(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = 'poolGridConfig';
  const CONFIG_VERSION = 4;   // mantido: configurações salvas na v4.0 continuam valendo

  // ===== Paletas da estrutura =====
  const palettes = {
    padrao:{walls:'#b4c2b0',stroke:'#56645a',empty:'#eef1f4',card:'#ffffff',title:'#1f2933',muted:'#6b7480'},
    cinza: {walls:'#c5c5c5',stroke:'#6f6f6f',empty:'#f0f0f0',card:'#ffffff',title:'#303030',muted:'#707070'},
    oceano:{walls:'#b6ccd8',stroke:'#4f6b7a',empty:'#eaf5fb',card:'#ffffff',title:'#17324a',muted:'#5a7385'}
  };
  const RANGE_COLORS = ['#f6c343','#1e8e3e','#1e88e5','#8e24aa','#00acc1','#f4511e','#3949ab','#7cb342','#6d4c41'];

  const defaults = {
    version:CONFIG_VERSION,
    showHeader:true, sectionTitle:'NÍVEL DE REPRESA',
    sectionSubtitle:'Percentual do nível atual em relação à capacidade útil', iconColor:'#1e8e3e',
    columns:0, minCard:170, sort:'tableau', gap:8, maxCards:24,
    uppercase:true, decimals:1,
    footerPrefix:'Volume atual:', footerSuffix:'m³', footerDecimals:0,
    showBadge:true,
    ranges:[
      {name:'BAIXO',   color:'#d32f2f', end:10},
      {name:'ATENÇÃO', color:'#f6c343', end:40},
      {name:'NORMAL',  color:'#1e8e3e', end:500}
    ],
    waterMode:'fixed', waterColor:'#1e6fd9',
    percentMode:'fixed', percentColor:'#1565c0', percentFirstRange:true,
    wave:true, showCard:true, showAxis:true,
    fontTitle:13, fontPercentage:30, fontFooter:12,
    colorPreset:'padrao', colors:{...palettes.padrao}, theme:'light'
  };

  let config = clone(defaults), sheet, author = false, saving = false, running = false, pending = false;
  let items = [], globalMessage = '';
  const cards = new Map();
  let cardSeq = 0;

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const fmt = (n, d) => n.toLocaleString('pt-BR', {minimumFractionDigits:d, maximumFractionDigits:d});
  const intIn = (v, min, max, fb) => Number.isInteger(v) && v >= min && v <= max ? v : fb;
  const oneOf = (v, list, fb) => list.includes(v) ? v : fb;
  const bool = (v, fb) => typeof v === 'boolean' ? v : fb;
  const str = (v, max, fb) => typeof v === 'string' ? v.slice(0, max) : fb;
  const validRanges = r => Array.isArray(r) && r.length >= 1 && r.length <= 10 &&
    r.every((x, i) => validColor(x.color) && typeof x.name === 'string' && finite(x.end) && x.end > (i ? r[i-1].end : 0) && x.end <= 500);
  const errText = e => String((e && e.message) || e);
  const isNull = v => v === null || v === undefined || v === '' || v === '%null%';

  function mix(hex, target, t){
    const a = parseInt(hex.slice(1), 16), b = parseInt(target.slice(1), 16);
    const ch = s => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t));
    return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
  }
  function textOn(hex){
    const n = parseInt(hex.slice(1), 16), [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255];
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#3b2f00' : '#ffffff';
  }

  // ===== Configuração =====
  function readConfig(){
    const raw = tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return clone(defaults);
    try{
      const c = JSON.parse(raw), d = clone(defaults);
      if (c.version !== CONFIG_VERSION) return d;
      const ranges = Array.isArray(c.ranges) ? c.ranges.map(r => ({name:String(r.name ?? '').slice(0, 20), color:r.color, end:Number(r.end)})) : null;
      return {
        version:CONFIG_VERSION,
        showHeader:bool(c.showHeader, d.showHeader), sectionTitle:str(c.sectionTitle, 60, d.sectionTitle),
        sectionSubtitle:str(c.sectionSubtitle, 120, d.sectionSubtitle), iconColor:validColor(c.iconColor) ? c.iconColor : d.iconColor,
        columns:intIn(c.columns, 0, 10, d.columns), minCard:intIn(c.minCard, 120, 400, d.minCard),
        sort:oneOf(c.sort, ['tableau','alpha','worst','valueAsc','valueDesc'], d.sort),
        gap:intIn(c.gap, 0, 24, d.gap), maxCards:intIn(c.maxCards, 1, 50, d.maxCards),
        uppercase:bool(c.uppercase, d.uppercase), decimals:intIn(c.decimals, 0, 3, d.decimals),
        footerPrefix:str(c.footerPrefix, 40, d.footerPrefix), footerSuffix:str(c.footerSuffix, 12, d.footerSuffix),
        footerDecimals:intIn(c.footerDecimals, 0, 2, d.footerDecimals),
        showBadge:bool(c.showBadge, d.showBadge), ranges:validRanges(ranges) ? ranges : d.ranges,
        waterMode:oneOf(c.waterMode, ['fixed','range'], d.waterMode), waterColor:validColor(c.waterColor) ? c.waterColor : d.waterColor,
        percentMode:oneOf(c.percentMode, ['fixed','range'], d.percentMode), percentColor:validColor(c.percentColor) ? c.percentColor : d.percentColor,
        percentFirstRange:bool(c.percentFirstRange, d.percentFirstRange),
        wave:bool(c.wave, d.wave), showCard:bool(c.showCard, d.showCard), showAxis:bool(c.showAxis, d.showAxis),
        fontTitle:intIn(c.fontTitle, 9, 28, d.fontTitle), fontPercentage:intIn(c.fontPercentage, 14, 56, d.fontPercentage), fontFooter:intIn(c.fontFooter, 9, 20, d.fontFooter),
        colorPreset:oneOf(c.colorPreset, ['padrao','cinza','oceano','custom'], d.colorPreset),
        colors:Object.fromEntries(Object.keys(d.colors).map(k => [k, validColor(c.colors?.[k]) ? c.colors[k] : d.colors[k]])),
        theme:oneOf(c.theme, ['light','gray','transparent','dark'], d.theme)
      };
    }catch(_){ return clone(defaults); }
  }

  // ===== Regras de status =====
  function rangeIndexFor(item){
    if (!finite(item.value)) return -1;
    const ends = config.ranges.map((r, i) => i === 0 && item.limit1 !== null && config.ranges.length > 1 ? item.limit1 : r.end);
    const idx = ends.findIndex(end => item.value < end);
    return idx === -1 ? ends.length - 1 : idx;
  }
  function footerFor(item){
    const v = item.label;
    if (isNull(v)) return '';
    if (typeof v === 'number') return [config.footerPrefix, fmt(v, config.footerDecimals), config.footerSuffix].filter(Boolean).join(' ');
    return String(v);
  }
  function sortItems(list){
    const out = list.slice();
    const byName = (a, b) => a.title.localeCompare(b.title, 'pt-BR', {numeric:true, sensitivity:'base'});
    const val = (x, fb) => finite(x.value) ? x.value : fb;
    switch (config.sort){
      case 'alpha': out.sort(byName); break;
      case 'worst': out.sort((a, b) => (rangeIndexFor(a) - rangeIndexFor(b)) || (val(a, -Infinity) - val(b, -Infinity)) || byName(a, b)); break;
      case 'valueAsc': out.sort((a, b) => (val(a, -Infinity) - val(b, -Infinity)) || byName(a, b)); break;
      case 'valueDesc': out.sort((a, b) => (val(b, -Infinity) - val(a, -Infinity)) || byName(a, b)); break;
    }
    return out;
  }

  // ===== Cartões =====
  function createCard(){
    const node = $('cardTemplate').content.firstElementChild.cloneNode(true);
    const n = ++cardSeq, clipId = `clip${n}`, gradId = `grad${n}`;
    node.querySelector('[data-id="clip"]').id = clipId;
    node.querySelector('[data-id="grad"]').id = gradId;
    node.querySelector('.water-clip').setAttribute('clip-path', `url(#${clipId})`);
    node.querySelector('.liquid').setAttribute('fill', `url(#${gradId})`);
    const q = s => node.querySelector(s);
    return {node, title:q('.title'), badge:q('.badge'), pct:q('.percentage'), svg:q('.pool'),
      top:q('.stop-top'), bottom:q('.stop-bottom'), level:q('.water-level'), foot:q('.card-foot'), error:q('.card-error')};
  }

  function paintCard(c, item){
    const hasValue = finite(item.value);
    const ri = rangeIndexFor(item), range = ri >= 0 ? config.ranges[ri] : null;

    c.title.textContent = item.title; c.title.title = item.title;

    c.badge.hidden = !(config.showBadge && range && range.name);
    if (!c.badge.hidden){ c.badge.textContent = range.name; c.badge.style.background = range.color; c.badge.style.color = textOn(range.color); }

    // Percentual: cor fixa (azul), cor da faixa, ou cor da faixa 1 só quando estiver nela (ex.: BAIXO em vermelho, como no mockup)
    let pctColor = config.percentColor;
    if (range && (config.percentMode === 'range' || (config.percentFirstRange && ri === 0 && config.ranges.length > 1))) pctColor = range.color;
    c.node.style.setProperty('--percent', pctColor);
    c.pct.textContent = hasValue ? fmt(item.value, config.decimals) + ' %' : '—';

    const water = config.waterMode === 'range' && range ? range.color : config.waterColor;
    c.node.style.setProperty('--water', water);
    c.top.setAttribute('stop-color', mix(water, '#ffffff', .28));
    c.bottom.setAttribute('stop-color', water);
    const fraction = hasValue ? Math.min(1, Math.max(0, item.value / 100)) : 0;
    c.level.style.transform = `translateY(${(165 - fraction * 157).toFixed(2)}px)`;
    c.level.style.visibility = hasValue && fraction > 0 ? 'visible' : 'hidden';
    c.node.classList.toggle('overflowing', hasValue && item.value > 100);

    c.foot.textContent = footerFor(item);
    c.error.textContent = item.error || ''; c.error.hidden = !item.error;
    c.node.classList.toggle('has-error', !!item.error);
    c.svg.setAttribute('aria-label', hasValue ? `${item.title}: ${fmt(item.value, config.decimals)} por cento${range && range.name ? ', ' + range.name : ''}.` : `${item.title}: sem valor.`);
  }

  function applyGlobalStyle(){
    const body = document.body, root = document.documentElement;
    const colors = config.colorPreset === 'custom' ? config.colors : (palettes[config.colorPreset] || palettes.padrao);
    for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--${k}`, v);
    root.style.setProperty('--icon', config.iconColor);
    root.style.setProperty('--fs-title', config.fontTitle + 'px');
    root.style.setProperty('--fs-percent', config.fontPercentage + 'px');
    root.style.setProperty('--fs-footer', config.fontFooter + 'px');
    root.style.setProperty('--gap', config.gap + 'px');
    for (const t of ['gray','transparent','dark']){ root.classList.toggle(t, config.theme === t); body.classList.toggle(t, config.theme === t); }
    body.classList.toggle('card-on', config.showCard); body.classList.toggle('card-off', !config.showCard);
    body.classList.toggle('axis-off', !config.showAxis);
    body.classList.toggle('wave-off', !config.wave);
    body.classList.toggle('upper', config.uppercase);
    body.classList.toggle('header-off', !config.showHeader);
    $('sectionTitle').textContent = config.sectionTitle;
    $('sectionSubtitle').textContent = config.sectionSubtitle;
  }

  function layout(){
    const grid = $('grid'), n = grid.children.length;
    if (!n) return;
    const w = grid.clientWidth, h = grid.clientHeight, gap = config.gap;
    let cols = config.columns || Math.max(1, Math.floor((w + gap) / (config.minCard + gap)));
    cols = Math.min(cols, n);
    const rows = Math.ceil(n / cols);
    grid.style.setProperty('--cols', cols); grid.style.setProperty('--rows', rows);
    const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
    for (const el of grid.children){
      el.classList.toggle('compact', cw < 170 || ch < 150);
      el.classList.toggle('tiny', cw < 125);
    }
    fitTitles();
  }
  // Mesmo tamanho de título em todos os cartões, reduzindo até caber (mínimo 9 px).
  function fitTitles(){
    const titles = [...$('grid').querySelectorAll('.title')];
    if (!titles.length) return;
    let size = config.fontTitle;
    const set = s => titles.forEach(t => { t.style.fontSize = s + 'px'; });
    set(size);
    while (size > 9 && titles.some(t => t.scrollWidth > t.clientWidth + 1)){ size -= 0.5; set(size); }
  }

  function render(){
    applyGlobalStyle();
    const grid = $('grid');
    const visible = sortItems(items).slice(0, config.maxCards);
    const keep = new Set(visible.map(i => i.key));
    for (const [k, c] of cards) if (!keep.has(k)){ c.node.remove(); cards.delete(k); }
    visible.forEach((item, idx) => {
      let c = cards.get(item.key);
      if (!c){ c = createCard(); cards.set(item.key, c); }
      try{ paintCard(c, item); }
      catch(e){ c.error.textContent = 'Erro ao desenhar: ' + errText(e); c.error.hidden = false; }
      if (grid.children[idx] !== c.node) grid.insertBefore(c.node, grid.children[idx] || null);
    });
    let msg = globalMessage;
    if (!msg && items.length > config.maxCards) msg = `Exibindo ${config.maxCards} de ${items.length} reservatórios. Aumente "Máximo de cartões" em Configurar ou filtre no Tableau.`;
    $('notice').textContent = msg;
    layout();
  }

  // ===== Editor de faixas =====
  function rangesFromForm(){
    return [...$('rangesContainer').querySelectorAll('.range-row')].map(row => ({
      name:row.querySelector('.range-name').value.trim().slice(0, 20),
      color:row.querySelector('.range-color').value,
      end:Number(row.querySelector('.range-end').value)
    }));
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function renderRangeEditor(ranges){
    $('rangesContainer').innerHTML = ranges.map((r, i) => {
      const start = i ? ranges[i-1].end : 0;
      return `<fieldset class="range range-row"><legend>Faixa ${i+1}</legend>
        <div class="range-grid">
          <label>Status<input class="range-name" maxlength="20" value="${esc(r.name)}"></label>
          <label>Cor<input class="range-color" type="color" value="${r.color}"></label>
          <label>De (%)<input class="range-start" type="number" value="${start}" readonly></label>
          <label>Até (%)<input class="range-end" type="number" min="${start}" max="500" step="0.1" value="${r.end}"></label>
        </div>
        <button class="remove-range" type="button" data-index="${i}" ${ranges.length === 1 ? 'disabled' : ''}>Remover faixa</button>
      </fieldset>`;
    }).join('');
    $('addRange').disabled = ranges.length >= 10;
    $('rangesContainer').querySelectorAll('.remove-range').forEach(btn => btn.addEventListener('click', () => {
      const cur = rangesFromForm();
      if (!validRanges(cur)){ $('saveStatus').textContent = 'Ajuste os limites em ordem crescente antes de remover uma faixa.'; return; }
      const lastEnd = cur[cur.length - 1].end; cur.splice(Number(btn.dataset.index), 1); cur[cur.length - 1].end = lastEnd;
      renderRangeEditor(cur); $('saveStatus').textContent = '';
    }));
    $('rangesContainer').querySelectorAll('.range-end').forEach(inp => inp.addEventListener('input', () => {
      let start = 0;
      $('rangesContainer').querySelectorAll('.range-row').forEach(row => {
        row.querySelector('.range-start').value = String(start); row.querySelector('.range-end').min = String(start);
        start = Number(row.querySelector('.range-end').value);
      });
    }));
  }
  function addRange(){
    const r = rangesFromForm();
    if (!validRanges(r)){ $('saveStatus').textContent = 'Ajuste os limites em ordem crescente antes de adicionar outra faixa.'; return; }
    if (r.length >= 10) return;
    const curEnd = r[r.length - 1].end, prevEnd = r.length > 1 ? r[r.length - 2].end : 0;
    const split = Math.round(((prevEnd + curEnd) / 2) * 10) / 10;
    if (split <= prevEnd || split >= curEnd){ $('saveStatus').textContent = 'Não há espaço entre os limites para criar outra faixa.'; return; }
    r[r.length - 1].end = split;
    r.push({name:'NOVO', color:RANGE_COLORS[(r.length - 1) % RANGE_COLORS.length], end:curEnd});
    renderRangeEditor(r); $('saveStatus').textContent = '';
  }

  // ===== Painel de configuração =====
  const colorIds = {walls:'colorWallsInput', stroke:'colorStrokeInput', empty:'colorEmptyInput', card:'colorCardInput', title:'colorTitleInput', muted:'colorMutedInput'};
  function syncColorControls(event){
    const p = $('colorPresetInput').value;
    if (event && palettes[p]) for (const [k, id] of Object.entries(colorIds)) $(id).value = palettes[p][k];
    for (const id of Object.values(colorIds)) $(id).disabled = p !== 'custom';
  }
  function syncModes(){
    $('waterColorInput').disabled = $('waterModeInput').value !== 'fixed';
    $('percentColorInput').disabled = $('percentModeInput').value !== 'fixed';
    $('percentFirstRangeInput').disabled = $('percentModeInput').value !== 'fixed';
    $('minCardInput').disabled = $('columnsInput').value !== '0';
  }
  const sizes = [['fontTitleInput','fontTitleValue'],['fontPercentageInput','fontPercentageValue'],['fontFooterInput','fontFooterValue'],['gapInput','gapValue']];
  function updateSizeOutputs(){ for (const [i, o] of sizes) $(o).textContent = $(i).value + ' px'; }

  function openConfig(){
    if (!author || saving) return;
    const c = config;
    $('showHeaderInput').checked = c.showHeader; $('sectionTitleInput').value = c.sectionTitle;
    $('sectionSubtitleInput').value = c.sectionSubtitle; $('iconColorInput').value = c.iconColor;
    $('columnsInput').value = String(c.columns); $('minCardInput').value = String(c.minCard);
    $('sortInput').value = c.sort; $('gapInput').value = String(c.gap); $('maxCardsInput').value = String(c.maxCards);
    $('uppercaseInput').checked = c.uppercase; $('decimalsInput').value = String(c.decimals);
    $('footerPrefixInput').value = c.footerPrefix; $('footerSuffixInput').value = c.footerSuffix;
    $('footerDecimalsInput').value = String(c.footerDecimals);
    renderRangeEditor(clone(c.ranges)); $('showBadgeInput').checked = c.showBadge;
    $('waterModeInput').value = c.waterMode; $('waterColorInput').value = c.waterColor;
    $('percentModeInput').value = c.percentMode; $('percentColorInput').value = c.percentColor;
    $('percentFirstRangeInput').checked = c.percentFirstRange; $('waveInput').checked = c.wave;
    $('showCardInput').checked = c.showCard; $('showAxisInput').checked = c.showAxis;
    $('fontTitleInput').value = String(c.fontTitle); $('fontPercentageInput').value = String(c.fontPercentage); $('fontFooterInput').value = String(c.fontFooter);
    $('colorPresetInput').value = c.colorPreset; for (const [k, id] of Object.entries(colorIds)) $(id).value = c.colors[k];
    $('themeInput').value = c.theme;
    updateSizeOutputs(); syncColorControls(); syncModes();
    $('saveStatus').textContent = ''; $('settingsPanel').hidden = false; document.body.classList.add('configuring');
  }
  function closeConfig(){ $('settingsPanel').hidden = true; document.body.classList.remove('configuring'); }

  async function saveConfig(e){
    e.preventDefault(); if (!author || saving) return;
    const candidate = {
      version:CONFIG_VERSION,
      showHeader:$('showHeaderInput').checked, sectionTitle:$('sectionTitleInput').value.trim(),
      sectionSubtitle:$('sectionSubtitleInput').value.trim(), iconColor:$('iconColorInput').value,
      columns:Number($('columnsInput').value), minCard:Number($('minCardInput').value),
      sort:$('sortInput').value, gap:Number($('gapInput').value), maxCards:Number($('maxCardsInput').value),
      uppercase:$('uppercaseInput').checked, decimals:Number($('decimalsInput').value),
      footerPrefix:$('footerPrefixInput').value.trim(), footerSuffix:$('footerSuffixInput').value.trim(),
      footerDecimals:Number($('footerDecimalsInput').value),
      showBadge:$('showBadgeInput').checked, ranges:rangesFromForm(),
      waterMode:$('waterModeInput').value, waterColor:$('waterColorInput').value,
      percentMode:$('percentModeInput').value, percentColor:$('percentColorInput').value,
      percentFirstRange:$('percentFirstRangeInput').checked, wave:$('waveInput').checked,
      showCard:$('showCardInput').checked, showAxis:$('showAxisInput').checked,
      fontTitle:Number($('fontTitleInput').value), fontPercentage:Number($('fontPercentageInput').value), fontFooter:Number($('fontFooterInput').value),
      colorPreset:$('colorPresetInput').value,
      colors:Object.fromEntries(Object.entries(colorIds).map(([k, id]) => [k, $(id).value])),
      theme:$('themeInput').value
    };
    const fail = m => { $('saveStatus').textContent = m; };
    if (!Number.isInteger(candidate.minCard) || candidate.minCard < 120 || candidate.minCard > 400) return fail('Largura mínima do cartão: entre 120 e 400.');
    if (!Number.isInteger(candidate.maxCards) || candidate.maxCards < 1 || candidate.maxCards > 50) return fail('Máximo de cartões: entre 1 e 50.');
    if (!validRanges(candidate.ranges)) return fail('As faixas precisam estar em ordem crescente, com limite final de até 500%.');
    if (![candidate.waterColor, candidate.percentColor, candidate.iconColor, ...Object.values(candidate.colors)].every(validColor)) return fail('Confira as cores.');

    const settings = tableau.extensions.settings, previous = settings.get(CONFIG_KEY);
    saving = true; $('save').disabled = $('close').disabled = true; fail('Salvando…');
    try{
      settings.set(CONFIG_KEY, JSON.stringify(candidate)); await settings.saveAsync();
      config = candidate; void update();
      fail('Configuração salva. Salve/publique a pasta de trabalho para preservá-la.');
    }catch(err){
      if (previous === undefined) settings.erase(CONFIG_KEY); else settings.set(CONFIG_KEY, previous);
      fail('Não foi possível salvar: ' + errText(err));
    }finally{ saving = false; $('save').disabled = $('close').disabled = false; }
  }

  // ===== Leitura de dados =====
  let specCache = null;
  async function getSpec(){
    if (!author && specCache) return specCache;
    const spec = await sheet.getVisualSpecificationAsync();
    if (!author) specCache = spec;
    return spec;
  }
  async function readTable(){
    if (typeof sheet.getSummaryDataReaderAsync === 'function'){
      const reader = await sheet.getSummaryDataReaderAsync(undefined, {ignoreSelection:true});
      try{
        const pages = [];
        for (let i = 0; i < reader.pageCount; i++) pages.push(await reader.getPageAsync(i));
        return {columns:pages[0] ? pages[0].columns : [], data:pages.flatMap(p => p.data)};
      }finally{ await reader.releaseAsync(); }
    }
    const t = await sheet.getSummaryDataAsync({ignoreSelection:true});
    return {columns:t.columns, data:t.data};
  }

  async function readItems(){
    const spec = await getSpec(), card = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const enc = card ? card.encodings : [], fieldFor = id => { const e = enc.find(x => x.id === id); return e && e.field ? e.field : null; };
    const valueField = fieldFor('value'), titleField = fieldFor('title'), labelField = fieldFor('label'), limit1Field = fieldFor('limit1');
    if (!valueField) return {items:[], message:'Arraste uma medida para a entrada Valor no cartão Marcas.'};
    if (!titleField) return {items:[], message:'Arraste a dimensão do reservatório para a entrada Título no cartão Marcas.'};

    const table = await readTable();
    if (!table.data.length) return {items:[], message:'Sem dados para os filtros atuais.'};
    const colIndex = field => {
      if (!field) return -1;
      const col = table.columns.find(c => c.fieldName === field.name);
      if (!col) throw new Error(`O campo ${field.name} não foi encontrado nos dados da planilha.`);
      return col.index;
    };
    const iv = colIndex(valueField), it = colIndex(titleField), il = colIndex(labelField), im = colIndex(limit1Field);
    const get = (row, i) => { if (i < 0) return undefined; const c = row[i]; return c ? c.value : null; };
    const shown = (row, i) => { const c = row[i]; return c ? String(c.formattedValue ?? c.value) : ''; };

    const map = new Map(), out = [];
    for (const row of table.data){
      const title = isNull(get(row, it)) ? '(sem nome)' : shown(row, it).trim();
      const key = title.toLocaleLowerCase('pt-BR');
      if (map.has(key)){ map.get(key).dupes++; continue; }
      // Erros de uma linha ficam restritos ao cartão dela.
      const item = {key, title, value:null, label:null, limit1:null, error:'', dupes:0};
      try{
        const v = get(row, iv);
        if (finite(v)) item.value = v; else item.error = 'Valor nulo ou não numérico.';
        if (il >= 0){ const l = get(row, il); item.label = finite(l) ? l : (isNull(l) ? null : String(l).trim()); }
        if (im >= 0 && config.ranges.length > 1){
          const raw = get(row, im), n = typeof raw === 'number' ? raw : Number(raw);
          if (isNull(raw)){ /* sem limite: usa o padrão */ }
          else if (!finite(n) || n <= 0 || n >= config.ranges[1].end) item.error = `Limite faixa 1 inválido (${raw}); usando o padrão.`;
          else item.limit1 = n;
        }
      }catch(e){ item.error = errText(e); }
      map.set(key, item); out.push(item);
    }
    for (const item of out) if (item.dupes){
      item.value = null;
      item.error = `${item.dupes + 1} linhas para este reservatório. Retire dimensões extras do cartão Marcas.`;
    }
    return {items:out, message:''};
  }

  async function update(){
    pending = true; if (running) return; running = true;
    try{
      while (pending){
        pending = false;
        try{ const r = await readItems(); items = r.items; globalMessage = r.message; }
        catch(err){ items = []; globalMessage = 'Não foi possível ler os campos: ' + errText(err); }
        if (!pending) render();
      }
    }finally{ running = false; }
  }

  // ===== Eventos =====
  $('colorPresetInput').addEventListener('change', syncColorControls);
  ['waterModeInput','percentModeInput','columnsInput'].forEach(id => $(id).addEventListener('change', syncModes));
  for (const [i] of sizes) $(i).addEventListener('input', updateSizeOutputs);
  $('addRange').addEventListener('click', addRange);
  $('configure').addEventListener('click', openConfig);
  $('close').addEventListener('click', closeConfig);
  $('settingsForm').addEventListener('submit', saveConfig);
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('page-hidden', document.hidden));
  if ('ResizeObserver' in window){
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); }).observe($('grid'));
  } else window.addEventListener('resize', layout);

  async function init(){
    try{
      if (!window.tableau) throw new Error('Biblioteca Tableau não carregou. Verifique a pasta vendor.');
      if (window.self === window.top) throw new Error('Adicione o arquivo .trex pelo cartão Marcas de uma planilha Tableau.');
      await tableau.extensions.initializeAsync({configure:openConfig});
      if (!tableau.extensions.worksheetContent) throw new Error('Use uma extensão de visualização no Tableau 2024.2 ou posterior.');
      sheet = tableau.extensions.worksheetContent.worksheet;
      author = tableau.extensions.environment.mode === 'authoring';
      config = readConfig(); $('configure').hidden = !author;
      sheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, update);
      await update();
    }catch(err){ globalMessage = errText(err); render(); }
  }
  render();
  void init();
})();
