const fs=require('fs');
const vm=require('vm');

function assert(condition,message){if(!condition)throw new Error(message);}

function validateRepairPrompts(){
  const context={window:{},console};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('v2/ai-schema.js','utf8'),context,{filename:'v2/ai-schema.js'});
  const base=context.window.UKMLA_V2_AI_SCHEMA;
  const conditions=Array.from({length:10},(_,index)=>({
    id:`condition-${index+1}`,
    topicId:`topic-${index+1}`,
    topic:`Topic ${index+1}`,
    name:`Condition ${index+1}`,
    profile:index===0?'physiology':'clinical',
    fields:{},labels:{}
  }));
  const config={conditions,questionTypes:base.TYPES.map(item=>item[0]),currentSet:{id:'last-valid'},failedSet:{id:'failed-output'}};
  const errors=['Q2B: option exceeds 10 words.','Q3A: option contains an explanatory clause.'];
  const prompt=base.repairPrompt('category',config,errors,1,3);
  for(const required of[
    'AUTOMATIC CHECKPOINT REPAIR 1 OF 3',
    'Q2B: option exceeds 10 words.',
    'Q3A: option contains an explanatory clause.',
    'Do not skip, weaken or rename the checkpoint.',
    'LAST VALID SET ENTERING THIS CHECKPOINT',
    'FAILED CHECKPOINT OUTPUT TO REPAIR'
  ])assert(prompt.includes(required),`Repair prompt is missing: ${required}`);

  vm.runInContext(fs.readFileSync('v2/biomedical-ai.js','utf8'),context,{filename:'v2/biomedical-ai.js'});
  const biomedical=context.window.UKMLA_V2_AI_SCHEMA.repairPrompt('category',config,errors,1,3);
  assert(biomedical.includes('BIOMEDICAL AUTOMATIC REPAIR'),'Biomedical repair rules were not retained.');
  assert(biomedical.includes('Do not make unaffected biomedical questions longer'),'Biomedical repair could reintroduce verbosity.');
}

class MemoryStorage{
  constructor(){this.map=new Map();}
  getItem(key){return this.map.has(key)?this.map.get(key):null;}
  setItem(key,value){this.map.set(String(key),String(value));}
  removeItem(key){this.map.delete(String(key));}
}
class EventTargetStub{
  constructor(){this.events=[];}
  dispatchEvent(event){this.events.push(event);return true;}
}
class CustomEventStub{
  constructor(type,init={}){this.type=type;this.detail=init.detail;}
}

function createEngineHarness(responses,stages){
  const localStorage=new MemoryStorage();
  const document=new EventTargetStub();
  const requests=[];
  const progress=[];
  const fakeSchema={
    STAGES:stages,
    AUTO_REPAIR:{maxAttempts:3,maxErrors:20},
    generationPrompt:()=> 'generation prompt',
    checkpointPrompt:stage=>`checkpoint ${stage}`,
    repairPrompt:(stage,config,errors,attempt,max)=>`repair ${stage} ${attempt}/${max}: ${errors.join(' | ')} failed=${config.failedSet?.id}`,
    requestBody:(prompt,_knowledge,name)=>({prompt,name}),
    outputText:data=>data.output_text,
    validate:(set,_config,stage)=>{
      if(stage==='generation')return set?.generationValid?[]:['Generation structure invalid.'];
      if(stage==='category')return set?.categoryValid?[]:(set?.errors||['Category output invalid.']);
      if(stage==='final')return set?.finalValid?[]:(set?.errors||['Final output invalid.']);
      return[];
    },
    balancedShuffle:set=>({...set,shuffled:true})
  };
  const core={
    saveJson:(key,value)=>{localStorage.setItem(key,JSON.stringify(value));return true;},
    loadJson:(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}},
    coverageState:()=>({cycle:4}),
    STORAGE:{sets:'sets'}
  };
  const transport={
    send:async(_token,body)=>{
      requests.push(body);
      if(!responses.length)throw new Error('No mocked API response remains.');
      return{output_text:JSON.stringify(responses.shift())};
    }
  };
  const window={
    UKMLA_V2:core,
    UKMLA_V2_AI_SCHEMA:fakeSchema,
    UKMLA_V2_AI_TRANSPORT:transport,
    addEventListener:()=>{}
  };
  const context={
    window,document,localStorage,CustomEvent:CustomEventStub,
    navigator:{onLine:true},console,
    setTimeout:()=>0,clearTimeout:()=>{},
    Date,JSON,Math,Promise,TypeError,Error
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('v2/ai-engine.js','utf8'),context,{filename:'v2/ai-engine.js'});
  return{
    engine:context.window.UKMLA_V2_AI_ENGINE,
    localStorage,requests,progress,
    config:{
      apiKey:'test-key',knowledge:false,topic:'Test',
      conditions:Array.from({length:10},(_,index)=>({id:`c${index}`,topicId:`t${index}`})),
      questionTypes:Array.from({length:10},(_,index)=>`type${index}`),
      persist:true,
      onProgress:message=>progress.push(message)
    }
  };
}

async function validateSuccessfulRepair(){
  const stages=[
    {id:'generation',label:'Generate ten questions',percent:25},
    {id:'category',label:'Semantic answer-category review',percent:70},
    {id:'shuffle',label:'Balanced A–E shuffling',percent:96,local:true},
    {id:'final',label:'Final validation and rendering',percent:100,local:true}
  ];
  const harness=createEngineHarness([
    {id:'generation-valid',generationValid:true,finalValid:true},
    {id:'category-invalid-1',categoryValid:false,finalValid:true,errors:['Q2B: option exceeds 10 words.','Q3A: explanatory clause.']},
    {id:'category-invalid-2',categoryValid:false,finalValid:true,errors:['Q3A: explanatory clause.']},
    {id:'category-valid',categoryValid:true,finalValid:true}
  ],stages);
  const result=await harness.engine.runPipeline(harness.config);
  assert(result.id==='category-valid','The repaired checkpoint output was not accepted.');
  assert(result.shuffled===true,'The repaired set did not continue through A–E shuffling.');
  assert(harness.requests.length===4,`Expected four API calls, received ${harness.requests.length}.`);
  assert(harness.requests[2].name==='ukmla_category_repair_1_v2','First automatic repair request was not issued.');
  assert(harness.requests[3].name==='ukmla_category_repair_2_v2','Second automatic repair request was not issued.');
  assert(harness.progress.some(message=>message.includes('Automatic repair 1/3')),'Progress did not report repair 1/3.');
  assert(harness.progress.some(message=>message.includes('Automatic repair 2/3')),'Progress did not report repair 2/3.');
}

async function validateExhaustedRepairPreservesLastValid(){
  const stages=[
    {id:'generation',label:'Generate ten questions',percent:25},
    {id:'category',label:'Semantic answer-category review',percent:70},
    {id:'final',label:'Final validation and rendering',percent:100,local:true}
  ];
  const harness=createEngineHarness([
    {id:'generation-valid',generationValid:true,finalValid:true},
    {id:'failed-initial',categoryValid:false,errors:['Q2B invalid.']},
    {id:'failed-repair-1',categoryValid:false,errors:['Q2B invalid.']},
    {id:'failed-repair-2',categoryValid:false,errors:['Q2B invalid.']},
    {id:'failed-repair-3',categoryValid:false,errors:['Q2B invalid.']}
  ],stages);
  let failure='';
  try{await harness.engine.runPipeline(harness.config);}catch(error){failure=String(error.message||error);}
  assert(failure.includes('stopped after 3 automatic repair attempts'),'Exhausted repair did not produce a clear stop message.');
  assert(harness.requests.length===5,`Expected initial plus three repair calls after generation; received ${harness.requests.length}.`);
  const saved=harness.engine.loadJob();
  assert(saved.status==='paused','Exhausted checkpoint was not saved as paused.');
  assert(saved.repair?.exhausted===true,'Exhausted repair metadata was not saved.');
  assert(saved.repair?.attempt===3,'Saved repair attempt count is incorrect.');
  assert(saved.currentSet?.id==='generation-valid','A failed candidate replaced the last valid checkpoint state.');
  assert(saved.currentIndex===1,'Resume would not restart the failed checkpoint.');
}

async function validateFinalValidationRepair(){
  const stages=[
    {id:'generation',label:'Generate ten questions',percent:25},
    {id:'shuffle',label:'Balanced A–E shuffling',percent:96,local:true},
    {id:'final',label:'Final validation and rendering',percent:100,local:true}
  ];
  const harness=createEngineHarness([
    {id:'generation-valid',generationValid:true,finalValid:false,errors:['Final option invalid.']},
    {id:'final-repaired',generationValid:true,finalValid:true}
  ],stages);
  const result=await harness.engine.runPipeline(harness.config);
  assert(result.id==='final-repaired','Final validation did not accept the repaired set.');
  assert(harness.requests[1].name==='ukmla_final_repair_1_v2','Final validation did not reignite the API.');
  assert(result.shuffled===true,'Final repaired set was not re-shuffled.');
}

(async()=>{
  validateRepairPrompts();
  await validateSuccessfulRepair();
  await validateExhaustedRepairPreservesLastValid();
  await validateFinalValidationRepair();
  console.log(JSON.stringify({
    repairAttemptsPerCheckpoint:3,
    exactValidationErrorsReturnedToApi:true,
    successfulRepairContinuesPipeline:true,
    exhaustedRepairPreservesLastValidSet:true,
    resumeRestartsFailedCheckpoint:true,
    finalValidationCanReigniteApi:true,
    biomedicalRepairRulesPreserved:true
  },null,2));
})().catch(error=>{console.error(error);process.exit(1);});
