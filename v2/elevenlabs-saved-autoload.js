(function(){
  'use strict';

  const STORAGE={
    key:'ukmlaElevenLabsApiKeyV2',
    remember:'ukmlaElevenLabsRememberV2',
    enabled:'ukmlaElevenLabsEnabledV2',
    model:'ukmlaElevenLabsModelV2'
  };

  function read(key,fallback=''){
    try{
      const value=localStorage.getItem(key);
      return value===null?fallback:value;
    }catch(_){
      return fallback;
    }
  }

  function write(key,value){
    try{localStorage.setItem(key,String(value));}catch(_){}
  }

  function configure(){
    const section=document.querySelector('.elevenlabs-setup');
    const keyInput=document.getElementById('elevenlabs-key');
    const remember=document.getElementById('elevenlabs-remember');
    const enabled=document.getElementById('elevenlabs-enabled');
    const model=document.getElementById('elevenlabs-model');
    const savedKey=read(STORAGE.key).trim();

    if(!section||!keyInput||!remember||!enabled||!model)return false;

    keyInput.value=savedKey;
    remember.checked=true;
    enabled.checked=Boolean(savedKey);
    model.value=read(STORAGE.model,'eleven_v3')||'eleven_v3';
    write(STORAGE.remember,'1');
    write(STORAGE.enabled,savedKey?'1':'0');

    section.hidden=true;
    section.setAttribute('aria-hidden','true');

    if(savedKey)window.UKMLA_ELEVENLABS?.loadVoices?.();
    return true;
  }

  function start(){
    if(configure())return;
    const observer=new MutationObserver(()=>{
      if(configure())observer.disconnect();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
