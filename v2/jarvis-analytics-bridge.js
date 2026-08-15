(function(){
  'use strict';

  const PAD_ID='ukmla-4Jq9QYF2vHc8nLz6WmRpT3xA';
  const FIREBASE_PATH=`ukmlaPads/${PAD_ID}/jarvisTelemetry`;
  const REQUEST_KEY='ukmlaInformJarvisAfterReloadV1';
  const LAST_PUBLISH_KEY='ukmlaInformJarvisLastPublishV1';
  const SNAPSHOT_SIZE=10;
  let firebasePromise=null;
  let observer=null;
  let scheduled=false;
  let publishBusy=false;
  let lastAttemptToken='';

  function core(){return window.UKMLA_V2;}
  function performance(){return window.UKMLA_CONDITION_PERFORMANCE;}
  function freshness(){return window.UKMLA_ANALYTICS_FRESHNESS;}
  function onAnalytics(){return location.hash.startsWith('#/analytics');}
  function parse(value,fallback=null){try{return JSON.parse(value||'null')??fallback;}catch(_){return fallback;}}
  function clean(value,max=500){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}

  function requestInform(){
    if(publishBusy)return;
    const request={
      requestedAt:new Date().toISOString(),
      returnHash:'#/analytics'
    };
    try{localStorage.setItem(REQUEST_KEY,JSON.stringify(request));}
    catch(_){core()?.toast?.('Could not prepare the Jarvis refresh.');return;}

    // Deliberately restart the entire document before calculating the snapshot.
    // The service worker is network-first for app assets, so this is a real page
    // lifecycle refresh rather than an analytics-only re-render.
    location.reload();
  }

  function weakestSnapshotRows(){
    const rows=performance()?.buildStats?.();
    if(!Array.isArray(rows))return null;
    return rows
      .filter(item=>Number(item?.answered)>0&&Number.isFinite(Number(item?.health)))
      .sort((a,b)=>Number(a.health)-Number(b.health)||Number(b.answered)-Number(a.answered)||String(a.name||'').localeCompare(String(b.name||'')))
      .slice(0,SNAPSHOT_SIZE)
      .map((item,index)=>({
        rank:index+1,
        id:clean(item.id,160),
        name:clean(item.name,240),
        topic:clean(item.topic,240),
        topicId:clean(item.topicId,160),
        healthPercent:Math.round(Number(item.health)),
        answered:Number(item.answered)||0,
        correct:Number(item.correct)||0,
        rawAccuracyPercent:Number.isFinite(Number(item.rawAccuracy))?Math.round(Number(item.rawAccuracy)):null,
        lastAnsweredAt:item.lastAnsweredAt||null
      }));
  }

  async function buildSnapshot(request){
    freshness()?.invalidateIndex?.();
    if(core()?.App)core().App.eventIndex=null;
    const all=performance()?.buildStats?.();
    if(!Array.isArray(all))throw new Error('Condition analytics are not ready.');
    const weakest=weakestSnapshotRows()||[];
    if(!weakest.length)throw new Error('No answered conditions are available to send yet.');
    const answeredRows=all.filter(item=>Number(item?.answered)>0);
    const generatedAt=new Date().toISOString();
    const academicContent={
      n:SNAPSHOT_SIZE,
      weakest:weakest.map(item=>({
        id:item.id,
        healthPercent:item.healthPercent,
        answered:item.answered,
        correct:item.correct,
        rawAccuracyPercent:item.rawAccuracyPercent,
        lastAnsweredAt:item.lastAnsweredAt
      }))
    };
    const revision=await contentRevision(academicContent);
    return{
      schemaVersion:1,
      source:'ukmla-v2-condition-performance',
      revision,
      generatedAt,
      refreshRequestedAt:request?.requestedAt||generatedAt,
      n:SNAPSHOT_SIZE,
      answeredConditionCount:answeredRows.length,
      totalConditionAnswers:answeredRows.reduce((sum,item)=>sum+(Number(item.answered)||0),0),
      weakest
    };
  }

  async function contentRevision(value){
    const text=JSON.stringify(value);
    try{
      if(globalThis.crypto?.subtle){
        const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
        return[...bytes].slice(0,12).map(byte=>byte.toString(16).padStart(2,'0')).join('');
      }
    }catch(_){}
    let hash=2166136261;
    for(let index=0;index<text.length;index++){
      hash^=text.charCodeAt(index);
      hash=Math.imul(hash,16777619)>>>0;
    }
    return`fnv-${hash.toString(16).padStart(8,'0')}`;
  }

  async function firebase(){
    if(firebasePromise)return firebasePromise;
    firebasePromise=(async()=>{
      const appMod=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
      const dbMod=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
      const config=window.UKMLA_V2_FIREBASE_CONFIG;
      if(!config)throw new Error('Firebase configuration is unavailable.');
      const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(config);
      const db=dbMod.getDatabase(app);
      return{dbMod,ref:dbMod.ref(db,FIREBASE_PATH)};
    })();
    return firebasePromise;
  }

  async function publishSnapshot(snapshot){
    const{dbMod,ref}=await firebase();
    let committed=null;
    const result=await dbMod.runTransaction(ref,current=>{
      const existing=current&&typeof current==='object'?current:{};
      const existingLatest=existing.latest&&typeof existing.latest==='object'?existing.latest:null;
      const changed=!existingLatest||existingLatest.revision!==snapshot.revision;
      const next={
        schemaVersion:1,
        source:'ukmla-v2-inform-jarvis',
        revision:snapshot.revision,
        generatedAt:snapshot.generatedAt,
        refreshRequestedAt:snapshot.refreshRequestedAt,
        latest:snapshot,
        previous:changed?existingLatest:(existing.previous||null)
      };
      committed=next;
      return next;
    },{applyLocally:false});
    if(!result.committed)throw new Error('Firebase did not commit the Jarvis snapshot.');
    return result.snapshot?.val?.()||committed;
  }

  async function processReloadRequest(){
    const request=parse(localStorage.getItem(REQUEST_KEY),null);
    if(!request?.requestedAt||publishBusy)return;
    const token=String(request.requestedAt);
    if(token===lastAttemptToken)return;
    if(!core()?.App?.loaded||typeof performance()?.buildStats!=='function')return;
    if(!onAnalytics()){
      if(location.hash!=='#/analytics')location.hash='#/analytics';
      return;
    }

    lastAttemptToken=token;
    publishBusy=true;
    updateButton();
    try{
      // Let the post-reload analytics decorators complete before taking the record.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const snapshot=await buildSnapshot(request);
      const published=await publishSnapshot(snapshot);
      localStorage.removeItem(REQUEST_KEY);
      localStorage.setItem(LAST_PUBLISH_KEY,JSON.stringify({
        publishedAt:new Date().toISOString(),
        revision:published?.revision||snapshot.revision,
        weakest:snapshot.weakest.map(item=>({name:item.name,healthPercent:item.healthPercent}))
      }));
      core()?.toast?.(`Jarvis informed · ${snapshot.weakest.length} weakest conditions updated`);
    }catch(error){
      core()?.toast?.(`Jarvis update failed: ${clean(error?.message||error,180)}`);
    }finally{
      publishBusy=false;
      updateButton();
    }
  }

  function updateButton(){
    if(!onAnalytics())return;
    const actions=document.querySelector('#app .page-actions');
    if(!actions)return;
    let button=document.getElementById('inform-jarvis');
    if(!button){
      button=document.createElement('button');
      button.id='inform-jarvis';
      button.type='button';
      button.className='btn primary';
      button.addEventListener('click',requestInform);
      actions.prepend(button);
    }
    button.disabled=publishBusy;
    button.textContent=publishBusy?'Informing Jarvis…':'Inform Jarvis';
    const last=parse(localStorage.getItem(LAST_PUBLISH_KEY),null);
    button.title=last?.publishedAt
      ?`Refresh the full page, then publish the current ten weakest conditions to Jarvis. Last informed ${new Date(last.publishedAt).toLocaleString()}.`
      :'Refresh the full page, then publish the current ten weakest conditions to Jarvis.';
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(()=>{
      scheduled=false;
      updateButton();
      processReloadRequest();
    },30);
  }

  function initialise(){
    if(observer)return;
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    window.addEventListener('pageshow',schedule);
    document.addEventListener('ukmlaLearningEvent',schedule);
    document.addEventListener('ukmlaRemoteDataImported',schedule);
    document.addEventListener('ukmlaQuestionBankChanged',schedule);
    schedule();
  }

  window.UKMLA_JARVIS_ANALYTICS={
    SNAPSHOT_SIZE,
    FIREBASE_PATH,
    weakestSnapshotRows,
    buildSnapshot,
    requestInform
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();
})();
