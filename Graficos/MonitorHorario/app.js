(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = 'statusAtualizacaoConfig', CONFIG_VERSION = 2;
  const defaults = {
    version:CONFIG_VERSION, okMin:5, warnMin:15,
    okText:'ATUALIZADO', warnText:'ATENÇÃO', lateText:'ATRASADO',
    tz:'America/Sao_Paulo', tzMap:'MATO GROSSO=America/Cuiaba\nMT=America/Cuiaba',
    bg:'claro', bgColor:'#e6f4ea', showDate:true
  };
  let config = {...defaults}, sheet, author = false, running = false, pending = false;
  let dataInfo = null;          // {parts:{y,m,d,h,mi,s}, unit, tz}
  let message = 'Conectando…';

  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const isNull = v => v === null || v === undefined || v === '' || v === '%null%';
  const errText = e => String((e && e.message) || e);
  const pad = n => String(n).padStart(2, '0');
  const bareName = n => { const m = /^[^(]*\((.*)\)$/.exec(String(n)); return (m ? m[1] : String(n)).trim(); };
  const validTz = tz => { if (typeof tz !== 'string' || !tz) return false; try{ new Intl.DateTimeFormat('pt-BR', {timeZone:tz}); return true; }catch(_){ return false; } };

  // ===== Configuração =====
  function readConfig(){
    const raw = tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return;
    try{
      const c = JSON.parse(raw), d = defaults;
      const num = (v, fb) => finite(v) && v >= 0 ? v : fb;
      const s = (v, fb, max) => typeof v === 'string' ? v.slice(0, max) : fb;
      config = {version:CONFIG_VERSION, okMin:num(c.okMin, d.okMin), warnMin:num(c.warnMin, d.warnMin),
        okText:s(c.okText, d.okText, 20), warnText:s(c.warnText, d.warnText, 20), lateText:s(c.lateText, d.lateText, 20),
        tz:validTz(c.tz) ? c.tz : d.tz, tzMap:s(c.tzMap, d.tzMap, 600),
        bg:['claro','transparente','sobre-verde','solido'].includes(c.bg) ? c.bg : d.bg,
        bgColor:/^#[0-9a-f]{6}$/i.test(c.bgColor || '') ? c.bgColor : d.bgColor, showDate:typeof c.showDate === 'boolean' ? c.showDate : d.showDate};
    }catch(_){ config = {...defaults}; }
  }
  function parseTzMap(text){
    const out = [], bad = [];
    String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
      const i = l.lastIndexOf('='), k = i > 0 ? l.slice(0, i).trim() : '', tz = i > 0 ? l.slice(i + 1).trim() : '';
      if (k && validTz(tz)) out.push({k:k.toLocaleUpperCase('pt-BR'), tz}); else bad.push(l);
    });
    return {list:out, bad};
  }
  function tzForUnit(unit){
    if (!unit) return config.tz;
    const u = String(unit).toLocaleUpperCase('pt-BR');
    const hit = parseTzMap(config.tzMap).list.find(x => u.includes(x.k));
    return hit ? hit.tz : config.tz;
  }

  // ===== Datas =====
  // Tableau envia data/hora "de relógio" (sem fuso). Comparamos relógio com relógio:
  // hora dos dados × hora atual NO FUSO DA UNIDADE, ambos convertidos como se fossem UTC.
  function partsFromValue(v, formatted){
    if (v instanceof Date && !isNaN(v)) return {y:v.getFullYear(), m:v.getMonth() + 1, d:v.getDate(), h:v.getHours(), mi:v.getMinutes(), s:v.getSeconds()};
    for (const txt of [v, formatted]){
      if (isNull(txt)) continue;
      const t = String(txt).trim();
      let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);                   // 2026-11-23 13:55:50
      if (m) return {y:+m[1], m:+m[2], d:+m[3], h:+(m[4] || 0), mi:+(m[5] || 0), s:+(m[6] || 0)};
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(t);           // 23/11/2026 13:55:50
      if (m){
        let h = +(m[4] || 0); const ap = (m[7] || '').toUpperCase();
        if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
        // com AM/PM o formato é americano (mês/dia)
        const [d, mo] = ap ? [+m[2], +m[1]] : [+m[1], +m[2]];
        return {y:+m[3], m:mo, d, h, mi:+(m[5] || 0), s:+(m[6] || 0)};
      }
    }
    return null;
  }
  const asUtc = p => Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  function nowParts(tz){
    const f = new Intl.DateTimeFormat('en-CA', {timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
    const o = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
    return {y:+o.year, m:+o.month, d:+o.day, h:+o.hour % 24, mi:+o.minute, s:+o.second};
  }
  function fmtAge(sec){
    sec = Math.max(0, Math.floor(sec));
    if (sec < 60) return sec + ' s';
    if (sec < 3600) return Math.floor(sec / 60) + ' min';
    if (sec < 86400){ const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h + 'h' + (m ? ' ' + pad(m) + 'min' : ''); }
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600); return d + 'd' + (h ? ' ' + h + 'h' : '');
  }

  // ===== Desenho (roda a cada segundo; só texto, custo mínimo) =====
  function applyTheme(){
    const b = document.body;
    for (const t of ['claro','transparente','sobre-verde','solido']) b.classList.toggle('bg-' + t, config.bg === t);
    $('box').style.setProperty('--bg', config.bg === 'solido' ? config.bgColor : '');
    if (config.bg !== 'solido') $('box').style.removeProperty('--bg');
  }
  // Ajusta a fonte para o texto inteiro caber na caixa (só recalcula quando o tamanho do texto ou da caixa muda)
  let lastFitKey = '';
  function fit(force){
    const box = $('box'), txt = box.querySelector('.txt');
    const key = box.clientWidth + 'x' + box.clientHeight + ':' + txt.textContent.length;
    if (!force && key === lastFitKey) return;
    lastFitKey = key;
    let size = Math.max(8, Math.min(22, box.clientHeight * 0.42));
    txt.style.fontSize = size + 'px';
    box.querySelector('.dot').style.width = Math.max(6, Math.min(12, size * 0.6)) + 'px';
    while (size > 8 && box.scrollWidth > box.clientWidth + 1){ size -= 0.5; txt.style.fontSize = size + 'px'; }
  }
  function tick(){ draw(); fit(false); }
  function draw(){
    const box = $('box');
    if (!dataInfo){
      box.className = 'box st-wait'; $('label').textContent = message; $('age').textContent = ''; box.title = message; return;
    }
    const diff = (asUtc(nowParts(dataInfo.tz)) - asUtc(dataInfo.parts)) / 1000;
    const min = diff / 60;
    const st = min <= config.okMin ? 'ok' : min <= config.warnMin ? 'warn' : 'late';
    box.className = 'box st-' + st;
    $('label').textContent = st === 'ok' ? config.okText : st === 'warn' ? config.warnText : config.lateText;
    $('age').textContent = diff < -60 ? '(hora futura)' : fmtAge(diff);
    const p = dataInfo.parts;
    box.title = config.showDate
      ? `Dados: ${pad(p.d)}/${pad(p.m)}/${p.y} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${dataInfo.unit ? ' — ' + dataInfo.unit : ''} (fuso ${dataInfo.tz})`
      : '';
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
  async function load(){
    const spec = await getSpec(), card = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const enc = card ? card.encodings : [];
    const fieldOf = id => { const e = enc.filter(x => x.id === id).flatMap(x => x.fields ? x.fields : (x.field ? [x.field] : [])); return e[0] || null; };
    const fDate = fieldOf('date'), fUnit = fieldOf('unit');
    if (!fDate){ dataInfo = null; message = 'Arraste a data em Data'; return; }
    const t = await readTable();
    if (!t.data.length){ dataInfo = null; message = 'SEM DADOS'; return; }
    const col = f => t.columns.find(c => c.fieldName === f.name) || t.columns.find(c => bareName(c.fieldName) === bareName(f.name));
    const cD = col(fDate), cU = fUnit ? col(fUnit) : null;
    if (!cD){ dataInfo = null; message = 'Campo Data não encontrado'; return; }
    let best = null;
    for (const r of t.data){
      const cell = r[cD.index]; if (!cell) continue;
      const p = partsFromValue(cell.value, cell.formattedValue); if (!p) continue;
      if (!best || asUtc(p) > asUtc(best.parts)){
        const u = cU && r[cU.index] && !isNull(r[cU.index].value) ? String(r[cU.index].formattedValue ?? r[cU.index].value).trim() : '';
        best = {parts:p, unit:u};
      }
    }
    if (!best){ dataInfo = null; message = 'DATA INVÁLIDA'; return; }
    dataInfo = {...best, tz:tzForUnit(best.unit)};
  }
  async function update(){
    pending = true; if (running) return; running = true;
    try{
      while (pending){
        pending = false;
        try{ await load(); }catch(err){ dataInfo = null; message = 'ERRO: ' + errText(err); }
      }
    }finally{ running = false; tick(); }
  }

  // ===== Configurar =====
  function openConfig(){
    if (!author) return;
    const c = config;
    $('okInput').value = c.okMin; $('warnInput').value = c.warnMin;
    $('okTextInput').value = c.okText; $('warnTextInput').value = c.warnText; $('lateTextInput').value = c.lateText;
    $('tzInput').value = c.tz; $('tzMapInput').value = c.tzMap;
    $('bgInput').value = c.bg; $('bgColorInput').value = c.bgColor; $('showDateInput').checked = c.showDate;
    $('bgColorInput').disabled = c.bg !== 'solido';
    $('saveStatus').textContent = ''; $('settingsPanel').hidden = false;
  }
  $('bgInput').addEventListener('change', () => { $('bgColorInput').disabled = $('bgInput').value !== 'solido'; });
  $('configure').addEventListener('click', openConfig);
  $('close').addEventListener('click', () => { $('settingsPanel').hidden = true; });
  $('settingsForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!author) return;
    const okMin = Number($('okInput').value), warnMin = Number($('warnInput').value);
    if (!(okMin >= 0) || !(warnMin >= okMin)){ $('saveStatus').textContent = '"Atenção até" deve ser maior ou igual a "Atualizado até".'; return; }
    const bad = parseTzMap($('tzMapInput').value).bad;
    if (bad.length){ $('saveStatus').textContent = `Linha de fuso inválida: ${bad[0]} (use TEXTO=America/Cuiaba).`; return; }
    const cand = {version:CONFIG_VERSION, okMin, warnMin,
      okText:$('okTextInput').value.trim() || defaults.okText, warnText:$('warnTextInput').value.trim() || defaults.warnText,
      lateText:$('lateTextInput').value.trim() || defaults.lateText, tz:$('tzInput').value, tzMap:$('tzMapInput').value.trim(),
      bg:$('bgInput').value, bgColor:$('bgColorInput').value, showDate:$('showDateInput').checked};
    const s = tableau.extensions.settings, prev = s.get(CONFIG_KEY);
    $('saveStatus').textContent = 'Salvando…';
    try{
      s.set(CONFIG_KEY, JSON.stringify(cand)); await s.saveAsync();
      config = cand; applyTheme(); if (dataInfo) dataInfo.tz = tzForUnit(dataInfo.unit); tick();
      $('saveStatus').textContent = 'Salvo. Salve/publique a pasta de trabalho para preservar.';
    }catch(err){
      if (prev === undefined) s.erase(CONFIG_KEY); else s.set(CONFIG_KEY, prev);
      $('saveStatus').textContent = 'Não foi possível salvar: ' + errText(err);
    }
  });

  // ===== Início =====
  applyTheme(); tick();
  new ResizeObserver(() => fit(true)).observe(document.body);
  setInterval(() => { if (!document.hidden) tick(); }, 1000);
  (async () => {
    try{
      if (!window.tableau) throw new Error('vendor ausente');
      if (window.self === window.top) throw new Error('abra pelo .trex');
      await tableau.extensions.initializeAsync({configure:openConfig});
      if (!tableau.extensions.worksheetContent) throw new Error('requer Tableau 2024.2+');
      sheet = tableau.extensions.worksheetContent.worksheet;
      author = tableau.extensions.environment.mode === 'authoring';
      readConfig(); applyTheme(); $('configure').hidden = !author;
      sheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, update);
      await update();
    }catch(err){ dataInfo = null; message = errText(err).toUpperCase(); tick(); }
  })();
})();
