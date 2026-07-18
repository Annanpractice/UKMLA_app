(function(){
'use strict';

const CARD_DATA_PATTERN=/\/data\/conditions\.json$/;
const REQUEST_TIMEOUT_MS=8000;
const nativeFetch=window.fetch.bind(window);

function requestUrl(input){
  const value=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'');
  return new URL(value,location.href);
}

async function cachedCardData(url){
  if(!('caches'in window))return null;
  try{
    const response=await caches.match(url.href,{ignoreSearch:true});
    return response?.ok?response.clone():null;
  }catch(_){
    return null;
  }
}

function fetchWithTimeout(input,init={}){
  const controller=new AbortController();
  const externalSignal=init?.signal;
  const abort=()=>controller.abort(externalSignal?.reason);
  if(externalSignal){
    if(externalSignal.aborted)abort();
    else externalSignal.addEventListener('abort',abort,{once:true});
  }
  const timer=setTimeout(()=>controller.abort(new DOMException('Card data request timed out.','TimeoutError')),REQUEST_TIMEOUT_MS);
  return nativeFetch(input,{...init,signal:controller.signal}).finally(()=>{
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort',abort);
  });
}

async function rememberNetworkCopy(url,response){
  if(!response?.ok||!('caches'in window))return;
  try{
    const cache=await caches.open('ukmla-runtime-card-data-v1');
    await cache.put(url.href,response.clone());
  }catch(_){/* Runtime caching is optional. */}
}

window.fetch=async function resilientFetch(input,init){
  let url;
  try{url=requestUrl(input);}catch(_){return nativeFetch(input,init);}
  if(!CARD_DATA_PATTERN.test(url.pathname))return nativeFetch(input,init);

  const cached=await cachedCardData(url);
  if(cached){
    void fetchWithTimeout(input,{...(init||{}),cache:'no-cache'})
      .then(response=>rememberNetworkCopy(url,response))
      .catch(()=>{});
    return cached;
  }

  try{
    const response=await fetchWithTimeout(input,init||{});
    void rememberNetworkCopy(url,response);
    return response;
  }catch(error){
    const lateCache=await cachedCardData(url);
    if(lateCache)return lateCache;
    throw error;
  }
};
})();
