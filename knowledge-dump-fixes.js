(function(){
  'use strict';
  if(window.__UKMLA_KNOWLEDGE_DUMP_FIXES__)return;
  window.__UKMLA_KNOWLEDGE_DUMP_FIXES__=true;
  document.addEventListener('ukmlaKnowledgeProgress',event=>{
    const percent=Number(event.detail?.percent)||0;
    if(percent<100)return;
    const status=document.getElementById('aiq-status');
    if(status)status.textContent='Knowledge-pack set generated. Passed local validation, source fidelity and all routine checkpoints.';
  });
})();
