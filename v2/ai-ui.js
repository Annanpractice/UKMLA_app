(function(){
'use strict';

let root=null;
let playState=null;
let activeBuildPromise=null;
let latestProgress=null;
let completedSet=null;
let lastBuildError='';

function core(){return window.UKMLA_V2;}
function engine(){return window.UKMLA_V2_AI_ENGINE;}
function schema(){return window.UKMLA_V2_AI_SCHEMA;}
function clean(value){return core().clean(value);}
function escapeHtml(value){return core().escapeHtml(value);}
function selectConditions(mode,topicId){
  const app=core().App;
  const pool=mode==='topic'?(app.byTopic.get(topicId)||[]):app.conditions;
  return core().selectCoverageCandidates(pool,10,{uniqueTopics:mode!=='topic'});
}
function workspaceMounted(){return Boolean(root&&root.isConnected&&root.dataset.activeQuestionTab==='ai');}
function isBuilding(){return Boolean(activeBuildPromise);}

function injectBackgroundStyle(){
  if(document.getElementById('ai-background-runtime-style'))return;
  const style=document.createElement('style');
  style.id='ai-background-runtime-style';
  style.textContent=`
    #ai-background-build{position:fixed;z-index:145;right:16px;bottom:calc(88px + env(safe-area-inset-bottom));max-width:min(370px,calc(100vw - 32px));border:1px solid rgba(72,211,255,.48);border-radius:18px;background:rgba(3,21,43,.97);box-shadow:0 14px 38px rgba(0,0,0,.44),0 0 22px rgba(35,190,255,.2);color:#edfaff;padding:11px 13px;cursor:pointer;font:inherit;text-align:left}
    #ai-background-build strong{display:block;font-size:.88rem}#ai-background-build span{display:block;margin-top:3px;color:#9ed8f2;font-size:.76rem}#ai-background-build[hidden]{display:none}
    .background-build-note{margin-top:12px;padding:10px 12px;border:1px solid rgba(72,211,255,.28);border-radius:14px;background:rgba(72,211,255,.06);color:var(--muted);font-size:.82rem}
  `;
  document.head.appendChild(style);
}
function openAiWorkspace(){
  const api=core();
  const stored=api.loadJson(api.STORAGE.state,{});
  api.App.state={...api.App.state,quizTab:'ai'};
  api.saveJson(api.STORAGE.state,{...stored,quizTab:'ai'});
  api.go('quiz');
}
function indicator(){
  injectBackgroundStyle();
  let node=document.getElementById('ai-background-build');
  if(!node){
    node=document.createElement('button');
    node.type='button';
    node.id='ai-background-build';
    node.hidden=true;
    node.onclick=openAiWorkspace;
    document.body.appendChild(node);
  }
  return node;
}
function updateIndicator(job=latestProgress){
  const node=indicator();
  if(isBuilding()){
    const percent=Math.max(0,Math.min(100,Number(job?.percent)||0));
    const stage=job?.lastMessage||'Generating questions';
    node.hidden=false;
    node.innerHTML=`<strong>${percent}% · ${escapeHtml(stage)}</strong><span>Generation continues while you use Home, Cards, Focus or Analytics. Tap to return.</span>`;
    return;
  }
  if(completedSet){
    node.hidden=false;
    node.innerHTML='<strong>Questions ready</strong><span>The completed set was stored offline. Tap to open it.</span>';
    return;
  }
  if(lastBuildError){
    node.hidden=false;
    node.innerHTML=`<strong>Question build paused</strong><span>${escapeHtml(lastBuildError)} Tap to review or resume.</span>`;
    return;
  }
  node.hidden=true;
}

function pipelineOptions(selected){
  const modes=schema().PIPELINE_MODES;
  return[
    [modes.combined,schema().PIPELINE_LABELS[modes.combined]],
    [modes.legacy,schema().PIPELINE_LABELS[modes.legacy]]
  ].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${escapeHtml(label)}</option>`).join('');
}

function mount(container){
  root=container;
  const saved=engine().loadJob();
  const app=core().App;
  const selectedMode=schema().resolvePipelineMode(saved||null);
  const active=isBuilding();
  const resumeNote=active
    ?'This build is continuing independently. You may move to Home, Cards, Focus or Analytics without stopping it.'
    :saved&&saved.status!=='complete'
      ?`This saved build will resume with ${schema().PIPELINE_LABELS[selectedMode]}. The selector applies to new builds.`
      :'The default combined pipeline uses five model checkpoints, including the independent SBA quality audit.';

  root.innerHTML=`<section class="quiz-layout" data-ukmla-question-workspace="ai"><article class="quiz-card"><div class="eyebrow">GMC content-map structured</div><h2>UKMLA questions</h2><p>Build ten difficult clinical questions from the curated card atlas. All ten decision formats and every clinical quality rule remain mandatory.</p><div class="field"><label>Temporary OpenAI API key</label><input class="input" id="ai-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="Paste temporary API key" ${active?'disabled':''}></div><div class="api-session-note"><strong>Session only</strong><span>The key stays in browser memory for this build and is cleared from the field immediately. It is not saved to local storage or sync.</span></div><div class="field" style="margin-top:12px"><label>Question scope</label><select class="select" id="ai-mode" ${active?'disabled':''}><option value="random">All UKMLA topics</option><option value="topic">Selected topic</option></select></div><div class="field" id="ai-topic-field" style="margin-top:12px" hidden><label>Topic</label><select class="select" id="ai-topic" ${active?'disabled':''}>${app.topics.map(topic=>`<option value="${topic.id}">${escapeHtml(topic.name)} (${topic.count})</option>`).join('')}</select></div><div class="field" style="margin-top:12px"><label>Quality pipeline</label><select class="select" id="ai-pipeline-mode" ${active?'disabled':''}>${pipelineOptions(selectedMode)}</select><small class="question-source-note" id="ai-pipeline-note">${escapeHtml(resumeNote)}</small></div><button class="btn primary" id="ai-start" style="width:100%;margin-top:16px" ${active?'disabled':''}>${active?'Generation running in background':'Build 10 UKMLA questions'}</button>${!active&&saved&&saved.status!=='complete'?'<button class="btn" id="ai-resume" style="width:100%;margin-top:9px">Resume saved question build</button><button class="btn danger" id="ai-discard" style="width:100%;margin-top:9px">Discard saved build</button>':''}<div class="background-build-note">Once started, generation is detached from this panel and continues while you use other tabs inside the app. Brief switching to another browser app or tab is tolerated when the mobile browser keeps this page alive. If Android terminates the page, reopen it and resume the saved checkpoint with the API key.</div></article><aside class="quiz-card"><div class="topic-meta"><span>Question quality pipeline</span><strong id="ai-percent">${latestProgress?.percent??saved?.percent??0}%</strong></div><div class="progress-track" style="margin-top:12px"><div class="progress-fill" id="ai-progress-fill" style="--value:${latestProgress?.percent??saved?.percent??0}%"></div></div><div class="checkpoint-list" id="ai-checkpoints"></div><p id="ai-status" style="color:var(--muted)">${escapeHtml(latestProgress?.lastMessage||saved?.lastMessage||lastBuildError||'Ready to build.')}</p><small class="question-source-note" id="ai-active-pipeline"></small><small class="question-source-note">UKMLA question sets use the curated card atlas. PSA source verification is separate and uses live BNF/NICE-grounded checks.</small></aside></section><section id="ai-play" style="margin-top:18px"></section>`;
  root.dataset.activeQuestionTab='ai';
  drawProgress(latestProgress||saved||{pipelineMode:selectedMode,percent:0,lastMessage:'Ready to build.'});

  const mode=root.querySelector('#ai-mode');
  const pipelineSelect=root.querySelector('#ai-pipeline-mode');
  if(mode)mode.onchange=()=>{const field=root?.querySelector('#ai-topic-field');if(field)field.hidden=mode.value!=='topic';};
  if(pipelineSelect)pipelineSelect.onchange=()=>{
    const selected=schema().setPipelineMode(pipelineSelect.value);
    const note=root?.querySelector('#ai-pipeline-note');
    if(note)note.textContent=selected===schema().PIPELINE_MODES.legacy
      ?'Legacy mode restores separate option and semantic-category API reviews for new builds.'
      :'Combined mode performs five separate model checkpoints, including the independent SBA quality audit.';
    if(!saved)drawProgress({pipelineMode:selected,percent:0,lastMessage:'Ready to build.'});
  };
  root.querySelector('#ai-start')?.addEventListener('click',()=>void start(false));
  root.querySelector('#ai-resume')?.addEventListener('click',()=>void start(true));
  root.querySelector('#ai-discard')?.addEventListener('click',()=>{engine().clearJob();lastBuildError='';mount(container);});

  if(completedSet){
    const play=root.querySelector('#ai-play');
    if(play)renderSet(play,completedSet,'ai');
    completedSet=null;
    updateIndicator();
  }
}

function drawProgress(job){
  if(job)latestProgress={...latestProgress,...job};
  updateIndicator(latestProgress);
  if(!workspaceMounted())return;
  const current=latestProgress||job||{};
  const percent=current?.percent||0;
  const pipelineMode=schema().resolvePipelineMode(current||null);
  const stages=schema().stagesForPipeline(pipelineMode).filter(stage=>!stage.knowledgeOnly);
  const fill=root.querySelector('#ai-progress-fill');
  if(fill)fill.style.setProperty('--value',`${percent}%`);
  const label=root.querySelector('#ai-percent');
  if(label)label.textContent=`${percent}%`;
  const status=root.querySelector('#ai-status');
  if(status&&current?.lastMessage)status.textContent=current.lastMessage;
  const pipeline=root.querySelector('#ai-active-pipeline');
  if(pipeline)pipeline.textContent=`Active: ${schema().PIPELINE_LABELS[pipelineMode]}`;
  const list=root.querySelector('#ai-checkpoints');
  if(list)list.innerHTML=stages.map(stage=>{
    const done=percent>=stage.percent;
    const active=current?.currentStage===stage.id&&current?.status!=='complete';
    return`<div class="checkpoint ${done?'done':''} ${active?'active':''}"><span class="checkpoint-dot"></span><span>${stage.label}</span></div>`;
  }).join('');
}

async function start(resume){
  if(isBuilding()){core().toast('Question generation is already continuing in the background.');return activeBuildPromise;}
  if(!workspaceMounted())return null;
  const tokenInput=root.querySelector('#ai-key');
  const token=clean(tokenInput?.value);
  if(token.length<20){core().toast('Paste the temporary API key.');return null;}

  let job=resume?engine().loadJob():null;
  let conditions,questionTypes,topic,pipelineMode;
  if(job){
    conditions=job.conditions;
    questionTypes=job.questionTypes;
    topic=job.topic;
    pipelineMode=schema().resolvePipelineMode(job);
  }else{
    pipelineMode=schema().setPipelineMode(root.querySelector('#ai-pipeline-mode').value);
    const mode=root.querySelector('#ai-mode').value;
    const topicId=root.querySelector('#ai-topic').value;
    conditions=selectConditions(mode,topicId);
    if(conditions.length!==10){core().toast('The selected scope does not contain ten usable cards.');return null;}
    questionTypes=schema().TYPES.map(item=>item[0]);
    topic=mode==='topic'?core().topicById(topicId).name:'All UKMLA topics';
  }

  if(tokenInput)tokenInput.value='';
  playState=null;
  lastBuildError='';
  completedSet=null;
  latestProgress={...(job||{}),pipelineMode,percent:job?.percent||5,status:'active',lastMessage:job?.lastMessage||'Starting question generation'};
  if(workspaceMounted()){
    root.querySelectorAll('button,input,select').forEach(node=>node.disabled=true);
    const startButton=root.querySelector('#ai-start');
    if(startButton)startButton.textContent='Generation running in background';
  }
  updateIndicator(latestProgress);

  activeBuildPromise=(async()=>{
    let succeeded=false;
    try{
      const set=await engine().runPipeline({
        apiKey:token,
        conditions,
        questionTypes,
        topic,
        knowledge:false,
        job,
        persist:true,
        onProgress:(message,percent,stage,activeMode)=>drawProgress({
          lastMessage:message,
          percent,
          currentStage:stage,
          status:'active',
          pipelineMode:activeMode||pipelineMode
        })
      });
      drawProgress({lastMessage:'Saving complete set to IndexedDB…',percent:100,status:'active',pipelineMode:set.pipelineMode||pipelineMode});
      await engine().storeSet(set);
      completedSet=set;
      latestProgress={lastMessage:'Question set ready and safely stored offline.',percent:100,status:'complete',pipelineMode:set.pipelineMode||pipelineMode};
      succeeded=true;
      if(workspaceMounted()){
        const play=root.querySelector('#ai-play');
        if(play){renderSet(play,set,'ai');completedSet=null;}
      }
      return set;
    }catch(error){
      lastBuildError=`Question build stopped: ${error.message}`;
      latestProgress={...engine().loadJob(),lastMessage:lastBuildError,status:'paused'};
      drawProgress(latestProgress);
      return null;
    }finally{
      activeBuildPromise=null;
      updateIndicator(latestProgress);
      if(workspaceMounted()&&!succeeded&&!playState)mount(root);
    }
  })();
  return activeBuildPromise;
}

function renderSet(container,set,source='ai'){
  if(!container||!set)return;
  playState={set,source,index:0,answers:[],correct:0,container};
  drawQuestion();
}

function drawQuestion(){
  const state=playState;
  if(!state||!state.container)return;
  const question=state.set.questions[state.index];
  const answer=state.answers[state.index];
  const qid=question.id||String(state.index+1);
  if(!answer)core().logPresented({id:`present:${state.set.quizId}:${qid}`,source:state.source,quizId:state.set.quizId,questionId:qid,conditionId:question.targetConditionId,conditionName:question.targetCondition,topicId:question.topicId,topicName:question.topicName,questionType:question.questionType,packId:state.set.packId||null});
  state.container.innerHTML=`<article class="quiz-card" style="max-width:920px;margin:auto"><div class="topic-meta"><span>Question ${state.index+1} of ${state.set.questions.length}</span><span>${escapeHtml(question.questionTypeLabel)}</span></div><div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="--value:${Math.round((state.index+1)/state.set.questions.length*100)}%"></div></div><div class="quiz-stem">${escapeHtml(question.stem)}</div><p>${escapeHtml(question.leadIn)}</p><div class="options">${question.options.map(option=>`<button class="option ${answer?(option.id===question.correctOptionId?'correct':option.id===answer.selectedOptionId?'wrong':''):''}" data-ai-option="${option.id}" ${answer?'disabled':''}><span class="letter">${option.id}</span><span>${escapeHtml(option.text)}</span></button>`).join('')}</div>${answer?`<div class="feedback"><strong>${answer.correct?'Correct.':'Incorrect.'}</strong> ${escapeHtml(question.rationale)}<br><span>${escapeHtml(question.strongestDistractorExplanation)}</span>${question.sourceSupport?`<br><small>Source: ${escapeHtml(question.sourceSupport.sourceRefs.join(', '))}</small>`:''}</div><div class="card-actions"><button class="btn" id="ai-prev" ${state.index===0?'disabled':''}>Previous</button><button class="btn primary" id="ai-next">${state.index===state.set.questions.length-1?'Results':'Next'}</button></div>`:''}</article>`;
  state.container.querySelectorAll('[data-ai-option]').forEach(button=>button.onclick=()=>answerQuestion(button.dataset.aiOption));
  state.container.querySelector('#ai-prev')?.addEventListener('click',()=>{state.index--;drawQuestion();});
  state.container.querySelector('#ai-next')?.addEventListener('click',()=>{if(state.index===state.set.questions.length-1)drawResult();else{state.index++;drawQuestion();}});
}

function answerQuestion(optionId){
  const state=playState;
  const question=state.set.questions[state.index];
  if(state.answers[state.index])return;
  const option=question.options.find(item=>item.id===optionId);
  const correct=state.source==='knowledge'?option.id===question.correctOptionId:core().scoreAnswer({...question,param:core().TYPE_PARAM[question.questionType]},option);
  state.answers[state.index]={selectedOptionId:optionId,correct};
  if(correct)state.correct++;
  const qid=question.id||String(state.index+1);
  core().logAnswered({id:`answer:${state.set.quizId}:${qid}`,presentationId:`present:${state.set.quizId}:${qid}`,source:state.source,quizId:state.set.quizId,questionId:qid,conditionId:question.targetConditionId,conditionName:question.targetCondition,topicId:question.topicId,topicName:question.topicName,questionType:question.questionType,packId:state.set.packId||null,selectedOptionId:optionId,correctOptionId:question.correctOptionId,correct});
  drawQuestion();
}

function drawResult(){
  const state=playState;
  const percent=Math.round(state.correct/state.set.questions.length*100);
  state.container.innerHTML=`<article class="quiz-card" style="max-width:760px;margin:auto;text-align:center"><div class="eyebrow">Question set complete</div><div class="boast-number" style="margin:28px 0">${state.correct}/${state.set.questions.length}</div><h2>${percent}%</h2><p>Coverage, topic health and question-type analytics have been updated.</p><div class="card-actions" style="justify-content:center"><button class="btn primary" id="ai-new">Build another set</button><button class="btn" id="ai-analytics">Open analytics</button></div></article>`;
  state.container.querySelector('#ai-new').onclick=()=>mount(root);
  state.container.querySelector('#ai-analytics').onclick=()=>core().go('analytics');
}

document.addEventListener('ukmlaV2AiProgress',event=>drawProgress(event.detail));
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&isBuilding()){
    drawProgress({...latestProgress,lastMessage:latestProgress?.lastMessage||'Generation continuing'});
    document.dispatchEvent(new Event('ukmlaV2AiForeground'));
  }
});
window.addEventListener('online',()=>{if(isBuilding())document.dispatchEvent(new Event('ukmlaV2AiForeground'));});

window.UKMLA_V2_AI={
  mount,
  renderSet,
  isBuilding,
  latestProgress:()=>latestProgress,
  runKnowledgeBatch:config=>engine().runPipeline({...config,knowledge:true,persist:false}),
  storeSet:engine().storeSet,
  TYPES:schema().TYPES,
  STAGES:schema().stagesForPipeline(schema().resolvePipelineMode(null))
};
})();