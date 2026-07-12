(function(){
  'use strict';

  if(window.__UKMLA_RESUMABLE_AI_JOB__) return;
  window.__UKMLA_RESUMABLE_AI_JOB__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const KEY='ukmlaAiGenerationJobV1';
  const SETS_KEY='ukmlaAiGeneratedQuizSetsV1';
  const PROGRESS_KEY='ukmlaQuizProgressV1';
  const PARAMS=['Ix','Tx','Escalate','Mimics','Red flags'];
  const TYPE_PARAM={
    sparse_most_likely_diagnosis:'Mimics',
    close_mimic_discrimination:'Mimics',
    first_line_investigation:'Ix',
    dangerous_diagnosis_priority_exclusion:'Red flags',
    next_step_after_initial_result:'Ix',
    immediate_emergency_management:'Escalate',
    stable_first_line_treatment:'Tx',
    contraindication_caveat_switch:'Tx',
    failure_or_deterioration:'Escalate',
    escalation_referral_disposition:'Escalate'
  };
  const STAGES={
    ukmla_ai_quiz:{id:'generation',label:'Generating ten questions',start:10,end:30,step:0},
    ukmla_hard_sparse_checkpoint:{id:'sparse',label:'Very-difficult sparse-stem review',start:30,end:45,step:1},
    ukmla_option_normalisation:{id:'options',label:'Option normalisation',start:45,end:57,step:2},
    ukmla_clinical_category_checkpoint:{id:'category',label:'Semantic answer-category review',start:57,end:70,step:3},
    ukmla_distractor_validity_checkpoint:{id:'distractors',label:'Distractor-validity review',start:70,end:88,step:4}
  };
  const STEPS=[
    ['generation','Generate'],['sparse','Sparse'],['options','Options'],['category','Category'],
    ['distractors','Distractors'],['shuffle','A–E'],['render','Render']
  ];

  let sessionJobId=null;
  let resumeRunning=false;

  function loadJson(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}
    catch(_){return fallback;}
  }

  function saveJob(job){
    if(!job) return;
    job.updatedAt=new Date().toISOString();
    try{localStorage.setItem(KEY,JSON.stringify(job));}
    catch(error){
      job.cacheDisabled=true;
      job.cacheError='Browser storage is full; completed checkpoints cannot all be retained.';
      try{
        const compact=Object.assign({},job,{records:{}});
        localStorage.setItem(KEY,JSON.stringify(compact));
      }catch(_){/* keep the active in-memory request running */}
    }
    render(job);
  }

  function currentJob(){return loadJson(KEY,null);}

  function clearJob(){
    localStorage.removeItem(KEY);
    sessionJobId=null;
    resumeRunning=false;
    render(null);
  }

  function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}

  function canonicalBody(body){
    const copy=JSON.parse(JSON.stringify(body||{}));
    delete copy.stream;
    return copy;
  }

  function stripArchitecture(body){
    const copy=canonicalBody(body);
    for(const item of copy.input||[]){
      for(const content of item.content||[]){
        if(content.type!=='input_text'||typeof content.text!=='string') continue;
        const markers=['\n\nFULL RANDOM ENCYCLOPEDIA ARCHITECTURE:','\n\nHYBRID 5+5 ARCHITECTURE:'];
        let cut=-1;
        markers.forEach(marker=>{
          const at=content.text.indexOf(marker);
          if(at>=0&&(cut<0||at<cut)) cut=at;
        });
        if(cut>=0) content.text=content.text.slice(0,cut);
      }
    }
    return copy;
  }

  function hash(text){
    let value=2166136261;
    for(let i=0;i<text.length;i++){
      value^=text.charCodeAt(i);
      value=Math.imul(value,16777619);
    }
    return (value>>>0).toString(16).padStart(8,'0');
  }

  function requestKey(format,body){
    return `${format}:${hash(JSON.stringify(canonicalBody(body)))}`;
  }

  function extractJsonObject(text,start){
    let depth=0,inString=false,escaped=false,begun=false;
    for(let index=start;index<text.length;index++){
      const char=text[index];
      if(!begun){
        if(char!=='{') continue;
        begun=true;depth=1;start=index;continue;
      }
      if(inString){
        if(escaped) escaped=false;
        else if(char==='\\') escaped=true;
        else if(char==='"') inString=false;
        continue;
      }
      if(char==='"') inString=true;
      else if(char==='{') depth+=1;
      else if(char==='}'){
        depth-=1;
        if(depth===0) return text.slice(start,index+1);
      }
    }
    return null;
  }

  function payloadFromBody(body){
    for(const item of body.input||[]){
      if(item.role!=='user') continue;
      for(const content of item.content||[]){
        if(content.type!=='input_text'||typeof content.text!=='string') continue;
        const marker='Source material:\n';
        const at=content.text.lastIndexOf(marker);
        if(at<0) continue;
        const raw=extractJsonObject(content.text,at+marker.length);
        if(!raw) continue;
        try{return JSON.parse(raw);}catch(_){return null;}
      }
    }
    return null;
  }

  function formatOf(body){return body?.text?.format?.name||'';}

  function newJob(body){
    const payload=payloadFromBody(body)||{};
    const job={
      version:1,
      id:`ai-job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,
      status:'active',
      mode:payload.mode||'topic',
      payload,
      resumeBody:stripArchitecture(body),
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      progress:10,
      currentStage:'generation',
      currentLabel:'Preparing source material',
      completedStages:[],
      records:{},
      retryCount:0,
      lastError:'',
      lastMessage:'Source material prepared. Starting generation.'
    };
    sessionJobId=job.id;
    saveJob(job);
    emit('Source material prepared and resumable progress storage started.');
    return job;
  }

  function ensureJob(format,body){
    let job=currentJob();
    if(format==='ukmla_ai_quiz'){
      if(!job||job.status==='complete'||job.status==='discarded'||job.status==='error') job=newJob(body);
      else if(!sessionJobId&&!resumeRunning) return job;
    }
    return job;
  }

  function updateStage(job,stage,phase,message){
    if(!job||!stage) return;
    job.currentStage=stage.id;
    job.currentLabel=message||stage.label;
    job.status=phase==='paused'?'paused':'active';
    if(phase==='start') job.progress=Math.max(Number(job.progress)||0,stage.start);
    if(phase==='complete'){
      job.progress=Math.max(Number(job.progress)||0,stage.end);
      if(!job.completedStages.includes(stage.id)) job.completedStages.push(stage.id);
    }
    job.lastMessage=job.currentLabel;
    saveJob(job);
  }

  function responseFromRecord(record){
    return new Response(record.body,{
      status:record.status||200,
      statusText:record.statusText||'OK',
      headers:{'Content-Type':record.contentType||'application/json'}
    });
  }

  function errorMessage(raw,status){
    try{
      const parsed=JSON.parse(raw);
      return parsed?.error?.message||`OpenAI request failed (${status}).`;
    }catch(_){return clean(raw)||`OpenAI request failed (${status}).`;}
  }

  function isTransientStatus(status){return status===408||status===409||status===425||status===429||status>=500;}
  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

  function waitForOnline(){
    if(navigator.onLine!==false) return Promise.resolve();
    return new Promise(resolve=>window.addEventListener('online',resolve,{once:true}));
  }

  function emit(message,detail){
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message,detail:detail||null}}));
  }

  async function bufferedRequest(input,init,job,stage,key){
    let attempt=0;
    while(true){
      attempt+=1;
      updateStage(job,stage,'start',attempt>1?`${stage.label} — reconnecting attempt ${attempt}`:stage.label);
      try{
        const response=await previousFetch(input,init);
        const contentType=response.headers.get('content-type')||'application/json';
        const raw=await response.text();
        if(!response.ok){
          if(isTransientStatus(response.status)) throw Object.assign(new Error(errorMessage(raw,response.status)),{transient:true,status:response.status});
          job.status='error';
          job.lastError=errorMessage(raw,response.status);
          job.lastMessage=`${stage.label} stopped: ${job.lastError}`;
          saveJob(job);
          throw new Error(job.lastError);
        }
        const record={format:formatOf(JSON.parse(init.body||'{}')),stage:stage.id,status:response.status,statusText:response.statusText,contentType,body:raw,completedAt:new Date().toISOString()};
        job.records[key]=record;
        job.retryCount=0;
        job.lastError='';
        updateStage(job,stage,'complete',`${stage.label} completed`);
        return responseFromRecord(record);
      }catch(error){
        if(job.status==='error') throw error;
        const networkLike=error?.transient||error instanceof TypeError||/network|fetch|connection|offline|load failed|failed to fetch/i.test(String(error?.message||error));
        if(!networkLike) throw error;
        job.status='paused';
        job.retryCount=(job.retryCount||0)+1;
        job.lastError=String(error?.message||'Network connection interrupted.');
        job.lastMessage=`Connection interrupted during ${stage.label}. Progress saved; waiting to reconnect.`;
        saveJob(job);
        emit(`Connection interrupted during ${stage.label}. Completed checkpoints are saved; reconnection will resume this stage.`,{attempt:job.retryCount});
        await waitForOnline();
        const delay=Math.min(60000,Math.max(2000,Math.pow(2,Math.min(job.retryCount,5))*1000));
        job.status='active';
        job.lastMessage=`Connection restored. Resuming ${stage.label}…`;
        saveJob(job);
        emit(`Connection restored. Resuming ${stage.label} from the saved checkpoint…`);
        await wait(delay);
      }
    }
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(url!==API||!init||String(init.method||'GET').toUpperCase()!=='POST') return previousFetch(input,init);
    let body;
    try{body=JSON.parse(init.body||'{}');}catch(_){return previousFetch(input,init);}
    const format=formatOf(body);
    const stage=STAGES[format];
    if(!stage) return previousFetch(input,init);

    const job=ensureJob(format,body);
    if(!job) return previousFetch(input,init);
    const key=requestKey(format,body);
    const cached=job.records&&job.records[key];
    if(cached){
      updateStage(job,stage,'complete',`${stage.label} restored from saved progress`);
      emit(`${stage.label} restored from saved progress.`);
      return responseFromRecord(cached);
    }

    return bufferedRequest(input,init,job,stage,key);
  };

  function progressClass(job,stepId,index){
    if(!job) return '';
    if(job.completedStages?.includes(stepId)) return 'done';
    if(stepId==='shuffle'&&(job.progress||0)>=96) return 'done';
    if(stepId==='render'&&(job.progress||0)>=100) return 'done';
    const current=STEPS.findIndex(step=>step[0]===job.currentStage);
    if(current===index&&job.status!=='complete') return 'active';
    return '';
  }

  function injectStyle(){
    if(document.getElementById('ukmla-resume-progress-style')) return;
    const style=document.createElement('style');
    style.id='ukmla-resume-progress-style';
    style.textContent=`
      #aiq-generation-progress{position:relative;overflow:hidden;margin:1rem 0 .35rem;padding:1rem 1rem .9rem;border:1px solid rgba(48,190,255,.65);border-radius:16px;background:linear-gradient(145deg,rgba(3,18,39,.98),rgba(4,36,68,.96));box-shadow:0 0 0 1px rgba(20,130,255,.18) inset,0 0 24px rgba(0,151,255,.26),0 14px 32px rgba(0,20,47,.24);color:#dff7ff;font-family:inherit}
      #aiq-generation-progress[hidden]{display:none}
      #aiq-generation-progress:before{content:"";position:absolute;inset:-40%;background:linear-gradient(115deg,transparent 42%,rgba(54,206,255,.08) 49%,rgba(54,206,255,.18) 50%,rgba(54,206,255,.08) 51%,transparent 58%);animation:aiq-grid-scan 4.8s linear infinite;pointer-events:none}
      .aiq-neon-head{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:.7rem}
      .aiq-neon-title{font-size:.82rem;letter-spacing:.12em;text-transform:uppercase;color:#7edcff;text-shadow:0 0 10px rgba(43,190,255,.8)}
      .aiq-neon-stage{margin-top:.2rem;font-weight:800;color:#f3fdff}
      .aiq-neon-percent{font-size:1.7rem;line-height:1;font-weight:900;color:#8be8ff;text-shadow:0 0 8px #00a9ff,0 0 18px rgba(0,169,255,.75)}
      .aiq-neon-track{position:relative;height:15px;border-radius:999px;background:rgba(0,9,24,.82);border:1px solid rgba(93,215,255,.35);box-shadow:0 0 12px rgba(0,147,255,.18) inset;overflow:hidden}
      .aiq-neon-fill{position:relative;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#036dff,#00bfff 55%,#73f1ff);box-shadow:0 0 12px #009dff,0 0 24px rgba(0,189,255,.85);transition:width .75s cubic-bezier(.2,.75,.2,1)}
      .aiq-neon-fill:after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 0 35%,rgba(255,255,255,.82) 48%,transparent 61%);transform:translateX(-130%);animation:aiq-neon-sweep 1.8s linear infinite}
      .aiq-neon-steps{position:relative;display:grid;grid-template-columns:repeat(7,1fr);gap:.28rem;margin-top:.8rem}
      .aiq-neon-step{display:grid;justify-items:center;gap:.28rem;color:#668ba7;font-size:.65rem;text-align:center}
      .aiq-neon-dot{width:9px;height:9px;border-radius:50%;background:#19364f;border:1px solid #47738e}
      .aiq-neon-step.done,.aiq-neon-step.active{color:#bcefff}
      .aiq-neon-step.done .aiq-neon-dot{background:#59eaff;box-shadow:0 0 8px #00c8ff,0 0 15px #008cff}
      .aiq-neon-step.active .aiq-neon-dot{background:#fff;box-shadow:0 0 8px #fff,0 0 18px #00bfff;animation:aiq-neon-pulse 1.15s ease-in-out infinite}
      .aiq-neon-network{position:relative;margin-top:.75rem;color:#9cd7ed;font-size:.86rem}
      .aiq-neon-controls{position:relative;display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.75rem}
      .aiq-neon-controls button{border-color:#279ee8;background:rgba(0,88,154,.24);color:#e8fbff;box-shadow:0 0 12px rgba(0,160,255,.2)}
      #aiq-generation-progress.paused{animation:aiq-panel-pulse 2.2s ease-in-out infinite}
      @keyframes aiq-neon-sweep{to{transform:translateX(130%)}}
      @keyframes aiq-neon-pulse{50%{transform:scale(1.45);opacity:.65}}
      @keyframes aiq-panel-pulse{50%{box-shadow:0 0 0 1px rgba(20,130,255,.25) inset,0 0 34px rgba(0,151,255,.43),0 14px 32px rgba(0,20,47,.24)}}
      @keyframes aiq-grid-scan{to{transform:translateX(35%)}}
      @media(max-width:700px){.aiq-neon-steps{grid-template-columns:repeat(4,1fr);row-gap:.65rem}.aiq-neon-percent{font-size:1.45rem}.aiq-neon-controls button{width:100%}}
      @media(prefers-reduced-motion:reduce){#aiq-generation-progress:before,.aiq-neon-fill:after,.aiq-neon-step.active .aiq-neon-dot,#aiq-generation-progress.paused{animation:none}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi(){
    injectStyle();
    const shell=document.getElementById('ai-generated-quiz');
    if(!shell) return null;
    let panel=document.getElementById('aiq-generation-progress');
    if(panel) return panel;
    panel=document.createElement('div');
    panel.id='aiq-generation-progress';
    panel.hidden=true;
    panel.setAttribute('aria-live','polite');
    panel.innerHTML=`<div class="aiq-neon-head"><div><div class="aiq-neon-title">Generation pipeline</div><div class="aiq-neon-stage" id="aiq-neon-stage">Ready</div></div><div class="aiq-neon-percent" id="aiq-neon-percent">0%</div></div><div class="aiq-neon-track"><div class="aiq-neon-fill" id="aiq-neon-fill"></div></div><div class="aiq-neon-steps" id="aiq-neon-steps">${STEPS.map(step=>`<div class="aiq-neon-step" data-step="${step[0]}"><span class="aiq-neon-dot"></span><span>${step[1]}</span></div>`).join('')}</div><div class="aiq-neon-network" id="aiq-neon-network"></div><div class="aiq-neon-controls" id="aiq-neon-controls"><button type="button" id="aiq-resume-saved">Resume saved generation</button><button type="button" id="aiq-discard-saved">Discard saved progress</button></div>`;
    const actions=shell.querySelector('.aiq-actions');
    if(actions?.parentNode) actions.parentNode.insertBefore(panel,actions.nextSibling); else shell.appendChild(panel);
    panel.querySelector('#aiq-resume-saved').addEventListener('click',resumeSaved);
    panel.querySelector('#aiq-discard-saved').addEventListener('click',()=>{
      if(resumeRunning) return;
      clearJob();
      const status=document.getElementById('aiq-status');
      if(status) status.textContent='Saved generation progress discarded.';
    });
    return panel;
  }

  function render(job){
    const panel=ensureUi();
    if(!panel) return;
    if(!job){panel.hidden=true;return;}
    panel.hidden=false;
    panel.classList.toggle('paused',job.status==='paused');
    const percent=Math.max(0,Math.min(100,Number(job.progress)||0));
    panel.querySelector('#aiq-neon-percent').textContent=`${percent}%`;
    panel.querySelector('#aiq-neon-fill').style.width=`${percent}%`;
    panel.querySelector('#aiq-neon-stage').textContent=job.status==='complete'?'Quiz ready':job.currentLabel||'Generation in progress';
    let network=job.lastMessage||'';
    if(job.status==='paused') network=`Progress saved. ${network}`;
    if(job.cacheError) network+=` ${job.cacheError}`;
    panel.querySelector('#aiq-neon-network').textContent=network;
    panel.querySelectorAll('.aiq-neon-step').forEach((node,index)=>{
      node.className=`aiq-neon-step ${progressClass(job,node.dataset.step,index)}`.trim();
    });
    const controls=panel.querySelector('#aiq-neon-controls');
    const resumable=job.status!=='complete'&&sessionJobId!==job.id;
    controls.hidden=!resumable;
    const resumeButton=panel.querySelector('#aiq-resume-saved');
    resumeButton.hidden=job.status==='error';
    resumeButton.disabled=resumeRunning;
  }

  function markShuffle(message){
    const job=currentJob();
    if(!job||job.status==='complete') return;
    job.progress=Math.max(job.progress||0,96);
    job.currentStage='shuffle';
    job.currentLabel='Balanced A–E answer shuffling';
    if(!job.completedStages.includes('shuffle')) job.completedStages.push('shuffle');
    job.lastMessage=message||'Balanced A–E answer shuffling completed.';
    saveJob(job);
  }

  function finishJob(message){
    const job=currentJob();
    if(!job) return;
    job.status='complete';
    job.progress=100;
    job.currentStage='render';
    job.currentLabel='Final validation and rendering';
    if(!job.completedStages.includes('render')) job.completedStages.push('render');
    job.lastMessage=message||'All routine checkpoints completed. Quiz rendered.';
    job.records={};
    delete job.resumeBody;
    delete job.payload;
    saveJob(job);
    sessionJobId=null;
    resumeRunning=false;
  }

  function observeStatus(){
    const status=document.getElementById('aiq-status');
    if(!status||status.dataset.resumeObserved) return;
    status.dataset.resumeObserved='1';
    const sync=()=>{
      const text=clean(status.textContent);
      if(/Passed local validation|set generated\./i.test(text)) finishJob(text);
      else if(/^Generation failed:/i.test(text)){
        const job=currentJob();
        if(job&&job.status!=='paused'){
          job.status='error';job.lastError=text;job.lastMessage=text;saveJob(job);
        }
      }
    };
    new MutationObserver(sync).observe(status,{childList:true,subtree:true,characterData:true});
    sync();
  }

  function attachGenerationGuards(){
    ['aiq-generate','aiq-random'].forEach(id=>{
      const button=document.getElementById(id);
      if(!button||button.dataset.resumeGuarded) return;
      button.dataset.resumeGuarded='1';
      button.addEventListener('click',event=>{
        const job=currentJob();
        if(job&&job.status!=='complete'&&job.status!=='error'&&sessionJobId!==job.id){
          event.preventDefault();
          event.stopImmediatePropagation();
          render(job);
          const status=document.getElementById('aiq-status');
          if(status) status.textContent='An unfinished generation is saved. Resume it or discard its progress before starting another set.';
        }
      },true);
    });
  }

  function buttonsDisabled(value){
    ['aiq-generate','aiq-random','aiq-resume-saved'].forEach(id=>{
      const button=document.getElementById(id);
      if(button) button.disabled=value;
    });
  }

  function outputText(data){
    if(data&&typeof data.output_text==='string') return data.output_text;
    for(const item of data?.output||[]){
      for(const content of item.content||[]){
        if(content?.type==='output_text'&&typeof content.text==='string') return content.text;
      }
    }
    return '';
  }

  function validateResumedSet(set,payload){
    const errors=[];
    if(!set||!Array.isArray(set.questions)||set.questions.length!==10) errors.push('The response does not contain exactly ten questions.');
    const types=new Set();
    const stems=new Set();
    for(const [index,q] of (set?.questions||[]).entries()){
      if(!q.questionType) errors.push(`Question ${index+1}: missing question type.`); else types.add(q.questionType);
      const stem=clean(q.stem).toLowerCase();
      if(!stem) errors.push(`Question ${index+1}: missing stem.`);
      else if(stems.has(stem)) errors.push(`Question ${index+1}: duplicate stem.`); else stems.add(stem);
      if(!Array.isArray(q.options)||q.options.length!==5) errors.push(`Question ${index+1}: requires five options.`);
      const ids=(q.options||[]).map(option=>option.id).join('');
      if(ids!=='ABCDE') errors.push(`Question ${index+1}: options are not A–E.`);
      if(!(q.options||[]).some(option=>option.id===q.correctOptionId)) errors.push(`Question ${index+1}: invalid answer key.`);
    }
    if(types.size!==10) errors.push('The ten prescribed question types are not all present.');
    if(payload?.mode==='random_all_conditions'){
      const expected=(payload.conditions||[]).map(condition=>clean(condition.name).toLowerCase());
      const actual=(set?.questions||[]).map(question=>clean(question.targetCondition).toLowerCase());
      expected.forEach((name,index)=>{if(name&&actual[index]!==name) errors.push(`Question ${index+1}: saved random target changed or moved.`);});
    }
    return errors;
  }

  function ensureTopic(progress,topic){
    if(!progress[topic]||typeof progress[topic]!=='object') progress[topic]={};
    const item=progress[topic];
    if(!Number.isFinite(Number(item.health))) item.health=50;
    if(!Number.isFinite(Number(item.attempts))) item.attempts=0;
    if(!Number.isFinite(Number(item.correct))) item.correct=0;
    if(!Number.isFinite(Number(item.borrowedHits))) item.borrowedHits=0;
    if(!Number.isFinite(Number(item.sameTopicConfusions))) item.sameTopicConfusions=0;
    if(!item.params) item.params={};
    PARAMS.forEach(param=>{if(!item.params[param]) item.params[param]={health:50,attempts:0,correct:0,borrowedHits:0,sameTopicConfusions:0};});
    if(!progress.__mistakes) progress.__mistakes=[];
    return item;
  }

  function nudge(current,target,weight){return Math.round(Math.max(0,Math.min(100,Number(current)||0))*(1-weight)+target*weight);}

  function scoreResumedQuestion(q,chosen,set){
    const progress=loadJson(PROGRESS_KEY,{});
    const topicName=q.topic||set.topic;
    const param=TYPE_PARAM[q.questionType]||'Escalate';
    const topic=ensureTopic(progress,topicName);
    const aspect=topic.params[param];
    const correct=chosen.id===q.correctOptionId;
    const target=correct?100:0;
    topic.health=nudge(topic.health,target,.18);topic.attempts+=1;if(correct)topic.correct+=1;
    aspect.health=nudge(aspect.health,target,.18);aspect.attempts+=1;if(correct)aspect.correct+=1;
    if(!correct){
      const borrowedTopic=chosen.topic;
      if(borrowedTopic&&borrowedTopic!==topicName){
        const borrowed=ensureTopic(progress,borrowedTopic);
        const borrowedParam=borrowed.params[chosen.param||param]||borrowed.params[param];
        borrowed.health=nudge(borrowed.health,25,.10);borrowed.borrowedHits+=1;
        borrowedParam.health=nudge(borrowedParam.health,25,.10);borrowedParam.borrowedHits+=1;
      }else{topic.sameTopicConfusions+=1;aspect.sameTopicConfusions+=1;}
      progress.__mistakes.unshift({at:new Date().toISOString(),askedSection:topicName,askedCondition:q.targetCondition,selectedSection:chosen.topic||topicName,selectedCondition:chosen.condition||'',param,selectedText:chosen.text,correctText:q.options.find(option=>option.id===q.correctOptionId)?.text||''});
      progress.__mistakes=progress.__mistakes.slice(0,120);
    }
    localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress));
    return correct;
  }

  function refreshHealth(){
    const progress=loadJson(PROGRESS_KEY,{});
    document.querySelectorAll('.nav a[href^="#"]').forEach(link=>{
      const section=document.querySelector(link.getAttribute('href'));
      const h2=section?.querySelector('h2');
      if(!section||!h2) return;
      const title=clean(h2.textContent.replace(/inferred/gi,''));
      const score=progress[title]?.health??50;
      const scoreEl=link.querySelector('.topic-score');
      if(scoreEl) scoreEl.textContent=`${score}%`;
    });
  }

  function renderResumedQuiz(set){
    const area=document.getElementById('aiq-play');
    if(!area) return;
    const play={index:0,answers:[]};
    const draw=()=>{
      const q=set.questions[play.index];
      const answer=play.answers[play.index];
      area.innerHTML=`<div class="aiq-progress">Question ${play.index+1} of 10 · ${clean(q.questionTypeLabel||q.questionType)}</div><h3>${clean(q.stem)}</h3><p class="aiq-leadin">${clean(q.leadIn)}</p><div class="aiq-options">${q.options.map(option=>`<button type="button" class="aiq-option ${answer?.selected===option.id?'selected':''}" data-id="${option.id}"><b>${option.id}.</b> ${clean(option.text)}</button>`).join('')}</div><div id="aiq-feedback">${answer?`<div class="aiq-feedback ${answer.correct?'correct':'incorrect'}"><strong>${answer.correct?'Correct':'Incorrect'}.</strong> ${clean(q.rationale)}<br><span>${clean(q.strongestDistractorExplanation)}</span></div>`:''}</div><div class="aiq-nav"><button id="aiq-prev" type="button" ${play.index===0?'disabled':''}>Previous</button><button id="aiq-next" type="button" ${play.index===9?'disabled':''}>Next</button></div>`;
      area.querySelectorAll('.aiq-option').forEach(button=>button.addEventListener('click',()=>{
        if(play.answers[play.index]) return;
        const chosen=q.options.find(option=>option.id===button.dataset.id);
        play.answers[play.index]={selected:chosen.id,correct:scoreResumedQuestion(q,chosen,set)};
        refreshHealth();draw();
      }));
      area.querySelector('#aiq-prev')?.addEventListener('click',()=>{play.index-=1;draw();});
      area.querySelector('#aiq-next')?.addEventListener('click',()=>{play.index+=1;draw();});
    };
    draw();
  }

  async function resumeSaved(){
    if(resumeRunning) return;
    const job=currentJob();
    const input=document.getElementById('aiq-key');
    const status=document.getElementById('aiq-status');
    const apiKey=clean(input?.value);
    if(!job||!job.resumeBody||!job.payload){if(status)status.textContent='No resumable generation data is available.';return;}
    if(!apiKey.startsWith('sk-')){if(status)status.textContent='Paste the OpenAI API key again to resume the saved generation.';return;}
    resumeRunning=true;sessionJobId=job.id;job.status='active';job.lastMessage='Resuming from the first unfinished checkpoint…';saveJob(job);buttonsDisabled(true);
    if(status) status.textContent='Resuming the saved generation from the first unfinished checkpoint…';
    try{
      const response=await window.fetch(API,{method:'POST',headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(job.resumeBody)});
      const data=await response.json();
      if(!response.ok) throw new Error(data?.error?.message||`OpenAI request failed (${response.status}).`);
      const raw=outputText(data);
      if(!raw) throw new Error('OpenAI returned no structured quiz.');
      const set=JSON.parse(raw);
      const errors=validateResumedSet(set,job.payload);
      if(errors.length) throw new Error(errors.slice(0,4).join(' '));
      const sets=loadJson(SETS_KEY,[]);
      if(!sets.some(item=>item?.quizId&&item.quizId===set.quizId)){
        sets.unshift(set);localStorage.setItem(SETS_KEY,JSON.stringify(sets.slice(0,30)));
      }
      renderResumedQuiz(set);
      if(status) status.textContent='Saved generation completed. Passed final local validation.';
      finishJob('Reconnected, completed every routine checkpoint and rendered the saved quiz.');
    }catch(error){
      const latest=currentJob();
      if(latest&&latest.status!=='paused'){
        latest.status='error';latest.lastError=String(error.message||error);latest.lastMessage=`Resume stopped: ${latest.lastError}`;saveJob(latest);
      }
      if(status) status.textContent=`Generation failed: ${error.message}`;
    }finally{
      resumeRunning=false;sessionJobId=null;if(input)input.value='';buttonsDisabled(false);render(currentJob());
    }
  }

  document.addEventListener('ukmlaAiGenerationCheckpoint',event=>{
    const message=clean(event.detail?.message);
    if(/Balanced correct answers across A–E/i.test(message)) markShuffle(message);
    const job=currentJob();
    if(job&&message&&job.status!=='complete'&&!/Connection interrupted|Connection restored/i.test(message)){
      job.lastMessage=message;saveJob(job);
    }
  });

  function init(){
    ensureUi();render(currentJob());attachGenerationGuards();observeStatus();
    new MutationObserver(()=>{ensureUi();render(currentJob());attachGenerationGuards();observeStatus();}).observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('online',()=>{
      const job=currentJob();
      if(job?.status==='paused'){job.lastMessage='Connection detected. The active stage will resume automatically.';saveJob(job);}
    });
    window.addEventListener('offline',()=>{
      const job=currentJob();
      if(job&&job.status==='active'){job.status='paused';job.lastMessage='Connection lost. Completed checkpoints remain saved.';saveJob(job);}
    });
  }

  window.UKMLA_AI_RESUME={current:currentJob,clear:clearJob,resume:resumeSaved};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
