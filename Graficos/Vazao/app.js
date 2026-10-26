(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = 'flowGridConfig';
  const CONFIG_VERSION = 2;
  const RANGE_COLORS = ['#f2a900','#37a66b','#8656c7','#e95f48','#00a4a6','#3978cf'];
  const defaultColors = {metal:'#9aa3ab', inner:'#dfe6eb', title:'#1f2933', value:'#1f2933', card:'#ffffff', arrow:'#6b7480'};
  const DEFAULT_ICON = '#333333';

  const defaults = {
    version:CONFIG_VERSION,
    showHeader:true, sectionTitle:'VAZÃO INSTANTÂNEA',
    sectionSubtitle:'Vazão atual de entrada e saída nos principais pontos do sistema', iconColor:DEFAULT_ICON,
    columns:0, minCard:300, sort:'tableau', gap:12, maxCards:20,
    unit:'m³/h', decimals:1, maximum:1000,
    ranges:[{color:'#2fa4f0', end:500}], colorValue:false,
    animate:true, bubbles:true, speed:100,
    showCard:true, uppercase:true, fontTitle:14, fontValue:26,
    colors:{...defaultColors}, theme:'light'
  };

  let config = clone(defaults), sheet, author = false, saving = false, running = false, pending = false;
  let items = [], globalMessage = '';
  const cards = new Map();
  let seq = 0;

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const fmt = (n, d) => n.toLocaleString('pt-BR', {minimumFractionDigits:d, maximumFractionDigits:d});
  const intIn = (v, min, max, fb) => Number.isInteger(v) && v >= min && v <= max ? v : fb;
  const oneOf = (v, list, fb) => list.includes(v) ? v : fb;
  const bool = (v, fb) => typeof v === 'boolean' ? v : fb;
  const str = (v, max, fb) => typeof v === 'string' ? v.slice(0, max) : fb;
  const errText = e => String((e && e.message) || e);
  const isNull = v => v === null || v === undefined || v === '' || v === '%null%';
  const validRanges = r => Array.isArray(r) && r.length >= 1 && r.length <= 10 &&
    r.every((x, i) => validColor(x.color) && finite(x.end) && x.end > (i ? r[i-1].end : 0) && x.end <= 500);

  function shade(hex, amount){
    const n = parseInt(hex.slice(1), 16);
    const f = x => Math.max(0, Math.min(255, Math.round(x + (amount >= 0 ? (255 - x) * amount : x * amount))));
    return '#' + [16, 8, 0].map(s => f((n >> s) & 255).toString(16).padStart(2, '0')).join('');
  }

  // ===== Configuração =====
  function readConfig(){
    const raw = tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return clone(defaults);
    try{
      const c = JSON.parse(raw), d = clone(defaults);
      if (c.version !== CONFIG_VERSION) return d;
      const ranges = Array.isArray(c.ranges) ? c.ranges.map(r => ({color:r.color, end:Number(r.end)})) : null;
      const max = Number(c.maximum);
      return {
        version:CONFIG_VERSION,
        showHeader:bool(c.showHeader, d.showHeader), sectionTitle:str(c.sectionTitle, 60, d.sectionTitle),
        sectionSubtitle:str(c.sectionSubtitle, 120, d.sectionSubtitle), iconColor:validColor(c.iconColor) ? c.iconColor : d.iconColor,
        columns:intIn(c.columns, 0, 8, d.columns), minCard:intIn(c.minCard, 160, 600, d.minCard),
        sort:oneOf(c.sort, ['tableau','alpha','valueDesc','valueAsc'], d.sort),
        gap:intIn(c.gap, 0, 32, d.gap), maxCards:intIn(c.maxCards, 1, 40, d.maxCards),
        unit:str(c.unit, 16, d.unit), decimals:intIn(c.decimals, 0, 3, d.decimals),
        maximum:finite(max) && max > 0 ? max : d.maximum,
        ranges:validRanges(ranges) ? ranges : d.ranges, colorValue:bool(c.colorValue, d.colorValue),
        animate:bool(c.animate, d.animate), bubbles:bool(c.bubbles, d.bubbles), speed:intIn(c.speed, 50, 150, d.speed),
        showCard:bool(c.showCard, d.showCard), uppercase:bool(c.uppercase, d.uppercase),
        fontTitle:intIn(c.fontTitle, 9, 28, d.fontTitle), fontValue:intIn(c.fontValue, 14, 56, d.fontValue),
        colors:Object.fromEntries(Object.keys(defaultColors).map(k => [k, validColor(c.colors?.[k]) ? c.colors[k] : d.colors[k]])),
        theme:oneOf(c.theme, ['light','gray','transparent','dark'], d.theme)
      };
    }catch(_){ return clone(defaults); }
  }

  // ===== Regras =====
  function percentOf(item){
    const ref = finite(item.reference) && item.reference > 0 ? item.reference : config.maximum;
    return finite(item.value) ? Math.max(0, item.value / ref * 100) : 0;
  }
  function colorAt(p){
    const i = config.ranges.findIndex((r, k) => p < r.end || k === config.ranges.length - 1);
    return config.ranges[Math.max(0, i)].color;
  }
  function sortItems(list){
    const out = list.slice();
    const byName = (a, b) => a.title.localeCompare(b.title, 'pt-BR', {numeric:true, sensitivity:'base'});
    const val = x => finite(x.value) ? x.value : -Infinity;
    if (config.sort === 'alpha') out.sort(byName);
    if (config.sort === 'valueDesc') out.sort((a, b) => (val(b) - val(a)) || byName(a, b));
    if (config.sort === 'valueAsc') out.sort((a, b) => (val(a) - val(b)) || byName(a, b));
    return out;
  }

  // ===== Cartões =====
  function createCard(){
    const node = $('cardTemplate').content.firstElementChild.cloneNode(true);
    const n = ++seq, ids = {clip:`fclip${n}`, water:`fwater${n}`, metal:`fmetal${n}`};
    for (const [k, id] of Object.entries(ids)) node.querySelector(`[data-id="${k}"]`).id = id;
    node.querySelector('.water-clip').setAttribute('clip-path', `url(#${ids.clip})`);
    node.querySelector('.water').setAttribute('fill', `url(#${ids.water})`);
    node.querySelectorAll('.tube,.flange').forEach(el => el.setAttribute('fill', `url(#${ids.metal})`));
    const q = s => node.querySelector(s);
    return {node, title:q('.title'), svg:q('.pipe'), value:q('.value'), unit:q('.unit'), label:q('.label'), error:q('.card-error'),
      wTop:q('.w-top'), wMid:q('.w-mid'), wBot:q('.w-bot')};
  }

  function paintCard(c, item){
    const has = finite(item.value);
    const pct = percentOf(item), color = colorAt(pct);
    c.title.textContent = item.title; c.title.title = item.title;

    c.wTop.setAttribute('stop-color', shade(color, .55));
    c.wMid.setAttribute('stop-color', color);
    c.wBot.setAttribute('stop-color', shade(color, -.25));

    c.node.classList.toggle('no-data', !has);
    c.node.classList.toggle('stopped', has && item.value <= 0);
    c.node.classList.toggle('flowing', has && item.value > 0);
    c.node.classList.toggle('more-bubbles', pct >= 50);

    // Mesma lógica da v1.4: velocidade, amplitude e ritmo das bolhas crescem com a vazão (teto em 100%).
    const speed = Math.min(100, pct), k = 100 / config.speed;
    c.node.style.setProperty('--dur', ((4.5 - 3.9 * speed / 100) * k).toFixed(2) + 's');
    c.node.style.setProperty('--amp', (1.5 + speed * 0.04).toFixed(2) + 'px');
    c.node.style.setProperty('--bdur', ((3.5 - speed * 0.02) * k).toFixed(2) + 's');

    c.value.textContent = has ? fmt(item.value, config.decimals) : '—';
    c.node.style.setProperty('--value-color', config.colorValue && has ? color : config.colors.value);
    c.unit.textContent = has ? config.unit : '';
    c.label.textContent = isNull(item.label) ? '' : String(item.label);
    c.error.textContent = item.error || ''; c.error.hidden = !item.error;
    c.node.classList.toggle('has-error', !!item.error);
    c.svg.setAttribute('aria-label', has ? `${item.title}: ${fmt(item.value, config.decimals)} ${config.unit}` : `${item.title}: sem dados`);
  }

  function applyGlobalStyle(){
    const body = document.body, root = document.documentElement, col = config.colors;
    const set = (k, v) => root.style.setProperty(k, v);
    set('--metal', col.metal); set('--metal-hi', shade(col.metal, .65)); set('--metal-lo', shade(col.metal, -.38));
    set('--inner', col.inner); set('--title', col.title); set('--value', col.value); set('--card', col.card); set('--arrow', col.arrow);
    set('--icon', config.iconColor);
    set('--fs-title', config.fontTitle + 'px'); set('--fs-value', config.fontValue + 'px'); set('--gap', config.gap + 'px');
    for (const t of ['gray','transparent','dark']){ root.classList.toggle(t, config.theme === t); body.classList.toggle(t, config.theme === t); }
    body.classList.toggle('card-on', config.showCard); body.classList.toggle('card-off', !config.showCard);
    body.classList.toggle('header-off', !config.showHeader);
    body.classList.toggle('anim-off', !config.animate);
    body.classList.toggle('bubbles-off', !config.bubbles);
    body.classList.toggle('upper', config.uppercase);
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
    for (const el of grid.children) el.classList.toggle('compact', cw < 220 || ch < 150);
    fitTitles();
  }
  // Mesmo tamanho de título em todos os cartões, reduzindo até caber (mínimo 10 px).
  function fitTitles(){
    const titles = [...$('grid').querySelectorAll('.title')];
    let size = config.fontTitle;
    const set = s => titles.forEach(t => { t.style.fontSize = s + 'px'; });
    set(size);
    while (size > 10 && titles.some(t => t.scrollWidth > t.clientWidth + 1)){ size -= 0.5; set(size); }
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
    if (!msg && items.length > config.maxCards) msg = `Exibindo ${config.maxCards} de ${items.length} pontos. Aumente "Máximo de cartões" ou filtre no Tableau.`;
    $('notice').textContent = msg;
    layout();
  }

  // ===== Editor de faixas =====
  function rangesFromForm(){
    return [...$('rangesContainer').querySelectorAll('.range-row')].map(row => ({
      color:row.querySelector('.range-color').value, end:Number(row.querySelector('.range-end').value)
    }));
  }
  function renderRangeEditor(ranges){
    $('rangesContainer').innerHTML = ranges.map((r, i) => {
      const start = i ? ranges[i-1].end : 0;
      return `<fieldset class="range range-row"><legend>Faixa ${i+1}</legend>
        <div class="range-grid">
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
      renderRangeEditor(cur);
    }));
    $('rangesContainer').querySelectorAll('.range-end').forEach(inp => inp.addEventListener('input', () => {
      let start = 0;
      $('rangesContainer').querySelectorAll('.range-row').forEach(row => {
        row.querySelector('.range-start').value = String(start); start = Number(row.querySelector('.range-end').value);
      });
    }));
  }
  function addRange(){
    const r = rangesFromForm();
    if (!validRanges(r)){ $('saveStatus').textContent = 'Ajuste os limites em ordem crescente antes de adicionar outra faixa.'; return; }
    if (r.length >= 10) return;
    const curEnd = r[r.length - 1].end, prevEnd = r.length > 1 ? r[r.length - 2].end : 0;
    const split = Math.round(((prevEnd + Math.min(curEnd, Math.max(prevEnd * 2, 100))) / 2) * 10) / 10;
    if (split <= prevEnd || split >= curEnd){ $('saveStatus').textContent = 'Não há espaço entre os limites para criar outra faixa.'; return; }
    r[r.length - 1].end = split;
    r.push({color:RANGE_COLORS[(r.length - 1) % RANGE_COLORS.length], end:curEnd});
    renderRangeEditor(r); $('saveStatus').textContent = '';
  }

  // ===== Painel =====
  const colorIds = {metal:'colorMetalInput', inner:'colorInnerInput', title:'colorTitleInput', value:'colorValueColorInput', card:'colorCardInput', arrow:'colorArrowInput'};
  const outputs = [['gapInput','gapValue',' px'],['speedInput','speedValue','%'],['fontTitleInput','fontTitleValue',' px'],['fontValueInput','fontValueValue',' px']];
  function updateOutputs(){ for (const [i, o, s] of outputs) $(o).textContent = $(i).value + s; }
  function syncModes(){
    $('minCardInput').disabled = $('columnsInput').value !== '0';
    $('speedInput').disabled = !$('animateInput').checked;
  }

  function openConfig(){
    if (!author || saving) return;
    const c = config;
    $('showHeaderInput').checked = c.showHeader; $('sectionTitleInput').value = c.sectionTitle;
    $('sectionSubtitleInput').value = c.sectionSubtitle; $('iconColorInput').value = c.iconColor;
    $('columnsInput').value = String(c.columns); $('minCardInput').value = String(c.minCard);
    $('sortInput').value = c.sort; $('gapInput').value = String(c.gap); $('maxCardsInput').value = String(c.maxCards);
    $('unitInput').value = c.unit; $('decimalsInput').value = String(c.decimals); $('maximumInput').value = String(c.maximum);
    renderRangeEditor(clone(c.ranges)); $('colorValueInput').checked = c.colorValue;
    $('animateInput').checked = c.animate; $('bubblesInput').checked = c.bubbles; $('speedInput').value = String(c.speed);
    $('showCardInput').checked = c.showCard; $('uppercaseInput').checked = c.uppercase;
    $('fontTitleInput').value = String(c.fontTitle); $('fontValueInput').value = String(c.fontValue);
    for (const [k, id] of Object.entries(colorIds)) $(id).value = c.colors[k];
    $('themeInput').value = c.theme;
    updateOutputs(); syncModes();
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
      unit:$('unitInput').value.trim(), decimals:Number($('decimalsInput').value),
      maximum:Number(String($('maximumInput').value).replace(',', '.')),
      ranges:rangesFromForm(), colorValue:$('colorValueInput').checked,
      animate:$('animateInput').checked, bubbles:$('bubblesInput').checked, speed:Number($('speedInput').value),
      showCard:$('showCardInput').checked, uppercase:$('uppercaseInput').checked,
      fontTitle:Number($('fontTitleInput').value), fontValue:Number($('fontValueInput').value),
      colors:Object.fromEntries(Object.entries(colorIds).map(([k, id]) => [k, $(id).value])),
      theme:$('themeInput').value
    };
    if (!finite(candidate.maximum) || candidate.maximum <= 0){ $('saveStatus').textContent = 'A referência padrão precisa ser maior que zero.'; return; }
    if (!Number.isInteger(candidate.minCard) || candidate.minCard < 160 || candidate.minCard > 600){ $('saveStatus').textContent = 'Largura mínima do cartão: entre 160 e 600.'; return; }
    if (!Number.isInteger(candidate.maxCards) || candidate.maxCards < 1 || candidate.maxCards > 40){ $('saveStatus').textContent = 'Máximo de cartões: entre 1 e 40.'; return; }
    if (!validRanges(candidate.ranges)){ $('saveStatus').textContent = 'As faixas precisam estar em ordem crescente, com limite final de até 500%.'; return; }

    const settings = tableau.extensions.settings, previous = settings.get(CONFIG_KEY);
    saving = true; $('save').disabled = $('close').disabled = true; $('saveStatus').textContent = 'Salvando…';
    try{
      settings.set(CONFIG_KEY, JSON.stringify(candidate)); await settings.saveAsync();
      config = candidate; render();
      $('saveStatus').textContent = 'Configuração salva. Salve/publique a pasta de trabalho para preservá-la.';
    }catch(err){
      if (previous === undefined) settings.erase(CONFIG_KEY); else settings.set(CONFIG_KEY, previous);
      $('saveStatus').textContent = 'Não foi possível salvar: ' + errText(err);
    }finally{ saving = false; $('save').disabled = $('close').disabled = false; }
  }

  // ===== Dados =====
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
    const fValue = fieldFor('value'), fTitle = fieldFor('title'), fLabel = fieldFor('label'), fRef = fieldFor('reference');
    if (!fValue) return {items:[], message:'Arraste a medida de vazão para a entrada Valor no cartão Marcas.'};
    if (!fTitle) return {items:[], message:'Arraste a dimensão do ponto de medição para a entrada Título no cartão Marcas.'};

    const table = await readTable();
    if (!table.data.length) return {items:[], message:'Sem dados para os filtros atuais.'};
    const idx = f => {
      if (!f) return -1;
      const col = table.columns.find(c => c.fieldName === f.name);
      if (!col) throw new Error(`O campo ${f.name} não foi encontrado nos dados da planilha.`);
      return col.index;
    };
    const iV = idx(fValue), iT = idx(fTitle), iL = idx(fLabel), iR = idx(fRef);
    const raw = (row, i) => { if (i < 0) return undefined; const c = row[i]; return c ? c.value : null; };
    const shown = (row, i) => { const c = row[i]; return c ? String(c.formattedValue ?? c.value) : ''; };

    const map = new Map(), out = [];
    for (const row of table.data){
      const title = isNull(raw(row, iT)) ? '(sem nome)' : shown(row, iT).trim();
      const key = title.toLocaleLowerCase('pt-BR');
      if (map.has(key)){ map.get(key).dupes++; continue; }
      const item = {key, title, value:null, label:null, reference:null, error:'', dupes:0};
      try{
        const v = raw(row, iV);
        if (finite(v)){ item.value = v; if (v < 0) item.error = 'Vazão negativa; animação parada.'; }
        else item.error = 'Valor nulo ou não numérico.';
        if (iL >= 0 && !isNull(raw(row, iL))) item.label = shown(row, iL).trim();
        if (iR >= 0){
          const r = raw(row, iR);
          if (finite(r) && r > 0) item.reference = r;
          else if (!isNull(r)) item.error = `Referência inválida (${r}); usando a padrão.`;
        }
      }catch(e){ item.error = errText(e); }
      map.set(key, item); out.push(item);
    }
    for (const item of out) if (item.dupes){
      item.value = null;
      item.error = `${item.dupes + 1} linhas para este ponto. Retire dimensões extras do cartão Marcas.`;
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
  $('columnsInput').addEventListener('change', syncModes);
  $('animateInput').addEventListener('change', syncModes);
  for (const [i] of outputs) $(i).addEventListener('input', updateOutputs);
  $('addRange').addEventListener('click', addRange);
  $('resetColors').addEventListener('click', () => { for (const [k, id] of Object.entries(colorIds)) $(id).value = defaultColors[k]; $('iconColorInput').value = DEFAULT_ICON; });
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
