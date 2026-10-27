(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = 'pivotTableConfig';
  const CONFIG_VERSION = 2;          // v1.1: totais vêm da base por padrão
  const MAX_MEASURES = 8, MAX_COLS = 40, MAX_ROWS = 300;
  const defaultColors = {head:'#1e7b34', headText:'#ffffff', total:'#e6f4ea', text:'#1f2933'};

  const defaults = {
    version:CONFIG_VERSION,
    showHeader:true, sectionTitle:'CONSOLIDADO POR HORA E UNIDADE',
    sectionNote:'Valores em toneladas (t), fibra (%) e ATR', iconColor:'#1e7b34',
    measures:{},                       // por nome do campo: {label, decimals, total, weight}
    totalColMode:'last', totalColLabel:'TOTAL',
    totalRowMode:'label', totalRowLabel:'Total',
    rowHeader:'Hora', empty:'zero', fontSize:12, dimZeros:true, zebra:false, fillHeight:true, upperGroups:true,
    colors:{...defaultColors}, theme:'light'
  };
  const KNOWN = [
    {re:/CANA/i,  m:{label:'Cana (t)',  decimals:0, total:'sum'}},
    {re:/FIBRA/i, m:{label:'Fibra (%)', decimals:2, total:'wavg', weightHint:/CANA/i}},
    {re:/ATR/i,   m:{label:'ATR',       decimals:2, total:'wavg', weightHint:/CANA/i}}
  ];

  let config = clone(defaults), sheet, author = false, saving = false, running = false, pending = false;
  let model = null, globalMessage = '';

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
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

  // ===== Configuração =====
  function readConfig(){
    const raw = tableau.extensions.settings.get(CONFIG_KEY);
    if (!raw) return clone(defaults);
    try{
      const c = JSON.parse(raw), d = clone(defaults);
      const measures = {};
      if (c.measures && typeof c.measures === 'object') for (const [k, m] of Object.entries(c.measures)){
        measures[k] = {label:str(m.label, 30, bareName(k)), decimals:intIn(m.decimals, 0, 4, 2),
          total:oneOf(m.total, ['sum','avg','wavg','min','max','none'], 'sum'), weight:str(m.weight, 200, '')};
      }
      // config da v1.0 (sem os modos de total): aproveita textos/medidas/cores e assume totais da base
      return {
        version:CONFIG_VERSION,
        showHeader:bool(c.showHeader, d.showHeader), sectionTitle:str(c.sectionTitle, 80, d.sectionTitle),
        sectionNote:str(c.sectionNote, 120, d.sectionNote), iconColor:validColor(c.iconColor) ? c.iconColor : d.iconColor,
        measures,
        totalColMode:oneOf(c.totalColMode, ['last','label','calc','none'], d.totalColMode), totalColLabel:str(c.totalColLabel, 30, d.totalColLabel),
        totalRowMode:oneOf(c.totalRowMode, ['label','calc','none'], d.totalRowMode), totalRowLabel:str(c.totalRowLabel, 30, d.totalRowLabel),
        rowHeader:str(c.rowHeader, 30, d.rowHeader), empty:oneOf(c.empty, ['zero','dash','blank'], d.empty),
        fontSize:intIn(c.fontSize, 9, 22, d.fontSize), dimZeros:bool(c.dimZeros, d.dimZeros), zebra:bool(c.zebra, d.zebra),
        fillHeight:bool(c.fillHeight, d.fillHeight), upperGroups:bool(c.upperGroups, d.upperGroups),
        colors:Object.fromEntries(Object.keys(defaultColors).map(k => [k, validColor(c.colors?.[k]) ? c.colors[k] : d.colors[k]])),
        theme:oneOf(c.theme, ['light','gray','transparent'], d.theme)
      };
    }catch(_){ return clone(defaults); }
  }

  function measureCfg(name, allNames){
    if (config.measures[name]) return config.measures[name];
    const k = KNOWN.find(x => x.re.test(bareName(name)));
    const base = {label:bareName(name), decimals:2, total:'sum', weight:''};
    if (!k) return base;
    const m = {...base, ...k.m};
    if (m.weightHint){ m.weight = allNames.find(n => n !== name && m.weightHint.test(bareName(n))) || ''; if (!m.weight) m.total = 'avg'; }
    delete m.weightHint;
    return m;
  }

  // ===== Totais calculados (só quando o modo for "calc") =====
  function aggregate(cells, name, cfg){
    const vals = cells.map(c => c ? c[name] : null).filter(finite);
    if (!vals.length || cfg.total === 'none') return null;
    switch (cfg.total){
      case 'sum': return vals.reduce((a, b) => a + b, 0);
      case 'avg': return vals.reduce((a, b) => a + b, 0) / vals.length;
      case 'min': return Math.min(...vals);
      case 'max': return Math.max(...vals);
      case 'wavg':{
        let sw = 0, swv = 0;
        for (const c of cells){
          if (!c || !finite(c[name])) continue;
          const w = finite(c[cfg.weight]) ? c[cfg.weight] : 0;
          sw += w; swv += w * c[name];
        }
        return sw !== 0 ? swv / sw : 0;
      }
    }
    return null;
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

  async function readModel(){
    const spec = await getSpec(), card = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const enc = card ? card.encodings : [];
    const fieldsOf = id => enc.filter(e => e.id === id).flatMap(e => e.fields ? e.fields : (e.field ? [e.field] : []));
    const rowFields = fieldsOf('row'), colFields = fieldsOf('col');
    const fMeasures = fieldsOf('measure').slice(0, MAX_MEASURES);
    if (!rowFields.length) return {message:'Arraste ORDEM_LINHA e HORA para a entrada Linha.'};
    if (!fMeasures.length) return {message:'Arraste as medidas (ex.: CANA, FIBRA, ATR) para a entrada Medidas.'};

    const table = await readTable();
    if (!table.data.length) return {message:'Sem dados para os filtros atuais.'};
    const colOf = f => {
      let col = table.columns.find(c => c.fieldName === f.name);
      if (!col) col = table.columns.find(c => bareName(c.fieldName) === bareName(f.name));
      if (!col) throw new Error(`O campo ${f.name} não foi encontrado nos dados da planilha.`);
      return col;
    };
    const isNumType = col => /^(int|float|real|number|integer|double)/i.test(String(col.dataType || ''));
    // Com 2 campos na entrada: o numérico é a ORDEM e o texto é o RÓTULO, em qualquer ordem das pílulas.
    const pair = fields => {
      if (!fields.length) return {label:-1, order:-1};
      if (fields.length === 1) return {label:colOf(fields[0]).index, order:-1};
      const a = colOf(fields[0]), b = colOf(fields[1]);
      if (isNumType(a) && !isNumType(b)) return {label:b.index, order:a.index};
      if (isNumType(b) && !isNumType(a)) return {label:a.index, order:b.index};
      return {label:b.index, order:a.index};
    };
    const R = pair(rowFields), C = pair(colFields);
    const mIdx = fMeasures.map(f => ({name:f.name, i:colOf(f).index}));
    const raw = (row, i) => { const c = row[i]; return c ? c.value : null; };
    const shown = (row, i) => { const c = row[i]; return c ? String(c.formattedValue ?? c.value).trim() : ''; };
    const ordKey = v => finite(v) ? v : (isNull(v) ? Infinity : (Number.isFinite(Number(v)) ? Number(v) : String(v)));

    const rows = new Map(), cols = new Map(), cells = new Map();
    let dupes = 0, seq = 0;
    // a ORDEM faz parte da chave: os dois "06" (ordens diferentes) nunca se juntam
    const keyOf = (label, ord) => `${ord === undefined ? '' : String(ord)}\u0001${label}`;
    for (const r of table.data){
      const rLabel = isNull(raw(r, R.label)) ? '(vazio)' : shown(r, R.label);
      const rOrd = R.order >= 0 ? raw(r, R.order) : undefined;
      const cLabel = C.label >= 0 ? (isNull(raw(r, C.label)) ? '(vazio)' : shown(r, C.label)) : '';
      const cOrd = C.order >= 0 ? raw(r, C.order) : undefined;
      const rk = keyOf(rLabel, rOrd), ck = keyOf(cLabel, cOrd);
      if (!rows.has(rk)) rows.set(rk, {key:rk, label:rLabel, ord:ordKey(rOrd), seq:seq++});
      if (!cols.has(ck)) cols.set(ck, {key:ck, label:cLabel, ord:ordKey(cOrd), seq:seq++});
      const cellKey = rk + '\u0002' + ck;
      if (cells.has(cellKey)){ dupes++; continue; }
      const cell = {};
      for (const m of mIdx){ const v = raw(r, m.i); cell[m.name] = finite(v) ? v : null; }
      cells.set(cellKey, cell);
    }
    const byOrder = (a, b) => {
      if (typeof a.ord === 'number' && typeof b.ord === 'number' && a.ord !== b.ord) return a.ord - b.ord;
      if (typeof a.ord !== typeof b.ord) return typeof a.ord === 'number' ? -1 : 1;
      if (typeof a.ord === 'string' && a.ord !== b.ord) return a.ord.localeCompare(b.ord, 'pt-BR', {numeric:true});
      return a.seq - b.seq;
    };
    let rowList = [...rows.values()].sort(byOrder), colList = [...cols.values()].sort(byOrder);
    let message = '';
    if (R.order < 0) message = 'Dica: coloque ORDEM_LINHA junto com HORA na entrada Linha para manter a ordem e separar as horas repetidas.';
    if (rowList.length > MAX_ROWS){ rowList = rowList.slice(0, MAX_ROWS); message = `Exibindo ${MAX_ROWS} linhas. Filtre no Tableau para ver o restante.`; }
    if (colList.length > MAX_COLS){ colList = colList.slice(0, MAX_COLS); message = `Exibindo ${MAX_COLS} colunas. Filtre no Tableau para ver o restante.`; }
    if (dupes) message = `${dupes} combinação(ões) Linha × Coluna repetidas foram ignoradas. Retire dimensões extras do cartão Marcas.`;
    return {
      rowField:(rowFields[1] || rowFields[0]).name, hasCols:C.label >= 0, measures:mIdx.map(m => m.name),
      rows:rowList, cols:colList, cell:(rk, ck) => cells.get(rk + '\u0002' + ck) || null, message
    };
  }

  // ===== Renderização =====
  function applyGlobalStyle(){
    const body = document.body, root = document.documentElement, c = config.colors;
    root.style.setProperty('--head', c.head); root.style.setProperty('--head-text', c.headText);
    root.style.setProperty('--total', c.total); root.style.setProperty('--text', c.text);
    root.style.setProperty('--icon', config.iconColor); root.style.setProperty('--fs', config.fontSize + 'px');
    for (const t of ['gray','transparent']){ root.classList.toggle(t, config.theme === t); body.classList.toggle(t, config.theme === t); }
    body.classList.toggle('header-off', !config.showHeader);
    body.classList.toggle('dim', config.dimZeros);
    body.classList.toggle('zebra', config.zebra);
    body.classList.toggle('fill', config.fillHeight);
    body.classList.toggle('upper', config.upperGroups);
    $('sectionTitle').textContent = config.sectionTitle;
    $('sectionNote').textContent = config.sectionNote;
  }

  function cellHtml(v, cfg, cls){
    let text, z = false;
    if (!finite(v)){
      if (config.empty === 'zero'){ text = fmt(0, cfg.decimals); z = true; }
      else text = config.empty === 'dash' ? '—' : '';
    }else{
      text = fmt(v, cfg.decimals);
      z = Number(text.replace(/\./g, '').replace(',', '.')) === 0;
    }
    const classes = [cls, z ? 'z' : ''].filter(Boolean).join(' ');
    return `<td${classes ? ` class="${classes}"` : ''}>${esc(text)}</td>`;
  }

  function render(){
    applyGlobalStyle();
    const tbl = $('table');
    if (!model || !model.rows){ tbl.innerHTML = ''; $('notice').textContent = globalMessage || (model && model.message) || ''; return; }

    const ms = model.measures, cfgs = Object.fromEntries(ms.map(n => [n, measureCfg(n, ms)]));
    const hasCols = model.hasCols;

    // ---- coluna de total: vem da base (última coluna ou pelo rótulo) ou é calculada ----
    let dataCols = model.cols.slice(), totalCol = null, calcCol = false;
    if (hasCols){
      if (config.totalColMode === 'last' && dataCols.length > 1) totalCol = dataCols.pop();
      else if (config.totalColMode === 'label'){
        const i = dataCols.findIndex(c => norm(c.label) === norm(config.totalColLabel));
        if (i >= 0) totalCol = dataCols.splice(i, 1)[0];
      }else if (config.totalColMode === 'calc') calcCol = true;
    }
    // ---- linha de total: vem da base (pelo rótulo, sempre no fim) ou é calculada ----
    let dataRows = model.rows.slice(), totalRow = null, calcRow = false;
    if (config.totalRowMode === 'label'){
      const i = dataRows.findIndex(r => norm(r.label) === norm(config.totalRowLabel));
      if (i >= 0) totalRow = dataRows.splice(i, 1)[0];
    }else if (config.totalRowMode === 'calc') calcRow = true;

    const calcOver = cells => Object.fromEntries(ms.map(n => [n, aggregate(cells, n, cfgs[n])]));
    const totalColCell = r => totalCol ? model.cell(r.key, totalCol.key) : calcOver(dataCols.map(c => model.cell(r.key, c.key)));
    const totalRowCell = c => totalRow ? model.cell(totalRow.key, c.key) : calcOver(dataRows.map(r => model.cell(r.key, c.key)));
    const grandCell = () => {
      if (totalRow && totalCol) return model.cell(totalRow.key, totalCol.key);
      if (totalRow) return calcOver(dataCols.map(c => model.cell(totalRow.key, c.key)));
      if (totalCol) return calcOver(dataRows.map(r => model.cell(r.key, totalCol.key)));
      const all = []; for (const r of dataRows) for (const c of dataCols) all.push(model.cell(r.key, c.key));
      return calcOver(all);
    };
    const showTotalCol = !!totalCol || calcCol, showTotalRow = !!totalRow || calcRow;

    const nGroups = dataCols.length + (showTotalCol ? 1 : 0);
    const firstW = Math.max(5, Math.min(12, 60 / (nGroups * ms.length + 1)));
    document.documentElement.style.setProperty('--w-first', firstW.toFixed(1) + '%');
    const rowHead = esc(config.rowHeader || bareName(model.rowField));

    let h = '<thead>';
    const mHeads = tg => ms.map((n, i) => `<th class="m${i === 0 ? ' first' : ''}${tg ? ' tg' : ''}">${esc(cfgs[n].label)}</th>`).join('');
    if (hasCols){
      h += `<tr><th class="rowhead" rowspan="2">${rowHead}</th>`;
      for (const c of dataCols) h += `<th class="grp" colspan="${ms.length}" title="${esc(c.label)}">${esc(c.label)}</th>`;
      if (showTotalCol) h += `<th class="grp tg" colspan="${ms.length}">${esc(totalCol ? totalCol.label : config.totalColLabel)}</th>`;
      h += '</tr><tr>';
      for (const c of dataCols) h += mHeads(false);
      if (showTotalCol) h += mHeads(true);
      h += '</tr>';
    }else{
      h += `<tr><th class="rowhead">${rowHead}</th>${mHeads(false)}</tr>`;
    }
    h += '</thead><tbody>';

    const rowCells = (cellOf, totalCellFn) => {
      let s = '';
      for (const c of dataCols){
        const cell = cellOf(c);
        ms.forEach((n, i) => { s += cellHtml(cell ? cell[n] : null, cfgs[n], i === 0 ? 'first' : ''); });
      }
      if (showTotalCol){
        const t = totalCellFn() || {};
        ms.forEach((n, i) => { s += cellHtml(t[n], cfgs[n], i === 0 ? 'first tc' : 'tc'); });
      }
      return s;
    };
    for (const r of dataRows){
      h += `<tr><th title="${esc(r.label)}">${esc(r.label)}</th>`;
      h += rowCells(c => model.cell(r.key, c.key), () => totalColCell(r));
      h += '</tr>';
    }
    if (showTotalRow){
      h += `<tr class="tr"><th>${esc(totalRow ? totalRow.label : config.totalRowLabel)}</th>`;
      h += rowCells(c => totalRowCell(c), grandCell);
      h += '</tr>';
    }
    h += '</tbody>';
    tbl.innerHTML = h;

    const first = tbl.querySelector('thead tr');
    if (first) tbl.style.setProperty('--h1', first.getBoundingClientRect().height + 'px');
    let msg = globalMessage || model.message || '';
    if (!msg && config.totalRowMode === 'label' && !totalRow) msg = `Linha "${config.totalRowLabel}" não encontrada nos dados; tabela sem linha de total.`;
    $('notice').textContent = msg;
  }

  // ===== Painel de configuração =====
  const colorIds = {head:'colorHeadInput', headText:'colorHeadTextInput', total:'colorTotalInput', text:'colorTextInput'};
  const TOTAL_OPTS = [['sum','Soma'],['wavg','Média ponderada'],['avg','Média simples'],['min','Mínimo'],['max','Máximo'],['none','Sem total']];

  function renderMeasureEditor(){
    const box = $('measuresContainer'), ms = model && model.measures ? model.measures : [];
    if (!ms.length){ box.innerHTML = '<p class="hint">Arraste as medidas para a entrada <strong>Medidas</strong> e abra o Configurar de novo.</p>'; return; }
    box.innerHTML = ms.map(n => {
      const c = measureCfg(n, ms);
      const weights = ms.filter(x => x !== n).map(x => `<option value="${esc(x)}"${x === c.weight ? ' selected' : ''}>${esc(bareName(x))}</option>`).join('');
      return `<div class="m-row" data-name="${esc(n)}">
        <div class="m-name" title="${esc(n)}">${esc(bareName(n))}</div>
        <label>Rótulo<input class="m-label" maxlength="30" value="${esc(c.label)}"></label>
        <label>Decimais<select class="m-dec">${[0,1,2,3,4].map(d => `<option${d === c.decimals ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Total (se calculado)<select class="m-total">${TOTAL_OPTS.map(([v, t]) => `<option value="${v}"${v === c.total ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Peso<select class="m-weight"><option value="">—</option>${weights}</select></label>
      </div>`;
    }).join('');
    syncModes();
  }
  function syncModes(){
    const calc = $('totalColModeInput').value === 'calc' || $('totalRowModeInput').value === 'calc';
    $('totalColLabelInput').disabled = $('totalColModeInput').value !== 'label' && $('totalColModeInput').value !== 'calc';
    $('totalRowLabelInput').disabled = $('totalRowModeInput').value === 'none';
    $('measuresContainer').querySelectorAll('.m-row').forEach(row => {
      row.querySelector('.m-total').disabled = !calc;
      row.querySelector('.m-weight').disabled = !calc || row.querySelector('.m-total').value !== 'wavg';
    });
  }

  function openConfig(){
    if (!author || saving) return;
    const c = config;
    $('showHeaderInput').checked = c.showHeader; $('sectionTitleInput').value = c.sectionTitle;
    $('sectionNoteInput').value = c.sectionNote; $('iconColorInput').value = c.iconColor;
    $('totalColModeInput').value = c.totalColMode; $('totalColLabelInput').value = c.totalColLabel;
    $('totalRowModeInput').value = c.totalRowMode; $('totalRowLabelInput').value = c.totalRowLabel;
    renderMeasureEditor();
    $('rowHeaderInput').value = c.rowHeader; $('emptyInput').value = c.empty;
    $('fontSizeInput').value = String(c.fontSize); $('fontSizeValue').textContent = c.fontSize + ' px';
    $('dimZerosInput').checked = c.dimZeros; $('zebraInput').checked = c.zebra;
    $('fillHeightInput').checked = c.fillHeight; $('upperGroupsInput').checked = c.upperGroups;
    for (const [k, id] of Object.entries(colorIds)) $(id).value = c.colors[k];
    $('themeInput').value = c.theme;
    syncModes();
    $('saveStatus').textContent = ''; $('settingsPanel').hidden = false;
  }
  function closeConfig(){ $('settingsPanel').hidden = true; }

  async function saveConfig(e){
    e.preventDefault(); if (!author || saving) return;
    const measures = {...config.measures};
    $('measuresContainer').querySelectorAll('.m-row').forEach(row => {
      const total = row.querySelector('.m-total').value, weight = row.querySelector('.m-weight').value;
      measures[row.dataset.name] = {
        label:row.querySelector('.m-label').value.trim() || bareName(row.dataset.name),
        decimals:Number(row.querySelector('.m-dec').value),
        total:total === 'wavg' && !weight ? 'avg' : total, weight
      };
    });
    const candidate = {
      version:CONFIG_VERSION,
      showHeader:$('showHeaderInput').checked, sectionTitle:$('sectionTitleInput').value.trim(),
      sectionNote:$('sectionNoteInput').value.trim(), iconColor:$('iconColorInput').value,
      measures,
      totalColMode:$('totalColModeInput').value, totalColLabel:$('totalColLabelInput').value.trim() || 'TOTAL',
      totalRowMode:$('totalRowModeInput').value, totalRowLabel:$('totalRowLabelInput').value.trim() || 'Total',
      rowHeader:$('rowHeaderInput').value.trim(), empty:$('emptyInput').value,
      fontSize:Number($('fontSizeInput').value), dimZeros:$('dimZerosInput').checked, zebra:$('zebraInput').checked,
      fillHeight:$('fillHeightInput').checked, upperGroups:$('upperGroupsInput').checked,
      colors:Object.fromEntries(Object.entries(colorIds).map(([k, id]) => [k, $(id).value])),
      theme:$('themeInput').value
    };
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

  async function update(){
    pending = true; if (running) return; running = true;
    try{
      while (pending){
        pending = false;
        try{ model = await readModel(); globalMessage = model.rows ? '' : model.message; }
        catch(err){ model = null; globalMessage = 'Não foi possível ler os campos: ' + errText(err); }
        if (!pending) render();
      }
    }finally{ running = false; }
  }

  // ===== Eventos =====
  $('fontSizeInput').addEventListener('input', () => { $('fontSizeValue').textContent = $('fontSizeInput').value + ' px'; });
  ['totalColModeInput','totalRowModeInput'].forEach(id => $(id).addEventListener('change', syncModes));
  $('measuresContainer').addEventListener('change', e => { if (e.target.classList.contains('m-total')) syncModes(); });
  $('resetColors').addEventListener('click', () => { for (const [k, id] of Object.entries(colorIds)) $(id).value = defaultColors[k]; $('iconColorInput').value = defaults.iconColor; });
  $('configure').addEventListener('click', openConfig);
  $('close').addEventListener('click', closeConfig);
  $('settingsForm').addEventListener('submit', saveConfig);

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
