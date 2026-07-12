(function(){
  'use strict';
  if(window.__UKMLA_LEARNING_BADGE_SAFETY__)return;
  window.__UKMLA_LEARNING_BADGE_SAFETY__=true;

  let queued=false;
  function sanitise(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      queued=false;
      document.querySelectorAll('.learning-condition-count,.learning-topic-count').forEach(badge=>{
        const text=String(badge.textContent||'').trim();
        if(text){badge.dataset.count=text;badge.textContent='';}
        badge.setAttribute('aria-hidden','true');
        if(badge.classList.contains('learning-topic-count')){
          const link=badge.closest('.nav a');
          if(link){
            const label=[...link.children].find(node=>node.tagName==='SPAN'&&!node.classList.contains('topic-bulb')&&!node.classList.contains('topic-score')&&!node.classList.contains('learning-topic-count'));
            if(label&&badge.parentElement!==label)label.appendChild(badge);
          }
        }
      });
    }));
  }

  const style=document.createElement('style');
  style.textContent='.learning-condition-count::before,.learning-topic-count::before{content:attr(data-count)}';
  document.head.appendChild(style);

  ['ukmlaLearningEvent','ukmlaRemoteDataImported','ukmlaAdditionalTopicReady'].forEach(name=>document.addEventListener(name,sanitise));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sanitise,{once:true});else sanitise();
})();
