(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const defaults = {
    title: '', label: 'VAZÃO', unit: 'L', maximum: 1200, decimals: 1, theme: 'light',
    zoom: 100, fit: 'proportional', titleFont: 24, valueFont: 42, labelFont: 18,
    animationSpeed: 100, animate: true, bubbles: true, palette: 'industrial', pipeStyle: 'simple',
    colors: {pipe:'#7d8790',inside:'#27343d',highlight:'#d6e0e6',water:'#1b9de0',title:'#303840',text:'#303840'},
    ranges: [{color:'#1b9de0',end:100}]
  };
  const palettes = {
    industrial:{pipe:'#7d8790',inside:'#27343d',highlight:'#d6e0e6',water:'#1b9de0',title:'#303840',text:'#303840'},
    blue:{pipe:'#8297a5',inside:'#233c4c',highlight:'#d7e8f1',water:'#138bd1',title:'#24445a',text:'#24445a'},
    steel:{pipe:'#59636a',inside:'#182126',highlight:'#aeb8be',water:'#16a8c4',title:'#303840',text:'#303840'}
  };
  let config={...defaults,ranges:defaults.ranges.map(x=>({...x})),colors:{...defaults.colors}};
  let author=false,saving=false,sheet=null,current=null,fieldName='',dataMessage='',dynamicTitle=null,dynamicLabel=null;
  let running=false,pending=false; // controle de leitura (substitui readerTask)
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const validColor=c=>typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c);
  const validRanges=a=>Array.isArray(a)&&a.length>=1&&a.length<=10&&a.every((r,i)=>validColor(r.color)&&finite(r.end)&&r.end>(i?a[i-1].end:0)&&r.end<=500);
  const fmt=(n,d=config.decimals)=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:d});
  function normalized(){return finite(current)?Math.max(0,current/config.maximum*100):0;}
  function readConfig(){
    const raw=tableau.extensions.settings.get('flowConfig');if(!raw)return structuredCloneDefaults();
    try{
      const c=JSON.parse(raw),ranges=Array.isArray(c.ranges)?c.ranges.map(r=>({color:r.color,end:Number(r.end)})):structuredCloneDefaults().ranges;
      return {
        title:typeof c.title==='string'?c.title.slice(0,80):defaults.title,label:typeof c.label==='string'?c.label.slice(0,48):defaults.label,
        unit:typeof c.unit==='string'?c.unit.slice(0,24):defaults.unit,
        maximum:finite(Number(c.maximum))&&Number(c.maximum)>0?Number(c.maximum):defaults.maximum,
        decimals:Number.isInteger(c.decimals)&&c.decimals>=0&&c.decimals<=3?c.decimals:defaults.decimals,
        theme:['light','gray','transparent','dark'].includes(c.theme)?c.theme:defaults.theme,
        zoom:Number.isInteger(c.zoom)&&c.zoom>=80&&c.zoom<=125?c.zoom:defaults.zoom,
        fit:['proportional','fill'].includes(c.fit)?c.fit:defaults.fit,
        titleFont:Number.isInteger(c.titleFont)&&c.titleFont>=10&&c.titleFont<=44?c.titleFont:defaults.titleFont,
        valueFont:Number.isInteger(c.valueFont)&&c.valueFont>=18&&c.valueFont<=72?c.valueFont:defaults.valueFont,
        labelFont:Number.isInteger(c.labelFont)&&c.labelFont>=10&&c.labelFont<=36?c.labelFont:defaults.labelFont,
        animationSpeed:Number.isInteger(c.animationSpeed)&&c.animationSpeed>=50&&c.animationSpeed<=150?c.animationSpeed:defaults.animationSpeed,
        animate:typeof c.animate==='boolean'?c.animate:defaults.animate,
        bubbles:typeof c.bubbles==='boolean'?c.bubbles:true,
        palette:['industrial','blue','steel','custom'].includes(c.palette)?c.palette:defaults.palette,
        pipeStyle:['simple','metal'].includes(c.pipeStyle)?c.pipeStyle:defaults.pipeStyle,
        colors:Object.fromEntries(Object.entries(defaults.colors).map(([k,v])=>[k,validColor(c.colors?.[k])?c.colors[k]:v])),
        ranges:validRanges(ranges)?ranges:structuredCloneDefaults().ranges
      };
    }catch(_){return structuredCloneDefaults();}
  }
  function structuredCloneDefaults(){return {...defaults,colors:{...defaults.colors},ranges:defaults.ranges.map(x=>({...x}))};}
  function applyTheme(){for(const t of ['gray','transparent','dark']){document.documentElement.classList.toggle(t,config.theme===t);document.body.classList.toggle(t,config.theme===t);}}
  function colorAt(p){const i=config.ranges.findIndex((r,k)=>p<r.end||k===config.ranges.length-1);return config.ranges[Math.max(0,i)].color;}
  function render(){
    applyTheme();
    document.body.dataset.pipeStyle=config.pipeStyle;
    const colors=config.palette==='custom'?config.colors:(palettes[config.palette]||palettes.industrial);
    for(const [key,val] of Object.entries(colors))document.body.style.setProperty(`--${key==='pipe'?'pipe-color':key==='inside'?'inside-light':key==='highlight'?'pipe-highlight':key==='water'?'water-color':key==='title'?'title-color':'text-color'}`,val);
    document.body.style.setProperty('--pipe-shadow',shade(colors.pipe,-.32));
    document.body.style.setProperty('--inside-dark',shade(colors.inside,-.3));
    document.body.style.setProperty('--water-light',shade(colorAt(normalized()),.52));
    document.body.style.setProperty('--water-dark',shade(colorAt(normalized()),-.28));
    document.body.style.setProperty('--water-color',colorAt(normalized()));
    const zoom=config.zoom/100;
    $('flowGraphic').setAttribute('preserveAspectRatio',config.fit==='fill'?'none':'xMidYMid meet');
    $('flowGraphic').style.transform='none';
    $('flowGraphic').style.transformOrigin='center center';
    const title=dynamicTitle!==null?dynamicTitle:(config.title||fieldName||'Vazão de água');
    $('title').textContent=title;$('title').style.display=dynamicTitle===''?'none':'';$('title').style.fontSize=`${config.titleFont}px`;
    $('unit').textContent=config.unit;$('unit').hidden=!config.unit;
    const pct=normalized();
    $('percentage').textContent=finite(current)?fmt(current):'—';$('percentage').style.fontSize=`${config.valueFont}px`;$('percentage').parentElement.style.fontSize=`${config.valueFont}px`;
    $('label').textContent=dynamicLabel!==null?dynamicLabel:config.label;$('label').style.display=($('label').textContent?'':'none');$('label').style.fontSize=`${config.labelFont}px`;
    const active=finite(current)&&pct>0;
    document.body.classList.toggle('flow-active',active);
    document.body.classList.toggle('no-data',!finite(current));
    document.body.classList.toggle('no-animation',!config.animate||matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.body.classList.toggle('show-bubbles',config.bubbles);
    document.body.classList.toggle('more-bubbles',pct>=50);
    const speed=Math.min(100,Math.max(0,pct));
    document.body.style.setProperty('--flow-duration',`${(4.5-3.9*speed/100)*100/config.animationSpeed}s`);
    document.body.style.setProperty('--bubble-amplitude',`${2+speed*.07}px`);
    document.body.style.setProperty('--bubble-duration',`${(3.5-speed*.02)*100/config.animationSpeed}s`);
    $('notice').textContent=dataMessage||(finite(current)&&current/config.maximum>1?'Vazão acima do máximo configurado.':finite(current)&&current<0?'Valor negativo; animação parada.':'');
    layout();
    $('flowGraphic').setAttribute('aria-label',finite(current)?`Fluxo de água: ${fmt(current)} ${config.unit}; ${fmt(pct)} por cento da referência`:'Indicador de vazão aguardando dados');
  }
  // Layout runs only on resizing or data/settings changes, never per animation frame.
  function layout(){
    const main=$('main'), box=$('visualization'), graphic=$('flowGraphic');
    const style=getComputedStyle(main);
    const availableWidth=main.clientWidth-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0);
    const availableHeight=main.clientHeight-parseFloat(style.paddingTop||0)-parseFloat(style.paddingBottom||0);
    if(availableWidth<=0||availableHeight<=0)return;
    const other=[...box.children].filter(el=>!el.classList.contains('graphic-area'));
    const reserved=other.reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+24;
    const heightLimit=Math.max(16,availableHeight-reserved);
    const naturalWidth=Math.min(availableWidth,1200,heightLimit*900/220);
    const width=Math.min(availableWidth,1200,naturalWidth*config.zoom/100);
    const height=Math.min(heightLimit,width*220/900);
    box.style.width=`${width}px`;
    graphic.parentElement.style.height=`${height}px`;
  }
  function shade(hex,amount){const n=parseInt(hex.slice(1),16),f=x=>Math.max(0,Math.min(255,Math.round(x+(amount>=0?(255-x)*amount:x*amount))));return '#'+[16,8,0].map(s=>f((n>>s)&255).toString(16).padStart(2,'0')).join('');}
  function renderRanges(ranges){
    $('rangesContainer').innerHTML=ranges.map((r,i)=>`<fieldset class="range-row"><legend>Faixa ${i+1}</legend><div class="color-grid"><label>Cor<input class="range-color" type="color" value="${r.color}"></label><label>Até (%)<input class="range-end" type="number" min="0.1" max="500" step="0.1" value="${r.end}"></label></div><small>De <span class="range-start">${i?ranges[i-1].end:0}</span>%</small><button class="remove-range" type="button" ${ranges.length===1?'disabled':''}>Remover faixa</button></fieldset>`).join('');
    $('rangesContainer').querySelectorAll('.remove-range').forEach((b,i)=>b.addEventListener('click',()=>{const a=rangesFromForm();a.splice(i,1);renderRanges(a);}));
    $('rangesContainer').querySelectorAll('.range-end').forEach(input=>input.addEventListener('input',()=>{let start=0;$('rangesContainer').querySelectorAll('.range-row').forEach(row=>{row.querySelector('.range-start').textContent=String(start);row.querySelector('.range-end').min=String(start+0.1);start=Number(row.querySelector('.range-end').value);});}));
  }
  function rangesFromForm(){return [...$('rangesContainer').querySelectorAll('.range-row')].map(row=>({color:row.querySelector('.range-color').value,end:Number(row.querySelector('.range-end').value)}));}
  function addRange(){const a=rangesFromForm();if(a.length>=10)return;if(!validRanges(a)){$('saveStatus').textContent='Ajuste os limites das faixas antes de adicionar outra.';return;}const end=a[a.length-1].end,start=a.length>1?a[a.length-2].end:0,split=Math.round(((end+start)/2)*10)/10;if(split<=start||split>=end){$('saveStatus').textContent='Não há espaço para dividir essa faixa. Aumente o limite final primeiro.';return;}a[a.length-1].end=split;a.push({color:['#f2a900','#37a66b','#8656c7','#e95f48','#00a4a6','#3978cf'][(a.length-1)%6],end});renderRanges(a);}
  function openConfig(){if(!author||saving)return;$('pipeStyleInput').value=config.pipeStyle;$('titleInput').value=config.title;$('unitInput').value=config.unit;$('labelInput').value=config.label;$('maximumInput').value=String(config.maximum);$('decimalsInput').value=String(config.decimals);$('themeInput').value=config.theme;$('zoomInput').value=String(config.zoom);$('fitInput').value=config.fit;$('titleFontInput').value=String(config.titleFont);$('valueFontInput').value=String(config.valueFont);$('labelFontInput').value=String(config.labelFont);$('animationSpeedInput').value=String(config.animationSpeed);$('animateInput').checked=config.animate;$('bubblesInput').checked=config.bubbles;$('paletteInput').value=config.palette;for(const [k,v] of Object.entries(config.colors))$(`${k}ColorInput`).value=v;syncPalette();renderRanges(config.ranges.map(r=>({...r})));updateOutputs();$('settingsPanel').hidden=false;document.body.classList.add('configuring');$('saveStatus').textContent='';}
  function syncPalette(event){const p=$('paletteInput').value;if(event&&palettes[p])for(const [k,v] of Object.entries(palettes[p]))$(`${k}ColorInput`).value=v;for(const id of ['pipeColorInput','insideColorInput','highlightColorInput','waterColorInput','titleColorInput','textColorInput'])$(id).disabled=p!=='custom';}
  function updateOutputs(){for(const [id,out,suf] of [['zoomInput','zoomValue','%'],['titleFontInput','titleFontValue',' px'],['valueFontInput','valueFontValue',' px'],['labelFontInput','labelFontValue',' px'],['animationSpeedInput','animationSpeedValue','%']])$(out).textContent=$(id).value+suf;}
  async function saveConfig(e){
    e.preventDefault();if(!author||saving)return;
    const max=Number(String($('maximumInput').value).replace(',','.'));
    const c={unit:$('unitInput').value.trim().slice(0,24),title:$('titleInput').value.trim(),label:$('labelInput').value.trim(),maximum:max,decimals:Number($('decimalsInput').value),theme:$('themeInput').value,zoom:Number($('zoomInput').value),fit:$('fitInput').value,titleFont:Number($('titleFontInput').value),valueFont:Number($('valueFontInput').value),labelFont:Number($('labelFontInput').value),animationSpeed:Number($('animationSpeedInput').value),animate:$('animateInput').checked,bubbles:$('bubblesInput').checked,palette:$('paletteInput').value,pipeStyle:$('pipeStyleInput').value,colors:{pipe:$('pipeColorInput').value,inside:$('insideColorInput').value,highlight:$('highlightColorInput').value,water:$('waterColorInput').value,title:$('titleColorInput').value,text:$('textColorInput').value},ranges:rangesFromForm()};
    if(!finite(c.maximum)||c.maximum<=0||!['light','gray','transparent','dark'].includes(c.theme)||!Number.isInteger(c.zoom)||c.zoom<80||c.zoom>125||!['proportional','fill'].includes(c.fit)||!Number.isInteger(c.titleFont)||c.titleFont<10||c.titleFont>44||!Number.isInteger(c.valueFont)||c.valueFont<18||c.valueFont>72||!Number.isInteger(c.labelFont)||c.labelFont<10||c.labelFont>36||!Number.isInteger(c.animationSpeed)||c.animationSpeed<50||c.animationSpeed>150||!['industrial','blue','steel','custom'].includes(c.palette)||!['simple','metal'].includes(c.pipeStyle)||!Object.values(c.colors).every(validColor)||!validRanges(c.ranges)){$('saveStatus').textContent='Confira o máximo, as fontes, a velocidade e os limites das faixas.';return;}
    const settings=tableau.extensions.settings,previous=settings.get('flowConfig');saving=true;$('save').disabled=true;$('close').disabled=true;$('saveStatus').textContent='Salvando…';
    try{settings.set('flowConfig',JSON.stringify(c));await settings.saveAsync();config=c;render();$('saveStatus').textContent='Configuração salva. Salve/publique a pasta de trabalho para preservá-la.';}
    catch(err){if(previous===undefined)settings.erase('flowConfig');else settings.set('flowConfig',previous);$('saveStatus').textContent='Não foi possível salvar: '+String(err.message||err);}
    finally{saving=false;$('save').disabled=false;$('close').disabled=false;}
  }

  // ===== ALTERAÇÃO DE DESEMPENHO =====
  // 1) Especificação visual em cache fora do modo de edição.
  let specCache=null;
  async function getSpec(){
    if(!author&&specCache)return specCache;
    const spec=await sheet.getVisualSpecificationAsync();
    if(!author)specCache=spec;
    return spec;
  }
  // 2) Leitura em uma única chamada (antes: abrir leitor + ler página + liberar leitor).
  async function readValue(){
    const spec=await getSpec(),card=spec.marksSpecifications[spec.activeMarksSpecificationIndex],enc=card?card.encodings:[];
    const field=id=>{const e=enc.find(x=>x.id===id);return e&&e.field?e.field:null;},valueField=field('value'),titleField=field('title'),labelField=field('label');
    if(!valueField)return {value:null,name:'',title:null,label:null,message:'Arraste uma medida para Valor no cartão Marcas.'};
    const page=await sheet.getSummaryDataAsync({ignoreSelection:true,maxRows:2});
    if(page.data.length>1)return {value:null,name:valueField.name,title:null,label:null,message:'A extensão recebeu mais de uma linha. Ajuste os filtros para retornar um único valor.'};
    if(!page.data.length)return {value:null,name:valueField.name,title:null,label:null,message:'Sem dados para os filtros atuais.'};
    const row=page.data[0];
    function get(f,allowEmpty=false){if(!f)return undefined;const col=page.columns.find(c=>c.fieldName===f.name);const cell=col?row[col.index]:null;const val=cell&&cell.value;if(val===null||val===undefined||val===''){if(allowEmpty)return '';throw new Error(`O campo ${f.name} está vazio.`);}return val;}
    const value=get(valueField);
    if(!finite(value))throw new Error('A medida em Valor precisa ser numérica.');
    return {value,name:valueField.name,title:titleField?String(get(titleField,true)).trim():null,label:labelField?String(get(labelField,true)).trim():null,message:''};
  }
  // 3) Uma leitura por vez: eventos repetidos viram uma única leitura extra (antes, leituras rodavam em paralelo).
  async function update(){
    pending=true;if(running)return;running=true;
    try{
      while(pending){
        pending=false;
        try{const r=await readValue();current=r.value;fieldName=r.name;dynamicTitle=r.title;dynamicLabel=r.label;dataMessage=r.message||'';}
        catch(err){current=null;dataMessage='Não foi possível ler os dados: '+String(err.message||err);}
        if(!pending)render();
      }
    }finally{running=false;}
  }
  // ===== FIM DA ALTERAÇÃO =====

  $('addRange').addEventListener('click',addRange);$('paletteInput').addEventListener('change',e=>syncPalette(e));$('settingsForm').addEventListener('submit',saveConfig);$('configure').addEventListener('click',openConfig);$('close').addEventListener('click',()=>{$('settingsPanel').hidden=true;document.body.classList.remove('configuring');});
  for(const id of ['zoomInput','titleFontInput','valueFontInput','labelFontInput','animationSpeedInput'])$(id).addEventListener('input',updateOutputs);
  async function init(){try{if(!window.tableau)throw new Error('Biblioteca Tableau não carregou.');if(window.self===window.top)throw new Error('Adicione a extensão pelo cartão Marcas de uma planilha Tableau.');await tableau.extensions.initializeAsync({configure:openConfig});if(!tableau.extensions.worksheetContent)throw new Error('Use uma Viz Extension em uma planilha.');sheet=tableau.extensions.worksheetContent.worksheet;author=tableau.extensions.environment.mode==='authoring';config=readConfig();$('configure').hidden=!author;document.body.classList.toggle('authoring',author);render();sheet.addEventListener(tableau.TableauEventType.SummaryDataChanged,update);await update();}catch(err){dataMessage=String(err.message||err);render();$('notice').textContent=dataMessage;}}
  document.addEventListener('visibilitychange',()=>document.body.classList.toggle('page-hidden',document.hidden));
  if(typeof ResizeObserver!=='undefined'){const resizeObserver=new ResizeObserver(layout);resizeObserver.observe($('main'));}else{window.addEventListener('resize',layout);}
  void init();
})();
