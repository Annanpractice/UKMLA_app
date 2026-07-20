(function(){
  'use strict';

  const TRANSIENT_MS=30000;
  const dialogue=[];
  let dialogueStem='';
  let latestAudio=null;
  let audioState=null;
  let renderTimer=null;
  let restoreTimer=null;
  let scheduledRevoke=new Map();

  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function context(){return window.UKMLA_HANDSFREE?.getQuestionContext?.()||null;}
  function formatTime(value){
    const seconds=Math.max(0,Number.isFinite(Number(value))?Math.floor(Number(value)):0);
    return`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  }

  function questionOnlyText(current=context()){
    if(!current)return'';
    const options=(current.options||[]).map(option=>`${option.id}. ${option.text}.`).join(' ');
    return[clean(current.stem),clean(current.leadIn),options].filter(Boolean).join('. ');
  }

  function shouldReplaceQuestionSpeech(text,current){
    if(!current||current.answered)return false;
    const spoken=clean(text);
    if(!spoken)return false;
    if(/^(voice tutor on|hands-free voice control on)\b/i.test(spoken))return true;
    if(/say the letter of your proposed answer/i.test(spoken))return true;
    const stem=clean(current.stem);
    const options=current.options||[];
    return Boolean(stem&&spoken.includes(stem)&&options.length>=2&&spoken.includes(clean(options[0].text))&&spoken.includes(clean(options[1].text)));
  }

  function copyUtterance(utterance,text){
    try{utterance.text=text;return utterance;}catch(_){
      const replacement=new SpeechSynthesisUtterance(text);
      for(const key of['lang','rate','pitch','volume','voice','onstart','onend','onerror','onpause','onresume','onmark','onboundary']){
        try{replacement[key]=utterance[key];}catch(__){}
      }
      return replacement;
    }
  }

  function patchSpeechOutput(){
    const synth=window.speechSynthesis;
    if(!synth||synth.__ukmlaQuestionOnlyPatched)return;
    const previousSpeak=synth.speak.bind(synth);
    synth.speak=function(utterance){
      const current=context();
      const text=clean(utterance?.text);
      if(current&&shouldReplaceQuestionSpeech(text,current))utterance=copyUtterance(utterance,questionOnlyText(current));
      else{
        const confirmation=text.match(/^([A-E]) selected\. Are you sure\?/i);
        if(confirmation)utterance=copyUtterance(utterance,`Option ${confirmation[1].toUpperCase()} selected. Confirm?`);
      }
      return previousSpeak(utterance);
    };
    synth.__ukmlaQuestionOnlyPatched=true;
  }

  function optionForOrdinal(word,current=context()){
    const options=current?.options||[];
    const map={first:0,'1st':0,second:1,'2nd':1,third:2,'3rd':2,fourth:3,'4th':3,fifth:4,'5th':4,last:Math.max(0,options.length-1)};
    const index=map[word];
    return Number.isInteger(index)&&options[index]?.id?options[index].id:'';
  }

  function parseDirectChoice(raw){
    const text=clean(raw).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\s]+/g,' ').replace(/\s+/g,' ').trim();
    if(!text)return'';
    const current=context();

    const exactOrdinal=text.match(/^(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)(?:\s+(?:one|option|answer))?$/);
    if(exactOrdinal)return optionForOrdinal(exactOrdinal[1],current);
    const chosenOrdinal=text.match(/\b(?:choose|pick|select|take|go with|going with|lets go with|ill go with|my answer is|the answer is)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)(?:\s+(?:one|option|answer))?\b/);
    if(chosenOrdinal)return optionForOrdinal(chosenOrdinal[1],current);

    const spokenLetters={a:'A',ay:'A',b:'B',be:'B',bee:'B',c:'C',see:'C',sea:'C',d:'D',dee:'D',e:'E',ee:'E'};
    const exactLetter=text.match(/^(?:option\s+)?(a|ay|b|be|bee|c|see|sea|d|dee|e|ee)(?:\s+please)?$/);
    if(exactLetter)return spokenLetters[exactLetter[1]]||'';
    const chosenLetter=text.match(/\b(?:choose|pick|select|take|try|go with|going with|lets go with|ill go with|i think|my answer is|the answer is|answer|option)\s+(?:option\s+)?(a|ay|b|be|bee|c|see|sea|d|dee|e|ee)\b/);
    return chosenLetter?spokenLetters[chosenLetter[1]]||'':'';
  }

  function installRecognitionWrapper(recognition){
    if(!recognition||recognition.__ukmlaDirectChoiceWrapped||typeof recognition.onresult!=='function')return;
    const original=recognition.onresult;
    recognition.onresult=function(event){
      const alternatives=[];
      for(let index=event.resultIndex||0;index<event.results.length;index++){
        for(let choice=0;choice<event.results[index].length;choice++)alternatives.push(event.results[index][choice].transcript);
      }
      const selected=alternatives.map(parseDirectChoice).find(Boolean);
      if(selected){
        void window.UKMLA_HANDSFREE?.proposeAnswer?.(selected,{skipAgent:true});
        return;
      }
      return original.call(this,event);
    };
    recognition.__ukmlaDirectChoiceWrapped=true;
  }

  function patchRecognition(){
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    const proto=Recognition?.prototype;
    if(!proto||proto.__ukmlaDirectChoiceStartPatched)return;
    const previousStart=proto.start;
    proto.start=function(...args){installRecognitionWrapper(this);return previousStart.apply(this,args);};
    proto.__ukmlaDirectChoiceStartPatched=true;
  }

  function outputText(data){
    if(typeof data?.output_text==='string')return data.output_text;
    for(const item of data?.output||[])for(const part of item?.content||[])if(part?.type==='output_text'&&typeof part.text==='string')return part.text;
    return'';
  }

  function extractLearner(prompt){
    const match=String(prompt||'').match(/Learner said:\s*([\s\S]+?)\nCurrent app context:/);
    if(!match)return'';
    try{return clean(JSON.parse(match[1].trim()));}catch(_){return clean(match[1]);}
  }

  function tutorInstruction(){
    const recent=dialogue.length?`Recent dialogue for continuity: ${JSON.stringify(dialogue.slice(-6))}`:'No earlier dialogue is needed.';
    return`VOICE-TUTOR BEHAVIOUR OVERRIDE:
- Begin with the clinical content. Never introduce the app, UKMLA, API keys, policies, restrictions, or what you will not do unless the learner explicitly asks.
- When the learner asks what a term means or requests background, give a concise factual explanation grounded in the current question, then ask one focused Socratic question.
- When the learner offers reasoning, respond to that reasoning and ask one useful next question. Do not ask a generic "why did you choose that?" question.
- When the learner directly chooses an option, use propose_answer and make speech only: "Option X selected. Confirm?" Do not request justification.
- Keep the existing rule against revealing, rating, or eliminating answers before submission.
${recent}`;
  }

  function patchTutorTransport(){
    const transport=window.UKMLA_V2_AI_TRANSPORT;
    if(!transport?.send||transport.__ukmlaTutorEnhanced)return false;
    const previousSend=transport.send.bind(transport);
    transport.send=async function(apiKey,payload){
      const tutorTurn=payload?.text?.format?.name==='ukmla_handsfree_tutor_turn_v1';
      if(!tutorTurn)return previousSend(apiKey,payload);
      const enhanced=JSON.parse(JSON.stringify(payload));
      const current=context();
      const stem=clean(current?.stem);
      if(stem&&stem!==dialogueStem){dialogueStem=stem;dialogue.length=0;}
      enhanced.input=Array.isArray(enhanced.input)?enhanced.input:[];
      enhanced.input.unshift({role:'system',content:[{type:'input_text',text:tutorInstruction()}]});
      const learner=extractLearner(enhanced.input.map(item=>(item.content||[]).map(part=>part.text||'').join('\n')).join('\n'));
      const response=await previousSend(apiKey,enhanced);
      try{
        const parsed=JSON.parse(outputText(response));
        if(learner||parsed?.speech){dialogue.push({learner,assistant:clean(parsed?.speech)});while(dialogue.length>6)dialogue.shift();}
      }catch(_){}
      return response;
    };
    transport.__ukmlaTutorEnhanced=true;
    return true;
  }

  function statusNodes(){return[...document.querySelectorAll('[data-shared-quiz-status]')];}

  function ensureScrubber(track){
    let input=track.querySelector('.elevenlabs-progress-scrubber');
    if(input)return input;
    input=document.createElement('input');
    input.type='range';
    input.min='0';
    input.max='1';
    input.step='0.05';
    input.value='0';
    input.className='elevenlabs-progress-scrubber';
    input.setAttribute('aria-label','ElevenLabs audio position');
    input.addEventListener('input',()=>seekLatest(Number(input.value),false));
    input.addEventListener('change',()=>seekLatest(Number(input.value),true));
    track.appendChild(input);
    return input;
  }

  function seekLatest(seconds,play){
    if(!latestAudio||!audioState)return;
    const duration=Math.max(0,Number(audioState.duration)||0);
    const target=Math.max(0,Math.min(duration||seconds,seconds));
    audioState.current=target;
    audioState.completed=false;
    audioState.expires=Date.now()+TRANSIENT_MS;
    try{latestAudio.currentTime=target;}catch(_){}
    if(play||latestAudio.paused)latestAudio.play().catch(()=>{});
    renderAudioStatus();
  }

  function renderAudioStatus(){
    if(!audioState||Date.now()>=audioState.expires){restoreSharedStatus();return;}
    const duration=Math.max(0,Number(audioState.duration)||0);
    const current=Math.max(0,Math.min(duration||Number(audioState.current)||0,Number(audioState.current)||0));
    const percent=duration?Math.max(0,Math.min(100,current/duration*100)):0;
    for(const node of statusNodes()){
      const label=node.querySelector('[data-shared-status-label]');
      const detail=node.querySelector('[data-shared-status-detail]');
      const fill=node.querySelector('[data-shared-status-fill]');
      const track=fill?.parentElement||node.querySelector('.progress-track');
      if(label)label.textContent='ElevenLabs playback';
      if(detail)detail.textContent=`${audioState.playing?'Playing':'Latest output'} · ${formatTime(current)} / ${formatTime(duration)}`;
      if(fill)fill.hidden=true;
      if(track){
        track.classList.add('elevenlabs-scrubber-track');
        const slider=ensureScrubber(track);
        slider.max=String(Math.max(duration,1));
        slider.value=String(Math.min(current,Math.max(duration,1)));
        slider.style.setProperty('--elevenlabs-progress',`${percent}%`);
        slider.disabled=!duration;
      }
      node.classList.add('elevenlabs-progress-borrowed');
      node.setAttribute('aria-live','polite');
    }
  }

  function startRenderLoop(){
    if(renderTimer)return;
    renderTimer=setInterval(()=>{
      if(!audioState||Date.now()>=audioState.expires){restoreSharedStatus();return;}
      if(latestAudio&&!audioState.completed){
        const duration=Number(latestAudio.duration);
        const current=Number(latestAudio.currentTime);
        if(Number.isFinite(duration)&&duration>0)audioState.duration=duration;
        if(Number.isFinite(current)&&current>=0)audioState.current=current;
        audioState.playing=!latestAudio.paused&&!latestAudio.ended;
      }
      renderAudioStatus();
    },180);
  }

  function restoreSharedStatus(){
    if(renderTimer){clearInterval(renderTimer);renderTimer=null;}
    if(restoreTimer){clearTimeout(restoreTimer);restoreTimer=null;}
    audioState=null;
    for(const node of statusNodes()){
      const fill=node.querySelector('[data-shared-status-fill]');
      const track=fill?.parentElement||node.querySelector('.progress-track');
      if(fill)fill.hidden=false;
      track?.classList.remove('elevenlabs-scrubber-track');
      track?.querySelector('.elevenlabs-progress-scrubber')?.remove();
      node.classList.remove('elevenlabs-progress-borrowed');
    }
    window.UKMLA_V2_AI?.refreshSharedStatus?.();
  }

  function activateAudio(audio,patch={}){
    latestAudio=audio;
    const duration=Number(audio.duration);
    const current=Number(audio.currentTime);
    audioState={
      duration:Number.isFinite(duration)&&duration>0?duration:Number(audioState?.duration)||0,
      current:Number.isFinite(current)&&current>=0?current:Number(audioState?.current)||0,
      playing:!audio.paused&&!audio.ended,
      completed:Boolean(patch.completed),
      expires:Date.now()+TRANSIENT_MS,
      ...patch
    };
    if(restoreTimer)clearTimeout(restoreTimer);
    restoreTimer=setTimeout(restoreSharedStatus,TRANSIENT_MS+250);
    startRenderLoop();
    renderAudioStatus();
  }

  function monitorAudio(audio,src){
    if(!audio||audio.__ukmlaElevenLabsMonitored)return audio;
    const likelyElevenLabs=String(src||'').startsWith('blob:')&&window.UKMLA_ELEVENLABS?.isEnabled?.();
    if(!likelyElevenLabs)return audio;
    audio.__ukmlaElevenLabsMonitored=true;
    audio.__ukmlaBlobUrl=String(src||'');
    audio.addEventListener('loadedmetadata',()=>activateAudio(audio,{duration:Number(audio.duration)||0}));
    audio.addEventListener('durationchange',()=>activateAudio(audio,{duration:Number(audio.duration)||0}));
    audio.addEventListener('play',()=>activateAudio(audio,{playing:true,completed:false}));
    audio.addEventListener('timeupdate',()=>{
      if(audioState?.completed&&Number(audio.currentTime)===0)return;
      activateAudio(audio,{current:Number(audio.currentTime)||0,duration:Number(audio.duration)||0,playing:!audio.paused,completed:false});
    });
    audio.addEventListener('ended',()=>activateAudio(audio,{current:Number(audio.duration)||Number(audioState?.duration)||0,duration:Number(audio.duration)||Number(audioState?.duration)||0,playing:false,completed:true}));
    return audio;
  }

  function patchAudio(){
    const NativeAudio=window.Audio;
    if(!NativeAudio||NativeAudio.__ukmlaElevenLabsPatched)return;
    function PatchedAudio(src){return monitorAudio(new NativeAudio(src),src);}
    PatchedAudio.prototype=NativeAudio.prototype;
    try{Object.setPrototypeOf(PatchedAudio,NativeAudio);}catch(_){}
    PatchedAudio.__ukmlaElevenLabsPatched=true;
    window.Audio=PatchedAudio;

    const nativeRevoke=URL.revokeObjectURL.bind(URL);
    if(!URL.__ukmlaDelayedElevenLabsRevoke){
      URL.revokeObjectURL=function(url){
        const key=String(url||'');
        if(latestAudio?.__ukmlaBlobUrl===key){
          clearTimeout(scheduledRevoke.get(key));
          scheduledRevoke.set(key,setTimeout(()=>{scheduledRevoke.delete(key);nativeRevoke(key);},TRANSIENT_MS+1000));
          return;
        }
        nativeRevoke(url);
      };
      URL.__ukmlaDelayedElevenLabsRevoke=true;
    }
  }

  function injectStyles(){
    if(document.getElementById('voice-tutor-enhancement-styles'))return;
    const style=document.createElement('style');
    style.id='voice-tutor-enhancement-styles';
    style.textContent=`
      .elevenlabs-scrubber-track{height:26px!important;overflow:visible!important;background:transparent!important;display:flex;align-items:center}
      .elevenlabs-progress-scrubber{--elevenlabs-progress:0%;width:100%;height:26px;margin:0;appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer}
      .elevenlabs-progress-scrubber::-webkit-slider-runnable-track{height:8px;border-radius:999px;background:linear-gradient(90deg,var(--cyan) 0 var(--elevenlabs-progress),rgba(0,0,0,.34) var(--elevenlabs-progress) 100%);box-shadow:0 0 12px rgba(46,183,255,.2)}
      .elevenlabs-progress-scrubber::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;margin-top:-6px;border:2px solid #dff9ff;border-radius:50%;background:var(--blue);box-shadow:0 0 14px rgba(46,183,255,.7)}
      .elevenlabs-progress-scrubber::-moz-range-track{height:8px;border-radius:999px;background:rgba(0,0,0,.34)}
      .elevenlabs-progress-scrubber::-moz-range-progress{height:8px;border-radius:999px;background:var(--cyan)}
      .elevenlabs-progress-scrubber::-moz-range-thumb{width:18px;height:18px;border:2px solid #dff9ff;border-radius:50%;background:var(--blue);box-shadow:0 0 14px rgba(46,183,255,.7)}
      .elevenlabs-progress-borrowed [data-shared-status-label],.elevenlabs-progress-borrowed [data-shared-status-detail]{color:var(--cyan)}
    `;
    document.head.appendChild(style);
  }

  function initialise(){
    injectStyles();
    patchSpeechOutput();
    patchRecognition();
    patchAudio();
    if(!patchTutorTransport())setTimeout(initialise,100);
    window.addEventListener('hashchange',()=>{if(audioState)renderAudioStatus();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
