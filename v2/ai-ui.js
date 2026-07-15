(function(){
'use strict';

let root=null;
let playState=null;
let running=false;

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
  const resumeNote=saved&&saved.status!=='complete'
    ?`This saved build will resume with ${schema().PIPELINE_LABELS[selectedMode]}. The selector applies to new builds.`
    :'The combined trial removes one full-set API pass. Select legacy immediately if quality worsens.';

  root.innerHTML=`<section class="quiz-layout" data-ukmla-question-workspace="ai"><article class="quiz-card"><div class="eyebrow">GMC content-map structured</div><h2>UKMLA questions</h2><p>Build ten difficult clinical questions from the curated card atlas. All ten decision formats and every clinical quality rule remain mandatory.</p><div class="field"><label>Temporary OpenAI API key</label><input class="input" id="ai-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="Paste temporary API key"></div><div class="api-session-note"><strong>Session only</strong><span>The key stays in browser memory for this build and is cleared from the field afterwards. It is not saved to local storage or sync.</span></div><div class="field" style="margin-top:12px"><label>Question scope</label><select class="select" id="ai-mode"><option value="random">All UKMLA topics</option><option value="topic">Selected topic</option></select></div><div class="field" id="ai-topic-field" style="margin-top:12px" hidden><label>Topic</label><select class="select" id="ai-topic">${app.topics.map(topic=>`<option value="${topic.id}">${escapeHtml(topic.name)} (${topic.count})</option>`).join('')}</select></div><div class="field" style="margin-top:12px"><label>Quality pipeline</label><select class="select" id="ai-pipeline-mode">${pipelineOptions(selectedMode)}</select><small class="question-source-note" id="ai-pipeline-note">${escapeHtml(resumeNote)}</small></div><button class="btn primary" id="ai-start" style="width:100%;margin-top:16px">Build 10 UKMLA questions</button>${saved&&saved.status!=='complete'?'<button class="btn" id="ai-resume" style="width:100%;margin-top:9px">Resume saved question build</button><button class="btn danger" id="ai-discard" style="width:100%;margin-top:9px">Discard saved build</button>':''}</article><aside class="quiz-card"><div class="topic-meta"><span>Question quality pipeline</span><strong id="ai-percent">${saved?.percent||0}%</strong></div><div class="progress-track" style="margin-top:12px"><div class="progress-fill" id="ai-progress-fill" style="--value:${saved?.percent||0}%"></div></div><div class="checkpoint-list" id="ai-checkpoints"></div><p id="ai-status" style="color:var(--muted)">${escapeHtml(saved?.lastMessage||'Ready to build.')}</p><small class="question-source-note" id="ai-active-pipeline"></small><small class="question-source-note">UKMLA question sets use the curated card atlas. PSA source verification is separate and uses live BNF/NICE-grounded checks.</small></aside></section><section id="ai-play" style="margin-top:18px"></section>`;
  root.dataset.activeQuestionTab='ai';
  drawProgress(saved||{pipelineMode:selectedMode,percent:0,lastMessage:'Ready to build.'});

  const mode=root.querySelector('#ai-mode');
  const pipelineSelect=root.querySelector('#ai-pipeline-mode');
  mode.onchange=()=>root.querySelector('#ai-topic-field').hidden=mode.value!=='topic';
  pipelineSelect.onchange=()=>{
    const selected=schema().setPipelineMode(pipelineSelect.value);
    root.querySelector('#ai-pipeline-note').textContent=selected===schema().PIPELINE_MODES.legacy
      ?'Legacy mode restores separate option and semantic-category API reviews for new builds.'
      :'Combined trial keeps both audits in one API response and retains separate validation.';
    if(!saved)drawProgress({pipelineMode:selected,percent:0,lastMessage:'Ready to build.'});
  };
  root.querySelector('#ai-start').onclick=()=>start(false);
  root.querySelector('#ai-resume')?.addEventListener('click',()=>start(true));
  root.querySelector('#ai-discard')?.addEventListener('click',()=>{engine().clearJob();mount(container);});
}

function drawProgress(job){
  if(!root)return;
  const percent=job?.percent||0;
  const pipelineMode=schema().resolvePipelineMode(job||null);
  const stages=schema().stagesForPipeline(pipelineMode).filter(stage=>!stage.knowledgeOnly);
  const fill=root.querySelector('#ai-progress-fill');
  if(fill)fill.style.setProperty('--value',`${percent}%`);
  const label=root.querySelector('#ai-percent');
  if(label)label.textContent=`${percent}%`;
  const status=root.querySelector('#ai-status');
  if(status&&job?.lastMessage)status.textContent=job.lastMessage;
  const pipeline=root.querySelector('#ai-active-pipeline');
  if(pipeline)pipeline.textContent=`Active: ${schema().PIPELINE_LABELS[pipelineMode]}`;
  const list=root.querySelector('#ai-checkpoints');
  if(list)list.innerHTML=stages.map(stage=>{
    const done=percent>=stage.percent;
    const active=job?.currentStage===stage.id&&job?.status!=='complete';
    return`<div class="checkpoint ${done?'done':''} ${active?'active':''}"><span class="checkpoint-dot"></span><span>${stage.label}</span></div>`;
  }).join('');
}

async function start(resume){
  if(running)return;
  const token=clean(root.querySelector('#ai-key').value);
  if(token.length<20){core().toast('Paste the temporary API key.');return;}
  running=true;
  root.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
    let job=resume?engine().loadJob():null;
    let conditions,questionTypes,topic;
    let pipelineMode;
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
      if(conditions.length!==10)throw new Error('The selected scope does not contain ten usable cards.');
      questionTypes=schema().TYPES.map(item=>item[0]);
      topic=mode==='topic'?core().topicById(topicId).name:'All UKMLA topics';
    }
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
    renderSet(root.querySelector('#ai-play'),set,'ai');
    drawProgress({
      lastMessage:'Question set ready and safely stored offline.',
      percent:100,
      status:'complete',
      pipelineMode:set.pipelineMode||pipelineMode
    });
  }catch(error){
    drawProgress({...engine().loadJob(),lastMessage:`Question build stopped: ${error.message}`});
  }finally{
    running=false;
    root.querySelectorAll('button').forEach(button=>button.disabled=false);
    const input=root.querySelector('#ai-key');
    if(input)input.value='';
  }
}

function renderSet(container,set,source='ai'){
  playState={set,source,index:0,answers:[],correct:0,container};
  drawQuestion();
}

function drawQuestion(){
  const state=playState;
  if(!state)return;
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
window.UKMLA_V2_AI={
  mount,
  renderSet,
  runKnowledgeBatch:config=>engine().runPipeline({...config,knowledge:true,persist:false}),
  storeSet:engine().storeSet,
  TYPES:schema().TYPES,
  STAGES:schema().stagesForPipeline(schema().resolvePipelineMode(null))
};
})();
