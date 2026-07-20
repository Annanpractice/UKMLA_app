(function(){
  'use strict';

  const TARGET_NAME='George';
  const PREVIOUS_DEFAULT='Raymond Baxter';
  const STORAGE={
    voiceId:'ukmlaElevenLabsVoiceIdV2',
    voiceName:'ukmlaElevenLabsVoiceNameV2',
    userVoiceName:'ukmlaElevenLabsUserVoiceNameV1'
  };
  let observer=null;
  let applying=false;

  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function read(key){try{return localStorage.getItem(key)||'';}catch(_){return'';}}
  function write(key,value){try{localStorage.setItem(key,String(value));}catch(_){}}
  function remove(key){try{localStorage.removeItem(key);}catch(_){}}
  function findVoice(select,name){
    const wanted=clean(name).toLowerCase();
    if(!wanted)return null;
    const options=[...select.options];
    return options.find(option=>clean(option.textContent).toLowerCase()===wanted)
      ||options.find(option=>clean(option.textContent).toLowerCase().includes(wanted));
  }

  const initialSavedName=clean(read(STORAGE.voiceName));
  if(initialSavedName
    &&!initialSavedName.toLowerCase().includes(PREVIOUS_DEFAULT.toLowerCase())
    &&initialSavedName.toLowerCase()!==TARGET_NAME.toLowerCase()
    &&!read(STORAGE.userVoiceName)){
    write(STORAGE.userVoiceName,initialSavedName);
  }

  function chooseDefault(){
    const select=document.getElementById('elevenlabs-voice');
    if(!select||select.options.length<2)return false;
    const preferred=findVoice(select,read(STORAGE.userVoiceName));
    const george=findVoice(select,TARGET_NAME);
    const chosen=preferred||george;
    if(!chosen)return false;

    applying=true;
    select.value=chosen.value;
    write(STORAGE.voiceId,chosen.value);
    write(STORAGE.voiceName,clean(chosen.textContent));
    select.dispatchEvent(new Event('change',{bubbles:true}));
    applying=false;

    const status=document.getElementById('elevenlabs-status');
    if(status&&chosen===george){status.textContent='George is ready.';status.dataset.mode='ready';}
    return true;
  }

  function mount(){
    const select=document.getElementById('elevenlabs-voice');
    if(!select)return false;
    if(select.dataset.georgeDefaultMounted!=='1'){
      select.dataset.georgeDefaultMounted='1';
      select.addEventListener('change',()=>{
        if(applying||!select.value)return;
        write(STORAGE.userVoiceName,clean(select.selectedOptions[0]?.textContent));
      });
    }
    chooseDefault();
    observer?.disconnect();
    observer=new MutationObserver(()=>setTimeout(chooseDefault,0));
    observer.observe(select,{childList:true,subtree:true});
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#elevenlabs-load');
    if(button)setTimeout(chooseDefault,120);
  },true);

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#elevenlabs-clear'))remove(STORAGE.userVoiceName);
  });

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#elevenlabs-test');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const enabled=document.getElementById('elevenlabs-enabled')?.checked;
    const key=clean(document.getElementById('elevenlabs-key')?.value||read('ukmlaElevenLabsApiKeyV2'));
    const select=document.getElementById('elevenlabs-voice');
    const voice=select?.value;
    const status=document.getElementById('elevenlabs-status');
    if(!enabled||!key||!voice){
      if(status){status.textContent='Enter the key, load a voice and enable ElevenLabs first.';status.dataset.mode='error';}
      return;
    }
    const voiceName=clean(select.selectedOptions[0]?.textContent)||'The selected voice';
    speechSynthesis.speak(new SpeechSynthesisUtterance(`ElevenLabs is connected. ${voiceName} will now read your UKMLA questions and medical units more clearly.`));
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
