(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = 'monitorHorarioConfig';
  const CONFIG_VERSION = 1;
  const APP_VERSION = '1.0.3';
  // A carga SEMPRE grava a data/hora no horário de São Paulo.
  const LOAD_TZ = 'America/Sao_Paulo';
  const TZ_LIST = [
    ['America/Sao_Paulo', 'Brasília / SP'], ['America/Cuiaba', 'Cuiabá / MT'],
    ['America/Campo_Grande', 'Campo Grande / MS'], ['America/Manaus', 'Manaus / AM'],
    ['America/Porto_Velho', 'Porto Velho / RO'], ['America/Rio_Branco', 'Rio Branco / AC'],
    ['America/Noronha', 'Fernando de Noronha'], ['UTC', 'UTC']
  ];
  const STATUS = {
    OK:     {key:'OK',     level:0, text:'ATUALIZADO', color:'#16a34a'},
    ATTN:   {key:'ATTN',   level:1, text:'ATENÇÃO',    color:'#f59e0b'},
    LATE:   {key:'LATE',   level:2, text:'ATRASADO',   color:'#f97316'},
    AHEAD:  {key:'AHEAD',  level:3, text:'À FRENTE',   color:'#7c3aed'},
    CRIT:   {key:'CRIT',   level:4, text:'CRÍTICO',    color:'#dc2626'},
    NODATA: {key:'NODATA', level:4, text:'SEM DADOS',  color:'#9aa3ab'}
  };
  const defaults = {
    version:CONFIG_VERSION,
    normal:5, attention:15, late:30, ahead:5,
    tzDefault:'America/Sao_Paulo', tzMap:'MT=America/Cuiaba\nMATO GROSSO=America/Cuiaba',
    tick:5, dateFmt:'auto', showUnit:true, pulse:true, font:14, theme:'light', tooltip:true
  };
  let config = clone(defaults), sheet, author = false, saving = false, running = false, pending = false;
  let items = [], globalMessage = '', timer = 0, demo = false;
  const alerts = new Map();

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const intIn = (v, min, max, fb) => Number.isInteger(v) && v >= min && v <= max ? v : fb;
  const oneOf = (v, list, fb) => list.includes(v) ? v : fb;
  const bool = (v, fb) => typeof v === 'boolean' ? v : fb;
  const str = (v, max, fb) => typeof v === 'string' ? v.slice(0, max) : fb;
  const errText = e => String((e && e.message) || e);
  const isNull = v => v === null || v === undefined || v === '' || v === '%null%' || v === 'Null';
  const norm = s => String(s).trim().toLocaleUpperCase('pt-BR');
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ===== Fuso horário =====
  const fmtCache = new Map();
  function tzFmt(tz){
    if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {timeZone:tz, hourCycle:'h23',
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'}));
    return fmtCache.get(tz);
  }
  const validTz = tz => { try{ tzFmt(tz).format(new Date()); return true; }catch(_){ return false; } };
  // data/hora "de parede" de um instante, em um fuso
  function wall(epoch, tz){
    const o = {};
    for (const p of tzFmt(tz).formatToParts(new Date(epoch))) if (p.type !== 'literal') o[p.type] = +p.value;
    return {y:o.year, m:o.month, d:o.day, h:o.hour === 24 ? 0 : o.hour, mi:o.minute, s:o.second};
  }
  function offsetMs(epoch, tz){
    const w = wall(epoch, tz);
    return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(epoch / 1000) * 1000;
  }
  // data/hora gravada (sem fuso) -> instante absoluto, considerando o fuso de gravação
  function toEpoch(w, tz){
    const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
    let e = guess - offsetMs(guess, tz);
    const o2 = offsetMs(e, tz);
    if (o2 !== guess - e) e = guess - o2;
    return e;
  }
  function offsetLabel(tz){
    let m = Math.round(offsetMs(Date.now(), tz) / 60000);
    const sign = m < 0 ? '-' : '+'; m = Math.abs(m);
    return `UTC${sign}${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  }
  // diferença do fuso da unidade em relação a SP, ex.: "-1h"
  function vsLoad(tz){
    const h = Math.round((offsetMs(Date.now(), tz) - offsetMs(Date.now(), LOAD_TZ)) / 3600000);
    return h === 0 ? 'mesmo horário de SP' : `${h > 0 ? '+' : ''}${h}h em relação a SP`;
  }
  const tzName = tz => (TZ_LIST.find(t => t[0] === tz) || [tz, tz])[1];
  const fmtWall = (epoch, tz) => { const w = wall(epoch, tz); return `${pad(w.d)}/${pad(w.m)}/${w.y} ${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}`; };

  function parseTzMap(text){
    const list = [], bad = [];
    String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const i = line.lastIndexOf('='), k = i > 0 ? norm(line.slice(0, i)) : '', tz = i > 0 ? line.slice(i + 1).trim() : '';
      if (k && validTz(tz)) list.push([k, tz]); else bad.push(line);
    });
    return {list, bad};
  }
  function tzOfUnit(unit){
    const u = norm(unit || ''), {list} = parseTzMap(config.tzMap);
    const word = k => new RegExp(`(^|[^A-Z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`);
    const hit = u && (list.find(([k]) => u === k) || list.find(([k]) => k.length >= 3 && u.includes(k)) || list.find(([k]) => word(k).test(u)));
    return hit ? hit[1] : (validTz(config.tzDefault) ? config.tzDefault : LOAD_TZ);
  }

  // ===== Data =====
  function mk(y, mo, d, h, mi, s){
    const w = {y:+y, m:+mo, d:+d, h:+(h || 0), mi:+(mi || 0), s:+(s || 0)};
    return w.m >= 1 && w.m <= 12 && w.d >= 1 && w.d <= 31 && w.h <= 23 && w.mi <= 59 && w.s <= 59 ? w : null;
  }
  function parseDate(v){
    if (isNull(v)) return null;
    if (v instanceof Date) return isNaN(v) ? null : mk(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds());
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return mk(m[1], m[2], m[3], m[4], m[5], m[6]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
    if (m){
      let h = m[4] ? +m[4] : 0; const ap = (m[7] || '').toUpperCase();
      if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
      let mdy = config.dateFmt === 'mdy' || (config.dateFmt === 'auto' && (!!ap || +m[2] > 12));
      if (config.dateFmt === 'dmy') mdy = false;
      return mdy ? mk(m[3], m[1], m[2], h, m[5], m[6]) : mk(m[3], m[2], m[1], h, m[5], m[6]);
    }
    return null;
  }
  const parseCell = c => c ? (parseDate(c.value) || parseDate(c.formattedValue) || parseDate(c.nativeValue)) : null;

  // ===== Regras (diferença em segundos) =====
  function statusOf(sec){
    if (!finite(sec)) return STATUS.NODATA;
    if (sec < -config.ahead * 60) return STATUS.AHEAD;
    if (sec <= config.normal * 60) return STATUS.OK;
    if (sec <= config.attention * 60) return STATUS.ATTN;
    if (sec <= config.late * 60) return STATUS.LATE;
    return STATUS.CRIT;
  }
  // 45 s | 3 min 07 s | 1h 05min 12s | 2d 03h
  function duration(sec){
    const a = Math.floor(Math.abs(sec));
    if (a < 60) return `${a} s`;
    if (a < 3600) return `${Math.floor(a / 60)} min ${pad(a % 60)} s`;
    if (a < 86400) return `${Math.floor(a / 3600)}h ${pad(Math.floor(a % 3600 / 60))}min ${pad(a % 60)}s`;
    return `${Math.floor(a / 86400)}d ${pad(Math.floor(a % 86400 / 3600))}h`;
  }

  // ===== Configuração =====
  function readConfig(){
    const raw = demo ? localStorage.getItem(CONFIG_KEY) : tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return clone(defaults);
    try{
      const c = JSON.parse(raw), d = clone(defaults);
      if (c.version !== CONFIG_VERSION) return d;
      const tzOk = (v, fb) => typeof v === 'string' && validTz(v) ? v : fb;
      return {
        version:CONFIG_VERSION,
        normal:intIn(c.normal, 0, 100000, d.normal), attention:intIn(c.attention, 0, 100000, d.attention),
        late:intIn(c.late, 0, 100000, d.late), ahead:intIn(c.ahead, 0, 100000, d.ahead),
        tzDefault:tzOk(c.tzDefault, d.tzDefault), tzMap:str(c.tzMap, 1000, d.tzMap),
        tick:intIn(c.tick, 1, 600, d.tick), dateFmt:oneOf(c.dateFmt, ['auto','dmy','mdy'], d.dateFmt),
        showUnit:bool(c.showUnit, d.showUnit), pulse:bool(c.pulse, d.pulse),
        font:intIn(c.font, 10, 28, d.font), theme:oneOf(c.theme, ['light','gray','transparent','dark'], d.theme),
        tooltip:bool(c.tooltip, d.tooltip)
      };
    }catch(_){ return clone(defaults); }
  }

  // ===== Alertas =====
  function createAlert(){
    const node = $('alertTemplate').content.firstElementChild.cloneNode(true);
    const q = s => node.querySelector(s);
    const a = {node, unit:q('.unit-name'), label:q('.label'), delay:q('.delay'), item:null};
    node.addEventListener('mousemove', ev => { a.hover = ev; showTip(ev, a.item); });
    node.addEventListener('mouseleave', () => { a.hover = null; hideTip(); });
    return a;
  }
  function evaluate(item, now){
    if (!item.epoch) return {sec:NaN, st:STATUS.NODATA};
    const sec = (now - item.epoch) / 1000;      // instante absoluto: fuso já nivelado
    return {sec, st:statusOf(sec)};
  }
  function paintAlert(a, item, now){
    const {sec, st} = evaluate(item, now);
    a.item = item;
    a.node.style.setProperty('--c', st.color);
    a.node.classList.toggle('blink', st.level >= 3 && st !== STATUS.NODATA);
    a.unit.textContent = item.unit || '';
    a.label.textContent = st.text;
    a.delay.textContent = finite(sec) ? (sec < 0 ? '+' : '') + duration(sec) : '';
    if (a.hover) showTip(a.hover, item);
  }
  function applyGlobalStyle(){
    paintToggle();
    const body = document.body, root = document.documentElement;
    root.style.setProperty('--fs', config.font + 'px');
    for (const t of ['gray','transparent','dark']){ root.classList.toggle(t, config.theme === t); body.classList.toggle(t, config.theme === t); }
    body.classList.toggle('unit-off', !config.showUnit);
    body.classList.toggle('pulse-on', config.pulse);
  }
  function layout(){
    const grid = $('grid'), n = grid.children.length;
    if (!n) return;
    const w = grid.clientWidth, minW = config.showUnit ? 280 : 210;
    const cols = Math.min(n, Math.max(1, Math.floor((w + 6) / (minW + 6))));
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--rows', Math.ceil(n / cols));
  }
  function render(){
    applyGlobalStyle();
    const grid = $('grid'), now = Date.now();
    const sorted = items.slice().sort((x, y) => (evaluate(y, now).st.level - evaluate(x, now).st.level) ||
      String(x.unit).localeCompare(String(y.unit), 'pt-BR', {numeric:true}));
    const keep = new Set(sorted.map(i => i.key));
    for (const [k, a] of alerts) if (!keep.has(k)){ a.node.remove(); alerts.delete(k); }
    sorted.forEach((item, idx) => {
      let a = alerts.get(item.key);
      if (!a){ a = createAlert(); alerts.set(item.key, a); }
      paintAlert(a, item, now);
      if (grid.children[idx] !== a.node) grid.insertBefore(a.node, grid.children[idx] || null);
    });
    $('notice').textContent = globalMessage;
    layout();
  }

  // ===== Tooltip (horários nivelados em SP) =====
  function tipHtml(item){
    const now = Date.now(), {sec, st} = evaluate(item, now);
    if (!item.epoch) return `<div class="t-head" style="color:${st.color}">${st.text}</div>${esc(item.error || 'Nenhuma data válida.')}`;
    const rows = [
      ['Unidade', item.unit || '(não identificada)'],
      ['Fuso da unidade', `${tzName(item.tz)} (${offsetLabel(item.tz)})`],
      ['Último dado (SP)', fmtWall(item.epoch, LOAD_TZ)],
      ['Agora (SP)', fmtWall(now, LOAD_TZ)]
    ];
    if (item.tz !== LOAD_TZ) rows.push(['Agora na unidade', `${fmtWall(now, item.tz)} (${vsLoad(item.tz)})`]);
    rows.push(['Diferença', (sec < 0 ? 'à frente ' : '') + duration(sec)]);
    rows.push(['Limites (min)', `≤${config.normal} · ≤${config.attention} · ≤${config.late}`]);
    return `<div class="t-head" style="color:${st.color}">${st.text}</div>` +
      rows.map(([k, v]) => `<div class="t-row"><span>${k}</span><b>${esc(v)}</b></div>`).join('') +
      (item.warn ? `<div class="t-warn">⚠ ${esc(item.warn)}</div>` : '') +
      `<div class="t-ver">v${APP_VERSION}</div>`;
  }
  function showTip(ev, item){
    if (!item || !config.tooltip) return;
    const tip = $('tip');
    tip.innerHTML = tipHtml(item); tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 12, y = ev.clientY + 12;
    if (x + w > innerWidth) x = Math.max(2, innerWidth - w - 2);
    if (y + h > innerHeight) y = Math.max(2, ev.clientY - h - 8);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip(){ $('tip').hidden = true; }

  // ===== Botão liga/desliga do tooltip =====
  function paintToggle(){
    const b = $('tipToggle');
    b.classList.toggle('off', !config.tooltip);
    b.setAttribute('aria-pressed', String(config.tooltip));
    b.title = config.tooltip ? 'Tooltip ligado — clique para desligar' : 'Tooltip desligado — clique para ligar';
  }
  async function toggleTooltip(){
    config.tooltip = !config.tooltip;
    paintToggle();
    if (!config.tooltip) hideTip();
    // no modo de criação grava na pasta de trabalho; para visualizadores vale só na sessão
    try{
      if (demo) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      else if (author){ tableau.extensions.settings.set(CONFIG_KEY, JSON.stringify(config)); await tableau.extensions.settings.saveAsync(); }
    }catch(_){ /* mantém o estado na sessão */ }
  }

  // ===== Painel =====
  const fields = [['normalInput','normal','int'],['attentionInput','attention','int'],['lateInput','late','int'],['aheadInput','ahead','int'],
    ['tzDefaultInput','tzDefault','str'],['tzMapInput','tzMap','str'],
    ['tickInput','tick','int'],['dateFmtInput','dateFmt','str'],['showUnitInput','showUnit','bool'],['pulseInput','pulse','bool'],
    ['fontInput','font','int'],['themeInput','theme','str'],['tooltipInput','tooltip','bool']];
  function syncModes(){ $('fontValue').textContent = $('fontInput').value + ' px'; }
  function openConfig(){
    if (!author || saving) return;
    for (const [id, k, t] of fields){ if (t === 'bool') $(id).checked = config[k]; else $(id).value = String(config[k]); }
    syncModes(); hideTip();
    $('saveStatus').textContent = ''; $('settingsPanel').hidden = false; document.body.classList.add('configuring');
  }
  function closeConfig(){ $('settingsPanel').hidden = true; document.body.classList.remove('configuring'); }
  async function saveConfig(e){
    e.preventDefault(); if (!author || saving) return;
    const candidate = {version:CONFIG_VERSION};
    for (const [id, k, t] of fields) candidate[k] = t === 'bool' ? $(id).checked : t === 'int' ? Number($(id).value) : $(id).value.trim();
    const fail = m => { $('saveStatus').textContent = m; };
    for (const k of ['normal','attention','late','ahead']) if (!Number.isInteger(candidate[k]) || candidate[k] < 0) return fail('Os limites precisam ser números inteiros maiores ou iguais a zero.');
    if (!(candidate.normal < candidate.attention && candidate.attention < candidate.late)) return fail('Os limites devem ser crescentes: Atualizado < Atenção < Atrasado.');
    if (!Number.isInteger(candidate.tick) || candidate.tick < 1 || candidate.tick > 600) return fail('Recalcular: entre 1 e 600 segundos.');
    const bad = parseTzMap(candidate.tzMap).bad;
    if (bad.length) return fail(`Linha inválida em "Unidade → fuso": ${bad[0]} (use TEXTO=America/Cuiaba).`);
    saving = true; $('save').disabled = $('close').disabled = true; fail('Salvando…');
    try{
      if (demo) localStorage.setItem(CONFIG_KEY, JSON.stringify(candidate));
      else {
        const settings = tableau.extensions.settings, previous = settings.get(CONFIG_KEY);
        try{ settings.set(CONFIG_KEY, JSON.stringify(candidate)); await settings.saveAsync(); }
        catch(err){ if (previous === undefined) settings.erase(CONFIG_KEY); else settings.set(CONFIG_KEY, previous); throw err; }
      }
      config = candidate; startTimer(); await update();
      fail('Configuração salva. Salve/publique a pasta de trabalho para preservá-la.');
    }catch(err){ fail('Não foi possível salvar: ' + errText(err)); }
    finally{ saving = false; $('save').disabled = $('close').disabled = false; }
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
  // Unidade pelo filtro da planilha (quando não há campo em "Unidade")
  async function unitFromFilter(){
    try{
      const filters = await sheet.getFiltersAsync();
      const f = filters.find(x => x.filterType === 'categorical' && /UNIDADE|FILIAL|USINA|PLANTA/i.test(x.fieldName));
      if (!f) return null;
      if (f.isAllSelected) return {many:true, name:f.fieldName};
      const vals = (f.appliedValues || []).map(v => String(v.formattedValue ?? v.value));
      return vals.length === 1 ? {value:vals[0], name:f.fieldName} : {many:true, name:f.fieldName};
    }catch(_){ return null; }
  }
  // A data da carga é sempre lida no fuso de SP -> instante absoluto.
  // O fuso da unidade só muda a exibição do "agora na unidade"; a diferença fica nivelada.
  function makeItem(unit, w, raw){
    return {key:norm(unit || '_'), unit, tz:tzOfUnit(unit), epoch:toEpoch(w, LOAD_TZ), raw, warn:'', error:''};
  }
  async function readItems(){
    const spec = await getSpec(), card = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const enc = card ? card.encodings : [], fieldFor = id => { const e = enc.find(x => x.id === id); return e && e.field ? e.field : null; };
    const fDate = fieldFor('date'), fUnit = fieldFor('unit');
    if (!fDate) return {items:[], message:'Arraste a dimensão de data/hora para a entrada Data no cartão Marcas.'};
    const table = await readTable();
    if (!table.data.length) return {items:[{key:'_', unit:'', epoch:null, error:'Sem dados para os filtros atuais.'}], message:''};
    const idx = f => {
      if (!f) return -1;
      const col = table.columns.find(c => c.fieldName === f.name);
      if (!col) throw new Error(`O campo ${f.name} não foi encontrado nos dados da planilha.`);
      return col.index;
    };
    const iD = idx(fDate), iU = idx(fUnit);
    const filter = iU < 0 ? await unitFromFilter() : null;
    const fixedUnit = filter && filter.value ? filter.value : '';
    const map = new Map(); let invalid = 0;
    for (const row of table.data){
      const w = parseCell(row[iD]);
      if (!w){ invalid++; continue; }
      const c = iU >= 0 ? row[iU] : null;
      const unit = c ? (isNull(c.value) ? '(sem unidade)' : String(c.formattedValue ?? c.value).trim()) : fixedUnit;
      const item = makeItem(unit, w, row[iD].formattedValue);
      const cur = map.get(item.key);
      if (!cur || item.epoch > cur.epoch) map.set(item.key, item);     // maior data de cada unidade
    }
    const out = [...map.values()];
    if (!out.length) return {items:[{key:'_', unit:fixedUnit, epoch:null, error:`Nenhuma data/hora válida (${invalid} valores não reconhecidos). Use a data como "Data e hora exata".`}], message:''};
    if (filter && filter.many) out.forEach(i => { i.warn = `Mais de uma unidade em "${filter.name}" — selecione uma ou coloque a unidade na entrada Unidade.`; });
    return {items:out, message:''};
  }
  async function update(){
    pending = true; if (running) return; running = true;
    try{
      while (pending){
        pending = false;
        try{ const r = demo ? demoItems() : await readItems(); items = r.items; globalMessage = r.message; }
        catch(err){ items = []; globalMessage = 'Não foi possível ler os campos: ' + errText(err); }
        if (!pending) render();
      }
    }finally{ running = false; }
  }
  function startTimer(){
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) render(); }, config.tick * 1000);   // recálculo contra o relógio, sem consultar o Tableau
  }

  // ===== Demonstração (navegador, index.html?demo=1) =====
  function demoItems(){
    const now = Date.now();
    const mkDemo = (unit, secAgo) => makeItem(unit, wall(now - secAgo * 1000, LOAD_TZ), '');
    return {items:[mkDemo('UNIDADE SP', 45), mkDemo('UNIDADE MT', 67), mkDemo('UNIDADE MT 2', 42 * 60 + 13)], message:'Modo demonstração'};
  }

  // ===== Eventos =====
  const tzOptions = TZ_LIST.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  document.querySelectorAll('.tz-list').forEach(s => { s.innerHTML = tzOptions; });
  $('fontInput').addEventListener('input', syncModes);
  $('tipToggle').addEventListener('click', toggleTooltip);
  $('configure').addEventListener('click', openConfig);
  $('close').addEventListener('click', closeConfig);
  $('settingsForm').addEventListener('submit', saveConfig);
  document.addEventListener('visibilitychange', () => { document.body.classList.toggle('page-hidden', document.hidden); if (!document.hidden) render(); });
  if ('ResizeObserver' in window){
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); }).observe($('grid'));
  } else window.addEventListener('resize', layout);

  async function init(){
    try{
      if (/[?&]demo=1/.test(location.search)){
        demo = true; author = true; config = readConfig(); $('configure').hidden = false;
        startTimer(); await update(); return;
      }
      if (!window.tableau) throw new Error('Biblioteca Tableau não carregou. Verifique a pasta vendor.');
      if (window.self === window.top) throw new Error('Adicione o arquivo .trex pelo cartão Marcas de uma planilha Tableau (ou abra index.html?demo=1).');
      await tableau.extensions.initializeAsync({configure:openConfig});
      if (!tableau.extensions.worksheetContent) throw new Error('Use uma extensão de visualização no Tableau 2024.2 ou posterior.');
      sheet = tableau.extensions.worksheetContent.worksheet;
      author = tableau.extensions.environment.mode === 'authoring';
      config = readConfig(); $('configure').hidden = !author;
      sheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, update);
      try{ sheet.addEventListener(tableau.TableauEventType.FilterChanged, update); }catch(_){ /* opcional */ }
      startTimer();
      await update();
    }catch(err){ globalMessage = errText(err); render(); }
  }
  console.info('[MonitorHorario] versão ' + APP_VERSION);
  render();
  void init();
})();
