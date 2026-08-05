(function(){
  'use strict';

  const ALL_TOPICS='__all_topics__';
  const SPRANKI_SCRIPTS=[
    ['./v2/spranki-local-pack.js?v=2','spranki-local-pack-loader'],
    ['./v2/spranki-image-map-01.js?v=1','spranki-image-map-01-loader'],
    ['./v2/spranki-image-map-02.js?v=1','spranki-image-map-02-loader'],
    ['./v2/spranki-image-map-03.js?v=1','spranki-image-map-03-loader'],
    ['./v2/spranki-image-map-04.js?v=1','spranki-image-map-04-loader'],
    ['./v2/spranki-image-map-05.js?v=1','spranki-image-map-05-loader'],
    ['./v2/spranki-image-map-06.js?v=1','spranki-image-map-06-loader'],
    ['./v2/spranki-image-map-07.js?v=1','spranki-image-map-07-loader'],
    ['./v2/spranki-image-map-08.js?v=1','spranki-image-map-08-loader'],
    ['./v2/spranki-image-map-09.js?v=1','spranki-image-map-09-loader'],
    ['./v2/spranki-image-map-data.js?v=1','spranki-image-map-data-loader'],
    ['./v2/spranki-card-images.js?v=1','spranki-card-images-loader']
  ];
  let scheduled=false;
  let featurePromise=null;

  function loadScript(src,id){
    if(document.getElementById(id))return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.id=id;
      script.src=src;
      script.defer=true;
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error(`Could not load ${src}.`));
      document.head.appendChild(script);
    });
  }

  function loadSprankiFeatures(){
    if(featurePromise)return featurePromise;
    featurePromise=(async()=>{
      for(const[src,id]of SPRANKI_SCRIPTS)await loadScript(src,id);
    })().catch(error=>{
      console.warn('Spranki local image features did not load:',error);
      featurePromise=null;
    });
    return featurePromise;
  }

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
    void loadSprankiFeatures();
    const app=document.getElementById('app');
    if(!app){setTimeout(initialise,80);return;}
    new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    window.addEventListener('pageshow',schedule);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
