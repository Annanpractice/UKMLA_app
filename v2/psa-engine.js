(function(){
  'use strict';

  const KEYS={
    papers:'ukmlaPsaPapersV1',
    generationJob:'ukmlaPsaGenerationJobV1',
    activeSessions:'ukmlaPsaActiveSessionsV1',
    attempts:'ukmlaPsaAttemptsV1',
    markingJob:'ukmlaPsaMarkingJobV1'
  };

  function core(){return window.UKMLA_V2;}
  function schema(){return window.UKMLA_PSA_SCHEMA;}
  function transport(){return window.UKMLA_V2_AI_TRANSPORT;}
  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function clean(value){return String(value??'').trim();}
  function normaliseUnit(value){return clean(value).toLowerCase().replace(/μ/g,'micro').replace(/µ/g,'micro').replace(/\s+/g,'').replace(/per/g,'/');}
  function isRecoverable(error){return error instanceof TypeError||/network|fetch|offline|connection|load failed|408|409|425|429|500|502|503|504/i.test(String(error?.message||error));}
  function save(key,value){core().saveJson(key,value);}
  function load(key,fallback){return core().loadJson(key,fallback);}
  function saveGenerationJob(job){job.updatedAt=new Date().toISOString();save(KEYS.generationJob,job);document.dispatchEvent(new CustomEvent('ukmlaPsaGenerationProgress',{detail:job}));}
  function loadGenerationJob(){return load(KEYS.generationJob,null);}
  function clearGenerationJob(){localStorage.removeItem(KEYS.generationJob);}
  function saveMarkingJob(job){job.updatedAt=new Date().toISOString();save(KEYS.markingJob,job);document.dispatchEvent(new CustomEvent('ukmlaPsaMarkingProgress',{detail:job}));}
  function loadMarkingJob(){return load(KEYS.markingJob,null);}
  function clearMarkingJob(){localStorage.removeItem(KEYS.markingJob);}

  async function request(token,body,label,job,saveJob){
    let attempt=0;
    while(true){
      attempt++;
      try{
        document.dispatchEvent(new CustomEvent('ukmlaPsaApiProgress',{detail:{label,attempt}}));
        const data=await transport().send(token,body);
        const raw=schema().outputText(data);
        if(!raw)throw new Error('The API returned no structured response.');
        return JSON.parse(raw);
      }catch(error){
        if(!isRecoverable(error))throw error;
        if(job&&saveJob){job.status='paused';job.lastError=String(error.message||error);job.lastMessage=`Connection interrupted during ${label}. Progress saved.`;saveJob(job);}
        if(navigator.onLine===false)await new Promise(resolve=>window.addEventListener('online',resolve,{once:true}));
        await wait(Math.min(60000,2000*Math.pow(2,Math.min(attempt,5))));
        if(job&&saveJob){job.status='active';job.lastMessage=`Connection restored. Resuming ${label}.`;saveJob(job);}
      }
    }
  }

  function paperContext(config,counts){return{mode:config.mode,sectionCounts:counts,totalItems:Object.values(counts).reduce((sum,value)=>sum+value,0),durationSeconds:schema().timeForMode(config.mode,counts),openBook:true,permittedPracticeResource:'BNF navigation',originalQuestionsOnly:true};}
  function sectionIds(counts){return schema().SECTIONS.map(item=>item.id).filter(id=>counts[id]);}
  function overallGenerationPercent(job,sectionCount){const totalUnits=sectionCount*schema().GENERATION_STAGES.length;const completed=job.sectionIndex*schema().GENERATION_STAGES.length+job.stageIndex;return Math.min(99,Math.round(completed/totalUnits*100));}
  function validateWholePaper(paper,counts){
    const errors=[];
    const expectedTotal=Object.values(counts).reduce((sum,value)=>sum+value,0);
    if(paper.items.length!==expectedTotal)errors.push(`Paper has ${paper.items.length} items; expected ${expectedTotal}.`);
    for(const [sectionId,count] of Object.entries(counts)){
      const actual=paper.items.filter(item=>item.sectionId===sectionId).length;
      if(actual!==count)errors.push(`${sectionId} has ${actual} items; expected ${count}.`);
    }
    const ids=paper.items.map(item=>item.id);
    if(new Set(ids).size!==ids.length)errors.push('Item IDs are not unique.');
    const totalMarks=paper.items.reduce((sum,item)=>sum+Number(item.marks||0),0);
    if(totalMarks!==paper.totalMarks)errors.push(`Total marks calculate to ${totalMarks}, not ${paper.totalMarks}.`);
    return errors;
  }

  async function generatePaper(config){
    const counts=config.job?.counts||schema().countsForMode(config.mode,config.sectionId,config.count);
    const ids=sectionIds(counts);
    let job=config.job||{
      version:1,
      id:core().uid('psa-generation'),
      status:'active',
      mode:config.mode,
      sectionId:config.sectionId||'',
      counts,
      sectionIds:ids,
      sectionIndex:0,
      stageIndex:0,
      batches:{},
      percent:1,
      lastMessage:'PSA paper blueprint prepared.',
      createdAt:new Date().toISOString()
    };
    saveGenerationJob(job);
    const context=paperContext(config,counts);

    for(let sectionIndex=job.sectionIndex;sectionIndex<ids.length;sectionIndex++){
      const sectionId=ids[sectionIndex],count=counts[sectionId];
      let batch=job.batches[sectionId]||null;
      const startStage=sectionIndex===job.sectionIndex?job.stageIndex:0;
      for(let stageIndex=startStage;stageIndex<schema().GENERATION_STAGES.length;stageIndex++){
        const stage=schema().GENERATION_STAGES[stageIndex];
        job.sectionIndex=sectionIndex;job.stageIndex=stageIndex;job.currentSectionId=sectionId;job.currentStage=stage.id;job.status='active';job.percent=overallGenerationPercent(job,ids.length);job.lastMessage=`${schema().section(sectionId).label}: ${stage.label}`;saveGenerationJob(job);
        const prompt=stage.id==='generate'?schema().generationPrompt(sectionId,count,context):schema().checkpointPrompt(stage.id,sectionId,count,batch);
        batch=await request(config.apiKey,schema().requestBody(prompt,sectionId,count,`ukmla_psa_${sectionId}_${stage.id}`),job.lastMessage,job,saveGenerationJob);
        const errors=schema().validateBatch(batch,sectionId,count);
        if(errors.length)throw new Error(`${job.lastMessage} failed validation: ${errors.slice(0,4).join(' ')}`);
        job.batches[sectionId]=batch;job.stageIndex=stageIndex+1;job.percent=overallGenerationPercent(job,ids.length);job.lastMessage=`${schema().section(sectionId).label}: ${stage.label} completed`;saveGenerationJob(job);
      }
      job.sectionIndex=sectionIndex+1;job.stageIndex=0;job.percent=overallGenerationPercent(job,ids.length);saveGenerationJob(job);
    }

    const items=ids.flatMap(id=>job.batches[id].items);
    items.forEach((item,index)=>{item.paperNumber=index+1;});
    const paper={
      schemaVersion:'ukmla-psa-paper-v1',paperId:core().uid('psa-paper'),mode:job.mode,generatedAt:new Date().toISOString(),durationSeconds:schema().timeForMode(job.mode,counts),counts,totalItems:items.length,totalMarks:items.reduce((sum,item)=>sum+item.marks,0),items
    };
    const errors=validateWholePaper(paper,counts);
    if(errors.length)throw new Error(`Final paper validation failed: ${errors.join(' ')}`);
    const papers=load(KEYS.papers,[]);papers.unshift(paper);save(KEYS.papers,papers.slice(0,12));
    job.status='complete';job.percent=100;job.lastMessage=`${paper.totalItems}-item PSA paper ready.`;job.paperId=paper.paperId;saveGenerationJob(job);setTimeout(clearGenerationJob,700);
    return paper;
  }

  function latestPaper(){return load(KEYS.papers,[])[0]||null;}
  function paperById(id){return load(KEYS.papers,[]).find(item=>item.paperId===id)||null;}
  function saveSession(session){session.updatedAt=new Date().toISOString();const sessions=load(KEYS.activeSessions,{});sessions[session.deviceId||core().uid('device')]=session;save(KEYS.activeSessions,sessions);}
  function activeSession(){const sessions=load(KEYS.activeSessions,{});const device=localStorage.getItem(core().STORAGE.device);return device?sessions[device]||null:null;}
  function clearSession(session){const sessions=load(KEYS.activeSessions,{});delete sessions[session.deviceId];save(KEYS.activeSessions,sessions);}

  function exactSetEqual(a,b){const left=[...(a||[])].sort(),right=[...(b||[])].sort();return left.length===right.length&&left.every((value,index)=>value===right[index]);}
  function localMarkItem(item,answer){
    const result={itemId:item.id,sectionId:item.sectionId,awardedMarks:0,maxMarks:item.marks,safetyCritical:false,criterionResults:[],errorTags:[],feedback:'',markingSource:'local'};
    if(!answer){result.errorTags.push('unanswered');result.feedback='No answer was submitted.';return result;}
    if(item.responseMode==='single_select'){
      const correct=item.expectedAnswer.optionIds.includes(answer.optionId);result.awardedMarks=correct?item.marks:0;result.feedback=correct?'Correct option selected.':`Incorrect. ${item.rationale}`;if(!correct)result.errorTags.push('clinical_selection');return result;
    }
    if(item.responseMode==='multi_select'){
      const expected=item.expectedAnswer.reviewIds||[],selected=answer.reviewIds||[];const each=item.marks/Math.max(1,expected.length);const correctCount=expected.filter(id=>selected.includes(id)).length;result.awardedMarks=Math.min(item.marks,correctCount*each);if(selected.length!==expected.length)result.errorTags.push('selection_count');if(result.awardedMarks<item.marks)result.errorTags.push('prescription_review');result.feedback=`${correctCount}/${expected.length} unsafe prescriptions identified.`;return result;
    }
    if(item.responseMode==='numeric'){
      const value=Number(answer.numericValue),target=Number(item.expectedAnswer.numericValue),tolerance=Number(item.expectedAnswer.numericTolerance)||0;const valueCorrect=Number.isFinite(value)&&Math.abs(value-target)<=tolerance;const unitCorrect=(item.expectedAnswer.acceptedUnits||[]).map(normaliseUnit).includes(normaliseUnit(answer.unit));result.awardedMarks=(valueCorrect?item.marks/2:0)+(unitCorrect?item.marks/2:0);if(!valueCorrect)result.errorTags.push('calculation_value');if(!unitCorrect)result.errorTags.push('unit');result.safetyCritical=!valueCorrect&&target!==0&&Number.isFinite(value)&&(value>=target*10||value<=target/10);result.feedback=`Expected ${target} ${item.expectedAnswer.acceptedUnits[0]||''}.`;return result;
    }
    result.markingSource='ai';return result;
  }
  function answerRecord(item,answer){return{itemId:item.id,sectionId:item.sectionId,maxMarks:item.marks,stem:item.stem,context:item.context,responseMode:item.responseMode,response:answer||null,expectedAnswer:item.expectedAnswer,markingRubric:item.markingRubric,safetyCriticalErrors:item.safetyCriticalErrors,modelAnswer:item.modelAnswer};}
  function resultMap(results){return new Map((results||[]).map(item=>[item.itemId,item]));}
  function clampResult(result,item){const marks=Math.max(0,Math.min(item.marks,Number(result?.awardedMarks)||0));return{itemId:item.id,sectionId:item.sectionId,awardedMarks:marks,maxMarks:item.marks,safetyCritical:Boolean(result?.safetyCritical),criterionResults:Array.isArray(result?.criterionResults)?result.criterionResults:[],errorTags:Array.isArray(result?.errorTags)?result.errorTags:[],feedback:clean(result?.feedback),markingSource:result?.markingSource||'ai'};}
  function disputed(primary,audit){return Math.abs(Number(primary?.awardedMarks||0)-Number(audit?.awardedMarks||0))>=1||Boolean(primary?.safetyCritical)!==Boolean(audit?.safetyCritical);}

  async function markSession(config){
    const paper=config.paper,session=config.session;
    let job=config.job||{version:1,id:core().uid('psa-marking'),status:'active',paperId:paper.paperId,sessionId:session.sessionId,stageIndex:0,percent:1,lastMessage:'Preparing marking record.',localResults:[],primaryResults:[],safetyResults:[],adjudicatedResults:[],createdAt:new Date().toISOString()};
    saveMarkingJob(job);

    if(job.stageIndex<=0){
      job.currentStage='local';job.lastMessage='Deterministic objective marking';saveMarkingJob(job);
      job.localResults=paper.items.map(item=>localMarkItem(item,session.answers[item.id]));job.stageIndex=1;job.percent=18;saveMarkingJob(job);
    }
    const aiItems=paper.items.filter(item=>item.responseMode==='prescription');
    if(aiItems.length){
      const records=aiItems.map(item=>answerRecord(item,session.answers[item.id]));
      if(job.stageIndex<=1){
        job.currentStage='primary';job.lastMessage='Primary rubric marking';saveMarkingJob(job);
        const response=await request(config.apiKey,schema().markingRequest(schema().markingPrompt('primary',records),records.length,'ukmla_psa_primary_marking'),'Primary rubric marking',job,saveMarkingJob);
        job.primaryResults=response.results;job.stageIndex=2;job.percent=52;saveMarkingJob(job);
      }
      if(job.stageIndex<=2){
        job.currentStage='safety';job.lastMessage='Independent safety-critical audit';saveMarkingJob(job);
        const response=await request(config.apiKey,schema().markingRequest(schema().markingPrompt('safety',records,job.primaryResults),records.length,'ukmla_psa_safety_audit'),'Independent safety-critical audit',job,saveMarkingJob);
        job.safetyResults=response.results;job.stageIndex=3;job.percent=78;saveMarkingJob(job);
      }
      const primary=resultMap(job.primaryResults),safety=resultMap(job.safetyResults);
      const disputedRecords=records.filter(record=>disputed(primary.get(record.itemId),safety.get(record.itemId)));
      if(job.stageIndex<=3){
        job.currentStage='adjudication';job.lastMessage=disputedRecords.length?'Disagreement adjudication':'No marking disagreements detected';saveMarkingJob(job);
        if(disputedRecords.length){
          const prior=disputedRecords.map(record=>({itemId:record.itemId,primary:primary.get(record.itemId),safetyAudit:safety.get(record.itemId)}));
          const response=await request(config.apiKey,schema().markingRequest(schema().markingPrompt('adjudication',disputedRecords,prior),disputedRecords.length,'ukmla_psa_marking_adjudication'),'Disagreement adjudication',job,saveMarkingJob);
          job.adjudicatedResults=response.results;
        }else job.adjudicatedResults=[];
        job.stageIndex=4;job.percent=94;saveMarkingJob(job);
      }
    }else if(job.stageIndex<4){job.stageIndex=4;job.percent=94;job.lastMessage='No free-text prescriptions required AI marking.';saveMarkingJob(job);}

    const local=resultMap(job.localResults),primary=resultMap(job.primaryResults),safety=resultMap(job.safetyResults),adjudicated=resultMap(job.adjudicatedResults);
    const itemResults=paper.items.map(item=>{
      if(item.responseMode!=='prescription')return clampResult(local.get(item.id),item);
      const chosen=adjudicated.get(item.id)||safety.get(item.id)||primary.get(item.id)||local.get(item.id);
      return clampResult({...chosen,markingSource:adjudicated.has(item.id)?'adjudicated':safety.has(item.id)?'safety_audit':'primary_ai'},item);
    });
    const awardedMarks=itemResults.reduce((sum,item)=>sum+item.awardedMarks,0),sectionBreakdown={};
    for(const result of itemResults){const row=sectionBreakdown[result.sectionId]||(sectionBreakdown[result.sectionId]={awarded:0,available:0,items:0,safetyCritical:0});row.awarded+=result.awardedMarks;row.available+=result.maxMarks;row.items++;if(result.safetyCritical)row.safetyCritical++;}
    const attempt={schemaVersion:'ukmla-psa-attempt-v1',attemptId:core().uid('psa-attempt'),paperId:paper.paperId,sessionId:session.sessionId,mode:paper.mode,startedAt:session.startedAt,completedAt:new Date().toISOString(),durationSeconds:Math.max(0,Math.round((new Date()-new Date(session.startedAt))/1000)),awardedMarks,totalMarks:paper.totalMarks,percentage:paper.totalMarks?Math.round(awardedMarks/paper.totalMarks*1000)/10:0,lookupCount:Object.values(session.itemMeta||{}).reduce((sum,row)=>sum+Number(row.lookupCount||0),0),sectionBreakdown,itemResults,itemMeta:session.itemMeta||{}};
    const attempts=load(KEYS.attempts,[]);attempts.unshift(attempt);save(KEYS.attempts,attempts.slice(0,100));clearSession(session);
    job.status='complete';job.stageIndex=5;job.percent=100;job.currentStage='final';job.lastMessage='Final marks and PSA analytics saved.';job.attemptId=attempt.attemptId;saveMarkingJob(job);setTimeout(clearMarkingJob,700);
    return attempt;
  }

  function attempts(){return load(KEYS.attempts,[]);}
  function attemptById(id){return attempts().find(item=>item.attemptId===id)||null;}

  window.UKMLA_PSA_ENGINE={KEYS,generatePaper,loadGenerationJob,clearGenerationJob,latestPaper,paperById,saveSession,activeSession,clearSession,markSession,loadMarkingJob,clearMarkingJob,attempts,attemptById,localMarkItem};
})();
