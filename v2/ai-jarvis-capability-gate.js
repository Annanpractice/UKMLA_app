(function(){
'use strict';

const legacy=window.__UKMLA_AI_BEFORE_JARVIS__;
const durable=window.UKMLA_V2_AI;
if(!legacy||!durable||legacy===durable)return;

const durableMount=typeof durable.mount==='function'?durable.mount.bind(durable):null;
const legacyMount=typeof legacy.mount==='function'?legacy.mount.bind(legacy):null;
const worker=(localStorage.getItem('ukmlaJarvis2WorkerUrlV1')||'https://jarvis-2.iainpfs.workers.dev').trim().replace(/\/+$/,'');
let available=false;
let checked=false;
let lastContainer=null;

function expose(){
  window.UKMLA_V2_AI={
    ...durable,
    mount(container){
      lastContainer=container||lastContainer;
      if(available&&durableMount)return durableMount(container);
      if(legacyMount)return legacyMount(container);
      return null;
    },
    executionBackend:available?'jarvis-2-cloudflare-workflow':'browser-fallback'
  };
}

async function probe(){
  try{
    const response=await fetch(`${worker}/v1/ukmla/question-builds/latest`,{
      method:'GET',
      headers:{'X-Jarvis-Client':'ukmla-v2-capability-probe'},
      cache:'no-store'
    });
    available=response.status===401||response.status===403||response.ok;
  }catch(_){
    available=false;
  }
  checked=true;
  expose();
  if(available&&lastContainer?.isConnected&&durableMount)durableMount(lastContainer);
  document.dispatchEvent(new CustomEvent('ukmlaJarvis2Capability',{detail:{available,checked}}));
}

expose();
void probe();
})();
