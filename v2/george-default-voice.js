(function(){
  'use strict';

  const TARGET_NAME='George';
  const PREVIOUS_DEFAULT='Raymond Baxter';
  const STORAGE={
    voiceId:'ukmlaElevenLabsVoiceIdV2',
    voiceName:'ukmlaElevenLabsVoiceNameV2',
    migration:'ukmlaElevenLabsGeorgeDefaultV1'
  };
  let observer=null;

  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function read(key){try{return localStorage.getItem(key)||'';}catch(_){return'';}}
  function write(key,value){try{localStorage.setItem(key,String(value));}catch(_){}}
  function findGeorge(select){
    const options=[...select.options];
    const wanted=TARGET_NAME.toLowerCase();
    return options.find(option=>clean(option.textContent).toLowerCase()===wanted)
      ||options.find(option=>clean(option.textContent).toLowerCase().includes(wanted));
  }

  function applyDefault(){
    const select=document.getElementById('elevenlabs-voice');
    if(!select||select.options.length<2)return false;
    const george=findGeorge(select);
    if(!george)return false;

    const savedName=clean(read(STORAGE.voiceName));
    const migrated=read(STORAGE.migration)==='1';
    const previousWasDefault=savedName.toLowerCase().includes(PREVIOUS_DEFAULT.toLowerCase());
    const shouldChoose=!migrated&&(!savedName||previousWasDefault);

    if(shouldChoose){
      select.value=george.value;
      write(STORAGE.voiceId,george.value);
      write(STORAGE.voiceName,clean(george.textContent));
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    write(STORAGE.migration,'1');

    if(select.value===george.value){
      const status=document.getElementById('elevenlabs-status');
      if(status){status.textContent='George is ready.';status.dataset.mode='ready';}
    }
    return true;
  }

  function mount(){
    const select=document.getElementById('elevenlabs-voice');
    if(!select)return false;
    applyDefault();
    observer?.disconnect();
    observer=new MutationObserver(()=>setTimeout(applyDefault,0));
    observer.observe(select,{childList:true,subtree:true});
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#elevenlabs-load');
    if(button)setTimeout(applyDefault,100);
  },true);

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#elevenlabs-test');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const enabled=document.getElementById('elevenlabs-enabled')?.checked;
    const key=clean(document.getElementById('elevenlabs-key')?.value||read('ukmlaElevenLabsApiKeyV2'));
    const voice=document.getElementById('elevenlabs-voice')?.value;
    const status=document.getElementById('elevenlabs-status');
    if(!enabled||!key||!voice){
      if(status){status.textContent='Enter the key, load a voice and enable ElevenLabs first.';status.dataset.mode='error';}
      return;
    }
    speechSynthesis.speak(new SpeechSynthesisUtterance('ElevenLabs is connected. George will now read your UKMLA questions and medical units more clearly.'));
  },true);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{
    if(mount())return;
    const bodyObserver=new MutationObserver(()=>{if(mount())bodyObserver.disconnect();});
    bodyObserver.observe(document.body,{childList:true,subtree:true});
  },{once:true});
  else if(!mount()){
    const bodyObserver=new MutationObserver(()=>{if(mount())bodyObserver.disconnect();});
    bodyObserver.observe(document.body,{childList:true,subtree:true});
  }
})();
