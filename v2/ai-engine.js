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

async function runPipeline(config){
  const stages=schema().STAGES.filter(stage=>!stage.knowledgeOnly||config.knowledge);
  const job=config.job||{
    version:2,
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
    job.lastMessage=stage.label;
    if(config.persist!==false)saveJob(job);
    config.onProgress?.(stage.label,job.percent,stage.id);

    if(stage.local){
      if(stage.id==='shuffle')job.currentSet=schema().balancedShuffle(job.currentSet);
      if(stage.id==='final'){
        const errors=schema().validate(job.currentSet,config,'final');
        if(errors.length)throw new Error(`Final validation failed: ${errors.slice(0,4).join(' ')}`);
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
      const prompt=stage.id==='generation'
        ?schema().generationPrompt(config)
        :schema().checkpointPrompt(stage.id,{...config,currentSet:job.currentSet});
      job.currentSet=await request(
        config.apiKey,
        schema().requestBody(prompt,config.knowledge,`ukmla_${stage.id}_v2`),
        stage.label,
        config.persist===false?null:job
      );
      const errors=schema().validate(job.currentSet,config,stage.id);
      if(errors.length)throw new Error(`${stage.label} failed: ${errors.slice(0,4).join(' ')}`);
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
