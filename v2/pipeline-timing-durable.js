(function(){
'use strict';

const RUNS_KEY='ukmlaPipelineTimingRunsV1';
const MODEL_KEY='ukmlaPipelineTimingModelV1';
const PENDING_KEY='ukmlaPipelineTimingPendingV1';
const DURABLE_PREFIX='ukmlaPipelineTimingRunV2:';
const MAX_RUNS=120;
const MAX_PENDING=30;
let recoveryPromise=null;
let scheduled=null;

function timing(){return window.UKMLA_PIPELINE_TIMING;}
function engine(){return window.UKMLA_V2_AI_ENGINE;}
function bank(){return window.UKMLA_QUESTION_BANK;}
function large(){return window.UKMLA_LARGE_STORAGE;}
function parse(value,fallback){try{return JSON.parse(value||'null')??fallback;}catch(_){return fallback;}}
function read(key,fallback){return parse(localStorage.getItem(key),fallback);}
function write(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));return true;}
  catch(_){return false;}
}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function safeId(value){return String(value||`timing-${Date.now().toString(36)}`).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,160);}
function validDuration(value){const number=Number(value);return Number.isFinite(number)&&number>=20&&number<=45*60*1000;}
function compactTiming(row){
  return{
    stageId:clean(row?.stageId||'unknown'),
    durationMs:Math.round(Number(row?.durationMs)||0),
    apiAttempts:Math.max(0,Math.round(Number(row?.apiAttempts)||0)),
    successfulApiCalls:Math.max(0,Math.round(Number(row?.successfulApiCalls)||0))
  };
}
function uniqueRuns(rows){
  const map=new Map();
  for(const run of rows||[]){
    if(!run?.runId)continue;
    const current=map.get(run.runId);
    if(!current||Number(run.completedAtMs||run.updatedAtMs||0)>=Number(current.completedAtMs||current.updatedAtMs||0))map.set(run.runId,run);
  }
  return[...map.values()].sort((a,b)=>Number(a.completedAtMs||a.updatedAtMs||0)-Number(b.completedAtMs||b.updatedAtMs||0));
}
function runFromSet(set){
  const telemetry=set?.buildTelemetry;
  if(!telemetry||!Array.isArray(telemetry.stageTimings))return null;
  const stages=telemetry.stageTimings.map(compactTiming).filter(row=>row.stageId&&validDuration(row.durationMs));
  if(!stages.length)return null;
  const startedAtMs=Date.parse(telemetry.startedAt||set.generatedAt||'')||Date.now();
  const completedAtMs=Date.parse(telemetry.completedAt||set.generatedAt||'')||Date.now();
  return{
    version:2,
    runId:safeId(set.quizId||set.setId||`timing-${completedAtMs.toString(36)}`),
    deviceId:localStorage.getItem('ukmlaRemoteDeviceIdV1')||'local',
    pipelineMode:telemetry.pipelineMode||set.pipelineMode||'default',
    sourceType:set.sourceType||'ai',
    imageMode:localStorage.getItem('ukmlaImageQuestionModeV1')||'prefer',
    result:'complete',
    startedAtMs,
    completedAtMs,
    totalDurationMs:Math.max(0,completedAtMs-startedAtMs),
    apiCalls:Math.max(0,Number(telemetry.apiCalls)||0),
    questionCount:Array.isArray(set.questions)?set.questions.length:10,
    stages,
    repairStageCount:stages.filter(row=>row.successfulApiCalls>1).length,
    recoveredFromQuestionBank:true,
    updatedAtMs:Date.now()
  };
}
function updateNote(prefix,count){
  const node=document.getElementById('ai-timing-model-note');
  if(node)node.textContent=`${prefix} · ${count} completed build${count===1?'':'s'}`;
}
function saveCompact(rows,key,limit){
  const kept=uniqueRuns(rows).slice(-limit);
  if(write(key,kept))return kept;
  const smaller=kept.slice(-Math.min(40,limit));
  write(key,smaller);
  return smaller;
}
async function durableRuns(){
  if(!large()?.entries)return[];
  try{
    const rows=[];
    for(const[,value]of await large().entries(DURABLE_PREFIX)){
      const parsed=parse(value,null);
      if(parsed?.runId)rows.push(parsed);
    }
    return rows;
  }catch(_){return[];}
}
async function saveDurable(rows){
  if(!large()?.putMany)return;
  const entries=uniqueRuns(rows).slice(-MAX_RUNS).map(run=>[`${DURABLE_PREFIX}${safeId(run.runId)}`,JSON.stringify(run)]);
  if(entries.length)await large().putMany(entries);
}
async function questionBankRuns(){
  const api=bank();
  if(!api?.bankIndex||!api?.loadSet)return[];
  const records=api.bankIndex().filter(record=>['ai','knowledge'].includes(record?.sourceType)).slice(0,MAX_RUNS);
  const rows=[];
  for(const record of records){
    try{
      const set=await api.loadSet(record.setId);
      const run=runFromSet(set);
      if(run)rows.push(run);
    }catch(_){/* one unreadable set must not block the remaining history */}
  }
  return rows;
}
function rebuildModel(rows){
  const builder=timing()?.buildModel;
  if(typeof builder!=='function')return null;
  const model=builder(rows);
  write(MODEL_KEY,model);
  return model;
}
async function syncFirebase(){
  try{await timing()?.sync?.();return true;}
  catch(error){console.warn('Recovered timing history is queued for Firebase:',error);return false;}
}
async function mergeHistory(extraRuns=[]){
  const localBefore=read(RUNS_KEY,[])||[];
  const durable=await durableRuns();
  const knownBefore=uniqueRuns([...localBefore,...durable]);
  const knownIds=new Set(knownBefore.map(run=>run.runId));
  const bankRows=await questionBankRuns();
  const combined=uniqueRuns([...knownBefore,...bankRows,...(extraRuns||[])]).slice(-MAX_RUNS);
  const newlyRecovered=combined.filter(run=>!knownIds.has(run.runId));
  const local=saveCompact(combined,RUNS_KEY,MAX_RUNS);
  const pending=saveCompact([...(read(PENDING_KEY,[])||[]),...newlyRecovered],PENDING_KEY,MAX_PENDING);
  await saveDurable(local);
  const model=rebuildModel(local);
  updateNote('Recovered timing history',Number(model?.runCount)||0);
  return{runs:local,pending,model,newlyRecovered};
}
async function recover(extraRuns=[]){
  if(recoveryPromise)return recoveryPromise;
  recoveryPromise=(async()=>{
    const result=await mergeHistory(extraRuns);
    if(result.pending.length){
      const synced=await syncFirebase();
      if(synced)updateNote('Firebase timing model synced',Number(result.model?.runCount)||0);
    }
    return result;
  })().finally(()=>{recoveryPromise=null;});
  return recoveryPromise;
}
async function recordSet(set){
  const run=runFromSet(set);
  if(!run)return null;
  await recover([run]);
  return run;
}
function patchEngine(attempt=0){
  const api=engine();
  if(!api||typeof api.runPipeline!=='function'){
    if(attempt<240)setTimeout(()=>patchEngine(attempt+1),50);
    return false;
  }
  if(api.__durablePipelineTimingPatched)return true;
  api.__durablePipelineTimingPatched=true;
  const original=api.runPipeline.bind(api);
  api.runPipeline=async function runPipelineWithDurableTiming(config={}){
    const set=await original(config);
    await recordSet(set);
    return set;
  };
  return true;
}
function scheduleRecovery(delay=350){
  clearTimeout(scheduled);
  scheduled=setTimeout(()=>void recover(),delay);
}
function initialise(){
  patchEngine();
  scheduleRecovery(500);
  document.addEventListener('ukmlaAiCompletedSetStored',event=>{
    const setId=event.detail?.setId;
    if(!setId)return scheduleRecovery(100);
    void bank()?.loadSet?.(setId).then(set=>set&&recordSet(set)).catch(()=>scheduleRecovery(100));
  });
  window.addEventListener('online',()=>scheduleRecovery(100));
}
window.UKMLA_PIPELINE_TIMING_DURABLE={recover,recordSet,runFromSet,durableRuns,questionBankRuns};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
