(function(){
  'use strict';
  if(window.__UKMLA_LEARNING_SYNC_GUARD__)return;
  window.__UKMLA_LEARNING_SYNC_GUARD__=true;

  const READY_KEY='ukmlaLearningPullReadyV1';
  const EVENT_KEY='ukmlaLearningEventsV1';

  function hasLearningData(){
    try{return (JSON.parse(localStorage.getItem(EVENT_KEY)||'[]')||[]).length>0;}
    catch(_){return false;}
  }
  function ready(){
    const time=Number(sessionStorage.getItem(READY_KEY)||0);
    return time>0&&Date.now()-time<10*60*1000;
  }
  function status(text){const node=document.getElementById('ukmla-cloud-status');if(node)node.textContent=text;}
  function watchStatus(){
    const node=document.getElementById('ukmla-cloud-status');
    if(!node||node.dataset.learningGuarded)return;
    node.dataset.learningGuarded='1';
    new MutationObserver(()=>{
      const text=String(node.textContent||'');
      if(/Server already matches|Pulled server data|Server pad is empty/i.test(text))sessionStorage.setItem(READY_KEY,String(Date.now()));
      if(/Pushed this device|Merged and pushed/i.test(text))sessionStorage.removeItem(READY_KEY);
    }).observe(node,{childList:true,subtree:true,characterData:true});
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('#ukmla-cloud-push');
    if(!button||!hasLearningData()||ready())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    status('Pull from server first. Learning events must be merged before this device can safely push.');
  },true);
  function init(){watchStatus();new MutationObserver(watchStatus).observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
