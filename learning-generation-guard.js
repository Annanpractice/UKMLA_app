(function(){
  'use strict';
  if(window.__UKMLA_LEARNING_GENERATION_GUARD__)return;
  window.__UKMLA_LEARNING_GENERATION_GUARD__=true;

  function unfinished(){
    const job=window.UKMLA_AI_RESUME?.current?.();
    return job&&!['complete','error','discarded'].includes(job.status);
  }
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('#aiq-generate,#aiq-random,#knowledge-generate');
    if(!trigger||!unfinished())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const message='An unfinished generation is saved. Resume it or discard its progress before starting another quiz.';
    const status=document.getElementById('aiq-status');if(status)status.textContent=message;
    const knowledge=document.getElementById('knowledge-status');if(knowledge)knowledge.textContent=message;
    document.getElementById('aiq-generation-progress')?.scrollIntoView({behavior:'smooth',block:'center'});
  },true);
})();
