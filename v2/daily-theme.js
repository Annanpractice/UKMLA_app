(function(){
  'use strict';

  const THEMES=[
    {id:'sunday',name:'Rose',themeColor:'#210920',aliases:['rose','pink','magenta']},
    {id:'monday',name:'Blue',themeColor:'#03152b',aliases:['blue']},
    {id:'tuesday',name:'Purple',themeColor:'#170b2d',aliases:['purple','violet']},
    {id:'wednesday',name:'Green',themeColor:'#08251a',aliases:['green','emerald']},
    {id:'thursday',name:'Teal',themeColor:'#062625',aliases:['teal','turquoise']},
    {id:'friday',name:'Amber',themeColor:'#2b1706',aliases:['amber','orange','gold']},
    {id:'saturday',name:'Crimson',themeColor:'#2c0b12',aliases:['red','crimson','ruby']}
  ];

  const byName=new Map();
  THEMES.forEach(theme=>{
    byName.set(theme.id,theme);
    theme.aliases.forEach(alias=>byName.set(alias,theme));
  });

  function requestedTheme(){
    try{
      const value=new URLSearchParams(location.search).get('theme');
      return value?byName.get(String(value).trim().toLowerCase())||null:null;
    }catch(_){return null;}
  }

  function themeForDate(date=new Date()){return THEMES[date.getDay()]||THEMES[1];}

  function applyTheme(theme,source='calendar'){
    const root=document.documentElement;
    root.dataset.dayTheme=theme.id;
    root.dataset.dayThemeSource=source;
    root.style.colorScheme='dark';
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',theme.themeColor);
    window.UKMLA_DAILY_THEME={id:theme.id,name:theme.name,source,themes:THEMES.map(item=>({id:item.id,name:item.name}))};
    document.dispatchEvent(new CustomEvent('ukmlaDailyThemeChanged',{detail:window.UKMLA_DAILY_THEME}));
  }

  function applyCurrentTheme(){
    const override=requestedTheme();
    applyTheme(override||themeForDate(),override?'query':'calendar');
  }

  function scheduleMidnightRefresh(){
    if(requestedTheme())return;
    const now=new Date();
    const next=new Date(now);
    next.setHours(24,0,2,0);
    const delay=Math.max(1000,next.getTime()-now.getTime());
    setTimeout(()=>{applyCurrentTheme();scheduleMidnightRefresh();},Math.min(delay,2147483647));
  }

  function appendStyle(href,attribute){
    if(document.querySelector(`link[${attribute}]`))return null;
    const style=document.createElement('link');
    style.rel='stylesheet';
    style.href=href;
    style.setAttribute(attribute,'1');
    document.head.appendChild(style);
    return style;
  }

  function appendScript(src,attribute){
    const existing=document.querySelector(`script[${attribute}]`);
    if(existing)return existing;
    const script=document.createElement('script');
    script.async=false;
    script.src=src;
    script.setAttribute(attribute,'1');
    document.head.appendChild(script);
    return script;
  }

  function medicalImagesDisabled(){
    try{return new URLSearchParams(location.search).get('medicalImages')==='off';}
    catch(_){return false;}
  }

  function loadMedicalImageExtension(){
    if(medicalImagesDisabled())return;
    appendStyle('./v2/image-bank.css?v=2','data-ukmla-image-bank');
    appendStyle('./v2/image-mode-control.css?v=2','data-ukmla-image-mode');
    appendScript('./v2/image-bank.js?v=2','data-ukmla-image-bank');
    appendScript('./v2/image-mode-control.js?v=2','data-ukmla-image-mode');
  }

  function loadQuestionTypePlanner(attempt=0){
    const imageModeReady=Boolean(window.UKMLA_V2_AI_ENGINE?.__medicalImageModePatched);
    if(medicalImagesDisabled()||imageModeReady||attempt>=240){
      appendScript('./v2/ai-type-planner.js?v=1','data-ukmla-type-planner');
      return;
    }
    setTimeout(()=>loadQuestionTypePlanner(attempt+1),50);
  }

  function loadPharmacologyAnalytics(attempt=0){
    const ready=Boolean(
      window.UKMLA_V2&&
      window.UKMLA_PHARMACOLOGY&&
      window.UKMLA_QUESTION_BANK&&
      window.UKMLA_QUESTION_ANALYTICS
    );
    if(ready||attempt>=240){
      appendScript('./v2/pharmacology-analytics.js?v=1','data-ukmla-pharmacology-analytics');
      return;
    }
    setTimeout(()=>loadPharmacologyAnalytics(attempt+1),50);
  }

  let extensionsStarted=false;
  function startQuestionBuildExtensions(){
    if(extensionsStarted)return;
    extensionsStarted=true;
    loadMedicalImageExtension();
    loadQuestionTypePlanner();
  }

  function loadEditorialPipelineFirst(){
    if(window.UKMLA_EDITORIAL_PIPELINE_READY){startQuestionBuildExtensions();return;}
    document.addEventListener('ukmlaEditorialPipelineReady',startQuestionBuildExtensions,{once:true});
    appendScript('./v2/ai-editorial-pipeline.js?v=1','data-ukmla-editorial-pipeline');
  }

  applyCurrentTheme();
  loadEditorialPipelineFirst();
  loadPharmacologyAnalytics();
  scheduleMidnightRefresh();
})();
