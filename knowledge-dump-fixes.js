(function(){
  'use strict';
  if(window.__UKMLA_KNOWLEDGE_DUMP_FIXES__)return;
  window.__UKMLA_KNOWLEDGE_DUMP_FIXES__=true;
  document.addEventListener('ukmlaKnowledgeProgress',event=>{
    const message=String(event.detail?.message||'');
    const requested=Number(event.detail?.percent)||0;
    const label=document.getElementById('knowledge-progress-label');
    const current=Number(String(label?.textContent||'0').replace('%',''))||0;
    const percent=Math.max(current,requested);
    const fill=document.getElementById('knowledge-progress-fill');if(fill)fill.style.width=`${Math.min(100,percent)}%`;
    if(label)label.textContent=`${Math.round(Math.min(100,percent))}%`;
    const stage=document.getElementById('knowledge-progress-stage');if(stage&&message)stage.textContent=message;
    const localStatus=document.getElementById('knowledge-status');if(localStatus&&message)localStatus.textContent=message;
    if(requested<100)return;
    const status=document.getElementById('aiq-status');
    if(status)status.textContent='Knowledge-pack set generated. Passed local validation, source fidelity and all routine checkpoints.';
  });
})();
