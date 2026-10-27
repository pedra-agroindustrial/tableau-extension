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

  // ===== Rosca de participação =====
  const CONFIG_KEY = 'donutShareConfig', CONFIG_VERSION = 1;
  const defaults = {
    version:CONFIG_VERSION, showHeader:true, title:'PARTICIPAÇÃO NA PRODUÇÃO TOTAL', subtitle:'Cana processada por unidade',
    exclude:'TOTAL, ANT', titleCase:true, sort:'desc', unit:'t', decimals:0, pctDecimals:2,
    centerLabel:'Produção acumulada', thickness:34, showSliceLabels:true, showLegend:true,
    palette:'#1e8e3e\n#8fce8f\n#4caf50\n#c5e8c5\n#2e7d32\n#a5d6a7', colors:{zero:'#b7bec5', accent:'#1e7b34', text:'#1f2933'},
    font:12, showCard:true, theme:'light'
  };
  let config = clone(defaults), items = [], message = 'Conectando ao Tableau…';

  function readConfig(){
    const raw = tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return;
    try{
      const c = JSON.parse(raw), d = defaults;
      config = {version:CONFIG_VERSION, showHeader:bool(c.showHeader, d.showHeader), title:str(c.title, 80, d.title), subtitle:str(c.subtitle, 120, d.subtitle),
        exclude:str(c.exclude, 200, d.exclude), titleCase:bool(c.titleCase, d.titleCase), sort:oneOf(c.sort, ['desc','tableau','alpha'], d.sort),
        unit:str(c.unit, 10, d.unit), decimals:intIn(c.decimals, 0, 2, d.decimals), pctDecimals:intIn(c.pctDecimals, 0, 2, d.pctDecimals),
        centerLabel:str(c.centerLabel, 40, d.centerLabel), thickness:intIn(c.thickness, 15, 60, d.thickness),
        showSliceLabels:bool(c.showSliceLabels, d.showSliceLabels), showLegend:bool(c.showLegend, d.showLegend),
        palette:str(c.palette, 400, d.palette),
        colors:Object.fromEntries(Object.keys(d.colors).map(k => [k, validColor(c.colors?.[k]) ? c.colors[k] : d.colors[k]])),
        font:intIn(c.font, 9, 18, d.font), showCard:bool(c.showCard, d.showCard), theme:oneOf(c.theme, ['light','gray','transparent'], d.theme)};
    }catch(_){ config = clone(defaults); }
  }
  const small = new Set(['da','de','do','das','dos','e']);
  const tc = s => String(s).toLocaleLowerCase('pt-BR').split(/\s+/).map((w, i) => i && small.has(w) ? w : w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1)).join(' ');
  const palette = () => { const p = String(config.palette).split(/[\s,;]+/).filter(validColor); return p.length ? p : defaults.palette.split('\n'); };

  async function load(){
    const r = await readSeries('category', 'value');
    const ex = new Set(listOf(config.exclude));
    let list = (r.items || []).filter(i => !ex.has(norm(i.label))).map(i => ({...i, value:finite(i.value) ? Math.max(0, i.value) : 0}));
    if (config.sort === 'desc') list.sort((a, b) => (b.value - a.value) || (a.ord - b.ord) || (a.seq - b.seq));
    if (config.sort === 'alpha') list.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', {numeric:true}));
    items = list; message = r.message || '';
  }

  function arcPath(cx, cy, R, r, a0, a1){
    const p = (rad, a) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    const large = a1 - a0 > Math.PI ? 1 : 0, [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
    return `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${large} 0 ${x3} ${y3}Z`;
  }

  function render(){
    const root = document.documentElement, body = document.body, c = config.colors;
    root.style.setProperty('--accent', c.accent); root.style.setProperty('--text', c.text); root.style.setProperty('--fs', config.font + 'px');
    for (const t of ['gray','transparent']){ root.classList.toggle(t, config.theme === t); body.classList.toggle(t, config.theme === t); }
    body.classList.toggle('card-on', config.showCard); body.classList.toggle('header-off', !config.showHeader); body.classList.toggle('legend-off', !config.showLegend);
    $('sectionTitle').textContent = config.title; $('sectionSubtitle').textContent = config.subtitle;
    $('notice').textContent = message;

    const total = items.reduce((s, i) => s + i.value, 0), pal = palette();
    let k = 0;
    const view = items.map(i => ({...i, name:config.titleCase ? tc(i.label) : i.label, pct:total > 0 ? i.value / total * 100 : 0,
      color:i.value > 0 ? pal[k++ % pal.length] : c.zero}));
    const unit = config.unit ? ' ' + config.unit : '';

    // legenda
    const leg = $('legendList');
    leg.innerHTML = view.map(v => `<div class="leg-item${v.value > 0 ? '' : ' zero'}"><i style="background:${v.color}"></i>
      <div class="leg-name" title="${esc(v.name)}">${esc(v.name)}</div>
      <div class="leg-val">${esc(fmt(v.value, config.decimals) + unit)}</div><div class="leg-pct">${esc(fmt(v.pct, config.pctDecimals))}%</div></div>`).join('');
    leg.classList.toggle('narrow', leg.clientWidth < 115);

    const svg = $('svg'); svg.replaceChildren();
    const box = $('chart').getBoundingClientRect(), W = box.width, H = box.height;
    if (!view.length || W < 40 || H < 40) return;
    const fs = config.font, labelSpace = config.showSliceLabels ? fs * 3.6 : 4;
    const R = Math.max(10, Math.min(W / 2 - labelSpace, H / 2 - (config.showSliceLabels ? fs * 1.4 : 4)));
    const r = R * (1 - config.thickness / 100), cx = W / 2, cy = H / 2;

    if (total <= 0){
      svg.append(svgEl('path', {d:arcPath(cx, cy, R, r, 0, Math.PI * 2), fill:'#eef1f3'}));
    }else{
      let a = 0;
      for (const v of view){
        if (v.value <= 0) continue;
        const a1 = a + v.value / total * Math.PI * 2;
        const p = svgEl('path', {class:'slice', d:arcPath(cx, cy, R, r, a, a1), fill:v.color, stroke:'#fff', 'stroke-width':view.filter(x => x.value > 0).length > 1 ? 2 : 0});
        p.append(svgEl('title', {}, `${v.name}: ${fmt(v.value, config.decimals)}${unit} (${fmt(v.pct, config.pctDecimals)}%)`));
        svg.append(p);
        if (config.showSliceLabels && v.pct >= 3){
          const m = (a + a1) / 2, lr = R + fs * .7;
          const x = cx + lr * Math.sin(m), y = cy - lr * Math.cos(m) + fs * .35;
          const anchor = Math.sin(m) > .3 ? 'start' : Math.sin(m) < -.3 ? 'end' : 'middle';
          svg.append(svgEl('text', {class:'slice-label', x, y, 'text-anchor':anchor}, fmt(v.pct, config.pctDecimals) + '%'));
        }
        a = a1;
      }
    }
    // centro: total + texto
    svg.append(svgEl('circle', {cx, cy, r:Math.max(0, r - 2), fill:'#fff'}));
    const vtxt = fmt(total, config.decimals) + unit;
    const vs = Math.max(9, Math.min(r * .42, fs * 1.9, (r * 1.6) / (vtxt.length * .6)));   // cabe dentro do furo
    svg.append(svgEl('text', {class:'center-value', x:cx, y:cy + (config.centerLabel ? -vs * .05 : vs * .35), 'font-size':vs}, vtxt));
    if (config.centerLabel && r > fs * 2.2){
      const words = config.centerLabel.split(' '), lines = words.length > 1 && r < fs * 6 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [config.centerLabel];
      const longest = Math.max(...lines.map(l => l.length)), ls = Math.min(fs * .92, (r * 1.55) / (longest * .55));
      // só desenha as linhas que cabem dentro do furo da rosca
      if (ls >= 7) lines.forEach((ln, i) => {
        const yy = cy + vs * .55 + ls * (i * 1.15 + .5);
        if (yy + ls * .25 < cy + r * .8) svg.append(svgEl('text', {class:'center-label', x:cx, y:yy, 'font-size':ls}, ln));
      });
    }
  }

  // ===== Painel =====
  const outs = () => { $('thicknessValue').textContent = $('thicknessInput').value + '%'; $('fontValue').textContent = $('fontInput').value + ' px'; };
  function openConfig(){
    if (!author) return;
    const c = config;
    $('showHeaderInput').checked = c.showHeader; $('titleInput').value = c.title; $('subtitleInput').value = c.subtitle;
    $('excludeInput').value = c.exclude; $('titleCaseInput').checked = c.titleCase; $('sortInput').value = c.sort;
    $('unitInput').value = c.unit; $('decimalsInput').value = String(c.decimals); $('pctDecimalsInput').value = String(c.pctDecimals);
    $('centerLabelInput').value = c.centerLabel; $('thicknessInput').value = String(c.thickness);
    $('showSliceLabelsInput').checked = c.showSliceLabels; $('showLegendInput').checked = c.showLegend; $('paletteInput').value = c.palette;
    $('colorZeroInput').value = c.colors.zero; $('colorAccentInput').value = c.colors.accent; $('colorTextInput').value = c.colors.text;
    $('fontInput').value = String(c.font); $('showCardInput').checked = c.showCard; $('themeInput').value = c.theme;
    outs(); $('saveStatus').textContent = ''; $('settingsPanel').hidden = false;
  }
  $('thicknessInput').addEventListener('input', outs); $('fontInput').addEventListener('input', outs);
  $('configure').addEventListener('click', openConfig);
  $('close').addEventListener('click', () => { $('settingsPanel').hidden = true; });
  let update;
  $('settingsForm').addEventListener('submit', e => {
    e.preventDefault(); if (!author) return;
    const bad = $('paletteInput').value.split(/[\s,;]+/).filter(Boolean).filter(x => !validColor(x));
    if (bad.length){ $('saveStatus').textContent = `Cor inválida na paleta: ${bad[0]} (use #rrggbb).`; return; }
    const cand = {version:CONFIG_VERSION, showHeader:$('showHeaderInput').checked, title:$('titleInput').value.trim(), subtitle:$('subtitleInput').value.trim(),
      exclude:$('excludeInput').value, titleCase:$('titleCaseInput').checked, sort:$('sortInput').value,
      unit:$('unitInput').value.trim(), decimals:Number($('decimalsInput').value), pctDecimals:Number($('pctDecimalsInput').value),
      centerLabel:$('centerLabelInput').value.trim(), thickness:Number($('thicknessInput').value),
      showSliceLabels:$('showSliceLabelsInput').checked, showLegend:$('showLegendInput').checked, palette:$('paletteInput').value.trim(),
      colors:{zero:$('colorZeroInput').value, accent:$('colorAccentInput').value, text:$('colorTextInput').value},
      font:Number($('fontInput').value), showCard:$('showCardInput').checked, theme:$('themeInput').value};
    void saveSettings(CONFIG_KEY, cand, () => { config = cand; void update(); });
  });
  render();
  update = startExtension({load, render, openConfig, readConfig, fail:m => { items = []; message = m; }});
})();
