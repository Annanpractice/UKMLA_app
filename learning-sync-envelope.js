(function(){
  'use strict';

  if(window.__UKMLA_LEARNING_SYNC_ENVELOPE__) return;
  window.__UKMLA_LEARNING_SYNC_ENVELOPE__=true;

  const PROGRESS_KEY='ukmlaQuizProgressV1';
  const EVENT_KEY='ukmlaLearningEventsV1';
  const REGISTRY_KEY='ukmlaLearningRegistryV1';
  const COVERAGE_KEY='ukmlaCoverageStateV1';
  const PACKS_KEY='ukmlaKnowledgePackStatsV1';
  const FIELD='__learningSyncV1';
  let writing=false;

  function parse(value,fallback){try{return JSON.parse(value||'null')??fallback;}catch(_){return fallback;}}
  function get(key,fallback){return parse(localStorage.getItem(key),fallback);}
  function set(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function mergeEvents(a,b){const map=new Map();[...(a||[]),...(b||[])].forEach(event=>{if(event?.id)map.set(event.id,event);});return [...map.values()].sort((x,y)=>String(x.at||'').localeCompare(String(y.at||'')));}
  function mergeRegistry(a,b){return {version:Math.max(Number(a?.version)||1,Number(b?.version)||1),topics:{...(a?.topics||{}),...(b?.topics||{})},conditions:{...(a?.conditions||{}),...(b?.conditions||{})}};}
  function mergeCoverage(a,b){
    const ac=Number(a?.cycle)||1,bc=Number(b?.cycle)||1;if(ac>bc)return a;if(bc>ac)return b;
    return {...b,...a,cycle:ac,completedCycles:Math.max(Number(a?.completedCycles)||0,Number(b?.completedCycles)||0),covered:[...new Set([...(a?.covered||[]),...(b?.covered||[])])],updatedAt:new Date().toISOString()};
  }
  function mergePacks(a,b){const result={...(b||{})};Object.entries(a||{}).forEach(([id,value])=>{const other=result[id];if(!other||String(value?.updatedAt||value?.createdAt||'')>=String(other?.updatedAt||other?.createdAt||''))result[id]=value;});return result;}

  function localEnvelope(){return {version:1,events:get(EVENT_KEY,[]),registry:get(REGISTRY_KEY,{version:1,topics:{},conditions:{}}),coverage:get(COVERAGE_KEY,{cycle:1,completedCycles:0,covered:[]}),packs:get(PACKS_KEY,{}),updatedAt:new Date().toISOString()};}
  function writeEnvelope(){
    if(writing)return;writing=true;
    try{const progress=get(PROGRESS_KEY,{});progress[FIELD]=localEnvelope();set(PROGRESS_KEY,progress);}finally{writing=false;}
  }
  function mergeFromProgress(){
    if(writing)return;const progress=get(PROGRESS_KEY,{});const remote=progress[FIELD];if(!remote)return;
    const merged={version:1,events:mergeEvents(get(EVENT_KEY,[]),remote.events),registry:mergeRegistry(get(REGISTRY_KEY,{version:1,topics:{},conditions:{}}),remote.registry),coverage:mergeCoverage(get(COVERAGE_KEY,{cycle:1,completedCycles:0,covered:[]}),remote.coverage),packs:mergePacks(get(PACKS_KEY,{}),remote.packs),updatedAt:new Date().toISOString()};
    set(EVENT_KEY,merged.events);set(REGISTRY_KEY,merged.registry);set(COVERAGE_KEY,merged.coverage);set(PACKS_KEY,merged.packs);progress[FIELD]=merged;writing=true;try{set(PROGRESS_KEY,progress);}finally{writing=false;}window.UKMLA_LEARNING?.refresh();
  }

  document.addEventListener('ukmlaLearningEvent',writeEnvelope);
  document.addEventListener('ukmlaRemoteDataImported',()=>{mergeFromProgress();writeEnvelope();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')writeEnvelope();});
  window.addEventListener('pagehide',writeEnvelope);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mergeFromProgress();writeEnvelope();},{once:true});else{mergeFromProgress();writeEnvelope();}
})();
