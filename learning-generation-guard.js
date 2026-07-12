(function(){
  'use strict';
  if(window.__UKMLA_LEARNING_GENERATION_GUARD__)return;
  window.__UKMLA_LEARNING_GENERATION_GUARD__=true;

  function unfinished(){
    const job=window.UKMLA_AI_RESUME?.current?.();
    return job&&!['complete','error','discarded'].includes(job.status);
  }
  function knowledgeBusy(){
    const button=document.getElementById('knowledge-generate');
    const percent=Number(String(document.getElementById('knowledge-progress-label')?.textContent||'0').replace('%',''))||0;
    return Boolean(button?.disabled)&&percent>0&&percent<100;
  }
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('#aiq-generate,#aiq-random,#knowledge-generate');
    if(!trigger)return;
    const mappingConflict=trigger.id!=='knowledge-generate'&&knowledgeBusy();
    if(!unfinished()&&!mappingConflict)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const message=mappingConflict?'A knowledge pack is currently being mapped. Complete that generation before starting another quiz.':'An unfinished generation is saved. Resume it or discard its progress before starting another quiz.';
    const status=document.getElementById('aiq-status');if(status)status.textContent=message;
    const knowledge=document.getElementById('knowledge-status');if(knowledge)knowledge.textContent=message;
    document.getElementById(mappingConflict?'knowledge-dump-quiz':'aiq-generation-progress')?.scrollIntoView({behavior:'smooth',block:'center'});
  },true);
})();
