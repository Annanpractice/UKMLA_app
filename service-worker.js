// Previous deployed cache marker retained for validation migration: ukmla-cards-v11-sba-runtime-proof
const CACHE_NAME='ukmla-cards-v12-recency-background-generation';
const CORE_ASSETS=[
  './','./index.html','./app.html','./data/conditions.json',
  './v2/app.css','./v2/psa.css','./v2/psa-grounding.css','./v2/biomedical.css','./v2/question-workspace.css','./v2/question-bank.css','./v2/handsfree.css',
  './v2/core.js','./v2/large-storage.js','./v2/question-bank.js','./v2/question-analytics.js','./v2/ai-transport.js','./v2/ai-schema.js','./v2/biomedical-ai.js','./v2/ai-giveaway-validator.js','./v2/ai-pipeline-mode.js','./v2/ai-sba-audit.js','./v2/ai-targeted-repair.js','./v2/ai-engine.js','./v2/ai-ui.js',
  './v2/knowledge-pptx.js','./v2/knowledge.js','./v2/firebase-config.js','./v2/sync.js','./v2/psa-schema.js','./v2/psa-engine.js','./v2/psa-grounding.js','./v2/psa-runtime.js','./v2/psa.js','./v2/biomedical.js','./v2/biomedical-basic.js','./v2/question-workspace.js','./v2/handsfree.js'
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
    await Promise.all(names.filter(name=>name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  event.respondWith((async()=>{
    try{
      const response=await fetch(request);
      if(response&&response.ok){
        const cache=await caches.open(CACHE_NAME);
        cache.put(request,response.clone()).catch(()=>{});
      }
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