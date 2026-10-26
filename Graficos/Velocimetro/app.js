(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = 'motorGridConfig';
  const CONFIG_VERSION = 1;
  const ARC_START = 144, ARC_SWEEP = 252;   // 70% da circunferência, igual ao velocímetro original
  const defaultColors = {progress:'#2e9e44', track:'#d6e9da', needle:'#d81b3c', ticks:'#6b7480', title:'#1f2933', pill:'#e3f1e6', card:'#ffffff'};

  const defaults = {
    version:CONFIG_VERSION,
    showHeader:true, sectionTitle:'VELOCIDADE DO MOTOR', sectionSubtitle:'Rotação atual e corrente de operação', iconColor:'#1e8e3e',
    columns:0, minCard:190, sort:'tableau', gap:10, maxCards:20,
    maximum:100, decimals:1, unit:'%', fontValue:17, fontUnit:65,
    infoSuffix:'A', infoDecimals:1, fontInfo:13, infoBold:false,
    onThreshold:0, onText:'EM OPERAÇÃO', onColor:'#2e9e44', offText:'DESLIGADO', offColor:'#1b5e20',
    extraStatus:'FALHA=#d32f2f', showStatus:true,
    arcByStatus:true, shake:true,
    showCard:true, uppercase:true, fontTitle:14,
    colors:{...defaultColors}, theme:'light'
  };

  let config = clone(defaults), sheet, author = false, saving = false, running = false, pending = false;
  let items = [], globalMessage = '';
  const cards = new Map();

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const fmt = (n, d) => n.toLocaleString('pt-BR', {minimumFractionDigits:d, maximumFractionDigits:d});
  const intIn = (v, min, max, fb) => Number.isInteger(v) && v >= min && v <= max ? v : fb;
  const numIn = (v, min, max, fb) => finite(v) && v >= min && v <= max ? v : fb;
  const oneOf = (v, list, fb) => list.includes(v) ? v : fb;
  const bool = (v, fb) => typeof v === 'boolean' ? v : fb;
  const str = (v, max, fb) => typeof v === 'string' ? v.slice(0, max) : fb;
  const errText = e => String((e && e.message) || e);
  const isNull = v => v === null || v === undefined || v === '' || v === '%null%';
  const norm = s => String(s).trim().toLocaleUpperCase('pt-BR');

  function parseExtraStatus(text){
    const map = new Map(), bad = [];
    String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const i = line.lastIndexOf('='), name = i > 0 ? line.slice(0, i).trim() : '', color = i > 0 ? line.slice(i + 1).trim() : '';
      if (name && validColor(color)) map.set(norm(name), color); else bad.push(line);
    });
    return {map, bad};
  }

  // ===== Configuração =====
  // Campos novos (fontValue, fontUnit, fontInfo, infoBold) usam o padrão se não existirem:
  // configurações salvas na v1.0 continuam valendo.
  function readConfig(){
    const raw = tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return clone(defaults);
    try{
      const c = JSON.parse(raw), d = clone(defaults);
      if (c.version !== CONFIG_VERSION) return d;
      return {
        version:CONFIG_VERSION,
        showHeader:bool(c.showHeader, d.showHeader), sectionTitle:str(c.sectionTitle, 60, d.sectionTitle),
        sectionSubtitle:str(c.sectionSubtitle, 120, d.sectionSubtitle), iconColor:validColor(c.iconColor) ? c.iconColor : d.iconColor,
        columns:intIn(c.columns, 0, 10, d.columns), minCard:intIn(c.minCard, 140, 500, d.minCard),
        sort:oneOf(c.sort, ['tableau','alpha','onFirst','valueDesc'], d.sort),
        gap:intIn(c.gap, 0, 32, d.gap), maxCards:intIn(c.maxCards, 1, 40, d.maxCards),
        maximum:finite(c.maximum) && c.maximum > 0 ? c.maximum : d.maximum,
        decimals:intIn(c.decimals, 0, 2, d.decimals), unit:str(c.unit, 12, d.unit),
        fontValue:intIn(c.fontValue, 10, 40, d.fontValue), fontUnit:intIn(c.fontUnit, 40, 100, d.fontUnit),
        infoSuffix:str(c.infoSuffix, 12, d.infoSuffix), infoDecimals:intIn(c.infoDecimals, 0, 2, d.infoDecimals),
        fontInfo:intIn(c.fontInfo, 8, 30, d.fontInfo), infoBold:bool(c.infoBold, d.infoBold),
        onThreshold:numIn(c.onThreshold, 0, 100, d.onThreshold),
        onText:str(c.onText, 24, d.onText), onColor:validColor(c.onColor) ? c.onColor : d.onColor,
        offText:str(c.offText, 24, d.offText), offColor:validColor(c.offColor) ? c.offColor : d.offColor,
        extraStatus:str(c.extraStatus, 600, d.extraStatus), showStatus:bool(c.showStatus, d.showStatus),
        arcByStatus:bool(c.arcByStatus, d.arcByStatus), shake:bool(c.shake, d.shake),
        showCard:bool(c.showCard, d.showCard), uppercase:bool(c.uppercase, d.uppercase), fontTitle:intIn(c.fontTitle, 9, 24, d.fontTitle),
        colors:Object.fromEntries(Object.keys(defaultColors).map(k => [k, validColor(c.colors?.[k]) ? c.colors[k] : d.colors[k]])),
        theme:oneOf(c.theme, ['light','gray','transparent','dark'], d.theme)
      };
    }catch(_){ return clone(defaults); }
  }

  // ===== Regras =====
  const pctOf = item => finite(item.value) ? item.value / config.maximum * 100 : null;
  function statusOf(item){
    const pct = pctOf(item), on = pct !== null && pct > config.onThreshold;
    if (item.status !== null){            // texto vindo do campo Status
      const key = norm(item.status), extra = parseExtraStatus(config.extraStatus).map;
      let color = extra.get(key);
      if (!color) color = key === norm(config.onText) ? config.onColor : key === norm(config.offText) ? config.offColor : (on ? config.onColor : config.offColor);
      return {text:item.status, color, on};
    }
    if (pct === null) return {text:'SEM DADOS', color:'#9aa3ab', on:false};
    return on ? {text:config.onText, color:config.onColor, on:true} : {text:config.offText, color:config.offColor, on:false};
  }
  function sortItems(list){
    const out = list.slice();
    const byName = (a, b) => a.title.localeCompare(b.title, 'pt-BR', {numeric:true, sensitivity:'base'});
    const val = x => finite(x.value) ? x.value : -Infinity;
    if (config.sort === 'alpha') out.sort(byName);
    if (config.sort === 'valueDesc') out.sort((a, b) => (val(b) - val(a)) || byName(a, b));
    if (config.sort === 'onFirst') out.sort((a, b) => (Number(statusOf(b).on) - Number(statusOf(a).on)) || byName(a, b));
    return out;
  }

  // Posição vertical do valor e da informação conforme o tamanho das fontes,
  // para que não se sobreponham; a área do desenho cresce para baixo se precisar.
  function textLayout(){
    const valueY = 146 + config.fontValue * 0.9;
    const infoY = valueY + config.fontInfo * 0.95 + 7;
    const bottom = Math.max(204, infoY + config.fontInfo * 0.3 + 4);
    return {valueY, infoY, viewBox:`20 8 260 ${(bottom - 8).toFixed(1)}`};
  }

  // ===== Cartões =====
  function createCard(){
    const node = $('cardTemplate').content.firstElementChild.cloneNode(true);
    const q = s => node.querySelector(s);
    return {node, title:q('.title'), svg:q('.gauge'), progress:q('.progress'), needle:q('.needle-pos'),
      valueText:q('.value-text'), v:q('.v'), u:q('.u'), info:q('.info-text'), statusText:q('.status-text'), error:q('.card-error'), lastAngle:ARC_START};
  }

  function paintCard(c, item, tl){
    const pct = pctOf(item), has = pct !== null, st = statusOf(item);
    const frac = has ? Math.max(0, Math.min(1, pct / 100)) : 0;
    c.title.textContent = item.title; c.title.title = item.title;

    c.svg.setAttribute('viewBox', tl.viewBox);
    c.valueText.setAttribute('y', tl.valueY.toFixed(1));
    c.info.setAttribute('y', tl.infoY.toFixed(1));

    const angle = ARC_START + frac * ARC_SWEEP;
    c.node.classList.toggle('down', angle < c.lastAngle);   // descida mais suave, como no velocímetro original
    c.node.style.setProperty('--angle', angle.toFixed(2) + 'deg');
    c.lastAngle = angle;
    c.progress.style.strokeDasharray = `${(frac * 100).toFixed(2)} 100`;
    c.node.style.setProperty('--arc', config.arcByStatus ? st.color : config.colors.progress);

    c.node.classList.toggle('no-data', !has);
    c.node.classList.toggle('on', has && st.on && frac > 0);
    c.v.textContent = has ? fmt(item.value, config.decimals) : '—';
    c.u.textContent = has ? config.unit : '';

    const inf = item.info;
    c.info.textContent = inf === null ? '' : typeof inf === 'number' ? [fmt(inf, config.infoDecimals), config.infoSuffix].filter(Boolean).join(' ') : String(inf);

    c.node.style.setProperty('--status', st.color);
    c.statusText.textContent = st.text;

    let err = item.error;
    if (!err && has && (pct > 100 || pct < 0)) err = pct > 100 ? 'Acima do máximo da escala.' : 'Valor abaixo de zero.';
    c.error.textContent = err || ''; c.error.hidden = !err;
    c.node.classList.toggle('has-error', !!item.error);
    c.svg.setAttribute('aria-label', has ? `${item.title}: ${fmt(item.value, config.decimals)} ${config.unit}, ${st.text}` : `${item.title}: sem dados`);
  }

  function applyGlobalStyle(){
    const body = document.body, root = document.documentElement, col = config.colors;
    const set = (k, v) => root.style.setProperty(k, v);
    for (const [k, v] of Object.entries(col)) set('--' + k, v);
    set('--icon', config.iconColor); set('--fs-title', config.fontTitle + 'px'); set('--gap', config.gap + 'px');
    set('--fs-value', config.fontValue + 'px');
    set('--fs-unit', (config.fontValue * config.fontUnit / 100).toFixed(1) + 'px');
    set('--fs-info', config.fontInfo + 'px');
    set('--info-weight', config.infoBold ? '700' : '400');
    for (const t of ['gray','transparent','dark']){ root.classList.toggle(t, config.theme === t); body.classList.toggle(t, config.theme === t); }
    body.classList.toggle('card-on', config.showCard); body.classList.toggle('card-off', !config.showCard);
    body.classList.toggle('header-off', !config.showHeader);
    body.classList.toggle('status-off', !config.showStatus);
    body.classList.toggle('shake-on', config.shake);
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
    for (const el of grid.children) el.classList.toggle('compact', cw < 160 || ch < 150);
    const titles = [...grid.querySelectorAll('.title')];
    let size = config.fontTitle;
    const setSize = s => titles.forEach(t => { t.style.fontSize = s + 'px'; });
    setSize(size);
    while (size > 10 && titles.some(t => t.scrollWidth > t.clientWidth + 1)){ size -= 0.5; setSize(size); }
  }

  function render(){
    applyGlobalStyle();
    const grid = $('grid'), tl = textLayout();
    const visible = sortItems(items).slice(0, config.maxCards);
    const keep = new Set(visible.map(i => i.key));
    for (const [k, c] of cards) if (!keep.has(k)){ c.node.remove(); cards.delete(k); }
    visible.forEach((item, idx) => {
      let c = cards.get(item.key);
      if (!c){ c = createCard(); cards.set(item.key, c); }
      try{ paintCard(c, item, tl); }
      catch(e){ c.error.textContent = 'Erro ao desenhar: ' + errText(e); c.error.hidden = false; }
      if (grid.children[idx] !== c.node) grid.insertBefore(c.node, grid.children[idx] || null);
    });
    let msg = globalMessage;
    if (!msg && items.length > config.maxCards) msg = `Exibindo ${config.maxCards} de ${items.length} motores. Aumente "Máximo de cartões" ou filtre no Tableau.`;
    $('notice').textContent = msg;
    layout();
  }

  // ===== Painel =====
  const colorIds = {progress:'colorProgressInput', track:'colorTrackInput', needle:'colorNeedleInput', ticks:'colorTicksInput', title:'colorTitleInput', pill:'colorPillInput', card:'colorCardInput'};
  const outputs = [['gapInput','gapValue',' px'],['fontTitleInput','fontTitleValue',' px'],
    ['fontValueInput','fontValueValue',' px'],['fontUnitInput','fontUnitValue','%'],['fontInfoInput','fontInfoValue',' px']];
  function updateOutputs(){ for (const [i, o, s] of outputs) $(o).textContent = $(i).value + s; }
  function syncModes(){
    $('minCardInput').disabled = $('columnsInput').value !== '0';
    $('colorProgressInput').disabled = $('arcByStatusInput').checked;
  }

  function openConfig(){
    if (!author || saving) return;
    const c = config;
    $('showHeaderInput').checked = c.showHeader; $('sectionTitleInput').value = c.sectionTitle;
    $('sectionSubtitleInput').value = c.sectionSubtitle; $('iconColorInput').value = c.iconColor;
    $('columnsInput').value = String(c.columns); $('minCardInput').value = String(c.minCard);
    $('sortInput').value = c.sort; $('gapInput').value = String(c.gap); $('maxCardsInput').value = String(c.maxCards);
    $('maximumInput').value = String(c.maximum); $('decimalsInput').value = String(c.decimals); $('unitInput').value = c.unit;
    $('fontValueInput').value = String(c.fontValue); $('fontUnitInput').value = String(c.fontUnit);
    $('infoSuffixInput').value = c.infoSuffix; $('infoDecimalsInput').value = String(c.infoDecimals);
    $('fontInfoInput').value = String(c.fontInfo); $('infoBoldInput').checked = c.infoBold;
    $('onThresholdInput').value = String(c.onThreshold);
    $('onTextInput').value = c.onText; $('onColorInput').value = c.onColor;
    $('offTextInput').value = c.offText; $('offColorInput').value = c.offColor;
    $('extraStatusInput').value = c.extraStatus; $('showStatusInput').checked = c.showStatus;
    $('arcByStatusInput').checked = c.arcByStatus; $('shakeInput').checked = c.shake;
    for (const [k, id] of Object.entries(colorIds)) $(id).value = c.colors[k];
    $('showCardInput').checked = c.showCard; $('uppercaseInput').checked = c.uppercase;
    $('fontTitleInput').value = String(c.fontTitle); $('themeInput').value = c.theme;
    updateOutputs(); syncModes();
    $('saveStatus').textContent = ''; $('settingsPanel').hidden = false; document.body.classList.add('configuring');
  }
  function closeConfig(){ $('settingsPanel').hidden = true; document.body.classList.remove('configuring'); }

  async function saveConfig(e){
    e.preventDefault(); if (!author || saving) return;
    const num = id => Number(String($(id).value).replace(',', '.'));
    const candidate = {
      version:CONFIG_VERSION,
      showHeader:$('showHeaderInput').checked, sectionTitle:$('sectionTitleInput').value.trim(),
      sectionSubtitle:$('sectionSubtitleInput').value.trim(), iconColor:$('iconColorInput').value,
      columns:Number($('columnsInput').value), minCard:Number($('minCardInput').value),
      sort:$('sortInput').value, gap:Number($('gapInput').value), maxCards:Number($('maxCardsInput').value),
      maximum:num('maximumInput'), decimals:Number($('decimalsInput').value), unit:$('unitInput').value.trim(),
      fontValue:Number($('fontValueInput').value), fontUnit:Number($('fontUnitInput').value),
      infoSuffix:$('infoSuffixInput').value.trim(), infoDecimals:Number($('infoDecimalsInput').value),
      fontInfo:Number($('fontInfoInput').value), infoBold:$('infoBoldInput').checked,
      onThreshold:num('onThresholdInput'),
      onText:$('onTextInput').value.trim(), onColor:$('onColorInput').value,
      offText:$('offTextInput').value.trim(), offColor:$('offColorInput').value,
      extraStatus:$('extraStatusInput').value.trim(), showStatus:$('showStatusInput').checked,
      arcByStatus:$('arcByStatusInput').checked, shake:$('shakeInput').checked,
      colors:Object.fromEntries(Object.entries(colorIds).map(([k, id]) => [k, $(id).value])),
      showCard:$('showCardInput').checked, uppercase:$('uppercaseInput').checked,
      fontTitle:Number($('fontTitleInput').value), theme:$('themeInput').value
    };
    const fail = m => { $('saveStatus').textContent = m; };
    if (!finite(candidate.maximum) || candidate.maximum <= 0) return fail('O máximo da escala precisa ser maior que zero.');
    if (!finite(candidate.onThreshold) || candidate.onThreshold < 0 || candidate.onThreshold > 100) return fail('O limite de ligado precisa estar entre 0 e 100.');
    if (!Number.isInteger(candidate.minCard) || candidate.minCard < 140 || candidate.minCard > 500) return fail('Largura mínima do cartão: entre 140 e 500.');
    if (!Number.isInteger(candidate.maxCards) || candidate.maxCards < 1 || candidate.maxCards > 40) return fail('Máximo de cartões: entre 1 e 40.');
    const bad = parseExtraStatus(candidate.extraStatus).bad;
    if (bad.length) return fail(`Linha inválida em "Outros status": ${bad[0]} (use TEXTO=#rrggbb).`);

    const settings = tableau.extensions.settings, previous = settings.get(CONFIG_KEY);
    saving = true; $('save').disabled = $('close').disabled = true; fail('Salvando…');
    try{
      settings.set(CONFIG_KEY, JSON.stringify(candidate)); await settings.saveAsync();
      config = candidate; render();
      fail('Configuração salva. Salve/publique a pasta de trabalho para preservá-la.');
    }catch(err){
      if (previous === undefined) settings.erase(CONFIG_KEY); else settings.set(CONFIG_KEY, previous);
      fail('Não foi possível salvar: ' + errText(err));
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
    const fValue = fieldFor('value'), fTitle = fieldFor('title'), fInfo = fieldFor('info'), fStatus = fieldFor('status');
    if (!fValue) return {items:[], message:'Arraste a medida de velocidade (%) para a entrada Valor no cartão Marcas.'};
    if (!fTitle) return {items:[], message:'Arraste a dimensão do motor para a entrada Título no cartão Marcas.'};

    const table = await readTable();
    if (!table.data.length) return {items:[], message:'Sem dados para os filtros atuais.'};
    const idx = f => {
      if (!f) return -1;
      const col = table.columns.find(c => c.fieldName === f.name);
      if (!col) throw new Error(`O campo ${f.name} não foi encontrado nos dados da planilha.`);
      return col.index;
    };
    const iV = idx(fValue), iT = idx(fTitle), iI = idx(fInfo), iS = idx(fStatus);
    const raw = (row, i) => { if (i < 0) return undefined; const c = row[i]; return c ? c.value : null; };
    const shown = (row, i) => { const c = row[i]; return c ? String(c.formattedValue ?? c.value) : ''; };

    const map = new Map(), out = [];
    for (const row of table.data){
      const title = isNull(raw(row, iT)) ? '(sem nome)' : shown(row, iT).trim();
      const key = title.toLocaleLowerCase('pt-BR');
      if (map.has(key)){ map.get(key).dupes++; continue; }
      // erros de uma linha ficam só no cartão dela
      const item = {key, title, value:null, info:null, status:null, error:'', dupes:0};
      try{
        const v = raw(row, iV);
        if (finite(v)) item.value = v; else item.error = 'Valor nulo ou não numérico.';
        if (iI >= 0){ const x = raw(row, iI); item.info = finite(x) ? x : (isNull(x) ? null : shown(row, iI).trim()); }
        if (iS >= 0){ const s = raw(row, iS); item.status = isNull(s) ? null : shown(row, iS).trim(); }
      }catch(e){ item.error = errText(e); }
      map.set(key, item); out.push(item);
    }
    for (const item of out) if (item.dupes){
      item.value = null;
      item.error = `${item.dupes + 1} linhas para este motor. Retire dimensões extras do cartão Marcas.`;
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
  $('arcByStatusInput').addEventListener('change', syncModes);
  for (const [i] of outputs) $(i).addEventListener('input', updateOutputs);
  $('resetColors').addEventListener('click', () => {
    for (const [k, id] of Object.entries(colorIds)) $(id).value = defaultColors[k];
    $('iconColorInput').value = defaults.iconColor; $('onColorInput').value = defaults.onColor; $('offColorInput').value = defaults.offColor;
  });
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
