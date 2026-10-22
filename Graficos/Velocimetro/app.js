(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const defaults = {
    maximum: 100, title: 'Velocímetro', unit: '%',
    decimals: 1, theme: 'light', poolZoom: 120, fitMode: 'proportional',
    fontTitle: 18, fontPercentage: 29, fontLabel: 20, arcPercent: 70, showUnit: true,
    majorTickLength: 23, smallTickLength: 9, majorTickOffset: 0, smallTickOffset: 0, numberOffset: 0,
    majorTickStyle: 'standard', smallTickStyle: 'standard', showMajorTicks: true, showSmallTicks: true,
    design: 'modern', colorPreset: 'mono', useColorRanges: false, colorRanges: [],
    colors: { progress: '#303030', track: '#e9e9e9', needle: '#303030', labels: '#686868', numbers: '#686868', value: '#303030' }
  };

  let config = { ...defaults };
  let sheet, author = false, saving = false, running = false, pending = false;
  let current = null, fieldName = '', dataMessage = '', dynamicTitle = null, dynamicInfo = '', angle = 0;
  let animation = null, trembleAnimation = null, resizeObserver = null;
  const ns = 'http://www.w3.org/2000/svg';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const validMax = n => finite(n) && n > 0;
  const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const validColorRanges = ranges => Array.isArray(ranges) && ranges.length >= 1 && ranges.length <= 10 && ranges.every((r, i) => validColor(r.color) && finite(r.end) && r.end > (i ? ranges[i - 1].end : 0) && r.end <= 500);
  const number = (n, decimals = config.decimals) =>
    n.toLocaleString('pt-BR', { maximumFractionDigits: decimals });

  const palettes = {
    mono: { progress: '#303030', track: '#e9e9e9', needle: '#303030', labels: '#686868', numbers: '#686868', value: '#303030' },
    ocean: { progress: '#1976d2', track: '#dceaf7', needle: '#0d47a1', labels: '#476579', numbers: '#476579', value: '#17324a' },
    forest: { progress: '#2e7d32', track: '#e3eee4', needle: '#1b5e20', labels: '#526b54', numbers: '#526b54', value: '#213c25' },
    sunset: { progress: '#e87516', track: '#f6ead9', needle: '#a84312', labels: '#735e4a', numbers: '#735e4a', value: '#4b3527' },
    violet: { progress: '#7c3aed', track: '#ece6f7', needle: '#4c1d95', labels: '#675c7e', numbers: '#675c7e', value: '#35245a' },
    redNeedle: { progress: '#303030', track: '#e6e6e6', needle: '#c51f32', labels: '#282828', numbers: '#282828', value: '#151515' }
  };

  const cx = 300, cy = 220, radius = 190;
  function innerEdgeRadius() {
    return radius - (config.design === 'analog' ? 14 : config.design === 'minimal' ? 6 : config.design === 'realistic' ? 6 : 10);
  }
  function arcSweep() { return config.arcPercent * 3.6; }
  function arcStart() { return 270 - arcSweep() / 2; }
  function zeroAngle() { return arcStart() - 180; }
  function pointOnArc(fraction, r = radius) {
    const radians = (arcStart() + fraction * arcSweep()) * Math.PI / 180;
    return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)];
  }
  function arcPath() {
    const [x1, y1] = pointOnArc(0), [x2, y2] = pointOnArc(1);
    const largeArc = arcSweep() > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  function calculateAngle(value) {
    const fraction = Math.max(0, Math.min(1, value / config.maximum));
    return zeroAngle() + fraction * arcSweep();
  }

  function readConfig() {
    const raw = tableau.extensions.settings.get('gaugeConfig');
    if (!raw) return { ...defaults };

    try {
      const c = JSON.parse(raw);
      return {
        maximum: validMax(c.maximum) ? ((typeof c.unit === 'string' && c.unit.trim().toLowerCase() === 'km/h') ? 100 : c.maximum) : defaults.maximum,
        title: typeof c.title === 'string' ? c.title.slice(0, 80) : defaults.title,
        unit: typeof c.unit === 'string' && c.unit.trim() ? (c.unit.trim().toLowerCase() === 'km/h' ? '%' : c.unit.slice(0, 24)) : defaults.unit,
        decimals: Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= 3
          ? c.decimals : 1,
        theme: ['light', 'gray', 'transparent', 'dark'].includes(c.theme) ? c.theme : defaults.theme,
        arcPercent: Number.isInteger(c.arcPercent) && c.arcPercent >= 50 && c.arcPercent <= 80 ? c.arcPercent : defaults.arcPercent,
        poolZoom: Number.isInteger(c.poolZoom) && c.poolZoom >= 90 && c.poolZoom <= 125
          ? c.poolZoom : defaults.poolZoom,
        fitMode: ['proportional', 'fill'].includes(c.fitMode) ? c.fitMode : defaults.fitMode,
        fontTitle: Number.isInteger(c.fontTitle) && c.fontTitle >= 10 && c.fontTitle <= 36
          ? c.fontTitle : defaults.fontTitle,
        fontPercentage: Number.isInteger(c.fontPercentage) && c.fontPercentage >= 16 && c.fontPercentage <= 48
          ? c.fontPercentage : defaults.fontPercentage,
        fontLabel: Number.isInteger(c.fontLabel) && c.fontLabel >= 12 && c.fontLabel <= 36
          ? c.fontLabel : defaults.fontLabel,
        showUnit: typeof c.showUnit === 'boolean' ? c.showUnit : defaults.showUnit,
        majorTickLength: Number.isInteger(c.majorTickLength) && c.majorTickLength >= 8 && c.majorTickLength <= 30
          ? (c.majorTickLength === 16 ? defaults.majorTickLength : c.majorTickLength) : defaults.majorTickLength,
        smallTickLength: Number.isInteger(c.smallTickLength) && c.smallTickLength >= 4 && c.smallTickLength <= 28
          ? (c.smallTickLength === 12 ? defaults.smallTickLength : c.smallTickLength) : defaults.smallTickLength,
        majorTickOffset: Number.isInteger(c.majorTickOffset) && c.majorTickOffset >= -24 && c.majorTickOffset <= 24 ? c.majorTickOffset : defaults.majorTickOffset,
        smallTickOffset: Number.isInteger(c.smallTickOffset) && c.smallTickOffset >= -24 && c.smallTickOffset <= 24 ? c.smallTickOffset : defaults.smallTickOffset,
        numberOffset: Number.isInteger(c.numberOffset) && c.numberOffset >= -24 && c.numberOffset <= 24 ? c.numberOffset : defaults.numberOffset,
        majorTickStyle: ['standard', 'thin', 'bold', 'dot'].includes(c.majorTickStyle) ? c.majorTickStyle : defaults.majorTickStyle,
        smallTickStyle: ['standard', 'thin', 'bold', 'dot'].includes(c.smallTickStyle) ? c.smallTickStyle : defaults.smallTickStyle,
        showMajorTicks: typeof c.showMajorTicks === 'boolean' ? c.showMajorTicks : defaults.showMajorTicks,
        showSmallTicks: typeof c.showSmallTicks === 'boolean' ? c.showSmallTicks : defaults.showSmallTicks,
        design: ['modern', 'minimal', 'analog', 'realistic'].includes(c.design) ? c.design : defaults.design,
        colorPreset: ['mono', 'ocean', 'forest', 'sunset', 'violet', 'redNeedle', 'custom'].includes(c.colorPreset) ? c.colorPreset : defaults.colorPreset,
        colors: Object.fromEntries(Object.entries(defaults.colors).map(([key, fallback]) => [key, validColor(c.colors?.[key]) ? c.colors[key] : fallback])),
        useColorRanges: typeof c.useColorRanges === 'boolean' ? c.useColorRanges : defaults.useColorRanges,
        colorRanges: Array.isArray(c.colorRanges) && validColorRanges(c.colorRanges.map(r => ({color:r.color,end:Number(r.end)}))) ? c.colorRanges.map(r => ({color:r.color,end:Number(r.end)})) : []
      };
    } catch (_) {
      return { ...defaults };
    }
  }

  function setNeedleAngle(value) {
    $('needle').setAttribute('transform', `rotate(${value} ${cx} ${cy})`);
  }

  function animateNeedleTremble(target) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tick = t => {
      const wobble = Math.sin(t * 0.045) * 0.45 + Math.sin(t * 0.079) * 0.16;
      setNeedleAngle(target + wobble);
      trembleAnimation = requestAnimationFrame(tick);
    };
    trembleAnimation = requestAnimationFrame(tick);
  }

  function moveNeedle(target, trembling = false) {
    if (animation !== null) cancelAnimationFrame(animation);
    if (trembleAnimation !== null) cancelAnimationFrame(trembleAnimation);
    trembleAnimation = null;
    const initial = angle;
    const start = performance.now();
    const reducingSpeed = target < initial;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0 : reducingSpeed ? 750 : 450;

    function frame(t) {
      const p = duration ? Math.min(1, (t - start) / duration) : 1;
      const eased = reducingSpeed
        ? 0.5 - 0.5 * Math.cos(Math.PI * p)
        : 1 - Math.pow(1 - p, 3);
      angle = initial + (target - initial) * eased;
      setNeedleAngle(angle);
      if (p < 1) animation = requestAnimationFrame(frame);
      else {
        angle = target;
        if (trembling) animateNeedleTremble(target);
      }
    }
    animation = requestAnimationFrame(frame);
  }

  function renderTicks() {
    $('ticks').replaceChildren();
    if (!validMax(config.maximum)) return;
    const realistic = config.design === 'realistic';
    const divisions = 40;
    const step = 4;
    for (let i = 0; i <= divisions; i++) {
      const fraction = i / divisions;
      const radians = (arcStart() + fraction * arcSweep()) * Math.PI / 180;
      const major = i % step === 0;
      const medium = !major && i % 2 === 0;
      const visible = major ? config.showMajorTicks : config.showSmallTicks;
      const offset = major ? config.majorTickOffset : config.smallTickOffset;
      const style = major ? config.majorTickStyle : config.smallTickStyle;
      const smallLength = Math.min(config.smallTickLength, config.majorTickLength);
      const length = major ? config.majorTickLength : medium
        ? Math.round(smallLength + (config.majorTickLength - smallLength) * 0.43) : smallLength;
      const outerRadius = radius - 13 + offset;
      const innerRadius = outerRadius - length;
      if (visible) {
        if (style === 'dot') {
          const mark = document.createElementNS(ns, 'circle');
          const markRadius = Math.max(1.2, Math.min(5, length / (major ? 4 : medium ? 6 : 8))); 
          const midRadius = (outerRadius + innerRadius) / 2;
          mark.setAttribute('cx', cx + midRadius * Math.cos(radians));
          mark.setAttribute('cy', cy + midRadius * Math.sin(radians));
          mark.setAttribute('r', markRadius);
          mark.setAttribute('class', `tick-dot ${major ? 'major' : medium ? 'medium' : 'minor'}`);
          $('ticks').append(mark);
        } else {
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('x1', cx + outerRadius * Math.cos(radians));
          line.setAttribute('y1', cy + outerRadius * Math.sin(radians));
          line.setAttribute('x2', cx + innerRadius * Math.cos(radians));
          line.setAttribute('y2', cy + innerRadius * Math.sin(radians));
          line.setAttribute('class', `${major ? 'major' : medium ? 'medium' : 'minor'} style-${style}`);
          const width = style === 'thin' ? (major ? 1.6 : medium ? 1.1 : 0.8)
            : style === 'bold' ? (major ? 5.5 : medium ? 3.4 : 2.4)
            : (major ? 4 : medium ? 2.4 : 1.5);
          line.setAttribute('stroke-width', String(width));
          $('ticks').append(line);
        }
      }
      if (major) {
        const label = document.createElementNS(ns, 'text');
        const labelRadius = (realistic ? radius - 54 : 151) + config.numberOffset;
        label.setAttribute('x', cx + labelRadius * Math.cos(radians));
        label.setAttribute('y', cy + labelRadius * Math.sin(radians) + 5);
        label.setAttribute('font-size', String(16 / (config.poolZoom / 100)));
        label.textContent = number(config.maximum * fraction, realistic ? 0 : tickDecimals()) + (config.unit === '%' ? '%' : '');
        $('ticks').append(label);
      }
    }
  }

  function tickDecimals() {
    const step = config.maximum / 10;
    return Number.isInteger(step) ? 0 : Math.min(2, Math.max(1, config.decimals));
  }

  function render() {
    for (const theme of ['gray', 'transparent', 'dark']) {
      document.documentElement.classList.toggle(theme, config.theme === theme);
      document.body.classList.toggle(theme, config.theme === theme);
    }
    document.body.dataset.design = config.design;
    const colors = config.colorPreset === 'custom' ? config.colors : palettes[config.colorPreset] || palettes.mono;
    for (const [key, value] of Object.entries(colors)) document.body.style.setProperty(`--gauge-${key}`, value);
    const zoom = config.poolZoom / 100;
    const viewWidth = 600 / zoom, viewHeight = 500 / zoom;
    const viewTop = config.design === 'realistic' ? cy - viewHeight / 2 : (500 - viewHeight) / 2;
    $('gauge').setAttribute('viewBox', `${(600 - viewWidth) / 2} ${viewTop} ${viewWidth} ${viewHeight}`);
    const path = arcPath();
    $('track').setAttribute('d', path);
    $('progress').setAttribute('d', path);
    $('gauge').setAttribute('preserveAspectRatio', config.fitMode === 'fill' ? 'none' : 'xMidYMid meet');
    $('realisticDecor').style.display = config.design === 'realistic' ? '' : 'none';
    $('realisticSideHubs').style.display = config.design === 'realistic' ? '' : 'none';
    $('needlePivot').setAttribute('r', config.design === 'realistic' ? '24' : '12');
    $('needle').classList.toggle('needle-style-realistic', config.design === 'realistic');
    $('needle').classList.toggle('needle-style-analog', config.design === 'analog');
    $('needle').classList.toggle('needle-style-modern', config.design !== 'realistic' && config.design !== 'analog');
    $('value').setAttribute('y', config.design === 'realistic' ? '330' : '280');
    $('unitLabel').setAttribute('y', config.design === 'realistic' ? '366' : '315');
    $('title').textContent = dynamicTitle !== null ? dynamicTitle : (config.title || fieldName || 'Velocímetro');
    $('title').style.display = dynamicTitle === '' ? 'none' : '';
    $('title').style.fontSize = `${config.fontTitle}px`;
    $('value').setAttribute('font-size', String(config.fontPercentage / zoom));
    $('unitLabel').textContent = config.showUnit ? config.unit : '';
    $('unitLabel').setAttribute('font-size', String(config.fontLabel / zoom));
    $('infoLabel').textContent = dynamicInfo;
    $('infoLabel').style.display = dynamicInfo ? '' : 'none';
    $('infoLabel').setAttribute('font-size', String(config.fontLabel / zoom));
    $('infoLabel').setAttribute('y', config.design === 'realistic' ? (config.showUnit ? '398' : '366') : (config.showUnit ? '355' : '320'));
    renderTicks();

    const hasValue = finite(current);
    const usable = hasValue && validMax(config.maximum);
    $('value').textContent = hasValue ? number(current) : '—';
    $('unitLabel').textContent = config.showUnit ? config.unit : '';
    let progressColor = colors.progress;
    if (usable && config.useColorRanges && config.colorRanges.length) {
      const percent = Math.max(0, current / config.maximum * 100);
      let rangeIndex = config.colorRanges.findIndex((range, i) => percent < range.end || i === config.colorRanges.length - 1);
      if (rangeIndex < 0) rangeIndex = config.colorRanges.length - 1;
      progressColor = config.colorRanges[rangeIndex].color;
    }
    $('progress').style.stroke = progressColor;
    $('progress').style.strokeDasharray = `${usable ? Math.min(1, Math.max(0, current / config.maximum)) * 100 : 0} 100`;
    $('needle').style.visibility = usable ? 'visible' : 'hidden';
    moveNeedle(usable ? calculateAngle(current) : zeroAngle(), usable && current > 0);

    let message = !validMax(config.maximum)
      ? 'Defina e salve o máximo no modo de edição.'
      : dataMessage;
    if (usable && current > config.maximum) message = 'Valor acima do máximo da escala.';
    if (usable && current < 0) message = 'Valor abaixo de zero.';

    $('notice').textContent = message;
    $('gauge').setAttribute(
      'aria-label',
      hasValue
        ? `${fieldName || 'Valor'}: ${number(current)}${config.showUnit ? ` ${config.unit}` : ''}. Escala de 0 a ${config.maximum ?? 'não configurado'}. ${message}`
        : message || 'Sem dados'
    );
  }

  function gaugeRangesFromForm() {
    return [...$('gaugeRangesContainer').querySelectorAll('.range-row')]
      .map(row => ({ color: row.querySelector('.range-color').value, end: Number(row.querySelector('.range-end').value) }));
  }

  function renderGaugeRangeEditor(ranges) {
    $('gaugeRangesContainer').innerHTML = ranges.map((range, i) => {
      const start = i ? ranges[i - 1].end : 0;
      return `<fieldset class="range-row"><legend>Faixa ${i + 1}</legend><label>Cor<input class="range-color" type="color" value="${range.color}"></label><div class="range-bounds"><label>De (%)<input class="range-start" type="number" value="${start}" readonly></label><label>Até (%)<input class="range-end" type="number" min="${start}" max="500" step="0.1" value="${range.end}"></label></div><button class="remove-range" type="button" ${ranges.length === 1 ? 'disabled' : ''}>Remover faixa</button></fieldset>`;
    }).join('');
    $('addGaugeRange').disabled = ranges.length >= 10;
    $('gaugeRangesContainer').querySelectorAll('.remove-range').forEach(button => button.addEventListener('click', () => {
      const currentRanges = gaugeRangesFromForm();
      if (!validColorRanges(currentRanges)) { $('saveStatus').textContent = 'Ajuste os limites das faixas em ordem crescente antes de remover.'; return; }
      const last = currentRanges[currentRanges.length - 1].end;
      currentRanges.splice([...$('gaugeRangesContainer').querySelectorAll('.remove-range')].indexOf(button), 1);
      currentRanges[currentRanges.length - 1].end = last;
      renderGaugeRangeEditor(currentRanges);
    }));
    $('gaugeRangesContainer').querySelectorAll('.range-end').forEach(input => input.addEventListener('input', () => {
      let start = 0;
      $('gaugeRangesContainer').querySelectorAll('.range-row').forEach(row => {
        row.querySelector('.range-start').value = String(start);
        row.querySelector('.range-end').min = String(start);
        start = Number(row.querySelector('.range-end').value);
      });
    }));
  }

  function addGaugeRange() {
    const ranges = gaugeRangesFromForm();
    if (!validColorRanges(ranges)) { $('saveStatus').textContent = 'Ajuste os limites das faixas em ordem crescente antes de adicionar outra.'; return; }
    if (ranges.length >= 10) return;
    const end = ranges[ranges.length - 1].end;
    const start = ranges.length > 1 ? ranges[ranges.length - 2].end : 0;
    const split = Math.round(((start + end) / 2) * 10) / 10;
    if (split <= start || split >= end) { $('saveStatus').textContent = 'Não há espaço entre os limites para adicionar uma faixa.'; return; }
    ranges[ranges.length - 1].end = split;
    const colors = ['#ffb300', '#43a047', '#1e88e5', '#8e24aa', '#00acc1', '#f4511e', '#3949ab', '#7cb342', '#6d4c41'];
    ranges.push({ color: colors[(ranges.length - 1) % colors.length], end });
    renderGaugeRangeEditor(ranges);
    $('saveStatus').textContent = '';
  }

  function openConfig() {
    if (!author || saving) return;
    $('maxInput').value = config.maximum ?? '';
    $('titleInput').value = config.title;
    $('unitInput').value = config.unit;
    $('decimalsInput').value = String(config.decimals);
    $('themeInput').value = config.theme;
    $('useColorRangesInput').checked = config.useColorRanges;
    const initialRangeColor = (config.colorPreset === 'custom' ? config.colors : palettes[config.colorPreset] || palettes.mono).progress;
    renderGaugeRangeEditor(config.colorRanges.length ? config.colorRanges.map(r => ({...r})) : [{color:initialRangeColor,end:100}]);
    $('colorRangesPanel').hidden = !config.useColorRanges;
    $('poolZoomInput').value = String(config.poolZoom);
    $('fitModeInput').value = config.fitMode;
    $('fontTitleInput').value = String(config.fontTitle);
    $('fontPercentageInput').value = String(config.fontPercentage);
    $('fontLabelInput').value = String(config.fontLabel);
    $('showUnitInput').checked = config.showUnit;
    $('majorTickLengthInput').value = String(config.majorTickLength);
    $('smallTickLengthInput').value = String(config.smallTickLength);
    $('majorTickOffsetInput').value = String(config.majorTickOffset);
    $('smallTickOffsetInput').value = String(config.smallTickOffset);
    $('numberOffsetInput').value = String(config.numberOffset);
    $('majorTickStyleInput').value = config.majorTickStyle;
    $('smallTickStyleInput').value = config.smallTickStyle;
    $('showMajorTicksInput').checked = config.showMajorTicks;
    $('showSmallTicksInput').checked = config.showSmallTicks;
    $('designInput').value = config.design;
    $('colorPresetInput').value = config.colorPreset;
    for (const key of Object.keys(config.colors)) $(`color${key[0].toUpperCase()}${key.slice(1)}Input`).value = config.colors[key];
    syncColorControls();
    $('arcPercentInput').value = String(config.arcPercent);
    updateSizeOutputs();
    $('saveStatus').textContent = '';
    $('settingsPanel').hidden = false;
  }

  async function saveConfig(e) {
    e.preventDefault();
    if (!author || saving) return;

    const raw = $('maxInput').value.trim();
    const max = /^\d+(?:[.,]\d+)?$/.test(raw)
      ? Number(raw.replace(',', '.')) : NaN;

    if (!validMax(max)) {
      $('saveStatus').textContent =
        'Informe um máximo maior que zero, sem separador de milhares (ex.: 1500 ou 1500,5).';
      return;
    }

    const candidate = {
      maximum: max,
      title: $('titleInput').value.trim(),
      unit: $('unitInput').value.trim(),
      decimals: Number($('decimalsInput').value),
      theme: $('themeInput').value,
      poolZoom: Number($('poolZoomInput').value),
      fitMode: $('fitModeInput').value,
      fontTitle: Number($('fontTitleInput').value),
      fontPercentage: Number($('fontPercentageInput').value),
      fontLabel: Number($('fontLabelInput').value),
      showUnit: $('showUnitInput').checked,
      majorTickLength: Number($('majorTickLengthInput').value),
      smallTickLength: Number($('smallTickLengthInput').value),
      majorTickOffset: Number($('majorTickOffsetInput').value),
      smallTickOffset: Number($('smallTickOffsetInput').value),
      numberOffset: Number($('numberOffsetInput').value),
      majorTickStyle: $('majorTickStyleInput').value,
      smallTickStyle: $('smallTickStyleInput').value,
      showMajorTicks: $('showMajorTicksInput').checked,
      showSmallTicks: $('showSmallTicksInput').checked,
      design: $('designInput').value,
      colorPreset: $('colorPresetInput').value,
      useColorRanges: $('useColorRangesInput').checked,
      colorRanges: gaugeRangesFromForm(),
      colors: {
        progress: $('colorProgressInput').value, track: $('colorTrackInput').value,
        needle: $('colorNeedleInput').value, labels: $('colorLabelsInput').value, numbers: $('colorNumbersInput').value, value: $('colorValueInput').value
      },
      arcPercent: Number($('arcPercentInput').value)
    };

    if (!Number.isInteger(candidate.poolZoom) || candidate.poolZoom < 90 || candidate.poolZoom > 125 ||
        !['proportional', 'fill'].includes(candidate.fitMode) ||
        !Number.isInteger(candidate.fontTitle) || candidate.fontTitle < 10 || candidate.fontTitle > 36 ||
        !Number.isInteger(candidate.fontPercentage) || candidate.fontPercentage < 16 || candidate.fontPercentage > 48 ||
        !Number.isInteger(candidate.fontLabel) || candidate.fontLabel < 12 || candidate.fontLabel > 36 ||
        !Number.isInteger(candidate.majorTickLength) || candidate.majorTickLength < 8 || candidate.majorTickLength > 30 ||
        !Number.isInteger(candidate.smallTickLength) || candidate.smallTickLength < 4 || candidate.smallTickLength > 28 ||
        !Number.isInteger(candidate.majorTickOffset) || candidate.majorTickOffset < -24 || candidate.majorTickOffset > 24 ||
        !Number.isInteger(candidate.smallTickOffset) || candidate.smallTickOffset < -24 || candidate.smallTickOffset > 24 ||
        !Number.isInteger(candidate.numberOffset) || candidate.numberOffset < -24 || candidate.numberOffset > 24 ||
        !['standard', 'thin', 'bold', 'dot'].includes(candidate.majorTickStyle) ||
        !['standard', 'thin', 'bold', 'dot'].includes(candidate.smallTickStyle) ||
        !['modern', 'minimal', 'analog', 'realistic'].includes(candidate.design) ||
        !['mono', 'ocean', 'forest', 'sunset', 'violet', 'redNeedle', 'custom'].includes(candidate.colorPreset) ||
        !Object.values(candidate.colors).every(validColor) ||
        (candidate.useColorRanges && !validColorRanges(candidate.colorRanges)) ||
        !Number.isInteger(candidate.arcPercent) || candidate.arcPercent < 50 || candidate.arcPercent > 80) {
      $('saveStatus').textContent = 'Confira o arco, as fontes, os traços e, se ativadas, as faixas de cor em ordem crescente até 500%.';
      return;
    }

    const settings = tableau.extensions.settings;
    const previous = settings.get('gaugeConfig');
    saving = true;
    $('save').disabled = true;
    $('close').disabled = true;
    $('saveStatus').textContent = 'Salvando…';

    try {
      settings.set('gaugeConfig', JSON.stringify(candidate));
      await settings.saveAsync();
      config = candidate;
      render();
      $('saveStatus').textContent =
        'Configuração salva. Salve/publique a pasta de trabalho para preservá-la.';
    } catch (err) {
      if (previous === undefined) settings.erase('gaugeConfig');
      else settings.set('gaugeConfig', previous);
      $('saveStatus').textContent = 'Não foi possível salvar: ' + String(err.message || err);
    } finally {
      saving = false;
      $('save').disabled = false;
      $('close').disabled = false;
    }
  }

  async function readValue() {
    const spec = await sheet.getVisualSpecificationAsync();
    const card = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const encodings = card ? card.encodings.filter(e => e.id === 'value') : [];
    const titleEncoding = card ? card.encodings.find(e => e.id === 'title') : null;
    const titleField = titleEncoding && titleEncoding.field ? titleEncoding.field : null;
    const infoEncoding = card ? card.encodings.find(e => e.id === 'info') : null;
    const infoField = infoEncoding && infoEncoding.field ? infoEncoding.field : null;

    if (encodings.length !== 1 || !encodings[0].field) {
      return {
        value: null, name: '', title: null, info: '',
        message: 'Arraste uma medida para a entrada Valor no cartão Marcas.'
      };
    }

    const field = encodings[0].field;
    let reader;

    try {
      reader = await sheet.getSummaryDataReaderAsync(2, { ignoreSelection: true });
      if (!reader.pageCount) {
        return { value: null, name: field.name, title: null, info: '', message: 'Sem dados para os filtros atuais.' };
      }

      const page = await reader.getPageAsync(0);
      if (reader.pageCount > 1 || page.data.length > 1) {
        return {
          value: null, name: field.name, title: null, info: '',
          message: 'Há várias marcas. Remova dimensões de Detalhe/Linhas/Colunas e agregue a medida em um único valor (SUM, AVG, MAX...).'
        };
      }
      if (!page.data.length) {
        return { value: null, name: field.name, title: null, info: '', message: 'Sem dados para os filtros atuais.' };
      }

      const column = page.columns.find(c => c.fieldName === field.name);
      if (!column) throw new Error('A medida da entrada Valor não foi encontrada nos dados da planilha.');

      const cell = page.data[0][column.index];
      const value = cell && cell.value;
      let title = null;
      if (titleField) {
        const titleColumn = page.columns.find(c => c.fieldName === titleField.name);
        if (!titleColumn) throw new Error(`O campo Título (${titleField.name}) não foi encontrado nos dados da planilha.`);
        const titleCell = page.data[0][titleColumn.index];
        const rawTitle = titleCell && titleCell.value;
        title = rawTitle === null || rawTitle === undefined ? '' : String(rawTitle).trim();
      }
      let info = '';
      if (infoField) {
        const infoColumn = page.columns.find(c => c.fieldName === infoField.name);
        if (!infoColumn) throw new Error(`O campo Informação (${infoField.name}) não foi encontrado nos dados da planilha.`);
        const infoCell = page.data[0][infoColumn.index];
        const rawInfo = infoCell && infoCell.value;
        info = rawInfo === null || rawInfo === undefined ? '' : String(rawInfo).trim();
      }
      if (!finite(value)) {
        return { value: null, name: field.name, title, info, message: 'A medida está nula ou não é numérica.' };
      }
      return { value, name: field.name, title, info, message: '' };
    } finally {
      if (reader) await reader.releaseAsync();
    }
  }

  async function update() {
    pending = true;
    if (running) return;
    running = true;

    try {
      while (pending) {
        pending = false;
        try {
          const result = await readValue();
          current = result.value;
          fieldName = result.name;
          dynamicTitle = result.title === undefined ? null : result.title;
          dynamicInfo = result.info || '';
          dataMessage = result.message;
        } catch (err) {
          current = null;
          dynamicTitle = null;
          dynamicInfo = '';
          dataMessage = 'Não foi possível ler a medida: ' + String(err.message || err);
        }
        if (!pending) render();
      }
    } finally {
      running = false;
    }
  }

  function syncColorControls(event) {
    const preset = $('colorPresetInput').value;
    const enabled = preset === 'custom';
    if (event && palettes[preset]) {
      for (const [key, value] of Object.entries(palettes[preset])) {
        $(`color${key[0].toUpperCase()}${key.slice(1)}Input`).value = value;
      }
    }
    for (const id of ['colorProgressInput', 'colorTrackInput', 'colorNeedleInput', 'colorLabelsInput', 'colorNumbersInput', 'colorValueInput']) $(id).disabled = !enabled;
  }

  $('colorPresetInput').addEventListener('change', syncColorControls);
  $('addGaugeRange').addEventListener('click', addGaugeRange);
  $('useColorRangesInput').addEventListener('change', () => { $('colorRangesPanel').hidden = !$('useColorRangesInput').checked; });
  $('designInput').addEventListener('change', () => {
    if ($('designInput').value === 'realistic' && $('colorPresetInput').value === 'mono') {
      $('colorPresetInput').value = 'redNeedle';
      syncColorControls(new Event('change'));
    }
  });

  function updateSizeOutputs() {
    for (const [id, output] of [
      ['poolZoomInput', 'poolZoomValue'], ['fontTitleInput', 'fontTitleValue'],
      ['fontPercentageInput', 'fontPercentageValue'], ['fontLabelInput', 'fontLabelValue'],
      ['arcPercentInput', 'arcPercentValue'], ['majorTickLengthInput', 'majorTickLengthValue'], ['smallTickLengthInput', 'smallTickLengthValue'],
      ['majorTickOffsetInput', 'majorTickOffsetValue'], ['smallTickOffsetInput', 'smallTickOffsetValue'], ['numberOffsetInput', 'numberOffsetValue']
    ]) {
      const value = Number($(id).value);
      const text = id === 'arcPercentInput' ? `${value}% da circunferência`
        : id.endsWith('OffsetInput') ? (value === 0 ? 'posição padrão' : `${Math.abs(value)} px para ${value < 0 ? 'dentro' : 'fora'}`)
        : $(id).value + (id === 'poolZoomInput' ? '%' : ' px');
      $(output).textContent = text;
    }
  }

  for (const id of ['poolZoomInput', 'fontTitleInput', 'fontPercentageInput', 'fontLabelInput', 'arcPercentInput', 'majorTickLengthInput', 'smallTickLengthInput', 'majorTickOffsetInput', 'smallTickOffsetInput', 'numberOffsetInput']) {
    $(id).addEventListener('input', updateSizeOutputs);
  }

  function observeContainerSize() {
    if (!('ResizeObserver' in window)) return;
    const container = $('main');
    if (!container) return;
    resizeObserver = new ResizeObserver(entries => {
      const box = entries[entries.length - 1].contentRect;
      document.body.dataset.compact = String(box.width < 260 || box.height < 190);
    });
    resizeObserver.observe(container);
  }

  $('configure').addEventListener('click', openConfig);
  $('close').addEventListener('click', () => { $('settingsPanel').hidden = true; });
  $('settingsForm').addEventListener('submit', saveConfig);

  async function init() {
    try {
      if (!window.tableau) {
        throw new Error('Biblioteca Tableau não carregou. Verifique a pasta vendor.');
      }
      if (window.self === window.top) {
        throw new Error('Adicione o arquivo .trex pelo cartão Marcas de uma planilha Tableau.');
      }

      await tableau.extensions.initializeAsync({ configure: openConfig });
      if (!tableau.extensions.worksheetContent) {
        throw new Error('Use uma extensão de visualização no Tableau 2024.2 ou posterior.');
      }

      sheet = tableau.extensions.worksheetContent.worksheet;
      author = tableau.extensions.environment.mode === 'authoring';
      config = readConfig();
      angle = zeroAngle();
      $('configure').hidden = !author;
      observeContainerSize();
      sheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, update);
      await update();
      if (author && !validMax(config.maximum)) openConfig();
    } catch (err) {
      dataMessage = String(err.message || err);
      render();
      $('notice').textContent = dataMessage;
    }
  }

  void init();
})();
