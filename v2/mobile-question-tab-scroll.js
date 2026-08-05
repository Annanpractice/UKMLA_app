(function(){
  'use strict';

  const MOBILE_QUERY='(max-width:760px)';
  let scheduled=false;
  let lastBar=null;
  let lastTab='';
  let alignmentToken=0;

  function onQuestionsRoute(){return location.hash.startsWith('#/quiz');}

  function activeTabButton(bar){
    return bar.querySelector('[data-quiz-tab].active,[data-quiz-tab][aria-selected="true"]');
  }

  function targetLeft(bar,button){
    const barRect=bar.getBoundingClientRect();
    const buttonRect=button.getBoundingClientRect();
    return Math.max(0,bar.scrollLeft+buttonRect.left-barRect.left-2);
  }

  function setLeft(bar,left){
    if(!bar.isConnected)return;
    bar.scrollLeft=left;
    try{bar.scrollTo({left,top:0,behavior:'auto'});}catch(_){bar.scrollLeft=left;}
  }

  function alignActiveTab(){
    scheduled=false;
    if(!onQuestionsRoute()||!window.matchMedia(MOBILE_QUERY).matches){
      lastBar=null;
      lastTab='';
      return;
    }

    const bar=document.querySelector('#app .tabs');
    const button=bar&&activeTabButton(bar);
    if(!bar||!button)return;

    const tab=button.dataset.quizTab||'';
    if(bar===lastBar&&tab===lastTab)return;
    lastBar=bar;
    lastTab=tab;

    const token=++alignmentToken;
    setLeft(bar,targetLeft(bar,button));
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(token!==alignmentToken||bar!==lastBar||!bar.isConnected)return;
      setLeft(bar,targetLeft(bar,button));
    }));
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(alignActiveTab);
  }

  function resetAndSchedule(){
    lastBar=null;
    lastTab='';
    schedule();
  }

  function initialise(){
    const app=document.getElementById('app');
    if(!app){setTimeout(initialise,80);return;}

    new MutationObserver(schedule).observe(app,{
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['class','aria-selected']
    });
    window.addEventListener('hashchange',resetAndSchedule);
    window.addEventListener('resize',resetAndSchedule,{passive:true});
    window.addEventListener('orientationchange',resetAndSchedule,{passive:true});
    window.addEventListener('pageshow',resetAndSchedule);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
