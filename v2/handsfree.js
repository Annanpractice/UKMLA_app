(function(){
  'use strict';

  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const state={
    enabled:false,
    recognition:null,
    speaking:false,
    pendingOption:'',
    lastQuestionKey:'',
    restartTimer:null,
    wakeLock:null,
    observer:null,
    manuallyStopped:false
  };

  let toggleButton=null;
  let statusNode=null;

  function isQuestionsRoute(){return location.hash.startsWith('#/quiz');}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function visible(node){return Boolean(node&&node.isConnected&&node.getClientRects().length);}
  function optionLetter(button){return clean(button?.querySelector('.letter')?.textContent||button?.dataset.aiOption||button?.dataset.option||'').toUpperCase();}
  function optionText(button){
    if(!button)return'';
    const spans=[...button.querySelectorAll('span')];
    return clean(spans.length>1?spans.slice(1).map(node=>node.textContent).join(' '):button.textContent.replace(optionLetter(button),''));
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
      toggleButton.querySelector('.handsfree-label').textContent=state.enabled?'Hands-free on':'Hands-free';
    }
  }

  function clearProposed(){
    document.querySelectorAll('.option.voice-proposed').forEach(button=>button.classList.remove('voice-proposed'));
    state.pendingOption='';
  }

  function stopRecognition(){
    clearTimeout(state.restartTimer);
    state.restartTimer=null;
    if(!state.recognition)return;
    try{state.recognition.abort();}catch(_){/* already stopped */}
  }

  function scheduleRecognition(delay=180){
    clearTimeout(state.restartTimer);
    if(!state.enabled||state.speaking||document.hidden||!SpeechRecognition)return;
    state.restartTimer=setTimeout(()=>{
      if(!state.enabled||state.speaking||document.hidden)return;
      try{state.recognition.start();setStatus('Listening…','listening');}catch(_){/* Chrome rejects duplicate starts */}
    },delay);
  }

  function speak(text,{after=null}={}){
    const spoken=clean(text);
    if(!spoken)return;
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

  function proposeAnswer(letter){
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
    speak(`${normalized} selected. Are you sure? Say confirm to submit, or choose another letter.`);
    return true;
  }

  function readFeedback(attempt=0){
    const question=currentQuestion();
    if(!question?.feedback){
      if(attempt<20)setTimeout(()=>readFeedback(attempt+1),120);
      else{speak('The answer was submitted, but I could not read the feedback.');}
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
    const text=` ${clean(transcript).toLowerCase().replace(/[^a-z0-9]+/g,' ')} `;
    const patterns={
      A:[/\boption a\b/,/\banswer a\b/,/\bchoose a\b/,/\bgo with a\b/,/^ a $/,/^ ay $/],
      B:[/\boption b\b/,/\banswer b\b/,/\bchoose b\b/,/\bgo with b\b/,/^ b $/,/^ be $/,/^ bee $/],
      C:[/\boption c\b/,/\banswer c\b/,/\bchoose c\b/,/\bgo with c\b/,/^ c $/,/^ see $/,/^ sea $/],
      D:[/\boption d\b/,/\banswer d\b/,/\bchoose d\b/,/\bgo with d\b/,/^ d $/,/^ dee $/],
      E:[/\boption e\b/,/\banswer e\b/,/\bchoose e\b/,/\bgo with e\b/,/^ e $/,/^ ee $/]
    };
    for(const [letter,list] of Object.entries(patterns))if(list.some(pattern=>pattern.test(text.trim()?` ${text.trim()} `:text)))return letter;
    const embedded=text.match(/\b(?:think|pick|select|try|want|say)\s+(?:it\s+is\s+)?([abcde])\b/);
    return embedded?embedded[1].toUpperCase():'';
  }

  function handleTranscript(raw){
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
    if(letter){proposeAnswer(letter);return;}
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
      if(state.enabled&&!state.speaking)scheduleRecognition(260);
    };
    return recognition;
  }

  async function requestWakeLock(){
    if(!('wakeLock'in navigator)||document.hidden||!state.enabled)return;
    try{state.wakeLock=await navigator.wakeLock.request('screen');}catch(_){/* optional enhancement */}
  }

  function releaseWakeLock(){
    state.wakeLock?.release?.().catch(()=>{});
    state.wakeLock=null;
  }

  function start(){
    if(state.enabled)return;
    if(!isQuestionsRoute()){location.hash='#/quiz';setTimeout(start,350);return;}
    if(!SpeechRecognition){
      setStatus('Voice recognition is unavailable in this browser','error');
      return;
    }
    state.enabled=true;
    state.manuallyStopped=false;
    state.recognition=state.recognition||createRecognition();
    updateVisibility();
    requestWakeLock();
    const question=currentQuestion();
    if(question){
      speak('Hands-free mode on. I will not reveal an answer before you submit it. '+questionSpeech(question));
      state.lastQuestionKey=question.key;
    }else{
      speak('Hands-free mode on. Open or build a question set, then I will read each question aloud.');
    }
  }

  function stop(){
    state.enabled=false;
    state.manuallyStopped=true;
    clearProposed();
    stopRecognition();
    if('speechSynthesis'in window)speechSynthesis.cancel();
    state.speaking=false;
    releaseWakeLock();
    setStatus('Hands-free off','idle');
    updateVisibility();
  }

  function updateVisibility(){
    if(!toggleButton)return;
    const show=isQuestionsRoute();
    toggleButton.hidden=!show;
    statusNode.hidden=!show||!state.enabled;
  }

  function observeQuestions(){
    state.observer=new MutationObserver(()=>{
      updateVisibility();
      if(!state.enabled||state.speaking)return;
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

  function mount(){
    const wrap=document.createElement('div');
    wrap.className='handsfree-controls';
    wrap.innerHTML=`<div class="handsfree-status" id="handsfree-status" role="status" aria-live="polite" hidden>Hands-free off</div><button class="handsfree-toggle" id="handsfree-toggle" type="button" aria-pressed="false"><span class="handsfree-mic" aria-hidden="true">◉</span><span class="handsfree-label">Hands-free</span></button>`;
    document.body.appendChild(wrap);
    toggleButton=wrap.querySelector('#handsfree-toggle');
    statusNode=wrap.querySelector('#handsfree-status');
    toggleButton.addEventListener('click',()=>state.enabled?stop():start());
    window.addEventListener('hashchange',updateVisibility);
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){stopRecognition();releaseWakeLock();}
      else if(state.enabled){requestWakeLock();scheduleRecognition(300);}
    });
    observeQuestions();
    updateVisibility();
  }

  window.UKMLA_HANDSFREE={
    start,
    stop,
    readQuestion,
    proposeAnswer,
    confirmAnswer,
    cancelProposal,
    nextQuestion,
    previousQuestion,
    repeatFeedback,
    getQuestionContext:()=>{
      const question=currentQuestion();
      if(!question)return null;
      return{
        meta:question.meta,
        stem:question.stem,
        leadIn:question.leadIn,
        options:question.options.map(({id,text})=>({id,text})),
        answered:question.answered,
        feedback:question.answered?question.feedback:''
      };
    }
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
