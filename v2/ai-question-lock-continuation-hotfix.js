(function(){
'use strict';

const engine=window.UKMLA_V2_AI_ENGINE;
const schema=window.UKMLA_V2_AI_SCHEMA;
const transport=window.UKMLA_V2_AI_TRANSPORT;
const locks=window.UKMLA_AI_QUESTION_LOCK_REPAIR;
if(!engine||!schema||!transport||!locks||engine.__questionLockContinuationSignalHotfix)return;
engine.__questionLockContinuationSignalHotfix=true;

const JOB_KEY='ukmlaV2AiJobV1';
const previousRunPipeline=engine.runPipeline.bind(engine);
const tiers=schema.REPAIR_TIERS;
let latestExhausted=null;

function core(){return window.UKMLA_V2;}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function clean(value){return String(value??'').trim();}
function increment(map,key){const target=map&&typeof map==='object'?map:{};target[key]=Number(target[key]||0)+1;return target;}
function retryable(error){return error instanceof TypeError||/network|fetch|offline|connection|load failed|408|409|425|429|500|502|503|504/i.test(clean(error?.message||error));}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function saveJob(job,config){
  job.updatedAt=new Date().toISOString();
  if(config?.persist!==false)core()?.saveJson?.(JOB_KEY,job);
  document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
  config?.onProgress?.(job.lastMessage,job.percent,job.currentStage,job.pipelineMode);
}

function stageBounds(stageId,pipelineMode){
  const stages=schema.stagesForPipeline?.(pipelineMode)||schema.STAGES||[];
  const index=stages.findIndex(stage=>stage.id===stageId);
  if(index<0)return{start:0,end:100};
  return{start:index?Number(stages[index-1].percent)||0:5,end:Number(stages[index].percent)||100};
}

function sequence(startTier){
  if(startTier===tiers.fields)return[tiers.fields,tiers.questions,tiers.set];
  if(startTier===tiers.questions)return[tiers.questions,tiers.set];
  return[tiers.set];
}

function continuationSignal(error,job){
  const message=clean(error?.message||error);
  const savedMessage=clean(job?.lastMessage);
  return Boolean(job?.repair?.exhausted)&&(
    /targeted field, affected-question and full-set repair were exhausted/i.test(message)||
    /targeted field, affected-question and full-set repair were exhausted/i.test(savedMessage)||
    /continuing unresolved question repair/i.test(message)||
    /continuing unresolved question repair/i.test(savedMessage)
  );
}

function parseResponse(data){
  const raw=schema.outputText(data);
  if(!raw)throw new Error('No structured question repair response was returned.');
  return JSON.parse(raw);
}

async function requestRepair(config,job,stageId,label,body){
  let attempt=0;
  while(true){
    attempt++;
    job.apiCalls=Number(job.apiCalls||0)+1;
    job.apiAttemptsByStage=increment(job.apiAttemptsByStage,stageId);
    job.lastMessage=attempt===1?label:`${label} — reconnecting attempt ${attempt}`;
    saveJob(job,config);
    try{
      const parsed=parseResponse(await transport.send(config.apiKey,body));
      job.apiSuccessByStage=increment(job.apiSuccessByStage,stageId);
      job.lastSuccessfulApiStage=stageId;
      job.lastSuccessfulApiAt=new Date().toISOString();
      return parsed;
    }catch(error){
      if(!retryable(error))throw error;
      job.lastError=clean(error.message||error);
      job.lastMessage=`Connection interrupted during ${label}. The locked questions are preserved; retrying automatically.`;
      saveJob(job,config);
      await wait(Math.min(60000,2000*Math.pow(2,Math.min(attempt,5))));
    }
  }
}

async function continueLockedRepair(config,saved){
  const stageId=saved.currentStage||saved.repair?.stageId;
  const validationStage=saved.repair?.validationStage||stageId;
  const stageLabel=saved.repair?.stageLabel||schema.stageLabel?.(stageId)||'Validation checkpoint';
  let candidate=clone(saved.currentSet);
  locks.restoreImmutableMetadata(candidate,config);
  let errors=schema.validate(candidate,config,validationStage);
  let round=Number(saved.questionRepairRound||0);

  while(errors.length){
    round++;
    saved.questionRepairRound=round;
    const initial=schema.repairPlan(errors,candidate);
    const repairSequence=sequence(initial.tier);

    for(let index=0;index<repairSequence.length&&errors.length;index++){
      const tier=repairSequence[index];
      const plan=schema.repairPlan(errors,candidate,tier);
      const ledger=locks.ledgerFor(errors,candidate,config,validationStage);
      saved.status='repairing';
      saved.currentSet=clone(candidate);
      saved.percent=Math.max(Number(saved.percent)||0,Number(ledger.percent)||0);
      saved.checkpointProgress=clone(ledger);
      saved.repair={
        stageId,
        stageLabel,
        validationStage,
        tier:plan.tier,
        tierLabel:plan.label,
        step:index+1,
        total:repairSequence.length,
        errors:[...errors],
        questionNumbers:[...(plan.questionNumbers||[])],
        fields:clone(plan.fields||[]),
        exhausted:false,
        questionLocked:true,
        round,
        startedAt:saved.repair?.startedAt||new Date().toISOString()
      };
      saved.lastError=errors.slice(0,8).join(' ');
      const prompt=schema.targetedRepairPrompt(validationStage,config,plan,candidate,index+1,repairSequence.length,saved.currentSet);
      const body=schema.repairRequestBody(prompt,config.knowledge,`ukmla_${validationStage}_${tier}_continuation_hotfix_v1`,tier);
      const response=await requestRepair(config,saved,stageId,`${stageLabel} — ${plan.label}`,body);
      candidate=schema.applyRepair(candidate,response,plan);
      if(stageId==='final')candidate=schema.balancedShuffle(candidate);
      errors=schema.validate(candidate,config,validationStage);
      saved.currentSet=clone(candidate);
      const updated=locks.ledgerFor(errors,candidate,config,validationStage);
      saved.percent=Math.max(Number(saved.percent)||0,Number(updated.percent)||0);
      saved.checkpointProgress=clone(updated);
      saveJob(saved,config);
    }
  }

  const bounds=stageBounds(stageId,saved.pipelineMode);
  saved.currentSet=candidate;
  saved.status='active';
  saved.percent=bounds.end;
  saved.currentIndex=Number(saved.currentIndex||0)+1;
  saved.completedStageIds=Array.isArray(saved.completedStageIds)?saved.completedStageIds:[];
  if(stageId&&!saved.completedStageIds.includes(stageId))saved.completedStageIds.push(stageId);
  saved.lastMessage=`${stageLabel} completed · 10/10 locked`;
  saved.checkpointProgress={stageId,validationStage,locked:10,failed:0,unresolvedQuestionNumbers:[],percent:bounds.end,stageStartPercent:bounds.start,stageEndPercent:bounds.end,updatedAt:new Date().toISOString()};
  delete saved.repair;
  delete saved.lastError;
  saveJob(saved,config);
  return saved;
}

document.addEventListener('ukmlaV2AiProgress',event=>{
  const detail=event.detail;
  if(!detail?.repair?.exhausted||!detail.currentSet)return;
  const snapshot=clone(detail);
  snapshot.status='repairing';
  latestExhausted=snapshot;
  const stored=engine.loadJob?.();
  if(stored?.id&&stored.id===snapshot.id)core()?.saveJson?.(JOB_KEY,snapshot);
});

engine.runPipeline=async function runPipelineWithContinuationSignalHotfix(config={}){
  let resumeJob=config.job||null;
  while(true){
    if(resumeJob?.repair?.exhausted){
      resumeJob=await continueLockedRepair(config,clone(resumeJob));
    }
    try{
      return await previousRunPipeline({...config,job:resumeJob});
    }catch(error){
      const saved=(config.persist!==false?engine.loadJob?.():null)||latestExhausted;
      if(!continuationSignal(error,saved))throw error;
      resumeJob=await continueLockedRepair(config,clone(saved));
    }
  }
};

window.UKMLA_AI_QUESTION_LOCK_CONTINUATION_HOTFIX={continuationSignal,continueLockedRepair};
})();
