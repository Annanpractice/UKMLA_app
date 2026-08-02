(function(){
'use strict';

const MODE='editorial-edit-points-v1';
const JOB_KEY='ukmlaV2AiJobV1';
const MAX_NETWORK_ATTEMPTS=3;
const EDIT_POINTS=[
  {id:'edit_sparse',label:'Sparsity edit point',instructionStage:'sparse',percent:40},
  {id:'edit_options_category',label:'Option and answer-category edit point',instructionStage:'options_category',percent:54},
  {id:'edit_distractors',label:'Distractor edit point',instructionStage:'distractors',percent:67},
  {id:'edit_sba',label:'Single-best-answer edit point',instructionStage:'sba_audit',percent:76}
];
const ALL_NUMBERS=Array.from({length:10},(_,index)=>index+1);
let initialising=false;
let initialised=false;

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function unique(values){return[...new Set(values)];}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function core(){return window.UKMLA_V2;}
function engine(){return window.UKMLA_V2_AI_ENGINE;}
function schema(){return window.UKMLA_V2_AI_SCHEMA;}
function transport(){return window.UKMLA_V2_AI_TRANSPORT;}
function isRetryable(error){return error instanceof TypeError||/network|fetch|offline|connection|load failed|408|409|425|429|500|502|503|504/i.test(clean(error?.message||error));}
function questionNumber(question,index){const value=Number(question?.questionNumber);return value>=1&&value<=10?value:index+1;}
function expectedTypeLabel(type){return schema()?.TYPES?.find?.(item=>item[0]===type)?.[1]||type;}
function expectedCondition(config,index){return config?.conditions?.[index]||null;}
function expectedConditionId(config,index){const item=expectedCondition(config,index);return item?.id||item?.conditionId||null;}
function expectedConditionName(config,index){const item=expectedCondition(config,index);return item?.name||item?.targetCondition||null;}
function expectedTopicName(config,index){const item=expectedCondition(config,index);return item?.topic||item?.topicName||null;}
function wordCount(value){const text=clean(value);return text?text.split(/\s+/).length:0;}
function sentenceCount(value){const text=clean(value);return text?Math.max(1,text.split(/[.!?]+(?:\s+|$)/).filter(Boolean).length):0;}
function explanatoryOption(value){return /[;:]|\b(?:because|therefore|thereby|due to|resulting in|which causes?|so that|risking|via|limiting|causing|leading to)\b/i.test(String(value||''));}

function saveJob(job){
  job.updatedAt=new Date().toISOString();
  core()?.saveJson?.(JOB_KEY,job);
  document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
}

function emit(job,config,{stage,message,percent,status='active',detail}={}){
  if(stage)job.currentStage=stage;
  if(message)job.lastMessage=message;
  if(Number.isFinite(Number(percent)))job.percent=Math.max(Number(job.percent)||0,Number(percent));
  job.status=status;
  job.pipelineMode=MODE;
  delete job.repair;
  delete job.checkpointProgress;
  if(detail)job.editorialProgress={...(job.editorialProgress||{}),...clone(detail),updatedAt:new Date().toISOString()};
  if(config.persist!==false)saveJob(job);
  else document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
  config.onProgress?.(job.lastMessage,job.percent,job.currentStage,MODE);
}

function sourceTargets(config,numbers=ALL_NUMBERS){
  const wanted=new Set(numbers);
  return(config.conditions||[]).map((item,index)=>({
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

function questionsFor(set,numbers=ALL_NUMBERS){
  const wanted=new Set(numbers);
  return(set?.questions||[]).filter((question,index)=>wanted.has(questionNumber(question,index)));
}

function restoreImmutableMetadata(set,config){
  if(!set||!Array.isArray(set.questions))return set;
  if(set.questions.length>10)set.questions=set.questions.slice(0,10);
  set.questions.forEach((question,index)=>{
    if(!question||typeof question!=='object')return;
    const condition=expectedCondition(config,index);
    const type=config?.questionTypes?.[index];
    question.questionNumber=index+1;
    if(type){question.questionType=type;question.questionTypeLabel=expectedTypeLabel(type);}
    if(condition){
      const conditionId=expectedConditionId(config,index);
      const conditionName=expectedConditionName(config,index);
      if(conditionId)question.targetConditionId=conditionId;
      if(conditionName)question.targetCondition=conditionName;
      if(condition.topicId)question.topicId=condition.topicId;
      const topicName=expectedTopicName(config,index);
      if(topicName)question.topicName=topicName;
    }
  });
  return set;
}

function hardStructuralErrors(set,config){
  const errors=[];
  if(!set||!Array.isArray(set.questions)||set.questions.length!==10)return['Exactly ten questions are required.'];
  const seenTypes=new Set();
  const seenTargets=new Set();
  set.questions.forEach((question,index)=>{
    const number=index+1;
    if(!question||typeof question!=='object'){errors.push(`Q${number}: question object is missing.`);return;}
    seenTypes.add(question.questionType);
    seenTargets.add(question.targetConditionId);
    if(question.questionNumber!==number)errors.push(`Q${number}: number changed.`);
    if(question.questionType!==config.questionTypes?.[index])errors.push(`Q${number}: type changed.`);
    if(question.targetConditionId!==expectedConditionId(config,index))errors.push(`Q${number}: target changed.`);
    if(question.topicId!==expectedCondition(config,index)?.topicId)errors.push(`Q${number}: topic changed.`);
    if(!Array.isArray(question.options)||question.options.length!==5)errors.push(`Q${number}: five options required.`);
    const optionIds=(question.options||[]).map(option=>option?.id).join('');
    if(optionIds!=='ABCDE')errors.push(`Q${number}: options must be A–E.`);
    if(!(question.options||[]).some(option=>option?.id===question.correctOptionId))errors.push(`Q${number}: invalid answer key.`);
    if(config.knowledge&&(!question.sourceSupport?.conceptId||!question.sourceSupport?.sourceRefs?.length))errors.push(`Q${number}: source support missing.`);
  });
  if(seenTypes.size!==10)errors.push('Question types are not unique.');
  if(seenTargets.size!==10)errors.push('Targets are not unique.');
  return errors;
}

function deterministicQualityIssues(question,index){
  const limits=schema()?.LIMITS||{};
  const number=index+1;
  const issues=[];
  const maxStem=question?.questionType==='sparse_most_likely_diagnosis'?(limits.sparseDiagnosisStemMaxWords||28):(limits.stemMaxWords||36);
  if(wordCount(question?.stem)>maxStem)issues.push({code:'stem_too_long',message:`Stem exceeds ${maxStem} words.`,fields:['stem']});
  if(sentenceCount(question?.stem)>(limits.stemMaxSentences||2))issues.push({code:'stem_too_many_sentences',message:'Stem exceeds two sentences.',fields:['stem']});
  if(wordCount(question?.leadIn)>(limits.leadInMaxWords||14))issues.push({code:'lead_in_too_long',message:'Lead-in is too long.',fields:['leadIn']});
  const options=Array.isArray(question?.options)?question.options:[];
  const lengths=options.map(option=>wordCount(option?.text));
  const correctIndex=options.findIndex(option=>option?.id===question?.correctOptionId);
  options.forEach(option=>{
    if(wordCount(option?.text)>(limits.optionMaxWords||10))issues.push({code:'option_too_long',message:`Option ${option?.id} is too long.`,fields:[`options.${option?.id}`]});
    if(explanatoryOption(option?.text))issues.push({code:'explanatory_option',message:`Option ${option?.id} contains explanation rather than an answer label.`,fields:[`options.${option?.id}`]});
  });
  if(lengths.length===5){
    const min=Math.min(...lengths);
    const max=Math.max(...lengths);
    if(max-min>=6||max>Math.max(8,min*2+3))issues.push({code:'option_length_giveaway',message:'Option lengths are not parallel.',fields:['options']});
    if(correctIndex>=0&&lengths[correctIndex]===max&&max-min>=4)issues.push({code:'correct_option_longest',message:'The correct option is substantially longer than its competitors.',fields:[`options.${question.correctOptionId}`]});
  }
  const normalised=options.map(option=>clean(option?.text).toLowerCase()).filter(Boolean);
  if(new Set(normalised).size!==normalised.length)issues.push({code:'duplicate_options',message:'Two or more options are textually duplicated.',fields:['options']});
  if(!clean(question?.rationale))issues.push({code:'missing_rationale',message:'Rationale is missing.',fields:['rationale']});
  return issues.map(issue=>({...issue,questionNumber:number}));
}

function allDeterministicQualityIssues(set,numbers=ALL_NUMBERS){
  const wanted=new Set(numbers);
  return(set?.questions||[]).flatMap((question,index)=>wanted.has(index+1)?deterministicQualityIssues(question,index):[]);
}

function questionSchema(config){
  return clone(schema().quizSchema(Boolean(config.knowledge)).properties.questions.items);
}

function editorResponseSchema(config){
  return{
    type:'object',additionalProperties:false,required:['questions'],
    properties:{questions:{type:'array',minItems:0,maxItems:10,items:questionSchema(config)}}
  };
}

function assessmentResponseSchema(){
  return{
    type:'object',additionalProperties:false,required:['results'],
    properties:{results:{type:'array',minItems:1,maxItems:10,items:{
      type:'object',additionalProperties:false,required:['questionNumber','verdict','issues'],
      properties:{
        questionNumber:{type:'integer',minimum:1,maximum:10},
        verdict:{type:'string',enum:['pass','fail']},
        issues:{type:'array',minItems:0,maxItems:8,items:{
          type:'object',additionalProperties:false,required:['code','message','fields'],
          properties:{
            code:{type:'string'},message:{type:'string'},
            fields:{type:'array',minItems:0,maxItems:8,items:{type:'string'}}
          }
        }}
      }
    }}}
  };
}

function regenerationResponseSchema(config){
  return{
    type:'object',additionalProperties:false,required:['question'],
    properties:{question:questionSchema(config)}
  };
}

function structuredBody(prompt,name,formatSchema){
  return{
    model:'gpt-5-mini',
    input:[
      {role:'system',content:[{type:'input_text',text:'Return only schema-conforming JSON. Make precise editorial changes and preserve fixed assignments.'}]},
      {role:'user',content:[{type:'input_text',text:prompt}]}
    ],
    text:{format:{type:'json_schema',name,strict:true,schema:formatSchema}}
  };
}

function outputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  for(const item of data?.output||[])for(const content of item.content||[])if(content?.type==='output_text'&&typeof content.text==='string')return content.text;
  return'';
}

async function request(config,job,{stage,label,body,percent,detail}){
  let lastError=null;
  for(let attempt=1;attempt<=MAX_NETWORK_ATTEMPTS;attempt++){
    job.apiCalls=Number(job.apiCalls||0)+1;
    job.apiAttemptsByStage=job.apiAttemptsByStage&&typeof job.apiAttemptsByStage==='object'?job.apiAttemptsByStage:{};
    job.apiAttemptsByStage[stage]=Number(job.apiAttemptsByStage[stage]||0)+1;
    emit(job,config,{stage,percent,message:attempt===1?label:`${label} · reconnecting ${attempt}/${MAX_NETWORK_ATTEMPTS}`,detail:{...(detail||{}),attempt}});
    try{
      const raw=outputText(await transport().send(config.apiKey,body));
      if(!raw)throw new Error('No structured response was returned.');
      const parsed=JSON.parse(raw);
      job.apiSuccessByStage=job.apiSuccessByStage&&typeof job.apiSuccessByStage==='object'?job.apiSuccessByStage:{};
      job.apiSuccessByStage[stage]=Number(job.apiSuccessByStage[stage]||0)+1;
      job.lastSuccessfulApiStage=stage;
      job.lastSuccessfulApiAt=new Date().toISOString();
      return parsed;
    }catch(error){
      lastError=error;
      if(!isRetryable(error)||attempt===MAX_NETWORK_ATTEMPTS)break;
      await wait(Math.min(12000,1000*Math.pow(2,attempt-1)));
    }
  }
  job.lastError=clean(lastError?.message||lastError);
  emit(job,config,{stage,percent,status:'paused',message:`${label} could not complete after ${MAX_NETWORK_ATTEMPTS} connection attempts. The draft is saved.`});
  throw lastError||new Error(`${label} failed.`);
}

function editPrompt(point,config,set,numbers,cycle){
  return`You are the ${point.label.toLowerCase()} in an editorial pipeline. This is an edit point, not a pass/fail checkpoint.

Review only question numbers ${numbers.join(', ')}. Return complete replacement question objects only for questions where a material edit is needed for your assigned dimension. Omit questions that need no change. Do not return, judge or rewrite questions outside this list.

EDITORIAL RESPONSIBILITY:
${schema().checkpointInstruction(point.instructionStage)}

PRESERVATION RULES:
- Preserve each question number, fixed target, topic, assigned question type and correct clinical proposition.
- Preserve already-good content outside your responsibility.
- Keep edits minimal but complete enough to leave a coherent question.
- Do not report pass/fail and do not explain edits.

EDITORIAL CYCLE: ${cycle}

SOURCE TARGETS:
${JSON.stringify(sourceTargets(config,numbers))}

QUESTIONS TO EDIT:
${JSON.stringify(questionsFor(set,numbers))}`;
}

function assessmentPrompt(config,set,numbers,round){
  const localIssues=allDeterministicQualityIssues(set,numbers);
  return`Act as the single final quality checkpoint for the supplied UKMLA questions. Analyse each requested question independently. Do not rewrite anything.

Return one result for every requested question number ${numbers.join(', ')}. Mark pass only when the question is fair, concise and has one unambiguously best answer.

FAIL A QUESTION WHEN ANY OF THESE APPLY:
- the stem states or blatantly reveals the answer;
- the correct option repeats a decisive stem clue;
- the correct option is conspicuously longer, safer, more detailed or more professional than the distractors;
- the options are not one semantic category or do not answer the lead-in;
- fewer than three distractors are credible near-misses for a knowledgeable but imperfect candidate;
- two or more options could reasonably be the best answer;
- essential discriminating information is missing;
- an option is an explanatory mini-vignette rather than a concise answer label;
- the question contains a factual or source-fidelity problem.

For each failure, provide concise issue codes, messages and affected fields. Do not invent cosmetic failures merely to make edits. This is assessment round ${round}.

DETERMINISTIC FLAGS ALREADY FOUND:
${JSON.stringify(localIssues)}

SOURCE TARGETS:
${JSON.stringify(sourceTargets(config,numbers))}

QUESTIONS TO ASSESS:
${JSON.stringify(questionsFor(set,numbers))}`;
}

function regenerationPrompt(config,set,number,issues){
  const index=number-1;
  return`Regenerate one UKMLA single-best-answer question from first principles. Return only the complete replacement object for Q${number}.

The target condition, topic and assigned question type are fixed. Preserve the intended clinical proposition when it remains valid, but do not copy defective wording. Build a concise stem, five homogeneous answer labels, at least three credible near-miss distractors and one unambiguously best answer.

FINAL-ASSESSMENT FAILURES:
${JSON.stringify(issues||[])}

ORIGINAL SOURCE TARGET:
${JSON.stringify(sourceTargets(config,[number])[0])}

ASSIGNED QUESTION TYPE:
${JSON.stringify({id:config.questionTypes[index],label:expectedTypeLabel(config.questionTypes[index])})}

CURRENT FAILED QUESTION:
${JSON.stringify(set.questions[index])}

QUALITY REQUIREMENTS:
${schema().checkpointInstruction('sparse')}
${schema().checkpointInstruction('options_category')}
${schema().checkpointInstruction('distractors')}
${schema().checkpointInstruction('sba_audit')}`;
}

function applyEdits(set,response,numbers,config){
  const next=clone(set);
  const allowed=new Set(numbers);
  const applied=[];
  for(const question of response?.questions||[]){
    const number=Number(question?.questionNumber);
    if(!allowed.has(number)||number<1||number>10)continue;
    next.questions[number-1]=clone(question);
    applied.push(number);
  }
  restoreImmutableMetadata(next,config);
  return{set:next,applied:unique(applied).sort((a,b)=>a-b)};
}

function normaliseAssessment(response,numbers){
  const byNumber=new Map();
  for(const result of response?.results||[]){
    const number=Number(result?.questionNumber);
    if(numbers.includes(number)&&!byNumber.has(number))byNumber.set(number,result);
  }
  return numbers.map(number=>byNumber.get(number)||{
    questionNumber:number,
    verdict:'fail',
    issues:[{code:'missing_assessment',message:'The final checkpoint did not return a verdict for this question.',fields:[]}]
  });
}

function failedFromAssessment(results){return results.filter(result=>result.verdict!=='pass').map(result=>result.questionNumber).sort((a,b)=>a-b);}
function issueMap(results){return Object.fromEntries(results.map(result=>[result.questionNumber,clone(result.issues||[])]));}

async function runEditCycle(config,job,set,numbers,cycle,{startPercent,endPercent}={}){
  let candidate=clone(set);
  const span=(Number(endPercent)||76)-(Number(startPercent)||30);
  for(let index=0;index<EDIT_POINTS.length;index++){
    const point=EDIT_POINTS[index];
    const percent=(Number(startPercent)||30)+(span*(index/EDIT_POINTS.length));
    const body=structuredBody(
      editPrompt(point,config,candidate,numbers,cycle),
      `ukmla_${point.id}_${cycle.replace(/[^a-z0-9]+/gi,'_').toLowerCase()}_v1`,
      editorResponseSchema(config)
    );
    const response=await request(config,job,{
      stage:point.id,label:`${point.label} · reviewing ${numbers.length} question${numbers.length===1?'':'s'}`,
      body,percent,detail:{phase:'edit',cycle,questionNumbers:[...numbers],editPoint:point.id}
    });
    const applied=applyEdits(candidate,response,numbers,config);
    candidate=applied.set;
    job.currentSet=clone(candidate);
    job.editorialTelemetry.editPoints.push({cycle,editPoint:point.id,questionNumbers:[...numbers],editedQuestionNumbers:applied.applied,completedAt:new Date().toISOString()});
    emit(job,config,{
      stage:point.id,percent:percent+Math.max(1,span/EDIT_POINTS.length*.7),
      message:`${point.label} · ${applied.applied.length?`${applied.applied.length} question${applied.applied.length===1?'':'s'} edited`:'no changes needed'}`,
      detail:{phase:'edit',cycle,questionNumbers:[...numbers],editedQuestionNumbers:applied.applied,editPoint:point.id}
    });
  }
  return candidate;
}

async function assess(config,job,set,numbers,round,percent){
  const response=await request(config,job,{
    stage:'final_assessment',
    label:`Final quality checkpoint · assessing ${numbers.length} question${numbers.length===1?'':'s'}`,
    percent,
    detail:{phase:'assessment',round,questionNumbers:[...numbers]},
    body:structuredBody(assessmentPrompt(config,set,numbers,round),`ukmla_final_assessment_${round}_v1`,assessmentResponseSchema())
  });
  const results=normaliseAssessment(response,numbers);
  const failed=failedFromAssessment(results);
  job.editorialTelemetry.assessments.push({round,questionNumbers:[...numbers],results:clone(results),completedAt:new Date().toISOString()});
  job.approvedQuestionNumbers=unique([...(job.approvedQuestionNumbers||[]),...numbers.filter(number=>!failed.includes(number))]).sort((a,b)=>a-b);
  job.failedQuestionNumbers=failed;
  job.assessmentIssues=issueMap(results);
  emit(job,config,{
    stage:'final_assessment',percent,
    message:`Final quality checkpoint · ${10-failed.length}/10 approved${failed.length?` · revising ${failed.map(number=>`Q${number}`).join(', ')}`:''}`,
    detail:{phase:'assessment',round,approvedCount:10-failed.length,failedQuestionNumbers:failed,results}
  });
  return{results,failed};
}

async function regenerate(config,job,set,numbers,issuesByNumber){
  const candidate=clone(set);
  emit(job,config,{
    stage:'question_regeneration',percent:94,
    message:`Fresh question regeneration · ${numbers.map(number=>`Q${number}`).join(', ')} · ${numbers.length} request${numbers.length===1?'':'s'} in parallel`,
    detail:{phase:'regeneration',questionNumbers:[...numbers],parallelRequests:numbers.length}
  });
  const responses=await Promise.all(numbers.map(async number=>{
    const body=structuredBody(regenerationPrompt(config,candidate,number,issuesByNumber[number]),`ukmla_regenerate_q${number}_v1`,regenerationResponseSchema(config));
    const response=await request(config,job,{
      stage:`regenerate_q${number}`,label:`Regenerating Q${number}`,
      body,percent:94,detail:{phase:'regeneration',questionNumbers:[number]}
    });
    return{number,question:response.question};
  }));
  for(const row of responses){if(row.question)candidate.questions[row.number-1]=clone(row.question);}
  restoreImmutableMetadata(candidate,config);
  job.currentSet=clone(candidate);
  job.editorialTelemetry.regeneratedQuestionNumbers=unique([...(job.editorialTelemetry.regeneratedQuestionNumbers||[]),...numbers]).sort((a,b)=>a-b);
  emit(job,config,{
    stage:'question_regeneration',percent:96,
    message:`Fresh question regeneration completed · ${numbers.map(number=>`Q${number}`).join(', ')}`,
    detail:{phase:'regeneration',questionNumbers:[...numbers]}
  });
  return candidate;
}

function initialiseJob(config){
  const supplied=config.job||null;
  const job=supplied?clone(supplied):{
    version:7,
    id:config.jobId||`ai-job-${Date.now().toString(36)}`,
    sourceType:config.knowledge?'knowledge':'ai',
    topic:config.topic,
    conditions:clone(config.conditions),
    questionTypes:clone(config.questionTypes),
    knowledge:Boolean(config.knowledge),
    sourceTitle:config.sourceTitle||'',
    packId:config.packId||null,
    currentSet:null,
    percent:5,
    apiCalls:0,
    apiAttemptsByStage:{},
    apiSuccessByStage:{},
    createdAt:new Date().toISOString()
  };
  job.version=7;
  job.pipelineMode=MODE;
  job.status='active';
  job.conditions=clone(config.conditions||job.conditions||[]);
  job.questionTypes=clone(config.questionTypes||job.questionTypes||[]);
  job.apiAttemptsByStage=job.apiAttemptsByStage&&typeof job.apiAttemptsByStage==='object'?job.apiAttemptsByStage:{};
  job.apiSuccessByStage=job.apiSuccessByStage&&typeof job.apiSuccessByStage==='object'?job.apiSuccessByStage:{};
  job.editorialTelemetry={
    mode:MODE,
    resumedFromSavedDraft:Boolean(supplied?.currentSet),
    editPoints:[],assessments:[],regeneratedQuestionNumbers:[],
    startedAt:job.createdAt||new Date().toISOString()
  };
  job.approvedQuestionNumbers=[];
  job.failedQuestionNumbers=[];
  delete job.repair;
  delete job.checkpointProgress;
  return job;
}

function finaliseSet(set,config,job){
  const finalSet=restoreImmutableMetadata(clone(set),config);
  const hardErrors=hardStructuralErrors(finalSet,config);
  if(hardErrors.length)throw new Error(`Final structural validation failed: ${hardErrors.slice(0,8).join(' ')}`);
  const shuffled=schema().balancedShuffle(finalSet);
  shuffled.schemaVersion='ukmla-ai-quiz-v2';
  shuffled.sourceType=config.knowledge?'knowledge_dump':'ai';
  shuffled.packId=config.packId||null;
  shuffled.pipelineMode=MODE;
  shuffled.buildTelemetry={
    pipelineMode:MODE,
    apiCalls:Number(job.apiCalls||0),
    apiAttemptsByStage:{...job.apiAttemptsByStage},
    apiSuccessByStage:{...job.apiSuccessByStage},
    approvedQuestionNumbers:[...(job.approvedQuestionNumbers||[])],
    editPoints:clone(job.editorialTelemetry.editPoints),
    assessments:clone(job.editorialTelemetry.assessments),
    regeneratedQuestionNumbers:[...(job.editorialTelemetry.regeneratedQuestionNumbers||[])],
    startedAt:job.editorialTelemetry.startedAt,
    completedAt:new Date().toISOString()
  };
  shuffled.schedulerSnapshot={
    coverageCycle:core()?.coverageState?.().cycle,
    selectedConditionIds:config.conditions.map(item=>item.id||item.conditionId),
    priorityOrder:['topic_coverage','unseen_condition','weak_question_type','low_health','recency'],
    pipelineMode:MODE
  };
  return shuffled;
}

async function runEditorialPipeline(config={}){
  const effective={...config};
  if(config.job){
    effective.conditions=config.conditions||config.job.conditions;
    effective.questionTypes=config.questionTypes||config.job.questionTypes;
    effective.knowledge=config.knowledge??config.job.knowledge;
    effective.topic=config.topic||config.job.topic;
    effective.sourceTitle=config.sourceTitle||config.job.sourceTitle;
    effective.packId=config.packId||config.job.packId;
  }
  if(!Array.isArray(effective.conditions)||effective.conditions.length!==10)throw new Error('Editorial question building requires exactly ten fixed conditions.');
  if(!Array.isArray(effective.questionTypes)||effective.questionTypes.length!==10)throw new Error('Editorial question building requires exactly ten assigned question types.');

  const job=initialiseJob(effective);
  let candidate=job.currentSet?restoreImmutableMetadata(clone(job.currentSet),effective):null;
  emit(job,effective,{stage:'editorial_start',percent:5,message:candidate?'Saved draft loaded · starting editorial cycle':'Source prepared · starting editorial build',detail:{phase:'start',resumed:Boolean(candidate)}});

  if(!candidate){
    const response=await request(effective,job,{
      stage:'generation',label:'Generating ten draft questions',percent:8,detail:{phase:'generation',questionNumbers:[...ALL_NUMBERS]},
      body:schema().requestBody(schema().generationPrompt(effective),Boolean(effective.knowledge),'ukmla_editorial_generation_v1')
    });
    candidate=restoreImmutableMetadata(response,effective);
    job.currentSet=clone(candidate);
    const hardErrors=hardStructuralErrors(candidate,effective);
    if(hardErrors.length)throw new Error(`Generated draft is structurally unusable: ${hardErrors.slice(0,8).join(' ')}`);
    emit(job,effective,{stage:'generation',percent:25,message:'Ten draft questions generated',detail:{phase:'generation',questionNumbers:[...ALL_NUMBERS]}});
  }

  emit(job,effective,{stage:'local_validation',percent:30,message:'Local structural checks completed',detail:{phase:'local_validation',qualityFlags:allDeterministicQualityIssues(candidate).length}});
  candidate=await runEditCycle(effective,job,candidate,ALL_NUMBERS,'initial',{startPercent:30,endPercent:76});
  job.currentSet=clone(candidate);

  let assessment=await assess(effective,job,candidate,ALL_NUMBERS,'initial',82);
  if(assessment.failed.length){
    const locked=ALL_NUMBERS.filter(number=>!assessment.failed.includes(number));
    job.approvedQuestionNumbers=locked;
    emit(job,effective,{
      stage:'subset_reedit',percent:84,
      message:`Subset editorial cycle · ${assessment.failed.map(number=>`Q${number}`).join(', ')}`,
      detail:{phase:'subset_reedit',questionNumbers:[...assessment.failed],lockedQuestionNumbers:locked}
    });
    candidate=await runEditCycle(effective,job,candidate,assessment.failed,'failed-subset',{startPercent:84,endPercent:91});
    job.currentSet=clone(candidate);
    assessment=await assess(effective,job,candidate,assessment.failed,'after_subset_reedit',92);
  }

  if(assessment.failed.length){
    candidate=await regenerate(effective,job,candidate,assessment.failed,job.assessmentIssues||{});
    assessment=await assess(effective,job,candidate,assessment.failed,'after_regeneration',98);
  }

  if(assessment.failed.length){
    job.currentSet=clone(candidate);
    job.status='needs_review';
    job.failedQuestionNumbers=[...assessment.failed];
    const message=`Final quality checkpoint could not approve ${assessment.failed.map(number=>`Q${number}`).join(', ')} after one subset re-edit and one fresh regeneration. The draft is saved for review.`;
    emit(job,effective,{stage:'needs_review',percent:98,status:'needs_review',message,detail:{phase:'needs_review',failedQuestionNumbers:[...assessment.failed],issues:clone(job.assessmentIssues)}});
    throw new Error(message);
  }

  job.approvedQuestionNumbers=[...ALL_NUMBERS];
  const completedSet=finaliseSet(candidate,effective,job);
  job.currentSet=completedSet;
  job.status='complete';
  job.percent=100;
  job.currentStage='complete';
  job.lastMessage='Questions ready · 10/10 approved';
  job.editorialTelemetry.completedAt=new Date().toISOString();
  if(effective.persist!==false&&engine()?.persistCompletedSet)await engine().persistCompletedSet(completedSet,job);
  else document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
  effective.onProgress?.(job.lastMessage,100,'complete',MODE);
  return completedSet;
}

function patch(){
  const api=engine();
  const definitions=schema();
  const network=transport();
  if(!api||!definitions||!network||typeof api.runPipeline!=='function'||typeof network.send!=='function')return false;
  if(api.__editorialEditPointPipeline){initialised=true;return true;}
  api.__editorialEditPointPipeline=true;
  api.runPipeline=runEditorialPipeline;
  definitions.PIPELINE_MODES=definitions.PIPELINE_MODES||{};
  definitions.PIPELINE_MODES.editorial=MODE;
  definitions.PIPELINE_LABELS=definitions.PIPELINE_LABELS||{};
  definitions.PIPELINE_LABELS[MODE]='Editorial edit points';
  window.UKMLA_EDITORIAL_PIPELINE={MODE,EDIT_POINTS,runPipeline:runEditorialPipeline,hardStructuralErrors,deterministicQualityIssues};
  initialised=true;
  window.UKMLA_EDITORIAL_PIPELINE_READY=true;
  document.dispatchEvent(new CustomEvent('ukmlaEditorialPipelineReady',{detail:{mode:MODE}}));
  return true;
}

async function initialise(){
  if(initialised||initialising)return;
  initialising=true;
  for(let attempt=0;attempt<240&&!initialised;attempt++){
    if(patch())break;
    await wait(50);
  }
  initialising=false;
  if(!initialised)console.error('UKMLA editorial question pipeline could not initialise.');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
else initialise();
})();
