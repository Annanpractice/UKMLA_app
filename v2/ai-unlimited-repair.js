(function(){
'use strict';

const engine=window.UKMLA_V2_AI_ENGINE;
if(!engine||engine.__unlimitedRepairContinuation)return;
engine.__unlimitedRepairContinuation=true;

const JOB_KEY='ukmlaV2AiJobV1';
const MAX_AUTOMATIC_CONTINUATIONS=2;
const DERIVED_SET_ERRORS=new Set([
  'Question types are not unique.',
  'Targets are not unique.'
]);
const originalRunPipeline=engine.runPipeline;
let latestJob=engine.loadJob?.()||null;
let latestProgressAt=Date.now();

function core(){return window.UKMLA_V2;}
function schema(){return window.UKMLA_V2_AI_SCHEMA;}
function clean(value){return String(value??'').trim();}
function clone(value){return JSON.parse(JSON.stringify(value));}
function isQuestionError(error){return/^Q\d+/i.test(clean(error));}
function isDerivedSetError(error){return DERIVED_SET_ERRORS.has(clean(error));}

function saveJob(job){
  if(!job)return;
  job.updatedAt=new Date().toISOString();
  core()?.saveJson?.(JOB_KEY,job);
  latestJob=clone(job);
  latestProgressAt=Date.now();
  document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
}

function patchRepairClassification(){
  const api=schema();
  if(!api?.repairPlan||api.__repairBudgetClassifierPatched)return;
  api.__repairBudgetClassifierPatched=true;
  const original=api.repairPlan.bind(api);
  api.repairPlan=(errors,candidate,forcedTier)=>{
    const list=(errors||[]).map(clean).filter(Boolean);
    const questionErrors=list.filter(isQuestionError);
    const setErrors=list.filter(error=>!isQuestionError(error));
    const derivedOnly=questionErrors.length&&setErrors.length&&setErrors.every(isDerivedSetError);
    const filtered=derivedOnly&&forcedTier!==api.REPAIR_TIERS?.set?questionErrors:list;
    return original(filtered,candidate,forcedTier);
  };
}

function isExhaustedValidationRepair(error,job){
  const message=String(error?.message||error||'');
  return Boolean(job?.repair?.exhausted)&&/targeted field, affected-question and full-set repair were exhausted/i.test(message);
}

function checkpointLabel(job){
  return job?.repair?.stageLabel||schema()?.stageLabel?.(job?.currentStage)||'Validation checkpoint';
}

function continuationMessage(job,continuation,automaticContinuation){
  return`${checkpointLabel(job)} still has validation issues. Starting automatic repair cycle ${automaticContinuation} of ${MAX_AUTOMATIC_CONTINUATIONS} (${continuation} total continuations).`;
}

function pauseMessage(job){
  return`${checkpointLabel(job)} paused safely after ${MAX_AUTOMATIC_CONTINUATIONS} automatic continuation cycles. The last valid set and checkpoint are saved. Re-enter the API key and choose Continue saved repair.`;
}

function pauseForManualContinuation(saved,continuation,automaticContinuations,config){
  const message=pauseMessage(saved);
  saved.status='paused';
  saved.lastMessage=message;
  saved.repairContinuationCount=continuation;
  saved.repairBudgetPaused=true;
  saved.repairBudget={
    maxAutomaticContinuations:MAX_AUTOMATIC_CONTINUATIONS,
    automaticContinuations,
    pausedAt:new Date().toISOString(),
    stageId:saved.currentStage||saved.repair?.stageId||null,
    stageLabel:checkpointLabel(saved)
  };
  saved.repair={
    ...(saved.repair||{}),
    exhausted:true,
    continuation,
    manualResumeRequired:true,
    pausedAt:new Date().toISOString()
  };
  saveJob(saved);
  config.onProgress?.(message,saved.percent,saved.currentStage,saved.pipelineMode);
  const error=new Error(message);
  error.code='UKMLA_REPAIR_BUDGET_PAUSED';
  throw error;
}

function resumePausedJob(job){
  if(!job?.repairBudgetPaused)return job;
  const resumed={
    ...job,
    status:'active',
    repairBudgetPaused:false,
    repairBudget:{
      ...(job.repairBudget||{}),
      resumedAt:new Date().toISOString()
    },
    repair:{
      ...(job.repair||{}),
      exhausted:false,
      manualResumeRequired:false,
      resumedAt:new Date().toISOString()
    }
  };
  resumed.lastMessage=`${checkpointLabel(resumed)} resumed from the saved repair checkpoint.`;
  saveJob(resumed);
  return resumed;
}

function durationMs(job){
  const started=Date.parse(job?.createdAt||job?.repair?.startedAt||job?.updatedAt||'');
  return Number.isFinite(started)?Math.max(0,Date.now()-started):0;
}

function formatDuration(milliseconds){
  const seconds=Math.floor(Math.max(0,milliseconds)/1000);
  const minutes=Math.floor(seconds/60);
  const hours=Math.floor(minutes/60);
  if(hours)return`${hours}h ${minutes%60}m`;
  if(minutes)return`${minutes}m ${seconds%60}s`;
  return`${seconds}s`;
}

function stageAttempts(job){return Number(job?.apiAttemptsByStage?.[job?.currentStage]||0);}

function telemetryText(job){
  if(!job)return'';
  const parts=[`Elapsed ${formatDuration(durationMs(job))}`,`API calls ${Number(job.apiCalls||0)}`];
  if(job.currentStage)parts.push(`this checkpoint ${stageAttempts(job)}`);
  if(job.repair?.tierLabel)parts.push(job.repair.tierLabel);
  if(Number(job.repairContinuationCount||0)>0)parts.push(`repair continuation ${Number(job.repairContinuationCount)}`);
  if(job.repairBudgetPaused)parts.push('paused safely; progress preserved');
  else if(job.status==='active'&&Date.now()-latestProgressAt>=30000)parts.push(`waiting ${formatDuration(Date.now()-latestProgressAt)} for the current API response`);
  return parts.join(' · ');
}

function updateTelemetry(){
  const status=document.getElementById('ai-status');
  if(!status)return;
  let detail=document.getElementById('ai-repair-telemetry');
  if(!detail){
    detail=document.createElement('small');
    detail.id='ai-repair-telemetry';
    detail.className='question-source-note';
    status.insertAdjacentElement('afterend',detail);
  }
  const text=telemetryText(latestJob);
  if(detail.textContent!==text)detail.textContent=text;
  detail.hidden=!text;
  const resume=document.getElementById('ai-resume');
  if(resume&&latestJob?.repairBudgetPaused&&resume.textContent!=='Continue saved repair')resume.textContent='Continue saved repair';
}

document.addEventListener('ukmlaV2AiProgress',event=>{
  latestJob=event.detail?clone(event.detail):latestJob;
  latestProgressAt=Date.now();
  updateTelemetry();
});
document.addEventListener('ukmlaWorkspaceMounted',updateTelemetry);
window.addEventListener('hashchange',()=>setTimeout(updateTelemetry,0));
setInterval(updateTelemetry,1000);

patchRepairClassification();

engine.runPipeline=async function runPipelineWithRepairBudget(config={}){
  patchRepairClassification();
  let resumeJob=resumePausedJob(config.job||null);
  let continuation=Number(resumeJob?.repairContinuationCount||0);
  let automaticContinuations=0;

  while(true){
    try{
      return await originalRunPipeline({...config,job:resumeJob});
    }catch(error){
      const saved=engine.loadJob?.();
      if(config.persist===false||!isExhaustedValidationRepair(error,saved))throw error;

      continuation=Math.max(continuation,Number(saved.repairContinuationCount||0))+1;
      automaticContinuations++;
      if(automaticContinuations>MAX_AUTOMATIC_CONTINUATIONS){
        pauseForManualContinuation(saved,continuation,automaticContinuations-1,config);
      }

      const message=continuationMessage(saved,continuation,automaticContinuations);
      saved.status='active';
      saved.lastMessage=message;
      saved.repairContinuationCount=continuation;
      saved.repairBudgetPaused=false;
      saved.repairBudget={
        maxAutomaticContinuations:MAX_AUTOMATIC_CONTINUATIONS,
        automaticContinuations,
        continuedAt:new Date().toISOString(),
        stageId:saved.currentStage||saved.repair?.stageId||null,
        stageLabel:checkpointLabel(saved)
      };
      saved.repair={
        ...(saved.repair||{}),
        exhausted:false,
        continuation,
        automaticContinuation:automaticContinuations,
        continuedAt:new Date().toISOString()
      };

      saveJob(saved);
      config.onProgress?.(message,saved.percent,saved.currentStage,saved.pipelineMode);
      resumeJob=saved;
    }
  }
};

window.UKMLA_AI_REPAIR_BUDGET={
  maxAutomaticContinuations:MAX_AUTOMATIC_CONTINUATIONS,
  telemetryText,
  updateTelemetry
};
})();
