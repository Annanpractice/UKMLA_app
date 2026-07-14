(function(){
  'use strict';

  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const AGENT_MODEL='gpt-5-mini';
  const AGENT_KEY_TTL=30*60*1000;
  const state={
    enabled:false,
    recognition:null,
    speaking:false,
    pendingOption:'',
    lastQuestionKey:'',
    restartTimer:null,
    wakeLock:null,
    observer:null,
    apiKey:'',
    apiKeySetAt:0,
    aiEnabled:false,
    agentBusy:false,
    panelOpen:false
  };

  let toggleButton=null;
  let statusNode=null;
  let setupPanel=null;
  let keyInput=null;

  function isQuestionsRoute(){return location.hash.startsWith('#/quiz');}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function visible(node){return Boolean(node&&node.isConnected&&node.getClientRects().length);}
  function optionLetter(button){return clean(button?.querySelector('.letter')?.textContent||button?.dataset.aiOption||button?.dataset.option||'').toUpperCase();}
  function optionText(button){
    if(!button)return'';
    const spans=[...button.querySelectorAll('span')];
    return clean(spans.length>1?spans.slice(1).map(node=>node.textContent).join(' '):button.textContent.replace(optionLetter(button),''));
  }
  function transport(){return window.UKMLA_V2_AI_TRANSPORT;}
  function outputText(data){
    if(typeof data?.output_text==='string')return data.output_text;
    for(const item of data?.output||[]){
      for(const content of item.content||[]){
        if(content?.type==='output_text'&&typeof content.text==='string')return content.text;
      }
    }
    return'';
  }

  function activeQuestionCard(){
    return [...document.querySelectorAll('#app .quiz-card')].find(card=>visible(card)&&card.querySelector('.quiz-stem')&&card.querySelector('.options .option'))||null;
  }

  function currentQuestion(){
    const card=activeQuestionCard();
    if(!card)return null;
    const stem=clean(card.querySelector('.quiz-stem')?.textContent);
    const meta=clean(card.querySelector('.topic-meta span')?.textContent);
    const leadNode=card.querySelector('.quiz-stem + p');
    const leadIn=clean(leadNode?.textContent);
    const options=[...card.querySelectorAll('.options .option')].filter(visible).map(button=>({
      id:optionLetter(button),
      text:optionText(button),
      button
    })).filter(option=>/^[A-E]$/.test(option.id));
    const feedback=clean(card.querySelector('.feedback')?.textContent);
    const answered=Boolean(feedback||options.some(option=>option.button.disabled));
    const nextButton=card.querySelector('#ai-next,#quiz-next,#bank-next,#biomedical-next,#psa-next,.card-actions .btn.primary');
    const previousButton=card.querySelector('#ai-prev,#quiz-prev,#bank-prev,#biomedical-prev,#psa-prev,.card-actions .btn:not(.primary)');
    const key=[meta,stem,options.map(option=>`${option.id}:${option.text}`).join('|')].join('::');
    return{card,meta,stem,leadIn,options,feedback,answered,nextButton,previousButton,key};
  }

  function setStatus(message,mode='idle'){
    if(statusNode){statusNode.textContent=message;statusNode.dataset.mode=mode;}
    if(toggleButton){
      toggleButton.classList.toggle('active',state.enabled);
      toggleButton.setAttribute('aria-pressed',state.enabled?'true':'false');
      toggleButton.querySelector('.handsfree-label').textContent=state.enabled?(state.aiEnabled?'Voice tutor on':'Hands-free on'):'Hands-free';
    }
  }

  function setPanel(open){
    state.panelOpen=Boolean(open);
    if(setupPanel)setupPanel.hidden=!state.panelOpen;
    if(state.panelOpen)keyInput?.focus();
  }

  function clearProposed(){
    document.querySelectorAll('.option.voice-proposed').forEach(button=>button.classList.remove('voice-proposed'));
    state.pendingOption='';
  }

  function clearTemporaryApiKey(){
    state.apiKey='';
    state.apiKeySetAt=0;
    state.aiEnabled=false;
    if(keyInput)keyInput.value='';
  }

  function setTemporaryApiKey(token){
    const value=clean(token);
    if(value.length<20)return false;
    state.apiKey=value;
    state.apiKeySetAt=Date.now();
    return true;
  }

  function validTemporaryApiKey(){
    if(!state.apiKey)return false;
    if(Date.now()-state.apiKeySetAt>AGENT_KEY_TTL){clearTemporaryApiKey();return false;}
    return true;
  }

  function stopRecognition(){
    clearTimeout(state.restartTimer);
    state.restartTimer=null;
    if(!state.recognition)return;
    try{state.recognition.abort();}catch(_){/* already stopped */}
  }

  function scheduleRecognition(delay=180){
    clearTimeout(state.restartTimer);
    if(!state.enabled||state.speaking||state.agentBusy||document.hidden||!SpeechRecognition)return;
    state.restartTimer=setTimeout(()=>{
      if(!state.enabled||state.speaking||state.agentBusy||document.hidden)return;
      try{state.recognition.start();setStatus('Listening…','listening');}catch(_){/* duplicate start */}
    },delay);
  }

  function speak(text,{after=null}={}){
    const spoken=clean(text);
    if(!spoken){after?.();scheduleRecognition();return;}
    stopRecognition();
    if(!('speechSynthesis'in window)){
      setStatus('Speech output unavailable','error');
      after?.();
      scheduleRecognition();
      return;
    }
    speechSynthesis.cancel();
    state.speaking=true;
    setStatus('Speaking…','speaking');
    const utterance=new SpeechSynthesisUtterance(spoken);
    utterance.lang='en-GB';
    utterance.rate=.94;
    utterance.onend=()=>{
      state.speaking=false;
      after?.();
      scheduleRecognition(240);
    };
    utterance.onerror=()=>{
      state.speaking=false;
      setStatus('Listening…','listening');
      scheduleRecognition(240);
    };
    speechSynthesis.speak(utterance);
  }

  function questionSpeech(question=currentQuestion()){
    if(!question)return'';
    const optionSpeech=question.options.map(option=>`${option.id}. ${option.text}.`).join(' ');
    return [question.meta,question.stem,question.leadIn,optionSpeech,'Say the letter of your proposed answer.'].filter(Boolean).join('. ');
  }

  function readQuestion(){
    const question=currentQuestion();
    if(!question){setStatus('Open a question first','idle');return false;}
    clearProposed();
    state.lastQuestionKey=question.key;
    if(question.answered){
      speak(`${question.meta}. This question has already been submitted. ${question.feedback}. Say next when ready.`);
    }else{
      speak(questionSpeech(question));
    }
    return true;
  }

  function agentSchema(){
    return{
      type:'object',
      additionalProperties:false,
      required:['action','optionId','speech'],
      properties:{
        action:{type:'string',enum:['propose_answer','confirm_answer','cancel_answer','read_question','repeat_feedback','next_question','previous_question','none']},
        optionId:{anyOf:[{type:'string',enum:['A','B','C','D','E']},{type:'null'}]},
        speech:{type:'string',maxLength:420}
      }
    };
  }

  function agentPrompt(transcript,purpose){
    const question=currentQuestion();
    const context=question?{
      meta:question.meta,
      stem:question.stem,
      leadIn:question.leadIn,
      options:question.options.map(({id,text})=>({id,text})),
      answered:question.answered,
      feedback:question.answered?question.feedback:'',
      proposedOption:state.pendingOption||null
    }:null;
    return`You are the hands-free tutor inside a UKMLA single-best-answer revision app.

NON-NEGOTIABLE BEFORE SUBMISSION:
- Never state, imply or strongly signal the correct answer.
- Never say that an option is right, wrong, promising, unlikely, closer or better.
- Never eliminate an option for the learner.
- If asked for the answer, decline briefly and ask one neutral Socratic question about the learner's reasoning.
- Keep spoken replies brief: normally one or two sentences.
- Treat tentative language such as "I think B" as propose_answer, never confirm_answer.
- Only use confirm_answer when the learner clearly says confirm, submit, final answer or lock it in.

AFTER SUBMISSION:
- You may explain the feedback already displayed by the app, but do not add unsupported clinical claims.

Choose one action. Use none for ordinary tutor dialogue. For propose_answer, optionId must be A-E. Otherwise optionId must be null.

Purpose: ${purpose}
Learner said: ${JSON.stringify(clean(transcript))}
Current app context: ${JSON.stringify(context)}`;
  }

  async function askAgent(transcript,purpose='interpret'){
    if(!state.aiEnabled||!validTemporaryApiKey()||!transport()?.send)return null;
    state.agentBusy=true;
    stopRecognition();
    setStatus('Tutor thinking…','thinking');
    try{
      const data=await transport().send(state.apiKey,{
        model:AGENT_MODEL,
        input:[
          {role:'system',content:[{type:'input_text',text:'Follow the tutoring safety rules exactly. Return only the requested JSON object.'}]},
          {role:'user',content:[{type:'input_text',text:agentPrompt(transcript,purpose)}]}
        ],
        text:{format:{type:'json_schema',name:'ukmla_handsfree_tutor_turn_v1',strict:true,schema:agentSchema()}}
      });
      const raw=outputText(data);
      if(!raw)throw new Error('No tutor response was returned.');
      return JSON.parse(raw);
    }catch(error){
      const message=clean(error?.message||error);
      if(/api key|authentication|unauthor/i.test(message))clearTemporaryApiKey();
      setStatus(`Tutor unavailable: ${message}`,'error');
      return null;
    }finally{
      state.agentBusy=false;
    }
  }

  async function proposeAnswer(letter,{agentSpeech='',skipAgent=false}={}){
    const question=currentQuestion();
    const normalized=clean(letter).toUpperCase();
    if(!question){speak('Open a question first.');return false;}
    if(question.answered){speak('That answer has already been submitted. Say next when ready.');return false;}
    const option=question.options.find(item=>item.id===normalized);
    if(!option){speak(`Option ${normalized} is not available.`);return false;}
    clearProposed();
    option.button.classList.add('voice-proposed');
    option.button.scrollIntoView({block:'nearest',behavior:'smooth'});
    state.pendingOption=normalized;
    setStatus(`${normalized} awaiting confirmation`,'pending');
    document.dispatchEvent(new CustomEvent('ukmlaHandsFreeAction',{detail:{action:'propose_answer',optionId:normalized}}));

    let spoken=clean(agentSpeech);
    if(!spoken&&state.aiEnabled&&!skipAgent){
      const response=await askAgent(`I am considering option ${normalized}.`, 'neutral_socratic_follow_up');
      spoken=clean(response?.speech);
    }
    speak(spoken||`${normalized} selected. Are you sure? Say confirm to submit, or choose another letter.`);
    return true;
  }

  function readFeedback(attempt=0){
    const question=currentQuestion();
    if(!question?.feedback){
      if(attempt<20)setTimeout(()=>readFeedback(attempt+1),120);
      else speak('The answer was submitted, but I could not read the feedback.');
      return;
    }
    clearProposed();
    state.lastQuestionKey=question.key;
    document.dispatchEvent(new CustomEvent('ukmlaHandsFreeAction',{detail:{action:'answer_submitted'}}));
    speak(`${question.feedback}. Say next when ready, or say repeat feedback.`);
  }

  function confirmAnswer(){
    const question=currentQuestion();
    if(!question){speak('Open a question first.');return false;}
    if(question.answered){speak('That answer has already been submitted. Say next when ready.');return false;}
    if(!state.pendingOption){speak('Choose A, B, C, D or E first.');return false;}
    const option=question.options.find(item=>item.id===state.pendingOption);
    if(!option){clearProposed();speak('That option is no longer available. Please choose again.');return false;}
    stopRecognition();
    option.button.click();
    setStatus('Answer submitted','idle');
    setTimeout(readFeedback,90);
    return true;
  }

  function cancelProposal(){
    if(!state.pendingOption){speak('No answer is awaiting confirmation.');return false;}
    clearProposed();
    setStatus('Listening…','listening');
    speak('Selection cleared. Choose another letter.');
    return true;
  }

  function nextQuestion(){
    const question=currentQuestion();
    if(!question){speak('Open a question first.');return false;}
    if(!question.answered){speak('Submit an answer before moving on.');return false;}
    const button=question.nextButton;
    if(!button||button.disabled){speak('There is no next question available.');return false;}
    clearProposed();
    stopRecognition();
    button.click();
    setTimeout(()=>{
      if(!currentQuestion()){setStatus('Question set complete','idle');speak('Question set complete.');}
    },420);
    return true;
  }

  function previousQuestion(){
    const question=currentQuestion();
    const button=question?.previousButton;
    if(!button||button.disabled){speak('There is no previous question available.');return false;}
    clearProposed();
    stopRecognition();
    button.click();
    setTimeout(readQuestion,160);
    return true;
  }

  function repeatFeedback(){
    const question=currentQuestion();
    if(!question?.feedback){speak('There is no feedback yet.');return false;}
    speak(question.feedback);
    return true;
  }

  function parseOption(transcript){
    const words=clean(transcript).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const exact={a:'A',ay:'A',b:'B',be:'B',bee:'B',c:'C',see:'C',sea:'C',d:'D',dee:'D',e:'E',ee:'E'};
    if(exact[words])return exact[words];
    const direct=words.match(/\b(?:option|answer|choose|pick|select|try|want|think|say|with)\s+(?:it\s+is\s+)?([abcde])\b/);
    if(direct)return direct[1].toUpperCase();
    const tentative=words.match(/\b(?:think|want|try|choose|pick|select|go with|leaning towards?)\b.*\b([abcde])$/);
    return tentative?tentative[1].toUpperCase():'';
  }

  async function applyAgentResponse(response){
    if(!response)return false;
    const speech=clean(response.speech);
    switch(response.action){
      case'propose_answer':return proposeAnswer(response.optionId,{agentSpeech:speech,skipAgent:true});
      case'confirm_answer':return confirmAnswer();
      case'cancel_answer':return cancelProposal();
      case'read_question':return readQuestion();
      case'repeat_feedback':return repeatFeedback();
      case'next_question':return nextQuestion();
      case'previous_question':return previousQuestion();
      default:speak(speech||'Tell me your reasoning, or choose A, B, C, D or E.');return true;
    }
  }

  async function handleTranscript(raw){
    const transcript=clean(raw).toLowerCase();
    if(!transcript){scheduleRecognition();return;}
    setStatus(`Heard: “${transcript}”`,'heard');

    if(/\b(stop hands free|turn hands free off|stop listening|end session)\b/.test(transcript)){stop();return;}
    if(/\b(repeat feedback|read feedback|explain again)\b/.test(transcript)){repeatFeedback();return;}
    if(/\b(repeat question|read question|say that again|repeat options|read the options)\b/.test(transcript)){readQuestion();return;}
    if(/\b(previous|go back|previous question)\b/.test(transcript)){previousQuestion();return;}
    if(/\b(next|continue|next question|move on)\b/.test(transcript)){nextQuestion();return;}
    if(/\b(confirm|yes|yeah|yep|lock it in|final answer|submit|go with that|i am sure)\b/.test(transcript)){confirmAnswer();return;}
    if(/\b(no|cancel|clear that|change my answer|not sure)\b/.test(transcript)){cancelProposal();return;}
    if(/\b(help|what can i say)\b/.test(transcript)){
      speak('Say A, B, C, D or E to propose an answer. Say confirm to submit. You can also say repeat question, repeat feedback, next, previous, or stop hands free.');
      return;
    }

    const letter=parseOption(transcript);
    if(letter){await proposeAnswer(letter);return;}

    if(state.aiEnabled&&validTemporaryApiKey()){
      const response=await askAgent(transcript,'interpret_and_tutor');
      if(response){await applyAgentResponse(response);return;}
    }
    speak('I did not catch a command. Say a letter, repeat question, or help.');
  }

  function createRecognition(){
    if(!SpeechRecognition)return null;
    const recognition=new SpeechRecognition();
    recognition.lang='en-GB';
    recognition.interimResults=false;
    recognition.continuous=false;
    recognition.maxAlternatives=3;
    recognition.onresult=event=>{
      const alternatives=[];
      for(let i=event.resultIndex;i<event.results.length;i++){
        for(let j=0;j<event.results[i].length;j++)alternatives.push(event.results[i][j].transcript);
      }
      const preferred=alternatives.find(text=>parseOption(text))||alternatives[0]||'';
      handleTranscript(preferred);
    };
    recognition.onerror=event=>{
      if(!state.enabled)return;
      if(event.error==='not-allowed'||event.error==='service-not-allowed'){
        setStatus('Microphone permission denied','error');
        state.enabled=false;
        updateVisibility();
        return;
      }
      if(event.error!=='aborted'&&event.error!=='no-speech')setStatus(`Microphone: ${event.error}`,'error');
      scheduleRecognition(450);
    };
    recognition.onend=()=>{
      if(state.enabled&&!state.speaking&&!state.agentBusy)scheduleRecognition(260);
    };
    return recognition;
  }

  async function requestWakeLock(){
    if(!('wakeLock'in navigator)||document.hidden||!state.enabled)return;
    try{state.wakeLock=await navigator.wakeLock.request('screen');}catch(_){/* optional */}
  }

  function releaseWakeLock(){
    state.wakeLock?.release?.().catch(()=>{});
    state.wakeLock=null;
  }

  function beginSession({useAi=false}={}){
    if(state.enabled)return;
    if(!isQuestionsRoute()){location.hash='#/quiz';setTimeout(()=>beginSession({useAi}),350);return;}
    if(!SpeechRecognition){setStatus('Voice recognition is unavailable in this browser','error');return;}
    if(useAi&&!validTemporaryApiKey()){setPanel(true);setStatus('Paste a temporary API key','pending');return;}
    state.enabled=true;
    state.aiEnabled=Boolean(useAi&&validTemporaryApiKey());
    state.recognition=state.recognition||createRecognition();
    setPanel(false);
    updateVisibility();
    requestWakeLock();
    const question=currentQuestion();
    const intro=state.aiEnabled
      ?'Voice tutor on. The temporary key is held only in this page session and will be cleared when you stop. I will not reveal an answer before you submit it. '
      :'Hands-free voice control on. ';
    if(question){speak(intro+questionSpeech(question));state.lastQuestionKey=question.key;}
    else speak(intro+'Open or build a question set, then I will read each question aloud.');
  }

  function startWithTemporaryKey(){
    const token=clean(keyInput?.value);
    if(token.length<20){setStatus('Paste the temporary API key','error');return;}
    setTemporaryApiKey(token);
    keyInput.value='';
    beginSession({useAi:true});
  }

  function stop(){
    state.enabled=false;
    clearProposed();
    stopRecognition();
    if('speechSynthesis'in window)speechSynthesis.cancel();
    state.speaking=false;
    state.agentBusy=false;
    releaseWakeLock();
    clearTemporaryApiKey();
    setStatus('Hands-free off','idle');
    updateVisibility();
  }

  function updateVisibility(){
    if(!toggleButton)return;
    const show=isQuestionsRoute();
    toggleButton.hidden=!show;
    statusNode.hidden=!show||(!state.enabled&&!state.panelOpen);
    if(!show)setPanel(false);
  }

  function observeQuestions(){
    state.observer=new MutationObserver(()=>{
      updateVisibility();
      if(!state.enabled||state.speaking||state.agentBusy)return;
      const question=currentQuestion();
      if(!question)return;
      if(question.key!==state.lastQuestionKey){
        state.lastQuestionKey=question.key;
        clearProposed();
        setTimeout(readQuestion,180);
      }
    });
    state.observer.observe(document.getElementById('app'),{childList:true,subtree:true});
  }

  function captureGeneratorKey(event){
    const trigger=event.target?.closest?.('#ai-start,#ai-resume');
    if(!trigger)return;
    const token=clean(document.getElementById('ai-key')?.value);
    if(token.length>=20)setTemporaryApiKey(token);
  }

  function mount(){
    const wrap=document.createElement('div');
    wrap.className='handsfree-controls';
    wrap.innerHTML=`
      <section class="handsfree-setup" id="handsfree-setup" hidden>
        <div class="handsfree-setup-head"><strong>Voice tutor</strong><button type="button" id="handsfree-close" aria-label="Close">×</button></div>
        <label for="handsfree-key">Temporary OpenAI API key</label>
        <input id="handsfree-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="Paste temporary API key">
        <div class="handsfree-session-note"><strong>Session only</strong><span>The same key used for question generation can be reused automatically in this page session. It is never saved to local storage or sync, and is cleared when the voice session stops, the page closes, or after 30 minutes.</span></div>
        <button class="btn primary" id="handsfree-agent-start" type="button">Start AI voice tutor</button>
        <button class="btn ghost" id="handsfree-simple-start" type="button">Start simple voice controls</button>
      </section>
      <div class="handsfree-status" id="handsfree-status" role="status" aria-live="polite" hidden>Hands-free off</div>
      <button class="handsfree-toggle" id="handsfree-toggle" type="button" aria-pressed="false"><span class="handsfree-mic" aria-hidden="true">◉</span><span class="handsfree-label">Hands-free</span></button>`;
    document.body.appendChild(wrap);
    toggleButton=wrap.querySelector('#handsfree-toggle');
    statusNode=wrap.querySelector('#handsfree-status');
    setupPanel=wrap.querySelector('#handsfree-setup');
    keyInput=wrap.querySelector('#handsfree-key');

    toggleButton.addEventListener('click',()=>{
      if(state.enabled){stop();return;}
      if(validTemporaryApiKey()){beginSession({useAi:true});return;}
      setPanel(!state.panelOpen);
      setStatus(state.panelOpen?'Choose voice mode':'Hands-free off',state.panelOpen?'pending':'idle');
      updateVisibility();
    });
    wrap.querySelector('#handsfree-close').addEventListener('click',()=>{setPanel(false);setStatus('Hands-free off','idle');updateVisibility();});
    wrap.querySelector('#handsfree-agent-start').addEventListener('click',startWithTemporaryKey);
    wrap.querySelector('#handsfree-simple-start').addEventListener('click',()=>beginSession({useAi:false}));
    keyInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();startWithTemporaryKey();}});

    document.addEventListener('click',captureGeneratorKey,true);
    window.addEventListener('hashchange',updateVisibility);
    window.addEventListener('pagehide',clearTemporaryApiKey);
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){stopRecognition();releaseWakeLock();}
      else if(state.enabled){requestWakeLock();scheduleRecognition(300);}
    });
    observeQuestions();
    updateVisibility();
  }

  window.UKMLA_HANDSFREE={
    beginSession,
    start:()=>beginSession({useAi:validTemporaryApiKey()}),
    stop,
    readQuestion,
    proposeAnswer,
    confirmAnswer,
    cancelProposal,
    nextQuestion,
    previousQuestion,
    repeatFeedback,
    speak,
    setTemporaryApiKey,
    clearTemporaryApiKey,
    getQuestionContext:()=>{
      const question=currentQuestion();
      if(!question)return null;
      return{
        meta:question.meta,
        stem:question.stem,
        leadIn:question.leadIn,
        options:question.options.map(({id,text})=>({id,text})),
        answered:question.answered,
        feedback:question.answered?question.feedback:'',
        proposedOption:state.pendingOption||null
      };
    }
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
