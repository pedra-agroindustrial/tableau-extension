(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = 'kpiCardConfig';
  const CONFIG_VERSION = 1;
  const MAX_CARDS = 24;
  const ICONS = [['cana','Cana'],['folha','Folha'],['frasco','Frasco'],['fabrica','Fábrica'],['gota','Gota'],['raio','Energia'],['caminhao','Caminhão'],['grafico','Gráfico']];
  const DELTA_MODES = [['pct','%'],['pp','p.p.'],['abs','Absoluta'],['none','Sem variação']];
  const defaultColors = {accent:'#1e7b34', value:'#17324a', title:'#1f2933', muted:'#6b7480', up:'#1e8e3e', down:'#d32f2f', card:'#ffffff'};

  const defaults = {
    version:CONFIG_VERSION,
    cards:{},                     // por título: {icon, suffix, decimals, deltaMode, deltaDecimals}
    detail:'em relação ao mesmo horário de ontem', uppercase:true,
    columns:0, minCard:220, gap:12,
    fontTitle:11, fontValue:30, fontSmall:10, iconSize:36,
    colors:{...defaultColors}, accentBar:true, showCard:true, theme:'light'
  };
  // Sugestões automáticas pelo nome do indicador (podem ser trocadas no Configurar)
  const KNOWN = [
    {re:/CANA/i,               c:{icon:'cana',    suffix:'t', decimals:0, deltaMode:'pct', deltaDecimals:0}},
    {re:/FIBRA/i,              c:{icon:'folha',   suffix:'%', decimals:2, deltaMode:'pp',  deltaDecimals:1}},
    {re:/ATR/i,                c:{icon:'frasco',  suffix:'',  decimals:2, deltaMode:'abs', deltaDecimals:1}},
    {re:/USINA|UNIDADE/i,      c:{icon:'fabrica', suffix:'',  decimals:0, deltaMode:'none',deltaDecimals:0}},
    {re:/VAZ|ÁGUA|AGUA|NÍVEL|NIVEL/i, c:{icon:'gota', suffix:'', decimals:1, deltaMode:'pct', deltaDecimals:0}},
    {re:/ENERGIA|MOTOR|MW|KW/i, c:{icon:'raio',   suffix:'', decimals:1, deltaMode:'pct', deltaDecimals:0}}
  ];

  let config = clone(defaults), sheet, author = false, saving = false, running = false, pending = false;
  let items = [], globalMessage = '';
  const cards = new Map();

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const intIn = (v, min, max, fb) => Number.isInteger(v) && v >= min && v <= max ? v : fb;
  const oneOf = (v, list, fb) => list.includes(v) ? v : fb;
  const bool = (v, fb) => typeof v === 'boolean' ? v : fb;
  const str = (v, max, fb) => typeof v === 'string' ? v.slice(0, max) : fb;
  const errText = e => String((e && e.message) || e);
  const isNull = v => v === null || v === undefined || v === '' || v === '%null%';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt = (n, d) => n.toLocaleString('pt-BR', {minimumFractionDigits:d, maximumFractionDigits:d});
  const iconIds = ICONS.map(i => i[0]), deltaIds = DELTA_MODES.map(d => d[0]);

  // ===== Configuração =====
  function readConfig(){
    const raw = tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return clone(defaults);
    try{
      const c = JSON.parse(raw), d = clone(defaults);
      if (c.version !== CONFIG_VERSION) return d;
      const cardsCfg = {};
      if (c.cards && typeof c.cards === 'object') for (const [k, v] of Object.entries(c.cards)) cardsCfg[k] = sanitizeCard(v);
      return {
        version:CONFIG_VERSION, cards:cardsCfg,
        detail:str(c.detail, 80, d.detail), uppercase:bool(c.uppercase, d.uppercase),
        columns:intIn(c.columns, 0, 8, d.columns), minCard:intIn(c.minCard, 140, 500, d.minCard), gap:intIn(c.gap, 0, 32, d.gap),
        fontTitle:intIn(c.fontTitle, 8, 20, d.fontTitle), fontValue:intIn(c.fontValue, 14, 48, d.fontValue),
        fontSmall:intIn(c.fontSmall, 8, 16, d.fontSmall), iconSize:intIn(c.iconSize, 18, 56, d.iconSize),
        colors:Object.fromEntries(Object.keys(defaultColors).map(k => [k, validColor(c.colors?.[k]) ? c.colors[k] : d.colors[k]])),
        accentBar:bool(c.accentBar, d.accentBar), showCard:bool(c.showCard, d.showCard),
        theme:oneOf(c.theme, ['light','gray','transparent'], d.theme)
      };
    }catch(_){ return clone(defaults); }
  }
  function sanitizeCard(v){
    v = v || {};
    return {icon:oneOf(v.icon, iconIds, 'grafico'), suffix:str(v.suffix, 12, ''), decimals:intIn(v.decimals, 0, 4, 1),
      deltaMode:oneOf(v.deltaMode, deltaIds, 'pct'), deltaDecimals:intIn(v.deltaDecimals, 0, 3, 1)};
  }
  function cardCfg(title){
    if (config.cards[title]) return config.cards[title];
    const k = KNOWN.find(x => x.re.test(title));
    return sanitizeCard(k ? k.c : {});
  }

  // ===== Formatação =====
  function valueText(item, cfg){
    if (typeof item.value === 'string') return item.value;           // ex.: "2 de 4" vindo da base
    if (!finite(item.value)) return '—';
    return fmt(item.value, cfg.decimals) + (cfg.suffix ? (cfg.suffix === '%' ? ' %' : ' ' + cfg.suffix) : '');
  }
  function deltaInfo(item, cfg){
    if (cfg.deltaMode === 'none' || !finite(item.delta)) return null;
    const v = item.delta, dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    const sign = v > 0 ? '+ ' : v < 0 ? '− ' : '';
    const unit = cfg.deltaMode === 'pct' ? '%' : cfg.deltaMode === 'pp' ? ' p.p.' : '';
    return {dir, text:sign + fmt(Math.abs(v), cfg.deltaDecimals) + unit};
  }

  // ===== Cartões =====
  function createCard(){
    const node = $('cardTemplate').content.firstElementChild.cloneNode(true);
    const q = s => node.querySelector(s);
    return {node, use:q('use'), title:q('.title'), value:q('.value'), delta:q('.delta'), deltaText:q('.delta-text'), detail:q('.detail'), error:q('.card-error')};
  }
  function paintCard(c, item){
    const cfg = cardCfg(item.title);
    c.use.setAttribute('href', '#ic-' + cfg.icon);
    c.title.textContent = item.title; c.title.title = item.title;
    const vt = valueText(item, cfg);
    c.value.textContent = vt; c.value.title = vt;
    const d = deltaInfo(item, cfg);
    c.delta.className = 'delta ' + (d ? d.dir : 'none');
    c.deltaText.textContent = d ? d.text : '';
    c.detail.textContent = item.detail !== null ? item.detail : config.detail;
    c.error.textContent = item.error || ''; c.error.hidden = !item.error;
    c.node.classList.toggle('has-error', !!item.error);
    c.node.setAttribute('aria-label', `${item.title}: ${vt}${d ? ', variação ' + d.text : ''}`);
  }

  function applyGlobalStyle(){
    const body = document.body, root = document.documentElement, col = config.colors;
    const set = (k, v) => root.style.setProperty(k, v);
    for (const [k, v] of Object.entries(col)) set('--' + k, v);
    set('--fs-title', config.fontTitle + 'px'); set('--fs-value', config.fontValue + 'px');
    set('--fs-small', config.fontSmall + 'px'); set('--icon', config.iconSize + 'px'); set('--gap', config.gap + 'px');
    for (const t of ['gray','transparent']){ root.classList.toggle(t, config.theme === t); body.classList.toggle(t, config.theme === t); }
    body.classList.toggle('card-on', config.showCard);
    body.classList.toggle('bar-on', config.accentBar);
    body.classList.toggle('upper', config.uppercase);
  }
  function layout(){
    const grid = $('grid'), n = grid.children.length;
    if (!n) return;
    const w = grid.clientWidth, h = grid.clientHeight, gap = config.gap;
    let cols = config.columns || Math.max(1, Math.floor((w + gap) / (config.minCard + gap)));
    cols = Math.min(cols, n);
    const rows = Math.ceil(n / cols);
    grid.style.setProperty('--cols', cols); grid.style.setProperty('--rows', rows);
    const cw = (w - gap * (cols - 1)) / cols;
    for (const el of grid.children){ el.classList.toggle('compact', cw < 200); el.classList.toggle('tiny', cw < 150); }
  }
  function render(){
    applyGlobalStyle();
    const grid = $('grid'), visible = items.slice(0, MAX_CARDS), keep = new Set(visible.map(i => i.key));
    for (const [k, c] of cards) if (!keep.has(k)){ c.node.remove(); cards.delete(k); }
    visible.forEach((item, idx) => {
      let c = cards.get(item.key);
      if (!c){ c = createCard(); cards.set(item.key, c); }
      try{ paintCard(c, item); }catch(e){ c.error.textContent = 'Erro ao desenhar: ' + errText(e); c.error.hidden = false; }
      if (grid.children[idx] !== c.node) grid.insertBefore(c.node, grid.children[idx] || null);
    });
    $('notice').textContent = globalMessage || (items.length > MAX_CARDS ? `Exibindo ${MAX_CARDS} de ${items.length} indicadores.` : '');
    layout();
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
  const bareName = n => { const m = /^[^(]*\((.*)\)$/.exec(String(n)); return (m ? m[1] : String(n)).trim(); };

  async function readItems(){
    const spec = await getSpec(), card = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const enc = card ? card.encodings : [];
    const fieldsOf = id => enc.filter(e => e.id === id).flatMap(e => e.fields ? e.fields : (e.field ? [e.field] : []));
    const fTitles = fieldsOf('title'), fValue = fieldsOf('value')[0], fDelta = fieldsOf('delta')[0], fDetail = fieldsOf('detail')[0];
    if (!fTitles.length) return {items:[], message:'Arraste o nome do indicador para a entrada Título.'};
    if (!fValue) return {items:[], message:'Arraste o valor para a entrada Valor.'};

    const table = await readTable();
    if (!table.data.length) return {items:[], message:'Sem dados para os filtros atuais.'};
    const colOf = f => {
      let col = table.columns.find(c => c.fieldName === f.name) || table.columns.find(c => bareName(c.fieldName) === bareName(f.name));
      if (!col) throw new Error(`O campo ${f.name} não foi encontrado nos dados da planilha.`);
      return col;
    };
    const isNum = col => /^(int|float|real|number|integer|double)/i.test(String(col.dataType || ''));
    // Título com 2 campos: o numérico é a ORDEM dos cards, o texto é o nome
    let iTitle, iOrder = -1;
    if (fTitles.length >= 2){
      const a = colOf(fTitles[0]), b = colOf(fTitles[1]);
      if (isNum(a) && !isNum(b)){ iTitle = b.index; iOrder = a.index; }
      else if (isNum(b) && !isNum(a)){ iTitle = a.index; iOrder = b.index; }
      else { iTitle = b.index; iOrder = a.index; }
    }else iTitle = colOf(fTitles[0]).index;
    const iValue = colOf(fValue).index, iDelta = fDelta ? colOf(fDelta).index : -1, iDetail = fDetail ? colOf(fDetail).index : -1;
    const raw = (r, i) => { const c = r[i]; return c ? c.value : null; };
    const shown = (r, i) => { const c = r[i]; return c ? String(c.formattedValue ?? c.value).trim() : ''; };

    const map = new Map(), out = [];
    table.data.forEach((r, seq) => {
      const title = isNull(raw(r, iTitle)) ? '(sem nome)' : shown(r, iTitle);
      const key = title.toLocaleLowerCase('pt-BR');
      if (map.has(key)){ map.get(key).dupes++; return; }
      const item = {key, title, value:null, delta:null, detail:null, error:'', dupes:0, seq,
        ord:iOrder >= 0 && finite(Number(raw(r, iOrder))) ? Number(raw(r, iOrder)) : Infinity};
      try{
        const v = raw(r, iValue);
        if (finite(v)) item.value = v;
        else if (!isNull(v)) item.value = shown(r, iValue);              // texto: exibido como veio (ex.: "2 de 4")
        else item.error = 'Valor nulo.';
        if (iDelta >= 0){ const d = raw(r, iDelta); item.delta = finite(d) ? d : (isNull(d) ? null : Number(String(d).replace(',', '.'))); if (!finite(item.delta)) item.delta = null; }
        if (iDetail >= 0){ const t = raw(r, iDetail); item.detail = isNull(t) ? null : shown(r, iDetail); }   // vazio: usa o detalhe padrão
      }catch(e){ item.error = errText(e); }
      map.set(key, item); out.push(item);
    });
    for (const it of out) if (it.dupes){ it.value = null; it.error = `${it.dupes + 1} linhas para este indicador. Retire dimensões extras.`; }
    out.sort((a, b) => (a.ord - b.ord) || (a.seq - b.seq));
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

  // ===== Painel =====
  const colorIds = {accent:'colorAccentInput', value:'colorValueInput', title:'colorTitleInput', muted:'colorMutedInput', up:'colorUpInput', down:'colorDownInput', card:'colorCardInput'};
  const outputs = [['gapInput','gapValue'],['fontTitleInput','fontTitleValue'],['fontValueInput','fontValueValue'],['fontSmallInput','fontSmallValue'],['iconSizeInput','iconSizeValue']];
  const updateOutputs = () => { for (const [i, o] of outputs) $(o).textContent = $(i).value + ' px'; };

  function renderCardEditor(){
    const box = $('cardsContainer');
    if (!items.length){ box.innerHTML = '<p class="hint">Nenhum indicador lido ainda. Arraste os campos e abra o Configurar de novo.</p>'; return; }
    box.innerHTML = items.slice(0, MAX_CARDS).map(it => {
      const c = cardCfg(it.title);
      const opt = (list, cur) => list.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('');
      return `<div class="c-row" data-title="${esc(it.title)}">
        <div class="c-name" title="${esc(it.title)}">${esc(it.title)}</div>
        <label>Ícone<select class="c-icon">${opt(ICONS, c.icon)}</select></label>
        <label>Sufixo<input class="c-suffix" maxlength="12" value="${esc(c.suffix)}"></label>
        <label>Decimais<select class="c-dec">${[0,1,2,3,4].map(d => `<option${d === c.decimals ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Variação<select class="c-dmode">${opt(DELTA_MODES, c.deltaMode)}</select></label>
        <label>Dec. var.<select class="c-ddec">${[0,1,2,3].map(d => `<option${d === c.deltaDecimals ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
      </div>`;
    }).join('');
  }
  function openConfig(){
    if (!author || saving) return;
    const c = config;
    renderCardEditor();
    $('detailInput').value = c.detail; $('uppercaseInput').checked = c.uppercase;
    $('columnsInput').value = String(c.columns); $('minCardInput').value = String(c.minCard); $('gapInput').value = String(c.gap);
    $('fontTitleInput').value = String(c.fontTitle); $('fontValueInput').value = String(c.fontValue);
    $('fontSmallInput').value = String(c.fontSmall); $('iconSizeInput').value = String(c.iconSize);
    for (const [k, id] of Object.entries(colorIds)) $(id).value = c.colors[k];
    $('accentBarInput').checked = c.accentBar; $('showCardInput').checked = c.showCard; $('themeInput').value = c.theme;
    updateOutputs(); $('minCardInput').disabled = c.columns !== 0;
    $('saveStatus').textContent = ''; $('settingsPanel').hidden = false;
  }
  async function saveConfig(e){
    e.preventDefault(); if (!author || saving) return;
    const cardsCfg = {...config.cards};
    $('cardsContainer').querySelectorAll('.c-row').forEach(row => {
      cardsCfg[row.dataset.title] = sanitizeCard({icon:row.querySelector('.c-icon').value, suffix:row.querySelector('.c-suffix').value.trim(),
        decimals:Number(row.querySelector('.c-dec').value), deltaMode:row.querySelector('.c-dmode').value, deltaDecimals:Number(row.querySelector('.c-ddec').value)});
    });
    const candidate = {
      version:CONFIG_VERSION, cards:cardsCfg,
      detail:$('detailInput').value.trim(), uppercase:$('uppercaseInput').checked,
      columns:Number($('columnsInput').value), minCard:Number($('minCardInput').value), gap:Number($('gapInput').value),
      fontTitle:Number($('fontTitleInput').value), fontValue:Number($('fontValueInput').value),
      fontSmall:Number($('fontSmallInput').value), iconSize:Number($('iconSizeInput').value),
      colors:Object.fromEntries(Object.entries(colorIds).map(([k, id]) => [k, $(id).value])),
      accentBar:$('accentBarInput').checked, showCard:$('showCardInput').checked, theme:$('themeInput').value
    };
    if (!Number.isInteger(candidate.minCard) || candidate.minCard < 140 || candidate.minCard > 500){ $('saveStatus').textContent = 'Largura mínima do card: entre 140 e 500.'; return; }
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

  // ===== Eventos =====
  for (const [i] of outputs) $(i).addEventListener('input', updateOutputs);
  $('columnsInput').addEventListener('change', () => { $('minCardInput').disabled = $('columnsInput').value !== '0'; });
  $('resetColors').addEventListener('click', () => { for (const [k, id] of Object.entries(colorIds)) $(id).value = defaultColors[k]; });
  $('configure').addEventListener('click', openConfig);
  $('close').addEventListener('click', () => { $('settingsPanel').hidden = true; });
  $('settingsForm').addEventListener('submit', saveConfig);
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
