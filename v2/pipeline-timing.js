(function(){
'use strict';

const PAD_ID='ukmla-4Jq9QYF2vHc8nLz6WmRpT3xA';
const ROOT_PATH=`ukmlaPads/${PAD_ID.replace(/[^A-Za-z0-9_-]/g,'-')}/pipelineTiming/v1`;
const LOCAL_RUNS_KEY='ukmlaPipelineTimingRunsV1';
const LOCAL_MODEL_KEY='ukmlaPipelineTimingModelV1';
const PENDING_KEY='ukmlaPipelineTimingPendingV1';
const MAX_LOCAL_RUNS=120;
const MAX_CLOUD_RUNS=250;
const MAX_PENDING_RUNS=30;
const PULL_TIMEOUT_MS=4500;
const TICK_MS=700;
const MIN_DURATION_MS=20;
const MAX_DURATION_MS=45*60*1000;
const INITIAL_PERCENT=5;
const FINAL_PERCENT=100;

let firebasePromise=null;
let model=read(LOCAL_MODEL_KEY,null);
let active=null;
let interval=null;
let noteText=modelNote(model,'Local timing history');
let observer=null;

function schema(){return window.UKMLA_V2_AI_SCHEMA;}
function engine(){return window.UKMLA_V2_AI_ENGINE;}
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}}
function nowIso(){return new Date().toISOString();}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function safeId(value){return String(value||`timing-${Date.now().toString(36)}`).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,160);}
function deviceId(){return localStorage.getItem('ukmlaRemoteDeviceIdV1')||'local';}
function imageMode(){return localStorage.getItem('ukmlaImageQuestionModeV1')||'prefer';}
function pipelineMode(value){return schema()?.resolvePipelineMode?.(value||null)||value?.pipelineMode||'default';}
function stageList(mode,knowledge=false){
  const rows=schema()?.stagesForPipeline?.(mode)||schema()?.STAGES||[];
  return rows.filter(stage=>!stage.knowledgeOnly||knowledge).map(stage=>({...stage}));
}
function validDuration(value){
  const duration=Number(value);
  return Number.isFinite(duration)&&duration>=MIN_DURATION_MS&&duration<=MAX_DURATION_MS;
}
function percentile(values,p){
  if(!values.length)return null;
  const sorted=values.slice().sort((a,b)=>a-b);
  const position=(sorted.length-1)*p;
  const lower=Math.floor(position),upper=Math.ceil(position);
  if(lower===upper)return sorted[lower];
  return sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);
}
function ewmaLog(values,alpha=.18){
  let value=null;
  for(const duration of values){
    const logged=Math.log(duration);
    value=value===null?logged:alpha*logged+(1-alpha)*value;
  }
  return value===null?null:Math.exp(value);
}
function uniqueRuns(rows){
  const map=new Map();
  for(const run of rows||[]){
    if(!run?.runId)continue;
    const existing=map.get(run.runId);
    if(!existing||Number(run.completedAtMs||run.updatedAtMs||0)>=Number(existing.completedAtMs||existing.updatedAtMs||0))map.set(run.runId,run);
  }
  return[...map.values()].sort((a,b)=>Number(a.completedAtMs||a.updatedAtMs||0)-Number(b.completedAtMs||b.updatedAtMs||0));
}
function compactTiming(row){
  return{
    stageId:clean(row?.stageId||'unknown'),
    durationMs:Math.round(Number(row?.durationMs)||0),
    apiAttempts:Math.max(0,Math.round(Number(row?.apiAttempts)||0)),
    successfulApiCalls:Math.max(0,Math.round(Number(row?.successfulApiCalls)||0))
  };
}
function compactRun(set,job,result='complete'){
  const telemetry=set?.buildTelemetry||{};
  const timings=(telemetry.stageTimings||job?.stageTimings||[]).map(compactTiming).filter(row=>row.stageId&&validDuration(row.durationMs));
  const startedAt=telemetry.startedAt||job?.createdAt||nowIso();
  const completedAt=telemetry.completedAt||nowIso();
  const startedAtMs=Date.parse(startedAt)||Date.now();
  const completedAtMs=Date.parse(completedAt)||Date.now();
  const runId=safeId(set?.quizId||set?.setId||job?.id||`timing-${completedAtMs.toString(36)}`);
  return{
    version:1,
    runId,
    deviceId:deviceId(),
    pipelineMode:telemetry.pipelineMode||job?.pipelineMode||pipelineMode(job),
    sourceType:set?.sourceType||job?.sourceType||(job?.knowledge?'knowledge':'ai'),
    imageMode:imageMode(),
    result,
    startedAtMs,
    completedAtMs,
    totalDurationMs:Math.max(0,completedAtMs-startedAtMs),
    apiCalls:Math.max(0,Number(telemetry.apiCalls??job?.apiCalls)||0),
    questionCount:Array.isArray(set?.questions)?set.questions.length:10,
    stages:timings,
    repairStageCount:timings.filter(row=>row.successfulApiCalls>1).length,
    updatedAtMs:Date.now()
  };
}
function buildModel(runs){
  const rows=uniqueRuns(runs).filter(run=>run.result==='complete'&&Array.isArray(run.stages)&&run.stages.length);
  const byMode={};
  for(const run of rows){
    const mode=run.pipelineMode||'default';
    const bucket=byMode[mode]||(byMode[mode]={runCount:0,stages:{}});
    bucket.runCount++;
    for(const timing of run.stages){
      if(!validDuration(timing.durationMs))continue;
      const stage=bucket.stages[timing.stageId]||(bucket.stages[timing.stageId]={durations:[],repairs:0,apiAttempts:0});
      stage.durations.push(Number(timing.durationMs));
      stage.repairs+=Number(timing.successfulApiCalls)>1?1:0;
      stage.apiAttempts+=Math.max(0,Number(timing.apiAttempts)||0);
    }
  }
  for(const bucket of Object.values(byMode)){
    for(const [stageId,stage] of Object.entries(bucket.stages)){
      const durations=stage.durations.slice(-MAX_CLOUD_RUNS);
      bucket.stages[stageId]={
        count:durations.length,
        estimateMs:Math.round(ewmaLog(durations)),
        medianMs:Math.round(percentile(durations,.5)),
        p80Ms:Math.round(percentile(durations,.8)),
        repairRate:Number((stage.repairs/Math.max(1,durations.length)).toFixed(3)),
        meanApiAttempts:Number((stage.apiAttempts/Math.max(1,durations.length)).toFixed(2))
      };
    }
  }
  return{
    version:1,
    method:'robust-log-ewma-v1',
    runCount:rows.length,
    generatedAt:nowIso(),
    modes:byMode
  };
}
function mergeAndStoreRuns(remoteRuns){
  const merged=uniqueRuns([...(read(LOCAL_RUNS_KEY,[])||[]),...(remoteRuns||[])]);
  const kept=merged.slice(-MAX_LOCAL_RUNS);
  write(LOCAL_RUNS_KEY,kept);
  model=buildModel(merged.slice(-MAX_CLOUD_RUNS));
  write(LOCAL_MODEL_KEY,model);
  return model;
}
function modelForMode(mode){return model?.modes?.[mode]||model?.modes?.default||null;}
function priorWeights(stages){
  let previous=INITIAL_PERCENT;
  return stages.map(stage=>{
    const end=clamp(Number(stage.percent)||previous,previous,FINAL_PERCENT);
    const weight=Math.max(.25,end-previous);
    previous=end;
    return weight;
  });
}
function timingPlan(mode,knowledge=false){
  const stages=stageList(mode,knowledge);
  const priors=priorWeights(stages);
  const modeModel=modelForMode(mode);
  const learned=stages.map((stage,index)=>{
    const estimate=Number(modeModel?.stages?.[stage.id]?.estimateMs);
    return validDuration(estimate)?estimate:priors[index]*2500;
  });
  const learnedTotal=learned.reduce((sum,value)=>sum+value,0)||1;
  const learnedWeights=learned.map(value=>value/learnedTotal*(FINAL_PERCENT-INITIAL_PERCENT));
  const runCount=Number(modeModel?.runCount)||0;
  const confidence=runCount<5?0:Math.min(.9,.9*(runCount-4)/16);
  const weights=priors.map((prior,index)=>(1-confidence)*prior+confidence*learnedWeights[index]);
  const weightTotal=weights.reduce((sum,value)=>sum+value,0)||1;
  const scale=(FINAL_PERCENT-INITIAL_PERCENT)/weightTotal;
  const normalised=weights.map(value=>value*scale);
  const starts=[];
  let cursor=INITIAL_PERCENT;
  normalised.forEach(value=>{starts.push(cursor);cursor+=value;});
  return{
    stages,
    starts,
    ends:normalised.map((value,index)=>starts[index]+value),
    estimates:learned,
    confidence,
    runCount
  };
}
function estimatedPercent(stageId,completed=false){
  if(!active)return null;
  const index=active.plan.stages.findIndex(stage=>stage.id===stageId);
  if(index<0)return active.maxPercent;
  const start=active.plan.starts[index];
  const end=active.plan.ends[index];
  if(completed){
    active.completed.add(stageId);
    active.maxPercent=Math.max(active.maxPercent,end);
    return clamp(active.maxPercent,INITIAL_PERCENT,99);
  }
  if(active.completed.has(stageId))return clamp(Math.max(active.maxPercent,end),INITIAL_PERCENT,99);
  if(active.stageId!==stageId){
    active.stageId=stageId;
    active.stageStartedAt=Date.now();
  }
  const elapsed=Math.max(0,Date.now()-active.stageStartedAt);
  const estimate=Math.max(500,active.plan.estimates[index]||30000);
  const fraction=Math.min(.92,.92*(1-Math.exp(-elapsed/(estimate*.58))));
  active.maxPercent=Math.max(active.maxPercent,start+(end-start)*fraction);
  return clamp(active.maxPercent,INITIAL_PERCENT,99);
}
function emitEstimate(detail,percent){
  if(!Number.isFinite(percent))return;
  const eventDetail={...detail,percent:Math.round(percent),learnedPercent:Number(percent.toFixed(1)),timingModelRuns:active?.plan?.runCount||model?.runCount||0,__pipelineTimingEstimate:true};
  document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:eventDetail}));
}
function progressDetail(message,percent,stageId,mode,status='active'){
  return{
    lastMessage:message,
    percent,
    currentStage:stageId,
    pipelineMode:mode,
    status,
    timingModelRuns:active?.plan?.runCount||0,
    timingModelConfidence:active?.plan?.confidence||0
  };
}
function handleEngineProgress(event){
  const detail=event.detail;
  if(!active||!detail||detail.__pipelineTimingEstimate)return;
  const stageId=detail.currentStage||active.stageId;
  if(!stageId)return;
  const completed=/\bcompleted\b/i.test(String(detail.lastMessage||''))||detail.status==='complete';
  const percent=detail.status==='complete'?100:estimatedPercent(stageId,completed);
  queueMicrotask(()=>emitEstimate(detail,percent));
}
function beginActive(config){
  const mode=pipelineMode(config.job||{pipelineMode:config.pipelineMode});
  active={
    runId:safeId(config.job?.id||config.jobId||`timing-${Date.now().toString(36)}`),
    mode,
    knowledge:Boolean(config.knowledge),
    plan:timingPlan(mode,Boolean(config.knowledge)),
    stageId:null,
    stageStartedAt:Date.now(),
    completed:new Set(config.job?.completedStageIds||[]),
    maxPercent:Math.max(INITIAL_PERCENT,Number(config.job?.learnedPercent)||INITIAL_PERCENT),
    startedAtMs:Date.now()
  };
  if(interval)clearInterval(interval);
  interval=setInterval(()=>{
    if(!active?.stageId)return;
    const percent=estimatedPercent(active.stageId,false);
    emitEstimate(progressDetail(active.lastMessage||'Quality checkpoint running',percent,active.stageId,active.mode),percent);
  },TICK_MS);
  updateNote(modelNote(model,'Firebase timing model'));
}
function endActive(){
  if(interval){clearInterval(interval);interval=null;}
  active=null;
}
function localRuns(){return read(LOCAL_RUNS_KEY,[])||[];}
function pendingRuns(){return read(PENDING_KEY,[])||[];}
function queueRun(run){
  if(!run?.runId)return;
  const local=uniqueRuns([...localRuns(),run]).slice(-MAX_LOCAL_RUNS);
  write(LOCAL_RUNS_KEY,local);
  const pending=uniqueRuns([...pendingRuns(),run]).slice(-MAX_PENDING_RUNS);
  write(PENDING_KEY,pending);
  model=buildModel(local);
  write(LOCAL_MODEL_KEY,model);
}
function removePending(ids){
  const remove=new Set(ids);
  write(PENDING_KEY,pendingRuns().filter(run=>!remove.has(run.runId)));
}
async function firebase(){
  if(firebasePromise)return firebasePromise;
  firebasePromise=(async()=>{
    const appMod=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const dbMod=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const config=window.UKMLA_V2_FIREBASE_CONFIG;
    if(!config)throw new Error('Firebase configuration is unavailable.');
    const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(config);
    return{dbMod,db:dbMod.getDatabase(app)};
  })().catch(error=>{firebasePromise=null;throw error;});
  return firebasePromise;
}
async function flushPending(){
  const pending=pendingRuns();
  if(!pending.length)return 0;
  const{dbMod,db}=await firebase();
  const updates={};
  for(const run of pending)updates[`${ROOT_PATH}/runs/${safeId(run.runId)}`]=run;
  await dbMod.update(dbMod.ref(db),updates);
  removePending(pending.map(run=>run.runId));
  return pending.length;
}
async function pullCloudRuns(){
  const{dbMod,db}=await firebase();
  const runsRef=dbMod.ref(db,`${ROOT_PATH}/runs`);
  const query=dbMod.query(runsRef,dbMod.orderByChild('completedAtMs'),dbMod.limitToLast(MAX_CLOUD_RUNS));
  const snapshot=await dbMod.get(query);
  const value=snapshot.val()||{};
  return Object.values(value).filter(Boolean);
}
async function pushModel(){
  const{dbMod,db}=await firebase();
  await dbMod.set(dbMod.ref(db,`${ROOT_PATH}/model`),model);
}
function timeout(ms){return new Promise((_,reject)=>setTimeout(()=>reject(new Error('Firebase timing pull timed out.')),ms));}
async function prepareTiming(){
  updateNote('Timing model · loading Firebase history…');
  try{
    await Promise.race([(async()=>{
      await flushPending();
      const remote=await pullCloudRuns();
      mergeAndStoreRuns(remote);
    })(),timeout(PULL_TIMEOUT_MS)]);
    noteText=modelNote(model,'Firebase timing model');
  }catch(error){
    model=buildModel(localRuns());
    write(LOCAL_MODEL_KEY,model);
    noteText=modelNote(model,'Local timing fallback');
    console.warn('Pipeline timing history unavailable:',error);
  }
  updateNote(noteText);
  return model;
}
async function persistRun(run){
  updateNote(modelNote(model,'Timing model updated locally'));
  try{
    await flushPending();
    await pushModel();
    noteText=modelNote(model,'Firebase timing model synced');
  }catch(error){
    noteText=modelNote(model,'Timing data queued for Firebase');
    console.warn('Pipeline timing upload deferred:',error);
  }
  updateNote(noteText);
}
function modelNote(value,prefix){
  const count=Number(value?.runCount)||0;
  return`${prefix} · ${count} completed build${count===1?'':'s'}`;
}
function updateNote(text){
  noteText=text||noteText;
  const mount=()=>{
    const pipeline=document.getElementById('ai-active-pipeline');
    if(!pipeline?.parentElement)return false;
    let note=document.getElementById('ai-timing-model-note');
    if(!note){
      note=document.createElement('small');
      note.id='ai-timing-model-note';
      note.className='question-source-note';
      pipeline.insertAdjacentElement('afterend',note);
    }
    note.textContent=noteText;
    return true;
  };
  if(!mount())setTimeout(mount,0);
}
function observeUi(){
  if(observer)return;
  observer=new MutationObserver(()=>updateNote(noteText));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  updateNote(noteText);
}
function patch(){
  const api=engine();
  if(!api||typeof api.runPipeline!=='function'||api.__pipelineTimingPatched)return false;
  api.__pipelineTimingPatched=true;
  const original=api.runPipeline.bind(api);
  api.runPipeline=async function runPipelineWithLearnedTiming(config={}){
    await prepareTiming();
    beginActive(config);
    const originalOnProgress=config.onProgress;
    const wrappedOnProgress=(message,fixedPercent,stageId,mode)=>{
      if(active){
        active.lastMessage=message;
        const completed=/\bcompleted\b/i.test(String(message||''))||Number(fixedPercent)>=100;
        const learned=Number(fixedPercent)>=100?100:estimatedPercent(stageId,completed);
        originalOnProgress?.(message,Math.round(learned??fixedPercent),stageId,mode);
      }else originalOnProgress?.(message,fixedPercent,stageId,mode);
    };
    try{
      const set=await original({...config,onProgress:wrappedOnProgress});
      const job=api.loadJob?.();
      const run=compactRun(set,job,'complete');
      queueRun(run);
      void persistRun(run);
      return set;
    }catch(error){
      const job=api.loadJob?.();
      const partial=compactRun(null,job,'failed');
      if(partial.stages.length){queueRun(partial);void persistRun(partial);}
      throw error;
    }finally{
      endActive();
    }
  };
  return true;
}
function initialise(attempt=0){
  observeUi();
  document.addEventListener('ukmlaV2AiProgress',handleEngineProgress);
  if(patch())return;
  if(attempt<240)setTimeout(()=>initialise(attempt+1),50);
}
window.UKMLA_PIPELINE_TIMING={
  prepareTiming,
  buildModel,
  timingPlan,
  currentModel:()=>model,
  localRuns,
  pendingRuns,
  sync:async()=>{await flushPending();const remote=await pullCloudRuns();mergeAndStoreRuns(remote);await pushModel();updateNote(modelNote(model,'Firebase timing model synced'));return model;}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initialise(),{once:true});else initialise();
})();
