(function(){
'use strict';

const engine=window.UKMLA_V2_AI_ENGINE;
const schema=window.UKMLA_V2_AI_SCHEMA;
const transport=window.UKMLA_V2_AI_TRANSPORT;
if(!engine||!schema||!transport||engine.__questionLockRepairContinuation)return;
engine.__questionLockRepairContinuation=true;

const JOB_KEY='ukmlaV2AiJobV1';
const DERIVED_SET_ERRORS=new Set([
  'Question types are not unique.',
  'Targets are not unique.'
]);
const originalRunPipeline=engine.runPipeline.bind(engine);
const originalValidate=schema.validate.bind(schema);
const originalRepairPlan=schema.repairPlan.bind(schema);
const originalTargetedRepairPrompt=schema.targetedRepairPrompt.bind(schema);
const originalRepairRequestBody=schema.repairRequestBody.bind(schema);
const originalApplyRepair=schema.applyRepair.bind(schema);
const tiers=schema.REPAIR_TIERS;
const REGEN_TIER=tiers.set;
const QUESTION_TIER=tiers.questions;
const FIELD_TIER=tiers.fields;

let latestJob=null;
let latestValidation=null;
let latestLedger=null;

function core(){return window.UKMLA_V2;}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function clean(value){return String(value??'').trim();}
function unique(values){return[...new Set(values)];}
function questionNumber(error){const match=clean(error).match(/^Q(\d+)/i);return match?Number(match[1]):null;}
function expectedCondition(config,index){return config?.conditions?.[index]||null;}
function expectedConditionId(config,index){const item=expectedCondition(config,index);return item?.id||item?.conditionId||null;}
function expectedConditionName(config,index){const item=expectedCondition(config,index);return item?.name||item?.targetCondition||null;}
function expectedTopicName(config,index){const item=expectedCondition(config,index);return item?.topic||item?.topicName||null;}
function expectedTypeLabel(type){return schema.TYPES?.find?.(item=>item[0]===type)?.[1]||type;}
function isRetryable(error){return error instanceof TypeError||/network|fetch|offline|connection|load failed|408|409|425|429|500|502|503|504/i.test(clean(error?.message||error));}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function increment(map,key){const target=map&&typeof map==='object'?map:{};target[key]=Number(target[key]||0)+1;return target;}

function restoreImmutableMetadata(set,config){
  if(!set||!Array.isArray(set.questions))return set;
  if(set.questions.length>10)set.questions=set.questions.slice(0,10);
  set.questions.forEach((question,index)=>{
    if(!question||typeof question!=='object')return;
    const expected=expectedCondition(config,index);
    const type=config?.questionTypes?.[index];
    question.questionNumber=index+1;
    if(type){question.questionType=type;question.questionTypeLabel=expectedTypeLabel(type);}
    if(expected){
      const conditionId=expectedConditionId(config,index);
      const conditionName=expectedConditionName(config,index);
      if(conditionId)question.targetConditionId=conditionId;
      if(conditionName)question.targetCondition=conditionName;
      if(expected.topicId)question.topicId=expected.topicId;
      const topicName=expectedTopicName(config,index);
      if(topicName)question.topicName=topicName;
    }
  });
  return set;
}

function derivedAffectedNumbers(candidate,config){
  const affected=[];
  const questions=Array.isArray(candidate?.questions)?candidate.questions:[];
  for(let index=0;index<10;index++){
    const question=questions[index];
    if(!question){affected.push(index+1);continue;}
    if(Number(question.questionNumber)!==index+1)affected.push(index+1);
    if(config?.questionTypes?.[index]&&question.questionType!==config.questionTypes[index])affected.push(index+1);
    const conditionId=expectedConditionId(config,index);
    if(conditionId&&question.targetConditionId!==conditionId)affected.push(index+1);
  }
  const duplicatePositions=(values)=>{
    const positions=new Map();
    values.forEach((value,index)=>{
      if(!value)return;
      const rows=positions.get(value)||[];
      rows.push(index+1);
      positions.set(value,rows);
    });
    return[...positions.values()].filter(rows=>rows.length>1).flat();
  };
  affected.push(...duplicatePositions(questions.slice(0,10).map(question=>question?.questionType)));
  affected.push(...duplicatePositions(questions.slice(0,10).map(question=>question?.targetConditionId)));
  return unique(affected.filter(number=>number>=1&&number<=10)).sort((a,b)=>a-b);
}

function failedQuestionNumbers(errors,candidate,config){
  const list=(errors||[]).map(clean).filter(Boolean);
  const numbers=list.map(questionNumber).filter(Boolean);
  const globals=list.filter(error=>!questionNumber(error));
  if(globals.some(error=>/exactly ten questions/i.test(error)))numbers.push(...Array.from({length:10},(_,index)=>index+1));
  if(globals.some(error=>DERIVED_SET_ERRORS.has(error)))numbers.push(...derivedAffectedNumbers(candidate,config));
  const unknownGlobals=globals.filter(error=>!DERIVED_SET_ERRORS.has(error)&&!/exactly ten questions/i.test(error));
  if(unknownGlobals.length&&!numbers.length)numbers.push(...Array.from({length:10},(_,index)=>index+1));
  if(!numbers.length&&list.length)numbers.push(...derivedAffectedNumbers(candidate,config));
  return unique(numbers.filter(number=>number>=1&&number<=10)).sort((a,b)=>a-b);
}

function filteredErrors(errors,candidate,config){
  const list=(errors||[]).map(clean).filter(Boolean);
  const questionErrors=list.filter(error=>questionNumber(error));
  const globals=list.filter(error=>!questionNumber(error));
  const derivedOnly=questionErrors.length&&globals.length&&globals.every(error=>DERIVED_SET_ERRORS.has(error));
  if(derivedOnly)return questionErrors;
  if(globals.every(error=>DERIVED_SET_ERRORS.has(error))){
    const affected=derivedAffectedNumbers(candidate,config);
    if(affected.length)return affected.map(number=>`Q${number}: immutable question assignment changed.`);
  }
  return list;
}

function stageBounds(stageId,pipelineMode){
  const stages=schema.stagesForPipeline?.(pipelineMode)||schema.STAGES||[];
  const index=stages.findIndex(stage=>stage.id===stageId);
  if(index<0)return{start:0,end:100};
  return{start:index?Number(stages[index-1].percent)||0:5,end:Number(stages[index].percent)||100};
}

function ledgerFor(errors,candidate,config,stage){
  const stageId=latestJob?.currentStage||stage;
  const failed=failedQuestionNumbers(errors,candidate,config);
  const locked=10-failed.length;
  const bounds=stageBounds(stageId,latestJob?.pipelineMode||config?.pipelineMode);
  const percent=Math.round((bounds.start+(bounds.end-bounds.start)*(locked/10))*10)/10;
  return{
    stageId,
    validationStage:stage,
    locked,
    failed:failed.length,
    unresolvedQuestionNumbers:failed,
    percent,
    stageStartPercent:bounds.start,
    stageEndPercent:bounds.end,
    updatedAt:new Date().toISOString()
  };
}

function ledgerText(ledger,job){
  if(!ledger)return'';
  const unresolved=ledger.unresolvedQuestionNumbers||[];
  const parts=[`${ledger.locked}/10 locked`];
  if(unresolved.length)parts.push(`repairing ${unresolved.map(number=>`Q${number}`).join(', ')}`);
  else parts.push('checkpoint passed');
  if(job?.repair?.tierLabel)parts.push(job.repair.tierLabel);
  if(Number(job?.questionRepairRound||0)>0)parts.push(`repair round ${Number(job.questionRepairRound)}`);
  if(Number(job?.apiCalls||0)>0)parts.push(`API call ${Number(job.apiCalls)}`);
  return parts.join(' · ');
}

function applyLedger(job,ledger){
  if(!job||!ledger||job.currentStage!==ledger.stageId||job.status==='complete')return job;
  job.percent=Math.max(Number(job.percent)||0,Number(ledger.percent)||0);
  job.checkpointProgress=clone(ledger);
  const base=clean(job.lastMessage).replace(/\s+·\s+\d+\/10 locked.*$/,'');
  const detail=ledgerText(ledger,job);
  if(detail)job.lastMessage=`${base||schema.stageLabel?.(ledger.stageId)||'Validation checkpoint'} · ${detail}`;
  return job;
}

function updateProgressDetail(job){
  const status=document.getElementById?.('ai-status');
  if(!status)return;
  let detail=document.getElementById('ai-question-lock-progress');
  if(!detail){
    detail=document.createElement('small');
    detail.id='ai-question-lock-progress';
    detail.className='question-source-note';
    status.insertAdjacentElement('afterend',detail);
  }
  const valid=job?.status!=='complete'&&job?.checkpointProgress?.stageId===job?.currentStage;
  const text=valid?ledgerText(job.checkpointProgress,job):'';
  if(detail.textContent!==text)detail.textContent=text;
  detail.hidden=!text;
}

function emitJob(job,config){
  const detail=applyLedger(job,latestLedger);
  detail.updatedAt=new Date().toISOString();
  if(config?.persist!==false)core()?.saveJson?.(JOB_KEY,detail);
  document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail}));
  config?.onProgress?.(detail.lastMessage,detail.percent,detail.currentStage,detail.pipelineMode);
  latestJob=detail;
}

function publishLedger(config){
  if(!latestLedger)return;
  const existing=(config?.persist!==false?engine.loadJob?.():null)||latestJob;
  if(!existing||(!existing.id&&!existing.currentStage))return;
  const source=clone(existing);
  if(!source.currentStage)source.currentStage=latestLedger.stageId;
  if(latestValidation?.candidate)source.currentSet=clone(latestValidation.candidate);
  if(!source.status)source.status='repairing';
  emitJob(source,config);
}

function lockedSnapshots(candidate,failed){
  const unresolved=new Set(failed||[]);
  const snapshots={};
  (candidate?.questions||[]).slice(0,10).forEach((question,index)=>{
    const number=index+1;
    if(!unresolved.has(number)&&question)snapshots[number]=clone(question);
  });
  return snapshots;
}

schema.validate=function validateWithQuestionLocks(set,config,stage='final'){
  restoreImmutableMetadata(set,config);
  const errors=originalValidate(set,config,stage);
  const ledger=ledgerFor(errors,set,config,stage);
  const stageChanged=latestValidation?.stage!==stage||latestValidation?.stageId!==ledger.stageId;
  const previousSnapshots=stageChanged?{}:(latestValidation?.lockedSnapshots||{});
  const snapshots={...previousSnapshots,...lockedSnapshots(set,ledger.unresolvedQuestionNumbers)};
  latestValidation={
    stage,
    stageId:ledger.stageId,
    config,
    candidate:clone(set),
    errors:[...errors],
    lockedSnapshots:snapshots
  };
  latestLedger=ledger;
  return errors;
};

schema.repairPlan=function questionLockedRepairPlan(errors,candidate,forcedTier){
  const config=latestValidation?.config;
  const stage=latestValidation?.stage||latestJob?.currentStage||'final';
  const ledger=ledgerFor(errors,candidate,config,stage);
  const previousSnapshots=latestValidation?.lockedSnapshots||{};
  latestValidation={
    ...(latestValidation||{}),
    stage,
    stageId:ledger.stageId,
    config,
    candidate:clone(candidate),
    errors:[...(errors||[])],
    lockedSnapshots:{...previousSnapshots,...lockedSnapshots(candidate,ledger.unresolvedQuestionNumbers)}
  };
  latestLedger=ledger;
  publishLedger(config);
  const filtered=filteredErrors(errors,candidate,config);
  const plan=originalRepairPlan(filtered,candidate,forcedTier);
  if(plan.tier===REGEN_TIER){
    const numbers=failedQuestionNumbers(filtered,candidate,config);
    return{...plan,label:'Question regeneration',questionNumbers:numbers.length?numbers:Array.from({length:10},(_,index)=>index+1),fields:[]};
  }
  return plan;
};

function sourceTargets(config,numbers){
  const wanted=new Set(numbers||[]);
  return(config?.conditions||[]).map((item,index)=>({
    questionNumber:index+1,
    conditionId:item.id||item.conditionId,
    topicId:item.topicId,
    topicName:item.topic||item.topicName,
    name:item.name||item.targetCondition,
    profile:item.profile||'clinical',
    fields:item.fields,
    labels:item.labels,
    sourceRefs:item.sourceRefs||[]
  })).filter(item=>wanted.has(item.questionNumber));
}

function affectedQuestions(candidate,numbers){
  const wanted=new Set(numbers||[]);
  return(candidate?.questions||[]).filter((question,index)=>wanted.has(Number(question?.questionNumber)||index+1));
}

schema.targetedRepairPrompt=function questionLockedRepairPrompt(stage,config,plan,candidate,step,total,lastValidSet){
  if(plan.tier!==REGEN_TIER)return originalTargetedRepairPrompt(stage,config,plan,candidate,step,total,lastValidSet);
  return`The ${schema.stageLabel?.(stage)||stage} checkpoint still has unresolved questions.

QUESTION REGENERATION ${step} OF ${total}
Return complete corrected question objects only for question numbers ${plan.questionNumbers.join(', ')}. Passing questions are locked, omitted from this request and must not be returned. Rebuild each unresolved question from its original source card and assigned question type. Preserve its question number, target, topic, answer proposition and all required metadata.

FAILED VALIDATION:
${plan.errors.map(error=>`- ${error}`).join('\n')}

CHECKPOINT REQUIREMENT:
${schema.checkpointInstruction(stage)}

UNRESOLVED QUESTIONS:
${JSON.stringify(affectedQuestions(candidate,plan.questionNumbers))}

ORIGINAL SOURCE TARGETS:
${JSON.stringify(sourceTargets(config,plan.questionNumbers))}`;
};

schema.repairRequestBody=function questionLockedRepairBody(prompt,knowledge,name,tier){
  if(tier!==REGEN_TIER)return originalRepairRequestBody(prompt,knowledge,name,tier);
  return originalRepairRequestBody(prompt,knowledge,name,QUESTION_TIER);
};

schema.applyRepair=function applyQuestionLockedRepair(candidate,response,plan){
  const effectivePlan=plan.tier===REGEN_TIER?{...plan,tier:QUESTION_TIER}:plan;
  const next=originalApplyRepair(candidate,response,effectivePlan);
  const allowed=new Set(plan.questionNumbers||[]);
  for(const[number,snapshot]of Object.entries(latestValidation?.lockedSnapshots||{})){
    const numeric=Number(number);
    if(allowed.has(numeric))continue;
    if(next?.questions?.[numeric-1])next.questions[numeric-1]=clone(snapshot);
  }
  return restoreImmutableMetadata(next,latestValidation?.config);
};

if(schema.REPAIR_TIER_LABELS)schema.REPAIR_TIER_LABELS[REGEN_TIER]='Question regeneration';

function isExhaustedValidationRepair(error,job){
  const message=clean(error?.message||error);
  return Boolean(job?.repair?.exhausted)&&/targeted field, affected-question and full-set repair were exhausted/i.test(message);
}

function tierSequence(startTier){
  if(startTier===FIELD_TIER)return[FIELD_TIER,QUESTION_TIER,REGEN_TIER];
  if(startTier===QUESTION_TIER)return[QUESTION_TIER,REGEN_TIER];
  return[REGEN_TIER];
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
    emitJob(job,config);
    try{
      const parsed=parseResponse(await transport.send(config.apiKey,body));
      job.apiSuccessByStage=increment(job.apiSuccessByStage,stageId);
      job.lastSuccessfulApiStage=stageId;
      job.lastSuccessfulApiAt=new Date().toISOString();
      return parsed;
    }catch(error){
      if(!isRetryable(error))throw error;
      job.lastError=clean(error.message||error);
      job.lastMessage=`Connection interrupted during ${label}. The locked questions are preserved; retrying automatically.`;
      emitJob(job,config);
      await wait(Math.min(60000,2000*Math.pow(2,Math.min(attempt,5))));
    }
  }
}

async function continueUnresolvedQuestions(config,saved){
  let candidate=clone(latestValidation?.candidate||saved.currentSet);
  const validationStage=latestValidation?.stage||saved.currentStage;
  const stageId=saved.currentStage||latestValidation?.stageId;
  const stageLabel=schema.stageLabel?.(stageId)||saved.repair?.stageLabel||'Validation checkpoint';
  restoreImmutableMetadata(candidate,config);
  let errors=schema.validate(candidate,config,validationStage);

  let repairRound=Number(saved.questionRepairRound||0);
  while(errors.length){
    repairRound+=1;
    saved.questionRepairRound=repairRound;
    const initialPlan=schema.repairPlan(errors,candidate);
    const sequence=tierSequence(initialPlan.tier);

    for(let index=0;index<sequence.length&&errors.length;index++){
      const tier=sequence[index];
      const plan=schema.repairPlan(errors,candidate,tier);
      saved.status='repairing';
      saved.currentSet=clone(candidate);
      saved.repair={
        stageId,
        stageLabel,
        tier:plan.tier,
        tierLabel:plan.label,
        step:index+1,
        total:sequence.length,
        errors:[...errors],
        questionNumbers:[...(plan.questionNumbers||[])],
        fields:clone(plan.fields||[]),
        exhausted:false,
        questionLocked:true,
        round:repairRound,
        startedAt:saved.repair?.startedAt||new Date().toISOString()
      };
      saved.lastError=errors.slice(0,8).join(' ');
      latestLedger=ledgerFor(errors,candidate,config,validationStage);
      const prompt=schema.targetedRepairPrompt(validationStage,config,plan,candidate,index+1,sequence.length,saved.currentSet);
      const body=schema.repairRequestBody(prompt,config.knowledge,`ukmla_${validationStage}_${tier}_locked_repair_v1`,tier);
      const response=await requestRepair(config,saved,stageId,`${stageLabel} — ${plan.label}`,body);
      candidate=schema.applyRepair(candidate,response,plan);
      if(stageId==='final')candidate=schema.balancedShuffle(candidate);
      errors=schema.validate(candidate,config,validationStage);
      saved.currentSet=clone(candidate);
      emitJob(saved,config);
    }
  }

  const bounds=stageBounds(stageId,saved.pipelineMode);
  saved.currentSet=candidate;
  saved.status='active';
  saved.percent=bounds.end;
  saved.currentIndex=Number(saved.currentIndex||0)+1;
  saved.completedStageIds=Array.isArray(saved.completedStageIds)?saved.completedStageIds:[];
  if(!saved.completedStageIds.includes(stageId))saved.completedStageIds.push(stageId);
  saved.lastMessage=`${stageLabel} completed · 10/10 locked`;
  saved.checkpointProgress={...latestLedger,locked:10,failed:0,unresolvedQuestionNumbers:[],percent:bounds.end};
  delete saved.repair;
  delete saved.lastError;
  latestLedger=saved.checkpointProgress;
  emitJob(saved,config);
  return saved;
}

document.addEventListener('ukmlaV2AiProgress',event=>{
  const detail=event.detail;
  if(!detail)return;
  latestJob=detail;
  if(detail.checkpointProgress?.stageId&&detail.checkpointProgress.stageId!==detail.currentStage)delete detail.checkpointProgress;
  if(latestLedger&&detail.currentStage===latestLedger.stageId&&detail.status!=='complete')applyLedger(detail,latestLedger);
  if(detail.repair?.exhausted&&latestValidation?.candidate){
    detail.status='repairing';
    detail.currentSet=clone(latestValidation.candidate);
    detail.lastMessage=`${detail.repair.stageLabel||schema.stageLabel?.(detail.currentStage)||'Validation checkpoint'} · continuing unresolved question repair`;
    applyLedger(detail,latestLedger);
  }
  updateProgressDetail(detail);
});

document.addEventListener('ukmlaWorkspaceMounted',()=>updateProgressDetail(latestJob));
window.addEventListener('hashchange',()=>setTimeout(()=>updateProgressDetail(latestJob),0));

engine.runPipeline=async function runPipelineWithQuestionLocks(config={}){
  let resumeJob=config.job||null;
  while(true){
    try{
      return await originalRunPipeline({...config,job:resumeJob});
    }catch(error){
      const saved=(config.persist!==false?engine.loadJob?.():null)||latestJob;
      if(!isExhaustedValidationRepair(error,saved))throw error;
      resumeJob=await continueUnresolvedQuestions(config,clone(saved));
    }
  }
};

window.UKMLA_AI_QUESTION_LOCK_REPAIR={
  failedQuestionNumbers,
  restoreImmutableMetadata,
  ledgerFor,
  ledgerText
};
})();
