(function(){
  'use strict';

  const URL_KEY='ukmlaIaisWorkerUrlV1';
  const TOKEN_KEY='ukmlaIaisTokenV1';
  const SET_PREFIX='ukmlaQuestionBankSetV1:';
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const state={active:false,busy:false,speaking:false,recognition:null,restartTimer:null,question:null,answerKey:null,conversationId:'',panel:null};

  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function visible(node){return Boolean(node&&node.isConnected&&node.getClientRects().length);}
  function optionLetter(button){return clean(button?.querySelector('.letter')?.textContent||button?.dataset.aiOption||button?.dataset.option||'').toUpperCase();}
  function optionText(button){
    if(!button)return'';
    const spans=[...button.querySelectorAll('span')];
    return clean(spans.length>1?spans.slice(1).map(node=>node.textContent).join(' '):button.textContent.replace(optionLetter(button),''));
  }
  function button(){return document.getElementById('handsfree-toggle');}
  function status(){return document.getElementById('handsfree-status');}
  function workerUrl(){return clean(localStorage.getItem(URL_KEY)).replace(/\/+$/,'');}
  function token(){return clean(sessionStorage.getItem(TOKEN_KEY));}
  function configured(){return Boolean(workerUrl()&&token());}
  function toast(message){window.UKMLA_V2?.toast?.(message);}

  function currentQuestion(){
    const card=[...document.querySelectorAll('#app .quiz-card')].find(node=>visible(node)&&node.querySelector('.quiz-stem')&&node.querySelector('.options .option'));
    if(!card)return null;
    const options=[...card.querySelectorAll('.options .option')].filter(visible).map(item=>({id:optionLetter(item),text:optionText(item),button:item})).filter(item=>/^[A-E]$/.test(item.id));
    const stem=clean(card.querySelector('.quiz-stem')?.textContent);
    const leadIn=clean(card.querySelector('.quiz-stem + p')?.textContent);
    const meta=clean(card.querySelector('.topic-meta')?.textContent);
    const key=[stem,leadIn,options.map(item=>`${item.id}:${item.text}`).join('|')].join('::');
    return{card,stem,leadIn,meta,options,key,answered:options.some(item=>item.button.disabled)};
  }

  function sameQuestion(stored,dom){
    if(!stored||!dom||clean(stored.stem)!==dom.stem||clean(stored.leadIn)!==dom.leadIn)return false;
    const options=Array.isArray(stored.options)?stored.options:[];
    if(options.length!==dom.options.length)return false;
    return options.every(option=>dom.options.some(item=>item.id===clean(option.id).toUpperCase()&&item.text===clean(option.text)));
  }

  async function resolveAnswerKey(dom){
    const storage=window.UKMLA_LARGE_STORAGE;
    if(!storage?.entries)return null;
    const rows=await storage.entries(SET_PREFIX);
    for(const[,payload]of rows){
      let set=null;
      try{set=JSON.parse(payload);}catch(_){continue;}
      for(const question of set?.questions||[]){
        if(sameQuestion(question,dom)&&/^[A-E]$/.test(clean(question.correctOptionId).toUpperCase()))return question;
      }
    }
    return null;
  }

  function syncButton(){
    const node=button();
    if(!node)return;
    const label=node.querySelector('.handsfree-label');
    if(label)label.textContent='I.A.I.S';
    node.setAttribute('aria-label','I.A.I.S Socratic tutor');
    node.setAttribute('aria-pressed',state.active?'true':'false');
    node.classList.toggle('active',state.active);
    const oldSetup=document.getElementById('handsfree-setup');
    if(oldSetup)oldSetup.hidden=true;
  }

  function setStatus(message,mode='idle'){
    const node=status();
    if(node){node.hidden=!message;node.textContent=message||'';node.dataset.mode=mode;}
    syncButton();
  }

  function ensurePanel(){
    if(state.panel?.isConnected)return state.panel;
    const wrap=document.querySelector('.handsfree-controls');
    if(!wrap)return null;
    const panel=document.createElement('section');
    panel.className='handsfree-setup';
    panel.id='iais-setup';
    panel.hidden=true;
    panel.innerHTML=`<div class="handsfree-setup-head"><strong>I.A.I.S connection</strong><button type="button" id="iais-close" aria-label="Close">×</button></div><label for="iais-worker-url">Jarvis 2 Worker address</label><input id="iais-worker-url" type="url" inputmode="url" autocomplete="url" placeholder="https://…workers.dev"><label for="iais-token">Jarvis password</label><input id="iais-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="handsfree-session-note"><strong>IAIS / Luna</strong><span>The Worker address can be remembered on this device. The password is kept only for this browser session and is never written into the UKMLA question data.</span></div><button class="btn primary" id="iais-connect" type="button">Connect I.A.I.S</button>`;
    wrap.insertBefore(panel,status()||button());
    panel.querySelector('#iais-worker-url').value=workerUrl();
    panel.querySelector('#iais-close').onclick=()=>{panel.hidden=true;};
    panel.querySelector('#iais-connect').onclick=()=>{
      const url=clean(panel.querySelector('#iais-worker-url').value).replace(/\/+$/,'');
      const secret=clean(panel.querySelector('#iais-token').value);
      if(!/^https:\/\//i.test(url)){toast('Enter the Jarvis 2 HTTPS Worker address.');return;}
      if(secret.length<8){toast('Enter the Jarvis app password.');return;}
      localStorage.setItem(URL_KEY,url);
      sessionStorage.setItem(TOKEN_KEY,secret);
      panel.querySelector('#iais-token').value='';
      panel.hidden=true;
      void start();
    };
    state.panel=panel;
    return panel;
  }

  function openPanel(){
    const panel=ensurePanel();
    if(!panel)return;
    panel.querySelector('#iais-worker-url').value=workerUrl();
    panel.hidden=false;
    (workerUrl()?panel.querySelector('#iais-token'):panel.querySelector('#iais-worker-url'))?.focus();
  }

  function stopRecognition(){
    clearTimeout(state.restartTimer);state.restartTimer=null;
    try{state.recognition?.abort();}catch(_){/* stopped */}
  }
  function scheduleRecognition(delay=220){
    clearTimeout(state.restartTimer);
    if(!state.active||state.busy||state.speaking||document.hidden||!state.recognition)return;
    state.restartTimer=setTimeout(()=>{
      if(!state.active||state.busy||state.speaking||document.hidden)return;
      try{state.recognition.start();setStatus('IAIS listening…','listening');}catch(_){/* already active */}
    },delay);
  }
  function speak(text){
    const value=clean(text);
    if(!value){scheduleRecognition();return;}
    stopRecognition();
    if(!('speechSynthesis'in window)){setStatus('IAIS ready','idle');scheduleRecognition();return;}
    speechSynthesis.cancel();
    state.speaking=true;
    setStatus('IAIS speaking…','speaking');
    const utterance=new SpeechSynthesisUtterance(value);
    utterance.lang='en-GB';
    utterance.rate=.95;
    utterance.onend=()=>{state.speaking=false;scheduleRecognition(260);};
    utterance.onerror=()=>{state.speaking=false;scheduleRecognition(260);};
    speechSynthesis.speak(utterance);
  }

  function ensureRecognition(){
    if(state.recognition||!SpeechRecognition)return Boolean(state.recognition);
    const recognition=new SpeechRecognition();
    recognition.lang='en-GB';
    recognition.continuous=false;
    recognition.interimResults=false;
    recognition.maxAlternatives=1;
    recognition.onresult=event=>{
      const transcript=clean(event.results?.[event.results.length-1]?.[0]?.transcript);
      if(transcript)void turn(transcript,'learner_turn');
    };
    recognition.onerror=event=>{
      if(!state.active)return;
      if(event.error==='not-allowed'||event.error==='service-not-allowed'){setStatus('Microphone permission is required for IAIS','error');return;}
      scheduleRecognition(500);
    };
    recognition.onend=()=>{if(state.active&&!state.busy&&!state.speaking)scheduleRecognition(300);};
    state.recognition=recognition;
    return true;
  }

  function machineEnvelope(raw){
    const text=clean(raw);
    if(!text)return{reply:'',action:{type:'none',optionId:null}};
    const candidate=text.startsWith('```')?text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''):text;
    try{
      const parsed=JSON.parse(candidate);
      const action=parsed?.action||{};
      return{
        reply:clean(parsed?.reply),
        action:{type:action.type==='select_answer'?'select_answer':'none',optionId:/^[A-E]$/.test(clean(action.optionId).toUpperCase())?clean(action.optionId).toUpperCase():null}
      };
    }catch(_){return{reply:text,action:{type:'none',optionId:null}};}
  }

  function tutorContext(utterance,event){
    const q=state.answerKey;
    return{
      kind:'ukmla_socratic_tutor_turn',
      roleContext:{
        identity:'You are IAIS, acting as the learner’s Socratic tutor inside a live UKMLA single-best-answer question.',
        situation:'You can see the exact question, all answer options, the hidden correct answer and its rationale. The learner cannot see the hidden answer key.',
        goal:'Help the learner reason their own way to an answer. Use judgement about what to ask, challenge, clarify or explain based on what the learner says.',
        answerBoundary:'Do not volunteer, strongly signal or prematurely reveal the correct option. If the learner explicitly asks to be told, you may decide how to respond appropriately. Do not pretend an incorrect commitment is correct.',
        controlBoundary:'Only request select_answer when the learner has clearly settled on an option or explicitly asks you to select/click it. Mere consideration, uncertainty or leaning is not a commitment.',
        voice:'Choose your own natural wording. There is no prescribed script or stock sequence of questions.'
      },
      interfaceContract:{
        response:'Return one JSON object only.',
        shape:{reply:'Your natural spoken response',action:{type:'none or select_answer',optionId:'null or A-E'}},
        note:'reply is entirely your wording; action is only a machine instruction for the webpage.'
      },
      question:{
        meta:state.question.meta,
        stem:q.stem,
        leadIn:q.leadIn,
        options:(q.options||[]).map(option=>({id:option.id,text:option.text})),
        correctOptionId:q.correctOptionId,
        rationale:q.rationale||'',
        strongestDistractorExplanation:q.strongestDistractorExplanation||'',
        targetCondition:q.targetCondition||'',
        topicName:q.topicName||'',
        questionType:q.questionType||''
      },
      event,
      learnerUtterance:utterance||null
    };
  }

  async function callIais(utterance,event){
    const response=await fetch(`${workerUrl()}/v1/chat`,{
      method:'POST',
      headers:{'Authorization':`Bearer ${token()}`,'Content-Type':'application/json','X-Jarvis-Client':'ukmla-web'},
      body:JSON.stringify({conversationId:state.conversationId,title:'UKMLA Socratic tutor',message:JSON.stringify(tutorContext(utterance,event))})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error||`Jarvis 2 returned ${response.status}`);
    return machineEnvelope(data.reply||data.text||'');
  }

  function executeAction(action){
    if(action?.type!=='select_answer'||!/^[A-E]$/.test(action.optionId||''))return false;
    const now=currentQuestion();
    if(!now||now.key!==state.question?.key||now.answered)return false;
    const target=now.options.find(option=>option.id===action.optionId);
    if(!target||target.button.disabled)return false;
    target.button.click();
    return true;
  }

  async function turn(utterance,event){
    if(!state.active||state.busy)return;
    const now=currentQuestion();
    if(!now||now.key!==state.question?.key){stop('Question changed');return;}
    state.busy=true;stopRecognition();setStatus('IAIS thinking…','thinking');
    try{
      const result=await callIais(utterance,event);
      const clicked=executeAction(result.action);
      if(clicked)setStatus('IAIS selected your answer','idle');
      speak(result.reply);
    }catch(error){
      const message=clean(error?.message||error);
      if(/unauthor/i.test(message))sessionStorage.removeItem(TOKEN_KEY);
      setStatus(`IAIS unavailable: ${message}`,'error');
      state.active=false;syncButton();
    }finally{state.busy=false;}
  }

  async function start(){
    if(state.active)return;
    if(!configured()){openPanel();return;}
    const question=currentQuestion();
    if(!question){toast('Open a UKMLA question first.');return;}
    if(question.answered){toast('Open an unanswered question for Socratic tutoring.');return;}
    setStatus('Finding the hidden answer key…','thinking');
    let answerKey=null;
    try{answerKey=await resolveAnswerKey(question);}catch(_){answerKey=null;}
    if(!answerKey){setStatus('IAIS could not resolve this question’s answer key','error');toast('This question is not yet available to answer-aware IAIS tutoring.');return;}
    if(!ensureRecognition()){setStatus('Speech recognition is unavailable in this browser','error');return;}
    window.UKMLA_HANDSFREE?.stop?.();
    state.question=question;
    state.answerKey=answerKey;
    state.conversationId=`ukmla-tutor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    state.active=true;
    syncButton();
    await turn('', 'session_start');
  }

  function stop(message='IAIS off'){
    state.active=false;state.busy=false;state.speaking=false;
    stopRecognition();
    try{speechSynthesis.cancel();}catch(_){/* unavailable */}
    state.question=null;state.answerKey=null;state.conversationId='';
    setStatus(message,'idle');
  }

  function interceptToggle(event){
    const target=event.target?.closest?.('#handsfree-toggle');
    if(!target)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(state.active)stop();else void start();
  }

  function init(){
    document.addEventListener('click',interceptToggle,true);
    const observer=new MutationObserver(()=>syncButton());
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopRecognition();else scheduleRecognition();});
    window.addEventListener('hashchange',()=>{if(state.active)stop('IAIS off');});
    ensurePanel();syncButton();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.UKMLA_IAIS_TUTOR={start,stop,currentQuestion,resolveAnswerKey};
})();
