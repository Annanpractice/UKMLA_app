(function(){
  'use strict';

  const WATCHED_KEYS=[
    'ukmlaLearningEventsV1',
    'ukmlaQuestionBankAttemptsV1',
    'ukmlaQuizProgressV1',
    'ukmlaCoverageStateV1',
    'ukmlaAnsweredCoverageStateV2'
  ];
  let lastSignature='';
  let refreshTimer=null;
  let initialised=false;

  function core(){return window.UKMLA_V2;}
  function onAnalyticsRoute(){return location.hash.startsWith('#/analytics');}
  function raw(key){
    try{return localStorage.getItem(key)||'';}catch(_){return'';}
  }
  function hashText(text){
    let value=2166136261;
    for(let index=0;index<text.length;index++){
      value^=text.charCodeAt(index);
      value=Math.imul(value,16777619)>>>0;
    }
    return value.toString(36);
  }
  function dataSignature(){
    return WATCHED_KEYS.map(key=>`${key}:${hashText(raw(key))}`).join('|');
  }
  function invalidateIndex(){
    const api=core();
    if(api?.App)api.App.eventIndex=null;
  }
  function renderFreshAnalytics(){
    refreshTimer=null;
    const api=core();
    if(!onAnalyticsRoute()||!api?.App?.loaded||typeof api.render!=='function')return;
    const scrollY=window.scrollY;
    invalidateIndex();
    lastSignature=dataSignature();
    api.render();
    requestAnimationFrame(()=>window.scrollTo({top:scrollY,left:0,behavior:'auto'}));
  }
  function scheduleFreshRender(){
    if(refreshTimer!==null)return;
    refreshTimer=setTimeout(renderFreshAnalytics,40);
  }
  function noteDataChange(){
    invalidateIndex();
    const next=dataSignature();
    const changed=next!==lastSignature;
    lastSignature=next;
    if(changed&&onAnalyticsRoute())scheduleFreshRender();
  }
  function checkForUnannouncedChange(){
    const next=dataSignature();
    if(next===lastSignature)return false;
    invalidateIndex();
    lastSignature=next;
    if(onAnalyticsRoute())scheduleFreshRender();
    return true;
  }
  function onRouteChange(){
    setTimeout(()=>{
      if(!onAnalyticsRoute())return;
      checkForUnannouncedChange();
    },0);
  }
  function initialise(){
    if(initialised)return;
    const api=core();
    if(!api?.App?.loaded){setTimeout(initialise,80);return;}
    initialised=true;
    lastSignature=dataSignature();

    // Discard any event index built before late storage migrations or sync work.
    invalidateIndex();
    if(onAnalyticsRoute())scheduleFreshRender();

    document.addEventListener('ukmlaLearningEvent',noteDataChange);
    document.addEventListener('ukmlaQuestionBankChanged',noteDataChange);
    document.addEventListener('ukmlaRemoteDataImported',noteDataChange);
    document.addEventListener('ukmlaAiCompletedSetStored',noteDataChange);
    window.addEventListener('storage',event=>{
      if(!event.key||WATCHED_KEYS.includes(event.key))noteDataChange();
    });
    window.addEventListener('hashchange',onRouteChange);
    window.addEventListener('pageshow',checkForUnannouncedChange);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')checkForUnannouncedChange();
    });
  }

  window.UKMLA_ANALYTICS_FRESHNESS={
    WATCHED_KEYS,dataSignature,invalidateIndex,noteDataChange,checkForUnannouncedChange
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();
})();
