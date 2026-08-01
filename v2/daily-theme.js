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

  function themeForDate(date=new Date()){
    return THEMES[date.getDay()]||THEMES[1];
  }

  function applyTheme(theme,source='calendar'){
    const root=document.documentElement;
    root.dataset.dayTheme=theme.id;
    root.dataset.dayThemeSource=source;
    root.style.colorScheme='dark';
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',theme.themeColor);
    window.UKMLA_DAILY_THEME={
      id:theme.id,
      name:theme.name,
      source,
      themes:THEMES.map(item=>({id:item.id,name:item.name}))
    };
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
    setTimeout(()=>{
      applyCurrentTheme();
      scheduleMidnightRefresh();
    },Math.min(delay,2147483647));
  }

  function appendStyle(href,attribute){
    if(document.querySelector(`link[${attribute}]`))return;
    const style=document.createElement('link');
    style.rel='stylesheet';
    style.href=href;
    style.setAttribute(attribute,'1');
    document.head.appendChild(style);
  }

  function appendScript(src,attribute){
    if(document.querySelector(`script[${attribute}]`))return;
    const script=document.createElement('script');
    script.src=src;
    script.async=false;
    script.setAttribute(attribute,'1');
    document.head.appendChild(script);
  }

  function loadMedicalImageExtension(){
    appendStyle('./v2/image-bank.css?v=1','data-ukmla-image-bank');
    appendStyle('./v2/image-mode-control.css?v=1','data-ukmla-image-mode');
    appendScript('./v2/image-bank.js?v=1','data-ukmla-image-bank');
    appendScript('./v2/image-mode-control.js?v=1','data-ukmla-image-mode');
  }

  applyCurrentTheme();
  loadMedicalImageExtension();
  scheduleMidnightRefresh();
})();
