(function(){
  'use strict';

  const ALL_TOPICS='__all_topics__';
  let scheduled=false;

  function onUnscopedCardsRoute(){
    const raw=(location.hash||'#/home').replace(/^#\/?/,'');
    const [route,...rest]=raw.split('/');
    return route==='conditions'&&!rest.join('/');
  }

  function applyDefault(){
    scheduled=false;
    if(!onUnscopedCardsRoute())return;

    const select=document.getElementById('topic-select');
    if(!select||select.dataset.defaultAllTopics==='1')return;
    if(!select.querySelector(`option[value="${ALL_TOPICS}"]`)){
      schedule();
      return;
    }

    select.dataset.defaultAllTopics='1';
    if(select.value===ALL_TOPICS)return;
    select.value=ALL_TOPICS;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(applyDefault);
  }

  function initialise(){
    const app=document.getElementById('app');
    if(!app){setTimeout(initialise,80);return;}
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    window.addEventListener('pageshow',schedule);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
