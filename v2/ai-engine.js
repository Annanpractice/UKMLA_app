(function(){
'use strict';

const JOB_KEY='ukmlaV2AiJobV1';
const DEFAULT_AUTO_REPAIRS=3;

function core(){return window.UKMLA_V2;}
function schema(){return window.UKMLA_V2_AI_SCHEMA;}
function transport(){return window.UKMLA_V2_AI_TRANSPORT;}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function isNetwork(error){return error instanceof TypeError||/network|fetch|offline|connection|load failed/i.test(String(error?.message||error));}
function saveJob(job){job.updatedAt=new Date().toISOString();core().saveJson(JOB_KEY,job);document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));}
function loadJob(){return core().loadJson(JOB_KEY,null);}
function clearJob(){localStorage.removeItem(JOB_KEY);}
function repairLimit(){return Number(schema().AUTO_REPAIR?.maxAttempts)||DEFAULT_AUTO_REPAIRS;}
function errorLimit(){return Number(schema().AUTO_REPAIR?.maxErrors)||20;}
function errorSummary(errors,limit=4){return(errors||[]).slice(0,limit).join(' ');}

function emitJob(job,config,message){
  job.lastMessage=message;
  if(config.persist!==false)saveJob(job);
  else document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
  config.onProgress?.(message,job.percent,job.currentStage);
}

async function request(token,body,label,job){
  let attempt=0;
  while(true){
    attempt++;
    try{
      document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:{...job,lastMessage:attempt===1?label:`${label} — reconnecting attempt ${attempt}`}}));
      const data=await transport().send(token,body);
      const raw=schema().outputText(data);
      if(!raw)throw new Error('No structured question set was returned.');
      return JSON.parse(raw);
    }catch(error){
      if(!(isNetwork(error)||/408|409|425|429|500|502|503|504/.test(String(error?.message||''))))throw error;
      if(job){
        job.status='paused';
        job.lastError=String(error.message||error);
        job.lastMessage=`Connection interrupted during ${label}. Progress saved.`;
        saveJob(job);
      }
      if(navigator.onLine===false)await new Promise(resolve=>window.addEventListener('online',resolve,{once:true}));
      await wait(Math.min(60000,2000*Math.pow(2,Math.min(attempt,5))));
      if(job){
        job.status='active';
        job.lastMessage=`Connection restored. Resuming ${label}.`;
        saveJob(job);
      }
    }
  }
}

function beginRepair(job,config,stage,errors,attempt,maxAttempts){
  const trimmed=(errors||[]).slice(0,errorLimit());
  job.status='repairing';
  job.repair={
    stageId:stage.id,
    stageLabel:stage.label,
    attempt,
    maxAttempts,
    errors:trimmed,
    exhausted:false,
    startedAt:job.repair?.startedAt||new Date().toISOString()
  };
  job.lastError=errorSummary(trimmed,8);
  const count=errors.length;
  emitJob(job,config,`${stage.label} found ${count} validation issue${count===1?'':'s'}. Automatic repair ${attempt}/${maxAttempts}…`);
}

function exhaustRepair(job,config,stage,errors,lastValidSet,maxAttempts){
  job.currentSet=lastValidSet;
  job.status='paused';
  job.repair={
    stageId:stage.id,
    stageLabel:stage.label,
    attempt:maxAttempts,
    maxAttempts,
    errors:(errors||[]).slice(0,errorLimit()),
    exhausted:true,
    stoppedAt:new Date().toISOString()
  };
  job.lastError=errorSummary(errors,8);
  job.lastMessage=`${stage.label} stopped after ${maxAttempts} automatic repair attempts: ${errorSummary(errors)}`;
  if(config.persist!==false)saveJob(job);
  else document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
  throw new Error(job.lastMessage);
}

function finishRepair(job){
  job.status='active';
  delete job.repair;
  delete job.lastError;
}

async function runRemoteStage(stage,config,job){
  const lastValidSet=job.currentSet;
  const initialPrompt=stage.id==='generation'
    ?schema().generationPrompt(config)
    :schema().checkpointPrompt(stage.id,{...config,currentSet:lastValidSet});
  let candidate=await request(
    config.apiKey,
    schema().requestBody(initialPrompt,config.knowledge,`ukmla_${stage.id}_v2`),
    stage.label,
    config.persist===false?null:job
  );
  let errors=schema().validate(candidate,config,stage.id);
  const maxAttempts=repairLimit();
  let attempt=0;

  while(errors.length&&attempt<maxAttempts){
    attempt++;
    beginRepair(job,config,stage,errors,attempt,maxAttempts);
    const prompt=schema().repairPrompt(stage.id,{
      ...config,
      currentSet:lastValidSet,
      failedSet:candidate
    },errors,attempt,maxAttempts);
    candidate=await request(
      config.apiKey,
      schema().requestBody(prompt,config.knowledge,`ukmla_${stage.id}_repair_${attempt}_v2`),
      `${stage.label} — automatic repair ${attempt}/${maxAttempts}`,
      config.persist===false?null:job
    );
    errors=schema().validate(candidate,config,stage.id);
  }

  if(errors.length)exhaustRepair(job,config,stage,errors,lastValidSet,maxAttempts);
  job.currentSet=candidate;
  finishRepair(job);
}

async function runFinalValidation(stage,config,job){
  const lastSet=job.currentSet;
  let candidate=job.currentSet;
  let errors=schema().validate(candidate,config,'final');
  if(!errors.length)return;

  const maxAttempts=repairLimit();
  let attempt=0;
  while(errors.length&&attempt<maxAttempts){
    attempt++;
    beginRepair(job,config,stage,errors,attempt,maxAttempts);
    const prompt=schema().repairPrompt('final',{
      ...config,
      currentSet:lastSet,
      failedSet:candidate
    },errors,attempt,maxAttempts);
    candidate=await request(
      config.apiKey,
      schema().requestBody(prompt,config.knowledge,`ukmla_final_repair_${attempt}_v2`),
      `Final validation — automatic repair ${attempt}/${maxAttempts}`,
      config.persist===false?null:job
    );
    candidate=schema().balancedShuffle(candidate);
    errors=schema().validate(candidate,config,'final');
  }

  if(errors.length)exhaustRepair(job,config,stage,errors,lastSet,maxAttempts);
  job.currentSet=candidate;
  finishRepair(job);
}

async function runPipeline(config){
  const stages=schema().STAGES.filter(stage=>!stage.knowledgeOnly||config.knowledge);
  const job=config.job||{
    version:3,
    id:config.jobId||`ai-job-${Date.now().toString(36)}`,
    status:'active',
    sourceType:config.knowledge?'knowledge':'ai',
    topic:config.topic,
    conditions:config.conditions,
    questionTypes:config.questionTypes,
    knowledge:config.knowledge,
    sourceTitle:config.sourceTitle||'',
    packId:config.packId||null,
    currentIndex:0,
    currentSet:null,
    percent:5,
    lastMessage:'Source prepared',
    createdAt:new Date().toISOString()
  };
  if(config.persist!==false)saveJob(job);

  for(let index=job.currentIndex||0;index<stages.length;index++){
    const stage=stages[index];
    job.currentIndex=index;
    job.currentStage=stage.id;
    job.percent=Math.max(job.percent||0,index?stages[index-1].percent:5);
    job.status='active';
    delete job.repair;
    job.lastMessage=stage.label;
    if(config.persist!==false)saveJob(job);
    config.onProgress?.(stage.label,job.percent,stage.id);

    if(stage.local){
      if(stage.id==='shuffle')job.currentSet=schema().balancedShuffle(job.currentSet);
      if(stage.id==='final'){
        await runFinalValidation(stage,config,job);
        job.currentSet.schemaVersion='ukmla-ai-quiz-v2';
        job.currentSet.sourceType=config.knowledge?'knowledge_dump':'ai';
        job.currentSet.packId=config.packId||null;
        job.currentSet.schedulerSnapshot={
          coverageCycle:core().coverageState().cycle,
          selectedConditionIds:config.conditions.map(item=>item.id||item.conditionId),
          priorityOrder:['topic_coverage','unseen_condition','weak_question_type','low_health','recency']
        };
      }
    }else{
      await runRemoteStage(stage,config,job);
    }

    job.currentIndex=index+1;
    job.percent=stage.percent;
    job.lastMessage=`${stage.label} completed`;
    if(config.persist!==false)saveJob(job);
    config.onProgress?.(job.lastMessage,job.percent,stage.id);
  }

  job.status='complete';
  job.percent=100;
  job.lastMessage='Questions ready';
  if(config.persist!==false){
    saveJob(job);
    setTimeout(clearJob,500);
  }
  return job.currentSet;
}

function storeSet(set){
  const type=set.sourceType==='knowledge_dump'?'knowledge':'ai';
  const bankRecord=window.UKMLA_QUESTION_BANK?.storeSet(set,{
    sourceType:type,
    title:set.topic&&set.topic!=='All UKMLA topics'?set.topic:undefined,
    verificationLabel:type==='knowledge'?'Source-fidelity checkpoint passed':'All clinical checkpoints passed'
  })||null;
  const sets=core().loadJson(core().STORAGE.sets,[]);
  if(!sets.some(item=>item.quizId===set.quizId))sets.unshift(set);
  core().saveJson(core().STORAGE.sets,sets.slice(0,30));
  return bankRecord;
}

window.UKMLA_V2_AI_ENGINE={runPipeline,loadJob,clearJob,storeSet};
})();
