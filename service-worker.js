// Previous deployed cache markers retained for validation migration: ukmla-cards-v11-sba-runtime-proof ukmla-cards-v13-durable-generated-sets ukmla-cards-v14-generated-set-survival ukmla-cards-v15-shared-status-intro ukmla-cards-v16-muted-intro-fallback ukmla-cards-v17-cache-first-card-startup ukmla-cards-v18-robust-mobile-intro ukmla-cards-v19-real-intro-only ukmla-cards-v20-optimised-real-intro ukmla-cards-v21-tap-first-frame-intro ukmla-cards-v22-original-resolution-intro ukmla-cards-v23-original-silent-intro ukmla-cards-v24-clinical-pharmacology ukmla-cards-v25-unlimited-api-repair ukmla-cards-v26-elevenlabs-handsfree ukmla-cards-v27-mobile-handsfree-scroll ukmla-cards-v28-mobile-search-layout ukmla-cards-v29-voice-tutor-scrubber ukmla-cards-v30-george-default-voice
const CACHE_NAME='ukmla-cards-v31-elevenlabs-saved-autoload';
const RUNTIME_CARD_CACHE='ukmla-runtime-card-data-v1';
const CORE_ASSETS=[
  './','./index.html','./app.html','./data/conditions.json','./assets/ukmla-intro-first-frame.jpg',
  './v2/app.css','./v2/intro.css','./v2/psa.css','./v2/psa-grounding.css','./v2/biomedical.css','./v2/question-workspace.css','./v2/question-bank.css','./v2/handsfree.css','./v2/mobile-enhancements.css',
  './v2/boot-recovery.js','./v2/intro.js','./v2/core.js','./v2/pharmacology-data.js','./v2/pharmacology-data-calculations-prescribing.js','./v2/pharmacology-data-emergency-acute.js','./v2/pharmacology-data-cardiovascular-emergency.js','./v2/pharmacology-data-cardiovascular-heart-failure-rhythm.js','./v2/pharmacology-data-cardiovascular-prevention.js','./v2/pharmacology-data-anticoagulation.js','./v2/pharmacology-data-antimicrobials-pneumonia.js','./v2/pharmacology-data-antimicrobials-urinary-skin.js','./v2/pharmacology-data-antimicrobials-stewardship.js','./v2/pharmacology-data-high-risk-metabolic.js','./v2/pharmacology-data-high-risk-toxicology.js','./v2/pharmacology-data-geriatrics-frailty.js','./v2/pharmacology-data-topical-dermatology.js','./v2/large-storage.js','./v2/question-bank.js','./v2/question-analytics.js','./v2/ai-transport.js','./v2/ai-schema.js','./v2/biomedical-ai.js','./v2/pharmacology-ai.js','./v2/ai-giveaway-validator.js','./v2/ai-pipeline-mode.js','./v2/ai-sba-audit.js','./v2/ai-targeted-repair.js','./v2/ai-engine.js','./v2/ai-unlimited-repair.js','./v2/ai-ui.js','./v2/ai-save-recovery.js',
  './v2/knowledge-pptx.js','./v2/knowledge.js','./v2/firebase-config.js','./v2/sync.js','./v2/psa-schema.js','./v2/psa-engine.js','./v2/psa-grounding.js','./v2/psa-runtime.js','./v2/psa.js','./v2/biomedical.js','./v2/biomedical-basic.js','./v2/pharmacology.js','./v2/question-workspace.js','./v2/handsfree.js','./v2/elevenlabs-handsfree.js','./v2/george-default-voice.js','./v2/elevenlabs-saved-autoload.js','./v2/mobile-search-enhancements.js','./v2/voice-tutor-enhancements.js'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_ASSETS.map(asset=>cache.add(new Request(asset,{cache:'reload'}))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name!==CACHE_NAME&&name!==RUNTIME_CARD_CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cacheResponse(request,response){
  if(!response?.ok||response.status===206)return response;
  const cache=await caches.open(CACHE_NAME);
  await cache.put(request,response.clone());
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  // Leave MP4 delivery to the browser and GitHub Pages. Native byte-range
  // streaming is more reliable on mobile than reconstructing media in the worker.
  if(url.pathname.endsWith('/assets/ukmla-intro.mp4'))return;

  if(url.pathname.endsWith('/data/conditions.json')){
    event.respondWith((async()=>{
      const cached=await caches.match(request,{ignoreSearch:true});
      const refresh=fetch(request)
        .then(response=>cacheResponse(request,response))
        .catch(()=>null);
      if(cached){
        event.waitUntil(refresh);
        return cached;
      }
      const response=await refresh;
      if(response)return response;
      throw new Error('Condition index is unavailable.');
    })());
    return;
  }

  event.respondWith((async()=>{
    try{
      const response=await fetch(request);
      cacheResponse(request,response).catch(()=>{});
      return response;
    }catch(error){
      const cached=await caches.match(request,{ignoreSearch:true});
      if(cached)return cached;
      if(request.mode==='navigate'){
        const fallback=await caches.match('./index.html');
        if(fallback)return fallback;
      }
      throw error;
    }
  })());
});
