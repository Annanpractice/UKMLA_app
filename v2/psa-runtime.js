(function(){
  'use strict';

  function install(){
    const engine=window.UKMLA_PSA_ENGINE;
    if(!engine||engine.__runtimePatched)return;
    engine.__runtimePatched=true;

    const originalSaveSession=engine.saveSession;
    const originalActiveSession=engine.activeSession;
    const originalMarkSession=engine.markSession;
    const originalPaperById=engine.paperById;
    let lastStructural='';
    let lastWriteAt=0;
    let pendingSession=null;
    let pendingTimer=null;

    function structuralSnapshot(session){
      const copy={...session};
      delete copy.remainingSeconds;
      delete copy.lastTimerAt;
      delete copy.updatedAt;
      return JSON.stringify(copy);
    }
    function flush(){
      if(!pendingSession)return;
      clearTimeout(pendingTimer);pendingTimer=null;
      const session=pendingSession;pendingSession=null;
      originalSaveSession(session);
      lastStructural=structuralSnapshot(session);
      lastWriteAt=Date.now();
    }
    engine.saveSession=function(session){
      const now=Date.now();
      const structural=structuralSnapshot(session);
      const structuralChange=structural!==lastStructural;
      const urgent=structuralChange||session.status!=='active'||Number(session.remainingSeconds)<=0;
      if(urgent||now-lastWriteAt>=5000){
        pendingSession=null;clearTimeout(pendingTimer);pendingTimer=null;
        originalSaveSession(session);
        lastStructural=structural;
        lastWriteAt=now;
        return;
      }
      pendingSession=session;
      clearTimeout(pendingTimer);
      pendingTimer=setTimeout(flush,Math.max(100,5000-(now-lastWriteAt)));
    };

    engine.activeSession=function(){
      const session=originalActiveSession();
      if(!session||session.status!=='active')return session;
      const reference=Number(session.lastTimerAt)||Date.parse(session.updatedAt||'')||Date.now();
      const elapsed=Math.max(0,Math.floor((Date.now()-reference)/1000));
      if(elapsed){session.remainingSeconds=Math.max(0,Number(session.remainingSeconds||0)-elapsed);session.lastTimerAt=Date.now();}
      lastStructural=structuralSnapshot(session);lastWriteAt=Date.now();
      return session;
    };

    engine.markSession=async function(config){
      const attempt=await originalMarkSession(config);
      attempt.durationSeconds=Math.max(0,Number(config.paper.durationSeconds||0)-Number(config.session.remainingSeconds||0));
      attempt.itemDescriptors=config.paper.items.map(item=>({itemId:item.id,sectionId:item.sectionId,sectionLabel:item.sectionLabel,clinicalDomain:item.clinicalDomain,highRiskClass:item.highRiskClass,marks:item.marks}));
      const attempts=window.UKMLA_V2.loadJson(engine.KEYS.attempts,[]);
      const index=attempts.findIndex(item=>item.attemptId===attempt.attemptId);
      if(index>=0)attempts[index]=attempt;else attempts.unshift(attempt);
      window.UKMLA_V2.saveJson(engine.KEYS.attempts,attempts.slice(0,100));
      return attempt;
    };

    engine.paperById=function(id){
      const paper=originalPaperById(id);
      if(paper)return paper;
      const attempt=engine.attempts().find(item=>item.paperId===id&&Array.isArray(item.itemDescriptors));
      return attempt?{paperId:id,items:attempt.itemDescriptors}:null;
    };

    window.addEventListener('pagehide',flush);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
