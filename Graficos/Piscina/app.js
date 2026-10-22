(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const defaults = {title:'Piscina',label:'PISCINA',decimals:1,theme:'gray',poolZoom:120,fitMode:'proportional',fontTitle:18,fontPercentage:29,fontLabel:20,colorPreset:'mono',colors:{walls:'#c5c5c5',empty:'#eeeeee',edge:'#d8d8d8',title:'#686868',label:'#303030'},ranges:[{color:'#e53935',end:100}]};
  const palettes={mono:{walls:'#c5c5c5',empty:'#eeeeee',edge:'#d8d8d8',title:'#686868',label:'#303030'},ocean:{walls:'#b6ccd8',empty:'#e6f4fb',edge:'#8eafbd',title:'#476579',label:'#17324a'},forest:{walls:'#b9cdbb',empty:'#e3eee4',edge:'#91af94',title:'#526b54',label:'#213c25'},sunset:{walls:'#e2c6a6',empty:'#f6ead9',edge:'#cba27d',title:'#735e4a',label:'#4b3527'},violet:{walls:'#c9bddb',empty:'#ece6f7',edge:'#a090bc',title:'#675c7e',label:'#35245a'}};
  let config={...defaults},sheet,author=false,saving=false,running=false,pending=false;
  let current=null,fieldName='',dataMessage='',dynamic={title:null,label:null,limit1:null},level=0,animation,waveAnimation=null,wavePhase=0,resizeObserver=null,resizeFrame=0;
  const validColor = c => typeof c==='string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const finite = n => typeof n==='number' && Number.isFinite(n);
  const number = (n,d=config.decimals) => n.toLocaleString('pt-BR',{maximumFractionDigits:d});
  const defaultConfig = () => ({...defaults,ranges:defaults.ranges.map(r=>({...r}))});
  const validRanges = ranges => Array.isArray(ranges)&&ranges.length>=1&&ranges.length<=10&&ranges.every((r,i)=>validColor(r.color)&&finite(r.end)&&r.end>(i?ranges[i-1].end:0)&&r.end<=500);
  function readConfig(){
    const raw=tableau.extensions.settings.get('poolConfig');if(!raw)return defaultConfig();
    try{
      const c=JSON.parse(raw);
      let ranges;
      if(Array.isArray(c.ranges))ranges=c.ranges.map(r=>({color:r.color,end:Number(r.end)}));
      else if(c.range1Max!==undefined)ranges=[
        {color:validColor(c.color1)?c.color1:defaults.ranges[0].color,end:Number(c.range1Max)},
        {color:validColor(c.color2)?c.color2:'#ffb300',end:Number(c.range2Max??c.threshold2??100)},
        {color:validColor(c.color3)?c.color3:'#43a047',end:100}
      ];
      else if(finite(Number(c.threshold1))&&finite(Number(c.threshold2))&&Number(c.threshold1)<Number(c.threshold2))ranges=[
        {color:validColor(c.color1)?c.color1:defaults.ranges[0].color,end:Number(c.threshold1)},
        {color:validColor(c.color2)?c.color2:'#ffb300',end:Number(c.threshold2)},
        {color:validColor(c.color3)?c.color3:'#43a047',end:100}
      ];
      else ranges=defaultConfig().ranges;
      const previousDefaults=Number(c.range1Max)===60&&Number(c.range2Max)===85&&Number(c.range3Max)===100&&c.color1==='#e53935'&&c.color2==='#ffb300'&&c.color3==='#43a047';
      if(!Array.isArray(c.ranges)&&previousDefaults)ranges=defaultConfig().ranges;
      if(!validRanges(ranges))ranges=defaultConfig().ranges;
      return {title:typeof c.title==='string'?c.title.slice(0,80):defaults.title,
        label:typeof c.label==='string'?c.label.slice(0,48):defaults.label,
        decimals:Number.isInteger(c.decimals)&&c.decimals>=0&&c.decimals<=3?c.decimals:defaults.decimals,
        theme:['light','gray','transparent','dark'].includes(c.theme)?c.theme:defaults.theme,
        poolZoom:Number.isInteger(c.poolZoom)&&c.poolZoom>=90&&c.poolZoom<=125?c.poolZoom:defaults.poolZoom,
        fitMode:['proportional','fill'].includes(c.fitMode)?c.fitMode:defaults.fitMode,
        fontTitle:Number.isInteger(c.fontTitle)&&c.fontTitle>=10&&c.fontTitle<=36?c.fontTitle:defaults.fontTitle,
        fontPercentage:Number.isInteger(c.fontPercentage)&&c.fontPercentage>=16&&c.fontPercentage<=48?c.fontPercentage:defaults.fontPercentage,
        fontLabel:Number.isInteger(c.fontLabel)&&c.fontLabel>=12&&c.fontLabel<=36?c.fontLabel:defaults.fontLabel,
        colorPreset:['mono','ocean','forest','sunset','violet','custom'].includes(c.colorPreset)?c.colorPreset:defaults.colorPreset,
        colors:Object.fromEntries(Object.entries(defaults.colors).map(([key,fallback])=>[key,validColor(c.colors?.[key])?c.colors[key]:fallback])),
        ranges};
    }catch(_){return defaultConfig();}
  }
  function drawLiquid(){
    const y=285-level*160,amplitude=level>0&&level<1?2.8:0,wavelength=220,points=[];
    for(let x=145;x<=505;x+=8){const waveY=y+Math.sin(((x-145)/wavelength)*Math.PI*2+wavePhase)*amplitude;points.push([x,waveY]);}
    const surfacePath=points.map(([x,py],i)=>`${i?'L':'M'} ${x} ${py.toFixed(2)}`).join(' ');
    $('liquid').setAttribute('d',`${surfacePath} L 505 450 L 145 450 Z`);$('surface').setAttribute('d',surfacePath);
  }
  function observeContainerSize(){
    if(!('ResizeObserver' in window))return;
    const container=$('main');if(!container)return;
    resizeObserver=new ResizeObserver(entries=>{
      const box=entries[entries.length-1].contentRect;
      document.body.dataset.compact=String(box.width<260||box.height<190);
      cancelAnimationFrame(resizeFrame);
      resizeFrame=requestAnimationFrame(drawLiquid);
    });
    resizeObserver.observe(container);
  }
  function rangesFromForm(){
    return [...$('rangesContainer').querySelectorAll('.range-row')].map(row=>({color:row.querySelector('.range-color').value,end:Number(row.querySelector('.range-end').value)}));
  }
  function renderRangeEditor(ranges){
    const colors=['#ffb300','#43a047','#1e88e5','#8e24aa','#00acc1','#f4511e','#3949ab','#7cb342','#6d4c41'];
    $('rangesContainer').innerHTML=ranges.map((range,i)=>{
      const start=i?ranges[i-1].end:0;
      return `<fieldset class="range range-row"><legend>Faixa ${i+1}</legend><label>Cor<input class="range-color" type="color" value="${range.color}"></label><div class="range-bounds"><label>De (%)<input class="range-start" type="number" value="${start}" readonly></label><label>Até (%)<input class="range-end" type="number" min="${start}" max="500" step="0.1" value="${range.end}"></label></div><button class="remove-range" type="button" data-index="${i}" ${ranges.length===1?'disabled':''}>Remover faixa</button></fieldset>`;
    }).join('');
    $('addRange').disabled=ranges.length>=10;
    $('rangesContainer').querySelectorAll('.remove-range').forEach(button=>button.addEventListener('click',()=>{
      const current=rangesFromForm();
      if(!validRanges(current)){$('saveStatus').textContent='Ajuste os limites para ficarem em ordem crescente antes de remover uma faixa.';return;}
      const index=Number(button.dataset.index),totalEnd=current[current.length-1].end;current.splice(index,1);current[current.length-1].end=totalEnd;renderRangeEditor(current);$('saveStatus').textContent='';
    }));
    $('rangesContainer').querySelectorAll('.range-end').forEach(input=>input.addEventListener('input',()=>{
      let start=0;
      $('rangesContainer').querySelectorAll('.range-row').forEach(row=>{row.querySelector('.range-start').value=String(start);row.querySelector('.range-end').min=String(start);start=Number(row.querySelector('.range-end').value);});
    }));
  }
  function addRange(){
    const ranges=rangesFromForm();
    if(!validRanges(ranges)){$('saveStatus').textContent='Ajuste os limites em ordem crescente antes de adicionar outra faixa.';return;}
    if(ranges.length>=10)return;
    const currentEnd=ranges[ranges.length-1].end,previousEnd=ranges.length>1?ranges[ranges.length-2].end:0;
    const split=Math.round(((previousEnd+currentEnd)/2)*10)/10;
    if(split<=previousEnd||split>=currentEnd){$('saveStatus').textContent='Não há espaço entre os limites atuais para criar outra faixa de pelo menos 0,1%.';return;}
    ranges[ranges.length-1].end=split;
    const colors=['#ffb300','#43a047','#1e88e5','#8e24aa','#00acc1','#f4511e','#3949ab','#7cb342','#6d4c41'];
    ranges.push({color:colors[(ranges.length-1)%colors.length],end:currentEnd});
    renderRangeEditor(ranges);$('saveStatus').textContent='';
  }
  function moveLiquid(target,immediate=false){
    cancelAnimationFrame(animation);const initial=level,start=performance.now();
    const duration=immediate||matchMedia('(prefers-reduced-motion: reduce)').matches?0:650;
    function frame(t){const p=duration?Math.min(1,(t-start)/duration):1;level=initial+(target-initial)*(1-Math.pow(1-p,3));drawLiquid();if(p<1)animation=requestAnimationFrame(frame);}
    animation=requestAnimationFrame(frame);
  }
  function animateWave(){
    if(!finite(current)||current<=0||current>=100||matchMedia('(prefers-reduced-motion: reduce)').matches){if(waveAnimation!==null)cancelAnimationFrame(waveAnimation);waveAnimation=null;return;}
    if(waveAnimation!==null)return;
    const tick=t=>{wavePhase=t*0.0015;drawLiquid();waveAnimation=requestAnimationFrame(tick);};waveAnimation=requestAnimationFrame(tick);
  }
  function render(){
    const selectedColors=config.colorPreset==='custom'?config.colors:(palettes[config.colorPreset]||palettes.mono);
    for(const [key,value] of Object.entries(selectedColors))document.body.style.setProperty(`--pool-${key}`,value);
    for(const theme of ['gray','transparent','dark']){document.documentElement.classList.toggle(theme,config.theme===theme);document.body.classList.toggle(theme,config.theme===theme);}
    const zoom=config.poolZoom/100,viewWidth=640/zoom,viewHeight=390/zoom;
    $('pool').setAttribute('viewBox',`${(640-viewWidth)/2} ${(390-viewHeight)/2} ${viewWidth} ${viewHeight}`);
    $('pool').setAttribute('preserveAspectRatio',config.fitMode==='fill'?'none':'xMidYMid meet');
    $('title').setAttribute('font-size',String(config.fontTitle/zoom));$('percentage').setAttribute('font-size',String(config.fontPercentage/zoom));$('poolLabel').setAttribute('font-size',String(config.fontLabel/zoom));
    const hasValue=finite(current),fraction=hasValue?Math.min(1,Math.max(0,current/100)):0;
    const boundaries=config.ranges.map((range,i)=>i===0&&dynamic.limit1!==null&&config.ranges.length>1?dynamic.limit1:range.end);
    const activeRange=hasValue?Math.max(0,boundaries.findIndex((end,i)=>current<end||i===boundaries.length-1)):0;
    const liquidColor=config.ranges[activeRange].color;
    // Define a cor nos elementos SVG diretamente para evitar CSS/cache antigo sobrescrevendo --water.
    $('liquid').style.fill=liquidColor;$('percentage').style.fill=liquidColor;
    $('overflow').style.display=hasValue&&current>100?'':'none';$('overflowLeft').style.stroke=liquidColor;$('overflowRight').style.stroke=liquidColor;$('overflowDropLeft').style.fill=liquidColor;$('overflowDropRight').style.fill=liquidColor;
    const titleText=dynamic.title!==null?dynamic.title:(config.title||fieldName||'Piscina');
    $('title').textContent=titleText;$('poolLabel').textContent=dynamic.label||config.label;
    $('percentage').textContent=hasValue?number(current)+' %':'—';
    $('liquid').style.visibility=hasValue&&fraction>0?'visible':'hidden';$('surface').style.visibility=hasValue&&fraction>0?'visible':'hidden';
    moveLiquid(fraction,!hasValue);animateWave();
    let message=dataMessage;if(hasValue&&current>100)message='Transbordando: valor acima de 100%.';if(hasValue&&current<0)message='Valor abaixo de 0%; piscina visualmente vazia.';
    $('notice').textContent=message;
    $('pool').setAttribute('aria-label',hasValue?`${titleText||fieldName||'Piscina'}: ${number(current)} por cento.`:message||'Sem dados');
  }
  function openConfig(){
    if(!author||saving)return;
    $('titleInput').value=config.title;$('labelInput').value=config.label;$('decimalsInput').value=String(config.decimals);
    $('poolZoomInput').value=String(config.poolZoom);$('fitModeInput').value=config.fitMode;
    $('fontTitleInput').value=String(config.fontTitle);$('fontPercentageInput').value=String(config.fontPercentage);$('fontLabelInput').value=String(config.fontLabel);updateSizeOutputs();
    renderRangeEditor(config.ranges.map(r=>({...r})));$('themeInput').value=config.theme;
    $('colorPresetInput').value=config.colorPreset;for(const [key,value] of Object.entries(config.colors))$(`color${key[0].toUpperCase()}${key.slice(1)}Input`).value=value;syncColorControls();
    $('saveStatus').textContent='';$('settingsPanel').hidden=false;
  }
  async function saveConfig(e){
    e.preventDefault();if(!author||saving)return;
    const candidate={title:$('titleInput').value.trim(),label:$('labelInput').value.trim(),decimals:Number($('decimalsInput').value),theme:$('themeInput').value,colorPreset:$('colorPresetInput').value,colors:{walls:$('colorWallsInput').value,empty:$('colorEmptyInput').value,edge:$('colorEdgeInput').value,title:$('colorTitleInput').value,label:$('colorLabelInput').value},poolZoom:Number($('poolZoomInput').value),fitMode:$('fitModeInput').value,fontTitle:Number($('fontTitleInput').value),fontPercentage:Number($('fontPercentageInput').value),fontLabel:Number($('fontLabelInput').value),ranges:rangesFromForm()};
    if(!['mono','ocean','forest','sunset','violet','custom'].includes(candidate.colorPreset)||!Object.values(candidate.colors).every(validColor)){ $('saveStatus').textContent='Confira as cores personalizadas.';return;}
    if(!Number.isInteger(candidate.poolZoom)||candidate.poolZoom<90||candidate.poolZoom>125||!['proportional','fill'].includes(candidate.fitMode)||!Number.isInteger(candidate.fontTitle)||candidate.fontTitle<10||candidate.fontTitle>36||!Number.isInteger(candidate.fontPercentage)||candidate.fontPercentage<16||candidate.fontPercentage>48||!Number.isInteger(candidate.fontLabel)||candidate.fontLabel<12||candidate.fontLabel>36){$('saveStatus').textContent='Confira a ampliação (90% a 125%) e os tamanhos das fontes dentro dos limites indicados.';return;}
    if(!validRanges(candidate.ranges)){$('saveStatus').textContent='As faixas precisam estar em ordem crescente e terminar em um limite entre 0% e 500%. Ajuste o limite “Até (%)” de cada faixa.';return;}
    const settings=tableau.extensions.settings,previous=settings.get('poolConfig');saving=true;$('save').disabled=true;$('close').disabled=true;$('saveStatus').textContent='Salvando…';
    try{settings.set('poolConfig',JSON.stringify(candidate));await settings.saveAsync();config=candidate;render();$('saveStatus').textContent='Configuração salva. Salve/publique a pasta de trabalho para preservá-la.';}
    catch(err){if(previous===undefined)settings.erase('poolConfig');else settings.set('poolConfig',previous);$('saveStatus').textContent='Não foi possível salvar: '+String(err.message||err);}
    finally{saving=false;$('save').disabled=false;$('close').disabled=false;}
  }
  async function readValue(){
    const spec=await sheet.getVisualSpecificationAsync(),card=spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const encodings=card?card.encodings:[],fieldFor=id=>{const encoding=encodings.find(e=>e.id===id);return encoding&&encoding.field?encoding.field:null;};
    const valueField=fieldFor('value'),titleField=fieldFor('title'),labelField=fieldFor('label'),limit1Field=fieldFor('limit1');
    if(!valueField)return {value:null,name:'',dynamic:{title:null,label:null,limit1:null},message:'Arraste uma medida para a entrada Valor no cartão Marcas.'};
    let reader;
    try{
      reader=await sheet.getSummaryDataReaderAsync(2,{ignoreSelection:true});
      if(!reader.pageCount)return {value:null,name:valueField.name,dynamic:{title:null,label:null,limit1:null},message:'Sem dados para os filtros atuais.'};
      const page=await reader.getPageAsync(0);
      if(reader.pageCount>1||page.data.length>1)return {value:null,name:valueField.name,dynamic:{title:null,label:null,limit1:null},message:'A extensão recebeu mais de uma linha. Ajuste os filtros para deixar um único registro/valor.'};
      if(!page.data.length)return {value:null,name:valueField.name,dynamic:{title:null,label:null,limit1:null},message:'Sem dados para os filtros atuais.'};
      const row=page.data[0],cache=new Map();
      function fieldValue(field,label,allowEmpty=false){
        if(!field)return undefined;
        if(!cache.has(field.name)){
          const column=page.columns.find(c=>c.fieldName===field.name);
          if(!column)throw new Error(`O campo ${label} (${field.name}) não foi encontrado nos dados da planilha.`);
          const cell=row[column.index];cache.set(field.name,cell&&cell.value);
        }
        const value=cache.get(field.name);
        if(value===null||value===undefined||value===''){if(allowEmpty)return '';throw new Error(`O campo ${label} está vazio para o registro filtrado.`);}
        return value;
      }
      const value=fieldValue(valueField,'Valor');
      if(!finite(value))throw new Error('A medida da entrada Valor está nula ou não é numérica.');
      const title=titleField?String(fieldValue(titleField,'Título',true)).trim():null;
      const label=labelField?String(fieldValue(labelField,'Nome')).trim():null;
      if(labelField&&!label)throw new Error('O campo Nome está vazio para o registro filtrado.');
      let limit1=null;
      if(limit1Field&&config.ranges.length>1){
        const raw=fieldValue(limit1Field,'Limite da faixa 1');limit1=typeof raw==='number'?raw:Number(raw);
        if(!finite(limit1)||limit1<=0||limit1>=config.ranges[1].end)throw new Error(`O limite da faixa 1 precisa ser maior que 0 e menor que ${number(config.ranges[1].end,2)}%.`);
      }
      return {value,name:valueField.name,dynamic:{title,label,limit1},message:''};
    }finally{if(reader)await reader.releaseAsync();}
  }
  async function update(){pending=true;if(running)return;running=true;try{while(pending){pending=false;try{const result=await readValue();current=result.value;fieldName=result.name;dynamic=result.dynamic||{title:null,label:null,limit1:null};dataMessage=result.message;}catch(err){current=null;dynamic={title:null,label:null,limit1:null};dataMessage='Não foi possível ler os campos da planilha: '+String(err.message||err);}if(!pending)render();}}finally{running=false;}}
  function syncColorControls(event){const preset=$('colorPresetInput').value;if(event&&palettes[preset])for(const [key,value] of Object.entries(palettes[preset]))$(`color${key[0].toUpperCase()}${key.slice(1)}Input`).value=value;const enabled=preset==='custom';for(const id of ['colorWallsInput','colorEmptyInput','colorEdgeInput','colorTitleInput','colorLabelInput'])$(id).disabled=!enabled;}
  $('colorPresetInput').addEventListener('change',syncColorControls);
  function updateSizeOutputs(){for(const [id,out] of [['poolZoomInput','poolZoomValue'],['fontTitleInput','fontTitleValue'],['fontPercentageInput','fontPercentageValue'],['fontLabelInput','fontLabelValue']])$(out).textContent=$(id).value+(id==='poolZoomInput'?'%':' px');}
  for(const id of ['poolZoomInput','fontTitleInput','fontPercentageInput','fontLabelInput'])$(id).addEventListener('input',updateSizeOutputs);
  $('addRange').addEventListener('click',addRange);
  $('configure').addEventListener('click',openConfig);$('close').addEventListener('click',()=>$('settingsPanel').hidden=true);$('settingsForm').addEventListener('submit',saveConfig);
  async function init(){try{
    if(!window.tableau)throw new Error('Biblioteca Tableau não carregou. Verifique a pasta vendor.');
    if(window.self===window.top)throw new Error('Adicione o arquivo .trex pelo cartão Marcas de uma planilha Tableau.');
    await tableau.extensions.initializeAsync({configure:openConfig});
    if(!tableau.extensions.worksheetContent)throw new Error('Use uma extensão de visualização no Tableau 2024.2 ou posterior.');
    sheet=tableau.extensions.worksheetContent.worksheet;author=tableau.extensions.environment.mode==='authoring';config=readConfig();$('configure').hidden=!author;
    observeContainerSize();sheet.addEventListener(tableau.TableauEventType.SummaryDataChanged,update);await update();
  }catch(err){dataMessage=String(err.message||err);render();$('notice').textContent=dataMessage;}}
  void init();
})();
