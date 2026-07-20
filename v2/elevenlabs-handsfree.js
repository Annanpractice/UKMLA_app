(function(){
  'use strict';

  const API_BASE='https://api.elevenlabs.io';
  const TARGET_VOICE='Raymond Baxter';
  const DEFAULT_MODEL='eleven_v3';
  const STORAGE={
    key:'ukmlaElevenLabsApiKeyV2',
    remember:'ukmlaElevenLabsRememberV2',
    enabled:'ukmlaElevenLabsEnabledV2',
    voiceId:'ukmlaElevenLabsVoiceIdV2',
    voiceName:'ukmlaElevenLabsVoiceNameV2',
    model:'ukmlaElevenLabsModelV2'
  };

  const synth=window.speechSynthesis;
  if(!synth)return;

  const nativeSpeak=synth.speak.bind(synth);
  const nativeCancel=synth.cancel.bind(synth);
  let activeAudio=null;
  let activeUrl='';
  let activeController=null;
  let currentUtterance=null;
  let mounted=false;

  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function read(key,fallback=''){try{const value=localStorage.getItem(key);return value===null?fallback:value;}catch(_){return fallback;}}
  function write(key,value){try{localStorage.setItem(key,String(value));}catch(_){}}
  function remove(key){try{localStorage.removeItem(key);}catch(_){}}
  function el(id){return document.getElementById(id);}
  function status(message,mode='idle'){
    const node=el('elevenlabs-status');
    if(node){node.textContent=message;node.dataset.mode=mode;}
  }
  function enabled(){return Boolean(el('elevenlabs-enabled')?.checked&&apiKey()&&voiceId());}
  function apiKey(){return clean(el('elevenlabs-key')?.value||read(STORAGE.key));}
  function voiceId(){return clean(el('elevenlabs-voice')?.value||read(STORAGE.voiceId));}
  function modelId(){return clean(el('elevenlabs-model')?.value||read(STORAGE.model,DEFAULT_MODEL))||DEFAULT_MODEL;}
  function rememberSettings(){
    const remember=Boolean(el('elevenlabs-remember')?.checked);
    write(STORAGE.remember,remember?'1':'0');
    write(STORAGE.enabled,el('elevenlabs-enabled')?.checked?'1':'0');
    write(STORAGE.model,modelId());
    const select=el('elevenlabs-voice');
    if(select?.value){
      write(STORAGE.voiceId,select.value);
      write(STORAGE.voiceName,clean(select.selectedOptions[0]?.textContent));
    }
    if(remember)write(STORAGE.key,clean(el('elevenlabs-key')?.value));
    else remove(STORAGE.key);
  }

  function releaseAudio({notifyEnd=false}={}){
    if(activeController){activeController.abort();activeController=null;}
    if(activeAudio){
      try{activeAudio.pause();activeAudio.currentTime=0;}catch(_){}
      activeAudio=null;
    }
    if(activeUrl){URL.revokeObjectURL(activeUrl);activeUrl='';}
    const utterance=currentUtterance;
    currentUtterance=null;
    if(notifyEnd&&utterance&&typeof utterance.onend==='function'){
      try{utterance.onend(new Event('end'));}catch(_){}
    }
  }

  function replaceNumberUnit(text,pattern,spoken){
    return text.replace(new RegExp(`(\\d(?:[\\d.,]*\\d)?)(?:\\s*)${pattern}\\b`,'gi'),`$1 ${spoken}`);
  }

  function normaliseForSpeech(input){
    let text=clean(input)
      .replace(/[–—]/g,' to ')
      .replace(/≥/g,' at least ')
      .replace(/≤/g,' at most ')
      .replace(/>/g,' greater than ')
      .replace(/</g,' less than ')
      .replace(/±/g,' plus or minus ')
      .replace(/\b1\s*:\s*1000\b/g,'one in one thousand')
      .replace(/\b1\s*:\s*10,?000\b/g,'one in ten thousand');

    text=replaceNumberUnit(text,'(?:mg|milligram(?:s)?)','milligrams');
    text=replaceNumberUnit(text,'(?:mcg|µg|microgram(?:s)?)','micrograms');
    text=replaceNumberUnit(text,'(?:g|gram(?:s)?)','grams');
    text=replaceNumberUnit(text,'(?:mL|ml|millilitre(?:s)?)','millilitres');
    text=replaceNumberUnit(text,'(?:L|litre(?:s)?)','litres');
    text=replaceNumberUnit(text,'(?:mmol\\/L|mmol\\s*per\\s*L)','millimoles per litre');
    text=replaceNumberUnit(text,'(?:mmHg)','millimetres of mercury');
    text=replaceNumberUnit(text,'(?:IU)','international units');
    text=replaceNumberUnit(text,'(?:kg)','kilograms');
    text=replaceNumberUnit(text,'(?:cm)','centimetres');
    text=replaceNumberUnit(text,'(?:mm)','millimetres');

    const replacements=[
      [/\bSpO2\b/gi,'oxygen saturation'],[/\bO2\b/g,'oxygen'],[/\bBP\b/g,'blood pressure'],
      [/\bECG\b/g,'E C G'],[/\bEEG\b/g,'E E G'],[/\bCT\b/g,'C T'],[/\bMRI\b/g,'M R I'],
      [/\bCXR\b/g,'chest X ray'],[/\bABG\b/g,'arterial blood gas'],[/\bVBG\b/g,'venous blood gas'],
      [/\bFBC\b/g,'full blood count'],[/\bCRP\b/g,'C R P'],[/\bESR\b/g,'E S R'],
      [/\bU&E\b/g,'urea and electrolytes'],[/\bLFTs?\b/g,'liver function tests'],
      [/\beGFR\b/g,'estimated G F R'],[/\bAKI\b/g,'acute kidney injury'],[/\bCKD\b/g,'chronic kidney disease'],
      [/\bICU\b/g,'intensive care'],[/\bED\b/g,'emergency department'],[/\bGP\b/g,'G P'],
      [/\bNICE\b/g,'Nice'],[/\bBNF\b/g,'B N F'],[/\bIV\b/g,'intravenous'],[/\bIM\b/g,'intramuscular'],
      [/\bPO\b/g,'by mouth'],[/\bOD\b/g,'once daily'],[/\bBD\b/g,'twice daily'],
      [/\bTDS\b/g,'three times daily'],[/\bQDS\b/g,'four times daily'],[/\bPRN\b/g,'when required'],
      [/\bNSAIDs?\b/g,'non steroidal anti inflammatory drugs'],[/\bACEi\b/g,'A C E inhibitor'],
      [/\bARB\b/g,'angiotensin receptor blocker'],[/\bHbA1c\b/gi,'haemoglobin A one C'],
      [/\bGCS\b/g,'Glasgow coma score'],[/\bNEWS2\b/g,'News two score'],
      [/\bIx\b/g,'investigations'],[/\bTx\b/g,'treatments']
    ];
    replacements.forEach(([pattern,replacement])=>{text=text.replace(pattern,replacement);});
    return clean(text).replace(/\s+([,.;:!?])/g,'$1').replace(/\/(?!\s)/g,' or ');
  }

  async function apiError(response){
    try{
      const body=await response.json();
      const detail=body?.detail?.message||body?.detail||body?.message||body?.error?.message;
      return typeof detail==='string'?detail:JSON.stringify(detail||body);
    }catch(_){
      try{return await response.text();}catch(__){return `ElevenLabs request failed with status ${response.status}.`;}
    }
  }

  async function loadVoices(){
    const key=apiKey();
    if(!key){status('Paste the ElevenLabs API key first.','error');el('elevenlabs-key')?.focus();return;}
    const button=el('elevenlabs-load');
    if(button)button.disabled=true;
    status('Loading your ElevenLabs voices…','busy');
    try{
      const response=await fetch(`${API_BASE}/v2/voices?page_size=100&sort=name&sort_direction=asc`,{headers:{'xi-api-key':key}});
      if(!response.ok)throw new Error(await apiError(response));
      const data=await response.json();
      const voices=Array.isArray(data?.voices)?data.voices:[];
      if(!voices.length)throw new Error('No voices were returned for this account.');
      const select=el('elevenlabs-voice');
      const savedId=read(STORAGE.voiceId);
      const savedName=clean(read(STORAGE.voiceName)).toLowerCase();
      const raymond=voices.find(voice=>clean(voice.name).toLowerCase().includes(TARGET_VOICE.toLowerCase()));
      const saved=voices.find(voice=>voice.voice_id===savedId)||voices.find(voice=>savedName&&clean(voice.name).toLowerCase()===savedName);
      const chosen=raymond||saved||voices[0];
      select.innerHTML=voices.map(voice=>`<option value="${String(voice.voice_id).replace(/"/g,'&quot;')}">${clean(voice.name)||'Unnamed voice'}</option>`).join('');
      select.value=chosen.voice_id;
      rememberSettings();
      status(raymond?`${clean(raymond.name)} is ready.`:`Voices loaded. Raymond Baxter was not found; choose the matching voice manually.` ,raymond?'ready':'warning');
    }catch(error){
      status(`Could not load voices: ${clean(error.message||error)}`,'error');
    }finally{
      if(button)button.disabled=false;
    }
  }

  async function generateSpeech(utterance){
    const key=apiKey();
    const selectedVoice=voiceId();
    if(!key||!selectedVoice){nativeSpeak(utterance);return;}

    releaseAudio();
    nativeCancel();
    currentUtterance=utterance;
    activeController=new AbortController();
    const text=normaliseForSpeech(utterance.text).slice(0,5000);
    status('Generating ElevenLabs speech…','busy');

    try{
      const response=await fetch(`${API_BASE}/v1/text-to-speech/${encodeURIComponent(selectedVoice)}?output_format=mp3_44100_128`,{
        method:'POST',
        headers:{'xi-api-key':key,'Content-Type':'application/json','Accept':'audio/mpeg'},
        body:JSON.stringify({
          text,
          model_id:modelId(),
          language_code:'en',
          apply_text_normalization:'on',
          voice_settings:{stability:0.5,similarity_boost:0.82,style:0.08,use_speaker_boost:true,speed:0.96}
        }),
        signal:activeController.signal
      });
      if(!response.ok)throw new Error(await apiError(response));
      const blob=await response.blob();
      activeUrl=URL.createObjectURL(blob);
      activeAudio=new Audio(activeUrl);
      activeAudio.preload='auto';
      activeAudio.onplay=()=>{
        status('Speaking with ElevenLabs.','ready');
        if(typeof utterance.onstart==='function')try{utterance.onstart(new Event('start'));}catch(_){}
      };
      activeAudio.onended=()=>{
        const finished=currentUtterance;
        releaseAudio();
        status('ElevenLabs voice ready.','ready');
        if(finished&&typeof finished.onend==='function')try{finished.onend(new Event('end'));}catch(_){}
      };
      activeAudio.onerror=()=>{
        const failed=currentUtterance;
        releaseAudio();
        status('The ElevenLabs audio could not be played. Falling back to the browser voice.','error');
        if(failed)nativeSpeak(failed);
      };
      await activeAudio.play();
    }catch(error){
      if(error?.name==='AbortError')return;
      const failed=currentUtterance;
      releaseAudio();
      status(`ElevenLabs failed: ${clean(error.message||error)}. Using the browser voice.`,`error`);
      if(failed)nativeSpeak(failed);
    }finally{
      activeController=null;
    }
  }

  synth.speak=function(utterance){
    if(!enabled()){nativeSpeak(utterance);return;}
    rememberSettings();
    generateSpeech(utterance);
  };

  synth.cancel=function(){
    releaseAudio();
    nativeCancel();
  };

  function injectStyles(){
    if(el('elevenlabs-handsfree-styles'))return;
    const style=document.createElement('style');
    style.id='elevenlabs-handsfree-styles';
    style.textContent=`
      .elevenlabs-setup{margin-top:.9rem;padding-top:.9rem;border-top:1px solid rgba(125,206,255,.2);display:grid;gap:.7rem}
      .elevenlabs-setup h3{margin:0;font-size:1rem;color:#eef8ff}
      .elevenlabs-setup label{display:grid;gap:.35rem;color:#b8c9db;font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .elevenlabs-setup input[type=password],.elevenlabs-setup select{width:100%;min-width:0;border:1px solid rgba(125,206,255,.28);border-radius:14px;background:#031426;color:#f4fbff;padding:.72rem .8rem;font:inherit}
      .elevenlabs-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.55rem;align-items:end}
      .elevenlabs-actions{display:flex;gap:.5rem;flex-wrap:wrap}
      .elevenlabs-check{display:flex!important;grid-auto-flow:column!important;grid-template-columns:auto 1fr!important;align-items:center;gap:.5rem!important;text-transform:none!important;letter-spacing:0!important;font-weight:600!important}
      .elevenlabs-note{margin:0;color:#9fb4c8;font-size:.76rem;line-height:1.4}
      #elevenlabs-status{color:#8fe8ff;font-size:.8rem;line-height:1.35}
      #elevenlabs-status[data-mode=error]{color:#ffb2b2}#elevenlabs-status[data-mode=warning]{color:#ffd690}
      @media(max-width:560px){.elevenlabs-row{grid-template-columns:1fr}.elevenlabs-actions .btn{flex:1 1 11rem}}
    `;
    document.head.appendChild(style);
  }

  function clearSavedKey(){
    remove(STORAGE.key);
    remove(STORAGE.voiceId);
    remove(STORAGE.voiceName);
    if(el('elevenlabs-key'))el('elevenlabs-key').value='';
    if(el('elevenlabs-voice'))el('elevenlabs-voice').innerHTML='<option value="">Load voices first</option>';
    status('Saved ElevenLabs key and voice selection cleared.','idle');
  }

  function mount(){
    if(mounted)return true;
    const panel=el('handsfree-setup');
    if(!panel)return false;
    injectStyles();
    const section=document.createElement('section');
    section.className='elevenlabs-setup';
    section.innerHTML=`
      <h3>ElevenLabs voice</h3>
      <label for="elevenlabs-key">ElevenLabs API key
        <input id="elevenlabs-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="Paste restricted ElevenLabs key">
      </label>
      <label class="elevenlabs-check"><input id="elevenlabs-remember" type="checkbox">Remember this key on this device</label>
      <div class="elevenlabs-row">
        <label for="elevenlabs-voice">Voice<select id="elevenlabs-voice"><option value="">Load voices first</option></select></label>
        <button class="btn ghost" id="elevenlabs-load" type="button">Load voices</button>
      </div>
      <label for="elevenlabs-model">Speech model
        <select id="elevenlabs-model"><option value="eleven_v3">Eleven version 3</option><option value="eleven_flash_v2_5">Flash version 2.5 — faster</option><option value="eleven_multilingual_v2">Multilingual version 2</option></select>
      </label>
      <label class="elevenlabs-check"><input id="elevenlabs-enabled" type="checkbox">Use ElevenLabs for Hands-free speech</label>
      <div class="elevenlabs-actions"><button class="btn ghost" id="elevenlabs-test" type="button">Test voice</button><button class="btn ghost" id="elevenlabs-clear" type="button">Clear saved key</button></div>
      <div id="elevenlabs-status" role="status" aria-live="polite">Paste the restricted key, then load voices.</div>
      <p class="elevenlabs-note">The key is stored only in this browser when “Remember” is selected. Use a restricted ElevenLabs key with a low credit limit. It is not included in UKMLA cloud sync.</p>`;
    panel.insertBefore(section,panel.querySelector('#handsfree-agent-start'));

    const remember=read(STORAGE.remember,'1')!=='0';
    el('elevenlabs-remember').checked=remember;
    el('elevenlabs-enabled').checked=read(STORAGE.enabled,'1')!=='0';
    el('elevenlabs-model').value=read(STORAGE.model,DEFAULT_MODEL);
    if(remember)el('elevenlabs-key').value=read(STORAGE.key);

    ['elevenlabs-key','elevenlabs-remember','elevenlabs-enabled','elevenlabs-model','elevenlabs-voice'].forEach(id=>{
      el(id)?.addEventListener('change',rememberSettings);
    });
    el('elevenlabs-load').addEventListener('click',loadVoices);
    el('elevenlabs-test').addEventListener('click',()=>{
      if(!enabled()){status('Enter the key, load a voice and enable ElevenLabs first.','error');return;}
      const utterance=new SpeechSynthesisUtterance('ElevenLabs is connected. Raymond Baxter will now read your UKMLA questions and medical units more clearly.');
      synth.speak(utterance);
    });
    el('elevenlabs-clear').addEventListener('click',clearSavedKey);
    el('elevenlabs-key').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();loadVoices();}});

    mounted=true;
    if(apiKey())loadVoices();
    return true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{
    if(mount())return;
    const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});
    observer.observe(document.body,{childList:true,subtree:true});
  },{once:true});
  else if(!mount()){
    const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});
    observer.observe(document.body,{childList:true,subtree:true});
  }

  window.UKMLA_ELEVENLABS={loadVoices,normaliseForSpeech,isEnabled:enabled,clearSavedKey};
})();
