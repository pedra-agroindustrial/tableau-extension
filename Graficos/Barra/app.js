(() => {
  'use strict';
  // ===== utilitários comuns =====
  const $ = id => document.getElementById(id);
  const clone = o => JSON.parse(JSON.stringify(o));
  const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const intIn = (v, min, max, fb) => Number.isInteger(v) && v >= min && v <= max ? v : fb;
  const oneOf = (v, list, fb) => list.includes(v) ? v : fb;
  const bool = (v, fb) => typeof v === 'boolean' ? v : fb;
  const str = (v, max, fb) => typeof v === 'string' ? v.slice(0, max) : fb;
  const errText = e => String((e && e.message) || e);
  const isNull = v => v === null || v === undefined || v === '' || v === '%null%';
  const norm = s => String(s).trim().toLocaleUpperCase('pt-BR');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt = (n, d) => n.toLocaleString('pt-BR', {minimumFractionDigits:d, maximumFractionDigits:d});
  const bareName = n => { const m = /^[^(]*\((.*)\)$/.exec(String(n)); return (m ? m[1] : String(n)).trim(); };
  const listOf = s => String(s || '').split(/[,;\n]/).map(x => norm(x)).filter(Boolean);

  let sheet, author = false, specCache = null;
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
  // Lê "categoria" (1 ou 2 campos: o numérico é a ORDEM, o texto é o RÓTULO) + 1 medida.
  // Linhas com o mesmo rótulo e ORDENS diferentes continuam separadas (ex.: os dois "06").
  async function readSeries(catId, valId){
    const spec = await getSpec(), card = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const enc = card ? card.encodings : [];
    const fieldsOf = id => enc.filter(e => e.id === id).flatMap(e => e.fields ? e.fields : (e.field ? [e.field] : []));
    const fCat = fieldsOf(catId), fVal = fieldsOf(valId)[0];
    if (!fCat.length) return {message:'Arraste a dimensão para a entrada Categoria.'};
    if (!fVal) return {message:'Arraste a medida para a entrada Valor.'};
    const table = await readTable();
    if (!table.data.length) return {items:[], message:'Sem dados para os filtros atuais.'};
    const colOf = f => {
      const col = table.columns.find(c => c.fieldName === f.name) || table.columns.find(c => bareName(c.fieldName) === bareName(f.name));
      if (!col) throw new Error(`O campo ${f.name} não foi encontrado nos dados da planilha.`);
      return col;
    };
    const isNum = col => /^(int|float|real|number|integer|double)/i.test(String(col.dataType || ''));
    let iLab, iOrd = -1;
    if (fCat.length >= 2){
      const a = colOf(fCat[0]), b = colOf(fCat[1]);
      if (isNum(a) && !isNum(b)){ iLab = b.index; iOrd = a.index; }
      else if (isNum(b) && !isNum(a)){ iLab = a.index; iOrd = b.index; }
      else { iLab = b.index; iOrd = a.index; }
    }else iLab = colOf(fCat[0]).index;
    const iVal = colOf(fVal).index;
    const raw = (r, i) => { const c = r[i]; return c ? c.value : null; };
    const shown = (r, i) => { const c = r[i]; return c ? String(c.formattedValue ?? c.value).trim() : ''; };
    const map = new Map(), out = [];
    table.data.forEach((r, seq) => {
      const label = isNull(raw(r, iLab)) ? '(vazio)' : shown(r, iLab);
      const ordRaw = iOrd >= 0 ? raw(r, iOrd) : null, ord = finite(Number(ordRaw)) && !isNull(ordRaw) ? Number(ordRaw) : Infinity;
      const key = (iOrd >= 0 ? String(ordRaw) : '') + '\u0001' + label;
      const v = raw(r, iVal);
      if (map.has(key)){ const it = map.get(key); if (finite(v)) it.value = (finite(it.value) ? it.value : 0) + v; return; }
      const it = {key, label, ord, seq, value:finite(v) ? v : null};
      map.set(key, it); out.push(it);
    });
    out.sort((a, b) => (a.ord - b.ord) || (a.seq - b.seq));
    return {items:out, valueName:bareName(fVal.name), message:''};
  }
  // Ajusta texto SVG para não passar da largura
  function svgEl(tag, attrs, text){
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function startExtension(opts){
    let running = false, pending = false;
    async function update(){
      pending = true; if (running) return; running = true;
      try{
        while (pending){
          pending = false;
          try{ await opts.load(); }catch(err){ opts.fail('Não foi possível ler os campos: ' + errText(err)); }
          if (!pending) opts.render();
        }
      }finally{ running = false; }
    }
    if ('ResizeObserver' in window){
      let raf = 0;
      new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(opts.render); }).observe($('chart'));
    }else window.addEventListener('resize', opts.render);
    (async () => {
      try{
        if (!window.tableau) throw new Error('Biblioteca Tableau não carregou. Verifique a pasta vendor.');
        if (window.self === window.top) throw new Error('Adicione o arquivo .trex pelo cartão Marcas de uma planilha Tableau.');
        await tableau.extensions.initializeAsync({configure:opts.openConfig});
        if (!tableau.extensions.worksheetContent) throw new Error('Use uma extensão de visualização no Tableau 2024.2 ou posterior.');
        sheet = tableau.extensions.worksheetContent.worksheet;
        author = tableau.extensions.environment.mode === 'authoring';
        opts.readConfig(); $('configure').hidden = !author;
        sheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, update);
        await update();
      }catch(err){ opts.fail(errText(err)); opts.render(); }
    })();
    return update;
  }
  async function saveSettings(key, candidate, onOk){
    const settings = tableau.extensions.settings, previous = settings.get(key);
    $('save').disabled = $('close').disabled = true; $('saveStatus').textContent = 'Salvando…';
    try{
      settings.set(key, JSON.stringify(candidate)); await settings.saveAsync();
      onOk(); $('saveStatus').textContent = 'Configuração salva. Salve/publique a pasta de trabalho para preservá-la.';
    }catch(err){
      if (previous === undefined) settings.erase(key); else settings.set(key, previous);
      $('saveStatus').textContent = 'Não foi possível salvar: ' + errText(err);
    }finally{ $('save').disabled = $('close').disabled = false; }
  }

  // ===== Barras por hora =====
  const CONFIG_KEY = 'barHourConfig', CONFIG_VERSION = 1;
  const defaults = {
    version:CONFIG_VERSION, showHeader:true, title:'PRODUÇÃO POR HORA (CANA)', subtitle:'Produção consolidada das quatro unidades',
    showLegend:true, legDone:'Produção realizada', legFuture:'Horário futuro (sem dados)',
    exclude:'Ant, Total', futureMode:'afterLast', decimals:0, yTitle:'Produção (t)', showLabels:true, showGrid:true,
    colors:{bar:'#2e9e44', future:'#d9dde1', accent:'#1e7b34', text:'#1f2933'}, barWidth:70, font:11, showCard:true, theme:'light'
  };
  let config = clone(defaults), items = [], message = 'Conectando ao Tableau…';

  function readConfig(){
    const raw = tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return;
    try{
      const c = JSON.parse(raw), d = defaults;
      config = {version:CONFIG_VERSION, showHeader:bool(c.showHeader, d.showHeader), title:str(c.title, 80, d.title), subtitle:str(c.subtitle, 120, d.subtitle),
        showLegend:bool(c.showLegend, d.showLegend), legDone:str(c.legDone, 40, d.legDone), legFuture:str(c.legFuture, 40, d.legFuture),
        exclude:str(c.exclude, 200, d.exclude), futureMode:oneOf(c.futureMode, ['afterLast','null','none'], d.futureMode),
        decimals:intIn(c.decimals, 0, 2, d.decimals), yTitle:str(c.yTitle, 30, d.yTitle), showLabels:bool(c.showLabels, d.showLabels), showGrid:bool(c.showGrid, d.showGrid),
        colors:Object.fromEntries(Object.keys(d.colors).map(k => [k, validColor(c.colors?.[k]) ? c.colors[k] : d.colors[k]])),
        barWidth:intIn(c.barWidth, 30, 95, d.barWidth), font:intIn(c.font, 9, 18, d.font), showCard:bool(c.showCard, d.showCard),
        theme:oneOf(c.theme, ['light','gray','transparent'], d.theme)};
    }catch(_){ config = clone(defaults); }
  }
  async function load(){
    const r = await readSeries('category', 'value');
    const ex = new Set(listOf(config.exclude));
    items = (r.items || []).filter(i => !ex.has(norm(i.label)));
    message = r.message || '';
  }

  function niceStep(max, target){
    const raw = max / target, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function render(){
    const root = document.documentElement, body = document.body, c = config.colors;
    root.style.setProperty('--accent', c.accent); root.style.setProperty('--text', c.text); root.style.setProperty('--fs', config.font + 'px');
    for (const t of ['gray','transparent']){ root.classList.toggle(t, config.theme === t); body.classList.toggle(t, config.theme === t); }
    body.classList.toggle('card-on', config.showCard); body.classList.toggle('header-off', !config.showHeader); body.classList.toggle('legend-off', !config.showLegend);
    $('sectionTitle').textContent = config.title; $('sectionSubtitle').textContent = config.subtitle;
    $('legDone').style.background = c.bar; $('legFuture').style.background = c.future;
    $('legDoneText').textContent = config.legDone; $('legFutureText').textContent = config.legFuture;
    $('notice').textContent = message;

    const svg = $('svg'); svg.replaceChildren();
    const box = $('chart').getBoundingClientRect(), W = box.width, H = box.height;
    if (!items.length || W < 60 || H < 60) return;

    // horários futuros
    let lastIdx = -1; items.forEach((it, i) => { if (finite(it.value) && it.value > 0) lastIdx = i; });
    const isFuture = (it, i) => config.futureMode === 'null' ? !finite(it.value)
      : config.futureMode === 'afterLast' ? (i > lastIdx && !(finite(it.value) && it.value > 0)) : false;

    const fs = config.font, max = Math.max(0, ...items.map(i => finite(i.value) ? i.value : 0));
    const step = niceStep(max || 1, 6), top = Math.max(step, Math.ceil((max * 1.08) / step) * step);
    const yLab = v => fmt(v, step < 1 ? 1 : 0);
    const left = Math.max(...[0, top].map(v => yLab(v).length)) * fs * .62 + (config.yTitle ? fs * 2.2 : 8) + 6;
    const pad = {l:left, r:6, t:config.showLabels ? fs * 1.8 : 8, b:fs * 2};
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    if (pw < 20 || ph < 20) return;
    const y = v => pad.t + ph - (v / top) * ph;

    for (let v = 0; v <= top + 1e-9; v += step){
      if (config.showGrid && v > 0) svg.append(svgEl('line', {class:'grid-line', x1:pad.l, x2:W - pad.r, y1:y(v), y2:y(v)}));
      svg.append(svgEl('text', {class:'axis-text', x:pad.l - 6, y:y(v) + fs * .35, 'text-anchor':'end'}, yLab(v)));
    }
    if (config.yTitle){
      const yt = svgEl('text', {class:'axis-title', x:0, y:0, 'text-anchor':'middle', transform:`translate(${fs * .9} ${pad.t + ph / 2}) rotate(-90)`}, config.yTitle);
      svg.append(yt);
    }
    svg.append(svgEl('line', {class:'baseline', x1:pad.l, x2:W - pad.r, y1:y(0), y2:y(0)}));

    // padrão hachurado para horário futuro
    const defs = svgEl('defs');
    const pat = svgEl('pattern', {id:'hatch', width:6, height:6, patternUnits:'userSpaceOnUse', patternTransform:'rotate(45)'});
    pat.append(svgEl('rect', {width:6, height:6, fill:c.future}), svgEl('line', {x1:0, y1:0, x2:0, y2:6, stroke:'#fff', 'stroke-width':2.2}));
    defs.append(pat); svg.append(defs);

    const slot = pw / items.length, bw = Math.max(2, slot * config.barWidth / 100);
    const labelEvery = Math.ceil((fs * 2.4) / slot);
    items.forEach((it, i) => {
      const cx = pad.l + slot * i + slot / 2, fut = isFuture(it, i);
      if (fut){
        const hh = Math.max(4, ph * .035);
        svg.append(svgEl('rect', {x:cx - bw / 2, y:y(0) - hh, width:bw, height:hh, fill:'url(#hatch)', rx:2}));
        if (config.showLabels) svg.append(svgEl('text', {class:'bar-label future', x:cx, y:y(0) - hh - 5}, '--'));
      }else{
        const v = finite(it.value) ? Math.max(0, it.value) : 0, yy = y(v), h = Math.max(v > 0 ? 1.5 : 0, y(0) - yy);
        const r = svgEl('rect', {class:'bar', x:cx - bw / 2, y:y(0) - h, width:bw, height:h, fill:c.bar, rx:Math.min(3, bw / 4)});
        r.append(svgEl('title', {}, `${it.label}: ${fmt(v, config.decimals)}`));
        svg.append(r);
        if (config.showLabels) svg.append(svgEl('text', {class:'bar-label', x:cx, y:y(0) - h - 5}, fmt(v, config.decimals)));
      }
      if (i % labelEvery === 0) svg.append(svgEl('text', {class:'x-text', x:cx, y:H - fs * .45}, it.label));
    });
  }

  // ===== Painel =====
  const colorIds = {bar:'colorBarInput', future:'colorFutureInput', accent:'colorAccentInput', text:'colorTextInput'};
  const outs = () => { $('barWidthValue').textContent = $('barWidthInput').value + '%'; $('fontValue').textContent = $('fontInput').value + ' px'; };
  function openConfig(){
    if (!author) return;
    const c = config;
    $('showHeaderInput').checked = c.showHeader; $('titleInput').value = c.title; $('subtitleInput').value = c.subtitle;
    $('showLegendInput').checked = c.showLegend; $('legDoneInput').value = c.legDone; $('legFutureInput').value = c.legFuture;
    $('excludeInput').value = c.exclude; $('futureModeInput').value = c.futureMode; $('decimalsInput').value = String(c.decimals);
    $('yTitleInput').value = c.yTitle; $('showLabelsInput').checked = c.showLabels; $('showGridInput').checked = c.showGrid;
    for (const [k, id] of Object.entries(colorIds)) $(id).value = c.colors[k];
    $('barWidthInput').value = String(c.barWidth); $('fontInput').value = String(c.font);
    $('showCardInput').checked = c.showCard; $('themeInput').value = c.theme;
    outs(); $('saveStatus').textContent = ''; $('settingsPanel').hidden = false;
  }
  $('barWidthInput').addEventListener('input', outs); $('fontInput').addEventListener('input', outs);
  $('configure').addEventListener('click', openConfig);
  $('close').addEventListener('click', () => { $('settingsPanel').hidden = true; });
  let update;
  $('settingsForm').addEventListener('submit', e => {
    e.preventDefault(); if (!author) return;
    const cand = {version:CONFIG_VERSION, showHeader:$('showHeaderInput').checked, title:$('titleInput').value.trim(), subtitle:$('subtitleInput').value.trim(),
      showLegend:$('showLegendInput').checked, legDone:$('legDoneInput').value.trim(), legFuture:$('legFutureInput').value.trim(),
      exclude:$('excludeInput').value, futureMode:$('futureModeInput').value, decimals:Number($('decimalsInput').value),
      yTitle:$('yTitleInput').value.trim(), showLabels:$('showLabelsInput').checked, showGrid:$('showGridInput').checked,
      colors:Object.fromEntries(Object.entries(colorIds).map(([k, id]) => [k, $(id).value])),
      barWidth:Number($('barWidthInput').value), font:Number($('fontInput').value), showCard:$('showCardInput').checked, theme:$('themeInput').value};
    void saveSettings(CONFIG_KEY, cand, () => { config = cand; void update(); });
  });
  render();
  update = startExtension({load, render, openConfig, readConfig, fail:m => { items = []; message = m; }});
})();
