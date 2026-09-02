(function(){
'use strict';

const legacy=window.UKMLA_V2_AI;
if(!legacy||window.__UKMLA_JARVIS_BACKGROUND_AI__)return;
window.__UKMLA_JARVIS_BACKGROUND_AI__=true;

const DEFAULT_WORKER='https://jarvis-2.iainpfs.workers.dev';
const WORKER_KEY='ukmlaJarvis2WorkerUrlV1';
const TOKEN_KEY='ukmlaJarvis2BuildTokenV1';
const JOB_KEY='ukmlaJarvis2QuestionJobV1';
const SNAPSHOT_KEY='ukmlaJarvis2QuestionJobSnapshotV1';
const IMPORTED_KEY='ukmlaJarvis2ImportedQuestionJobV1';
const API_PATH='/v1/ukmla/question-builds';
const POLL_MS=3000;

const STAGES=[
  {id:'generation',label:'Generate ten questions',percent:25},
  {id:'edit_sparse',label:'Sparsity edit point',percent:40},
  {id:'edit_options_category',label:'Options and answer-category edit',percent:54},
  {id:'edit_distractors',label:'Distractor edit point',percent:67},
  {id:'edit_sba',label:'Single-best-answer edit point',percent:76},
  {id:'final_assessment',label:'Independent final assessment',percent:82},
  {id:'complete',label:'Save approved question set',percent:100}
];

let root=null;
let latest=readJson(SNAPSHOT_KEY,null);
let pollTimer=null;
let requestBusy=false;
let importedThisSession='';

function core(){return window.UKMLA_V2;}
function schema(){return window.UKMLA_V2_AI_SCHEMA;}
function escapeHtml(value){return core().escapeHtml(value);}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function token(){return clean(localStorage.getItem(TOKEN_KEY));}
function workerUrl(){return clean(localStorage.getItem(WORKER_KEY))||DEFAULT_WORKER;}
function currentJobId(){return clean(localStorage.getItem(JOB_KEY));}
function active(job=latest){return Boolean(job&&['queued','running'].includes(job.status));}
function workspaceMounted(){return Boolean(root&&root.isConnected&&root.dataset.activeQuestionTab==='ai');}

function selectConditions(mode,topicId){
  const app=core().App;
  const pool=mode==='topic'?(app.byTopic.get(topicId)||[]):app.conditions;
  return core().selectCoverageCandidates(pool,10,{uniqueTopics:mode!=='topic'});
}

function saveSnapshot(job){
  latest=job||null;
  if(!job){localStorage.removeItem(SNAPSHOT_KEY);return;}
  const compact={
    id:job.id,status:job.status,topic:job.topic,currentStage:job.currentStage,
    percent:Number(job.percent)||0,lastMessage:job.lastMessage||'',error:job.error||'',
    createdAt:job.createdAt,updatedAt:job.updatedAt,completedAt:job.completedAt,
    pipelineMode:'editorial-edit-points-v1',executionBackend:'jarvis-2-cloudflare-workflow'
  };
  try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(compact));}catch(_){}
}

function readJson(key,fallback){
  try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}
}

async function api(path,{method='GET',body=null,credential=null}={}){
  const headers={'X-Jarvis-Client':'ukmla-v2'};
  const auth=credential||token();
  if(auth)headers.Authorization=`Bearer ${auth}`;
  if(body!=null)headers['Content-Type']='application/json';
  let response;
  try{
    response=await fetch(`${workerUrl()}${path}`,{method,headers,body:body==null?undefined:JSON.stringify(body),cache:'no-store'});
  }catch(error){
    throw new Error(`Jarvis 2 is unreachable: ${clean(error?.message||error)}`);
  }
  let data=null;
  try{data=await response.json();}catch(_){}
  if(!response.ok){
    const error=new Error(data?.error||`Jarvis 2 returned ${response.status}`);
    error.status=response.status;
    throw error;
  }
  return data;
}

function mount(container){
  root=container;
  root.dataset.activeQuestionTab='ai';
  if(!token())renderPairing();
  else renderBuilder();
}

function renderPairing(message=''){
  if(!workspaceMounted())return;
  const app=core().App;
  root.innerHTML=`<section class="quiz-layout" data-ukmla-question-workspace="ai"><article class="quiz-card"><div class="eyebrow">Durable question builder</div><h2>Connect Jarvis 2</h2><p>Question generation now runs on Jarvis 2 rather than inside Chrome. Pair this browser once; your full Jarvis access key is used only for the pairing request and is not stored by this page.</p><div class="field"><label>Jarvis 2 access key · one-time pairing</label><input class="input" id="ai-jarvis-key" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="Jarvis app access key"></div><details style="margin-top:12px"><summary>Worker address</summary><div class="field" style="margin-top:10px"><label>Jarvis 2 Worker</label><input class="input" id="ai-jarvis-worker" type="url" value="${escapeHtml(workerUrl())}" spellcheck="false"></div></details><button class="btn primary" id="ai-jarvis-pair" style="width:100%;margin-top:16px">Pair this browser</button>${message?`<p style="color:var(--danger);margin-top:12px">${escapeHtml(message)}</p>`:''}<div class="background-build-note">After pairing, the browser stores only a UKMLA-question-builder credential. It cannot be used for Jarvis chat, Gmail, Calendar or other Jarvis actions.</div></article><aside class="quiz-card"><div class="topic-meta"><span>New execution model</span><strong>Jarvis 2</strong></div><div class="checkpoint-list">${STAGES.slice(0,-1).map(stage=>`<div class="checkpoint"><span class="checkpoint-dot"></span><span>${escapeHtml(stage.label)}</span></div>`).join('')}</div><p style="color:var(--muted)">The same editorial quality pipeline is retained. Once a build starts, closing Chrome no longer stops the job.</p><small class="question-source-note">The OpenAI key remains on the Jarvis 2 Worker and is never sent to this browser.</small></aside></section><section id="ai-play" style="margin-top:18px"></section>`;
  root.querySelector('#ai-jarvis-pair')?.addEventListener('click',()=>void pair());
  const worker=root.querySelector('#ai-jarvis-worker');
  if(worker)worker.addEventListener('change',()=>{
    const value=clean(worker.value).replace(/\/+$/,'');
    if(value)localStorage.setItem(WORKER_KEY,value);
  });
}

function renderBuilder(){
  if(!workspaceMounted())return;
  const app=core().App;
  const isActive=active();
  root.innerHTML=`<section class="quiz-layout" data-ukmla-question-workspace="ai"><article class="quiz-card"><div class="eyebrow">Jarvis 2 durable build</div><h2>UKMLA questions</h2><p>Build ten difficult clinical questions from the curated card atlas. Generation and all editorial checks now continue on the server even when this page is closed.</p><div class="api-session-note"><strong>Jarvis 2 connected</strong><span>OpenAI is handled server-side. No OpenAI API key is required in Chrome.</span></div><div class="field" style="margin-top:12px"><label>Question scope</label><select class="select" id="ai-mode" ${isActive?'disabled':''}><option value="random">All UKMLA topics</option><option value="topic">Selected topic</option></select></div><div class="field" id="ai-topic-field" style="margin-top:12px" hidden><label>Topic</label><select class="select" id="ai-topic" ${isActive?'disabled':''}>${app.topics.map(topic=>`<option value="${topic.id}">${escapeHtml(topic.name)} (${topic.count})</option>`).join('')}</select></div><div class="field" style="margin-top:12px"><label>Quality pipeline</label><div class="input" style="height:auto;min-height:44px;display:flex;align-items:center">Editorial edit points · sparsity → options/category → distractors → SBA → assessment</div><small class="question-source-note">Failed questions alone receive the second editorial cycle and, if necessary, fresh regeneration.</small></div><button class="btn primary" id="ai-start" style="width:100%;margin-top:16px" ${isActive?'disabled':''}>${isActive?'Build running on Jarvis 2':'Build 10 UKMLA questions'}</button><button class="btn" id="ai-refresh-job" style="width:100%;margin-top:9px">Refresh server status</button><button class="btn" id="ai-disconnect" style="width:100%;margin-top:9px">Forget Jarvis 2 pairing</button><div class="background-build-note"><strong>Safe to leave.</strong> Once Jarvis 2 accepts the build, you can minimise Chrome, close this tab, lock the phone or turn the phone off. Reopening this page reconnects to the same server job.</div></article><aside class="quiz-card"><div class="topic-meta"><span>Server-side question build</span><strong id="ai-percent">${Number(latest?.percent)||0}%</strong></div><div class="progress-track" style="margin-top:12px"><div class="progress-fill" id="ai-progress-fill" style="--value:${Number(latest?.percent)||0}%"></div></div><div class="checkpoint-list" id="ai-checkpoints"></div><p id="ai-status" style="color:var(--muted)">${escapeHtml(latest?.lastMessage||'Checking Jarvis 2…')}</p><small class="question-source-note" id="ai-server-note">Jarvis 2 · durable Cloudflare Workflow</small></aside></section><section id="ai-play" style="margin-top:18px"></section>`;
  const mode=root.querySelector('#ai-mode');
  if(mode)mode.onchange=()=>{const field=root.querySelector('#ai-topic-field');if(field)field.hidden=mode.value!=='topic';};
  root.querySelector('#ai-start')?.addEventListener('click',()=>void startBuild());
  root.querySelector('#ai-refresh-job')?.addEventListener('click',()=>void refresh(true));
  root.querySelector('#ai-disconnect')?.addEventListener('click',disconnect);
  drawProgress(latest||{status:'idle',percent:0,lastMessage:'Checking Jarvis 2…'});
  void refresh(false);
}

async function pair(){
  if(requestBusy)return;
  const key=clean(root?.querySelector('#ai-jarvis-key')?.value);
  const worker=clean(root?.querySelector('#ai-jarvis-worker')?.value).replace(/\/+$/,'');
  if(!key){core().toast('Enter the Jarvis 2 access key once to pair this browser.');return;}
  if(worker)localStorage.setItem(WORKER_KEY,worker);
  requestBusy=true;
  const button=root?.querySelector('#ai-jarvis-pair');
  if(button){button.disabled=true;button.textContent='Pairing with Jarvis 2…';}
  try{
    const data=await api(`${API_PATH}/pair`,{method:'POST',credential:key});
    if(!data?.token)throw new Error('Jarvis 2 did not return a scoped build credential.');
    localStorage.setItem(TOKEN_KEY,data.token);
    const input=root?.querySelector('#ai-jarvis-key');if(input)input.value='';
    core().toast('Jarvis 2 paired. OpenAI question builds are now server-side.');
    renderBuilder();
  }catch(error){
    renderPairing(clean(error?.message||error));
  }finally{requestBusy=false;}
}

function disconnect(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(JOB_KEY);
  localStorage.removeItem(SNAPSHOT_KEY);
  latest=null;
  stopPolling();
  renderPairing();
}

async function startBuild(){
  if(requestBusy||active())return;
  if(!workspaceMounted())return;
  const mode=root.querySelector('#ai-mode')?.value||'random';
  const topicId=root.querySelector('#ai-topic')?.value||'';
  const conditions=selectConditions(mode,topicId);
  if(conditions.length!==10){core().toast('The selected scope does not contain ten usable cards.');return;}
  const questionTypes=schema().TYPES.map(item=>item[0]);
  const topic=mode==='topic'?core().topicById(topicId).name:'All UKMLA topics';
  const config={conditions,questionTypes,topic,knowledge:false};
  const payload={
    schemaVersion:1,
    topic,
    conditions,
    questionTypes,
    typeLabels:Object.fromEntries(schema().TYPES),
    limits:{...schema().LIMITS},
    generationBody:schema().requestBody(schema().generationPrompt(config),false,'ukmla_editorial_generation_v1'),
    editorialInstructions:{
      sparse:schema().checkpointInstruction('sparse'),
      options_category:schema().checkpointInstruction('options_category'),
      distractors:schema().checkpointInstruction('distractors'),
      sba_audit:schema().checkpointInstruction('sba_audit')
    }
  };
  requestBusy=true;
  const button=root.querySelector('#ai-start');
  if(button){button.disabled=true;button.textContent='Sending build to Jarvis 2…';}
  try{
    const data=await api(API_PATH,{method:'POST',body:payload});
    if(!data?.job?.id)throw new Error('Jarvis 2 did not return a question-build job.');
    localStorage.setItem(JOB_KEY,data.job.id);
    saveSnapshot(data.job);
    drawProgress(data.job);
    renderBuilder();
    schedulePoll(700);
  }catch(error){
    if(error?.status===401){localStorage.removeItem(TOKEN_KEY);renderPairing('Jarvis 2 pairing has expired or is invalid. Pair this browser again.');}
    else{core().toast(clean(error?.message||error));renderBuilder();}
  }finally{requestBusy=false;}
}

async function refresh(showToast=false){
  if(requestBusy||!token())return;
  requestBusy=true;
  try{
    const id=currentJobId();
    const data=await api(id?`${API_PATH}/${encodeURIComponent(id)}`:`${API_PATH}/latest`);
    const job=data?.job||null;
    if(job){
      localStorage.setItem(JOB_KEY,job.id);
      saveSnapshot(job);
      drawProgress(job);
      if(job.status==='complete'&&job.result)await importCompleted(job);
      if(active(job))schedulePoll();else stopPolling();
    }else{
      saveSnapshot(null);
      drawProgress({status:'idle',percent:0,lastMessage:'Ready to build on Jarvis 2.'});
      stopPolling();
    }
    if(showToast)core().toast(job?`Jarvis 2: ${job.lastMessage||job.status}`:'No server question build found.');
  }catch(error){
    if(error?.status===401){
      localStorage.removeItem(TOKEN_KEY);
      stopPolling();
      if(workspaceMounted())renderPairing('Jarvis 2 pairing has expired or is invalid. Pair this browser again.');
    }else{
      const snapshot=latest||{};
      drawProgress({...snapshot,lastMessage:`Last server checkpoint saved. ${clean(error?.message||error)}`});
      if(active(snapshot))schedulePoll(6000);
      if(showToast)core().toast(clean(error?.message||error));
    }
  }finally{requestBusy=false;}
}

async function importCompleted(job){
  if(!job?.id||!job.result)return;
  if(importedThisSession===job.id||localStorage.getItem(IMPORTED_KEY)===job.id)return;
  importedThisSession=job.id;
  await legacy.storeSet(job.result);
  localStorage.setItem(IMPORTED_KEY,job.id);
  core().toast('Jarvis 2 finished the question set · 10/10 approved and saved to Question Bank.');
  document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:{...job,lastMessage:'Question set ready and safely stored offline.',percent:100,status:'complete'}}));
  if(workspaceMounted()){
    const play=root.querySelector('#ai-play');
    if(play)legacy.renderSet(play,job.result,'ai');
  }
}

function drawProgress(job){
  if(job&&job.id)saveSnapshot(job);
  latest=job||latest;
  updateSharedStatus(latest);
  if(!workspaceMounted())return;
  const current=latest||{};
  const percent=Math.max(0,Math.min(100,Number(current.percent)||0));
  const fill=root.querySelector('#ai-progress-fill');if(fill)fill.style.setProperty('--value',`${percent}%`);
  const value=root.querySelector('#ai-percent');if(value)value.textContent=`${percent}%`;
  const status=root.querySelector('#ai-status');if(status)status.textContent=current.lastMessage||status.textContent;
  const list=root.querySelector('#ai-checkpoints');
  if(list){
    const rows=STAGES.map(stage=>{
      const done=current.status==='complete'||percent>=stage.percent;
      const activeStage=stageIsActive(stage.id,current.currentStage,current.status);
      return`<div class="checkpoint ${done?'done':''} ${activeStage?'active':''}"><span class="checkpoint-dot"></span><span>${escapeHtml(stage.label)}</span></div>`;
    });
    if(String(current.currentStage||'').startsWith('subset_')||current.currentStage==='subset_reedit')rows.splice(rows.length-1,0,'<div class="checkpoint active"><span class="checkpoint-dot"></span><span>Failed-question editorial cycle</span></div>');
    if(current.currentStage==='question_regeneration'||String(current.currentStage||'').startsWith('regenerate_q'))rows.splice(rows.length-1,0,'<div class="checkpoint active"><span class="checkpoint-dot"></span><span>Fresh regeneration of stubborn failures</span></div>');
    list.innerHTML=rows.join('');
  }
  const start=root.querySelector('#ai-start');
  if(start){start.disabled=active(current);start.textContent=active(current)?'Build running on Jarvis 2':'Build 10 UKMLA questions';}
  const note=root.querySelector('#ai-server-note');
  if(note){
    if(active(current))note.textContent='Jarvis 2 is running this independently · safe to close Chrome';
    else if(current.status==='complete')note.textContent='Jarvis 2 completed the durable build';
    else if(current.status==='needs_review')note.textContent='Jarvis 2 stopped after the bounded quality process · review required';
    else if(current.status==='error')note.textContent='Jarvis 2 preserved the last durable checkpoint';
    else note.textContent='Jarvis 2 · durable Cloudflare Workflow';
  }
}

function stageIsActive(stage,current,status){
  if(!current||status==='complete')return false;
  if(stage===current)return true;
  if(stage==='final_assessment'&&String(current).startsWith('assessment_'))return true;
  return false;
}

function updateSharedStatus(job){
  const isActive=active(job);
  const percent=Math.max(0,Math.min(100,Number(job?.percent)||0));
  document.querySelectorAll('[data-shared-quiz-status]').forEach(node=>{
    const label=node.querySelector('[data-shared-status-label]');
    const detail=node.querySelector('[data-shared-status-detail]');
    const fill=node.querySelector('[data-shared-status-fill]');
    if(isActive){
      if(label)label.textContent=`Jarvis 2 question build · ${percent}%`;
      if(detail)detail.textContent=job?.lastMessage||'Building questions';
      if(fill)fill.style.setProperty('--value',`${percent}%`);
      node.classList.add('generation-borrowed');
      node.setAttribute('aria-live','polite');
    }
  });
}

function schedulePoll(delay=POLL_MS){
  stopPolling();
  if(!token()||!active())return;
  pollTimer=setTimeout(()=>void refresh(false),delay);
}

function stopPolling(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}}

function foregroundRefresh(){
  if(!token())return;
  if(document.visibilityState&&document.visibilityState!=='visible')return;
  void refresh(false);
}

document.addEventListener('visibilitychange',foregroundRefresh);
window.addEventListener('pageshow',foregroundRefresh);
window.addEventListener('online',foregroundRefresh);

window.UKMLA_V2_AI={
  ...legacy,
  mount,
  isBuilding:()=>active(),
  latestProgress:()=>latest,
  refreshSharedStatus:()=>updateSharedStatus(latest),
  executionBackend:'jarvis-2-cloudflare-workflow'
};

if(token())setTimeout(()=>void refresh(false),50);
})();
