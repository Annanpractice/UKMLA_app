(function(){
'use strict';

const JOB_KEY='ukmlaV2AiJobV1';

function core(){return window.UKMLA_V2;}
function schema(){return window.UKMLA_V2_AI_SCHEMA;}
function transport(){return window.UKMLA_V2_AI_TRANSPORT;}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function isNetwork(error){return error instanceof TypeError||/network|fetch|offline|connection|load failed/i.test(String(error?.message||error));}
function saveJob(job){job.updatedAt=new Date().toISOString();core().saveJson(JOB_KEY,job);document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));}
function loadJob(){return core().loadJson(JOB_KEY,null);}
function clearJob(){localStorage.removeItem(JOB_KEY);}
function errorLimit(){return Number(schema().AUTO_REPAIR?.maxErrors)||20;}
function errorSummary(errors,limit=4){return(errors||[]).slice(0,limit).join(' ');}
function increment(map,key){
  const target=map&&typeof map==='object'?map:{};
  target[key]=Number(target[key]||0)+1;
  return target;
}

function emitJob(job,config,message){
  job.lastMessage=message;
  if(config.persist!==false)saveJob(job);
  else document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
  config.onProgress?.(message,job.percent,job.currentStage,job.pipelineMode);
}

async function request(token,body,label,job,stageId,persist=true){
  let attempt=0;
  const checkpoint=stageId||job?.currentStage||'unknown';
  while(true){
    attempt++;
    try{
      if(job){
        job.apiCalls=Number(job.apiCalls||0)+1;
        job.apiAttemptsByStage=increment(job.apiAttemptsByStage,checkpoint);
      }
      document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:{...job,lastMessage:attempt===1?label:`${label} — reconnecting attempt ${attempt}`}}));
      const data=await transport().send(token,body);
      const raw=schema().outputText(data);
      if(!raw)throw new Error('No structured question response was returned.');
      const parsed=JSON.parse(raw);
      if(job){
        job.apiSuccessByStage=increment(job.apiSuccessByStage,checkpoint);
        job.lastSuccessfulApiStage=checkpoint;
        job.lastSuccessfulApiAt=new Date().toISOString();
      }
      return parsed;
    }catch(error){
      if(!(isNetwork(error)||/408|409|425|429|500|502|503|504/.test(String(error?.message||''))))throw error;
      if(job){
        job.status='paused';
        job.lastError=String(error.message||error);
        job.lastMessage=`Connection interrupted during ${label}. Progress saved.`;
        if(persist)saveJob(job);
        else document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
      }
      if(navigator.onLine===false)await new Promise(resolve=>window.addEventListener('online',resolve,{once:true}));
      await wait(Math.min(60000,2000*Math.pow(2,Math.min(attempt,5))));
      if(job){
        job.status='active';
        job.lastMessage=`Connection restored. Resuming ${label}.`;
        if(persist)saveJob(job);
        else document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
      }
    }
  }
}

function tierSequence(startTier){
  const tiers=schema().REPAIR_TIERS;
  if(startTier===tiers.fields)return[tiers.fields,tiers.questions,tiers.set];
  if(startTier===tiers.questions)return[tiers.questions,tiers.set];
  return[tiers.set];
}

function beginRepair(job,config,stage,errors,plan,step,total){
  const trimmed=(errors||[]).slice(0,errorLimit());
  job.status='repairing';
  job.repair={
    stageId:stage.id,
    stageLabel:stage.label,
    tier:plan.tier,
    tierLabel:plan.label,
    step,
    total,
    errors:trimmed,
    questionNumbers:plan.questionNumbers,
    fields:plan.fields,
    exhausted:false,
    startedAt:job.repair?.startedAt||new Date().toISOString()
  };
  job.lastError=errorSummary(trimmed,8);
  const count=errors.length;
  emitJob(job,config,`${stage.label} found ${count} validation issue${count===1?'':'s'}. ${plan.label} ${step}/${total}…`);
}

function exhaustRepair(job,config,stage,errors,lastValidSet,usedTiers){
  job.currentSet=lastValidSet;
  job.status='paused';
  job.repair={
    stageId:stage.id,
    stageLabel:stage.label,
    tier:usedTiers.at(-1)||null,
    attemptedTiers:usedTiers,
    errors:(errors||[]).slice(0,errorLimit()),
    exhausted:true,
    stoppedAt:new Date().toISOString()
  };
  job.lastError=errorSummary(errors,8);
  job.lastMessage=`${stage.label} stopped after targeted field, affected-question and full-set repair were exhausted: ${errorSummary(errors)}`;
  if(config.persist!==false)saveJob(job);
  else document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
  throw new Error(job.lastMessage);
}

function finishRepair(job){
  job.status='active';
  delete job.repair;
  delete job.lastError;
}

async function repairCandidate(stage,config,job,candidate,lastValidSet,validationStage,reshuffle){
  let errors=schema().validate(candidate,config,validationStage);
  if(!errors.length)return candidate;

  const initialPlan=schema().repairPlan(errors,candidate);
  const sequence=tierSequence(initialPlan.tier);
  const usedTiers=[];

  for(let index=0;index<sequence.length&&errors.length;index++){
    let tier=sequence[index];
    const natural=schema().repairPlan(errors,candidate).tier;
    if(natural===schema().REPAIR_TIERS.set)tier=schema().REPAIR_TIERS.set;
    if(usedTiers.includes(tier))continue;

    const plan=schema().repairPlan(errors,candidate,tier);
    const step=usedTiers.length+1;
    const total=sequence.length;
    beginRepair(job,config,stage,errors,plan,step,total);
    const prompt=schema().targetedRepairPrompt(
      validationStage,
      config,
      plan,
      candidate,
      step,
      total,
      lastValidSet
    );
    const response=await request(
      config.apiKey,
      schema().repairRequestBody(prompt,config.knowledge,`ukmla_${validationStage}_${tier}_repair_v4`,tier),
      `${stage.label} — ${plan.label}`,
      job,
      stage.id,
      config.persist!==false
    );
    candidate=schema().applyRepair(candidate,response,plan);
    if(reshuffle)candidate=schema().balancedShuffle(candidate);
    errors=schema().validate(candidate,config,validationStage);
    usedTiers.push(tier);

    if(errors.length&&tier!==schema().REPAIR_TIERS.set){
      const next=schema().nextRepairTier(tier,errors,candidate);
      const nextPosition=sequence.indexOf(next);
      if(nextPosition>index+1)index=nextPosition-1;
    }
  }

  if(errors.length)exhaustRepair(job,config,stage,errors,lastValidSet,usedTiers);
  finishRepair(job);
  return candidate;
}

async function runRemoteStage(stage,config,job){
  const lastValidSet=job.currentSet;
  const initialPrompt=stage.id==='generation'
    ?schema().generationPrompt(config)
    :schema().checkpointPrompt(stage.id,{...config,currentSet:lastValidSet});
  const initial=await request(
    config.apiKey,
    schema().requestBody(initialPrompt,config.knowledge,`ukmla_${stage.id}_v3`),
    stage.label,
    job,
    stage.id,
    config.persist!==false
  );
  job.currentSet=await repairCandidate(stage,config,job,initial,lastValidSet,stage.id,false);
}

async function runFinalValidation(stage,config,job){
  const lastValidSet=job.currentSet;
  job.currentSet=await repairCandidate(stage,config,job,job.currentSet,lastValidSet,'final',true);
}

function stageCount(map,stageId){return Number(map?.[stageId]||0);}

function recordStageTiming(job,stage,startedAt,apiBefore,successBefore){
  job.stageTimings=Array.isArray(job.stageTimings)?job.stageTimings:[];
  job.stageTimings.push({
    stageId:stage.id,
    label:stage.label,
    durationMs:Math.max(0,Date.now()-startedAt),
    apiAttempts:Math.max(0,Number(job.apiCalls||0)-apiBefore),
    successfulApiCalls:Math.max(0,stageCount(job.apiSuccessByStage,stage.id)-successBefore),
    completedAt:new Date().toISOString()
  });
}

function remoteStageIds(stages){
  return stages.filter(stage=>!stage.local).map(stage=>stage.id);
}

function initialiseCheckpointTelemetry(job,stages){
  job.apiAttemptsByStage=job.apiAttemptsByStage&&typeof job.apiAttemptsByStage==='object'?job.apiAttemptsByStage:{};
  job.apiSuccessByStage=job.apiSuccessByStage&&typeof job.apiSuccessByStage==='object'?job.apiSuccessByStage:{};
  job.completedStageIds=Array.isArray(job.completedStageIds)?job.completedStageIds:[];
  job.requiredApiStages=remoteStageIds(stages);

  for(const timing of job.stageTimings||[]){
    if(!timing?.stageId||!job.requiredApiStages.includes(timing.stageId))continue;
    if(stageCount(job.apiSuccessByStage,timing.stageId)===0&&timing.stageId!=='sba_audit'){
      job.apiSuccessByStage[timing.stageId]=Math.max(1,Number(timing.successfulApiCalls||0));
    }
    if(!job.completedStageIds.includes(timing.stageId))job.completedStageIds.push(timing.stageId);
  }

  const auditIndex=stages.findIndex(stage=>stage.id==='sba_audit');
  if(auditIndex>=0&&job.currentSet&&Number(job.currentIndex||0)>auditIndex&&stageCount(job.apiSuccessByStage,'sba_audit')<1){
    job.currentIndex=auditIndex;
    job.currentStage='sba_audit';
    job.percent=auditIndex?stages[auditIndex-1].percent:5;
    job.status='active';
    job.lastMessage='Required SBA audit was missing. Resuming at the model audit checkpoint.';
  }
}

function assertRequiredApiCheckpoints(job,stages){
  const required=remoteStageIds(stages);
  const missing=required.filter(stageId=>stageCount(job.apiSuccessByStage,stageId)<1);
  if(missing.length){
    throw new Error(`Question build cannot render because required API checkpoint${missing.length===1?'':'s'} did not complete: ${missing.map(id=>schema().stageLabel?.(id)||id).join(', ')}.`);
  }
  const combined=schema().PIPELINE_MODES&&job.pipelineMode===schema().PIPELINE_MODES.combined;
  const auditRequired=combined&&schema().isSbaAuditEnabled?.()!==false;
  if(auditRequired&&stageCount(job.apiSuccessByStage,'sba_audit')<1){
    throw new Error('Question build cannot render because the independent single-best-answer API audit did not complete.');
  }
}

async function runPipeline(config){
  const pipelineMode=schema().resolvePipelineMode(config.job||null);
  const stages=schema().stagesForPipeline(pipelineMode).filter(stage=>!stage.knowledgeOnly||config.knowledge);
  const job=config.job||{
    version:6,
    id:config.jobId||`ai-job-${Date.now().toString(36)}`,
    status:'active',
    sourceType:config.knowledge?'knowledge':'ai',
    topic:config.topic,
    conditions:config.conditions,
    questionTypes:config.questionTypes,
    knowledge:config.knowledge,
    sourceTitle:config.sourceTitle||'',
    packId:config.packId||null,
    pipelineMode,
    currentIndex:0,
    currentSet:null,
    percent:5,
    apiCalls:0,
    apiAttemptsByStage:{},
    apiSuccessByStage:{},
    completedStageIds:[],
    stageTimings:[],
    lastMessage:'Source prepared',
    createdAt:new Date().toISOString()
  };
  job.pipelineMode=job.pipelineMode||pipelineMode;
  job.version=Math.max(Number(job.version)||0,6);
  initialiseCheckpointTelemetry(job,stages);
  if(config.persist!==false)saveJob(job);

  for(let index=job.currentIndex||0;index<stages.length;index++){
    const stage=stages[index];
    const stageStartedAt=Date.now();
    const apiBefore=Number(job.apiCalls||0);
    const successBefore=stageCount(job.apiSuccessByStage,stage.id);
    job.currentIndex=index;
    job.currentStage=stage.id;
    job.percent=Math.max(job.percent||0,index?stages[index-1].percent:5);
    job.status='active';
    delete job.repair;
    job.lastMessage=stage.label;
    if(config.persist!==false)saveJob(job);
    config.onProgress?.(stage.label,job.percent,stage.id,job.pipelineMode);

    if(stage.local){
      if(stage.id==='shuffle')job.currentSet=schema().balancedShuffle(job.currentSet);
      if(stage.id==='final'){
        assertRequiredApiCheckpoints(job,stages);
        await runFinalValidation(stage,config,job);
        job.currentSet.schemaVersion='ukmla-ai-quiz-v2';
        job.currentSet.sourceType=config.knowledge?'knowledge_dump':'ai';
        job.currentSet.packId=config.packId||null;
        job.currentSet.pipelineMode=job.pipelineMode;
        job.currentSet.buildTelemetry={
          pipelineMode:job.pipelineMode,
          apiCalls:Number(job.apiCalls||0),
          apiAttemptsByStage:{...job.apiAttemptsByStage},
          apiSuccessByStage:{...job.apiSuccessByStage},
          requiredApiStages:[...job.requiredApiStages],
          completedStageIds:[...job.completedStageIds],
          sbaAudit:{
            required:job.pipelineMode===schema().PIPELINE_MODES?.combined&&schema().isSbaAuditEnabled?.()!==false,
            successfulApiCalls:stageCount(job.apiSuccessByStage,'sba_audit')
          },
          startedAt:job.createdAt,
          completedAt:new Date().toISOString(),
          stageTimings:[...(job.stageTimings||[])]
        };
        job.currentSet.schedulerSnapshot={
          coverageCycle:core().coverageState().cycle,
          selectedConditionIds:config.conditions.map(item=>item.id||item.conditionId),
          priorityOrder:['topic_coverage','unseen_condition','weak_question_type','low_health','recency'],
          pipelineMode:job.pipelineMode
        };
      }
    }else{
      await runRemoteStage(stage,config,job);
    }

    recordStageTiming(job,stage,stageStartedAt,apiBefore,successBefore);
    if(!job.completedStageIds.includes(stage.id))job.completedStageIds.push(stage.id);
    if(stage.id==='final'&&job.currentSet?.buildTelemetry){
      job.currentSet.buildTelemetry.stageTimings=[...(job.stageTimings||[])];
      job.currentSet.buildTelemetry.completedStageIds=[...job.completedStageIds];
      job.currentSet.buildTelemetry.completedAt=new Date().toISOString();
    }
    job.currentIndex=index+1;
    job.percent=stage.percent;
    job.lastMessage=`${stage.label} completed`;
    if(config.persist!==false)saveJob(job);
    config.onProgress?.(job.lastMessage,job.percent,stage.id,job.pipelineMode);
  }

  assertRequiredApiCheckpoints(job,stages);
  job.status='complete';
  job.percent=100;
  job.lastMessage='Questions ready';
  if(config.persist!==false){
    saveJob(job);
    setTimeout(clearJob,500);
  }
  return job.currentSet;
}

async function storeSet(set){
  const type=set.sourceType==='knowledge_dump'?'knowledge':'ai';
  const record=await window.UKMLA_QUESTION_BANK?.storeSet(set,{
    sourceType:type,
    title:set.topic&&set.topic!=='All UKMLA topics'?set.topic:undefined,
    verificationLabel:type==='knowledge'?'Source-fidelity checkpoint passed':'All clinical checkpoints passed'
  });
  if(!record)throw new Error('The completed question set could not be saved in IndexedDB.');
  localStorage.removeItem(core().STORAGE.sets);
  return record;
}

window.UKMLA_V2_AI_ENGINE={runPipeline,loadJob,clearJob,storeSet};
})();