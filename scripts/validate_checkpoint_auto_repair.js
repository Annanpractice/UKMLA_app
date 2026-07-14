const fs=require('fs');
const vm=require('vm');

function assert(condition,message){if(!condition)throw new Error(message);}
function clone(value){return JSON.parse(JSON.stringify(value));}

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

function buildContext(responses,stageIds=['generation','category','shuffle','final']){
  const localStorage=new MemoryStorage();
  const document=new EventTargetStub();
  const requests=[];
  const progress=[];
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
  const window={UKMLA_V2:core,UKMLA_V2_AI_TRANSPORT:transport,addEventListener:()=>{}};
  const context={
    window,document,localStorage,CustomEvent:CustomEventStub,
    navigator:{onLine:true},console,location:{search:''},URLSearchParams,
    setTimeout:()=>0,clearTimeout:()=>{},
    Date,JSON,Math,Promise,TypeError,Error
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('v2/ai-schema.js','utf8'),context,{filename:'v2/ai-schema.js'});
  vm.runInContext(fs.readFileSync('v2/biomedical-ai.js','utf8'),context,{filename:'v2/biomedical-ai.js'});
  vm.runInContext(fs.readFileSync('v2/ai-pipeline-mode.js','utf8'),context,{filename:'v2/ai-pipeline-mode.js'});
  vm.runInContext(fs.readFileSync('v2/ai-targeted-repair.js','utf8'),context,{filename:'v2/ai-targeted-repair.js'});
  const schema=context.window.UKMLA_V2_AI_SCHEMA;
  schema.setPipelineMode(schema.PIPELINE_MODES.legacy);
  const wanted=new Set(stageIds);
  schema.LEGACY_STAGES.splice(0,schema.LEGACY_STAGES.length,...schema.LEGACY_STAGES.filter(stage=>wanted.has(stage.id)));
  vm.runInContext(fs.readFileSync('v2/ai-engine.js','utf8'),context,{filename:'v2/ai-engine.js'});
  return{context,schema,engine:context.window.UKMLA_V2_AI_ENGINE,localStorage,requests,progress,core};
}

function makeConditions(schema,profiles={}){
  return schema.TYPES.map((_type,index)=>({
    id:`condition-${index+1}`,
    topicId:`topic-${index+1}`,
    topic:`Topic ${index+1}`,
    name:`Condition ${index+1}`,
    profile:profiles[index+1]||'clinical',
    fields:{investigations:'Investigation',treatment:'Treatment',escalation:'Escalation',mimics:'Mimic',redFlags:'Red flag'},
    labels:{},sourceRefs:[]
  }));
}

function makeQuestion(schema,conditions,index){
  const type=schema.TYPES[index];
  const condition=conditions[index];
  return{
    id:`q-${index+1}`,
    questionNumber:index+1,
    questionType:type[0],
    questionTypeLabel:type[1],
    topicId:condition.topicId,
    topicName:condition.topic,
    targetConditionId:condition.id,
    targetCondition:condition.name,
    learningPoint:'Use the decisive clinical clue to distinguish close alternatives.',
    stem:'A stable adult has one decisive clinical finding requiring careful interpretation.',
    leadIn:'Select the single best answer.',
    options:'ABCDE'.split('').map((letter,optionIndex)=>({
      id:letter,
      text:`${['Immediate','Routine','Delayed','Conservative','Specialist'][optionIndex]} management`,
      topicId:condition.topicId,
      topicName:condition.topic,
      conditionId:condition.id,
      conditionName:condition.name,
      param:'treatment'
    })),
    correctOptionId:'A',
    decisiveClue:'One decisive clinical finding',
    rationale:'The decisive clue supports the correct same-category answer.',
    strongestDistractorId:'B',
    strongestDistractorExplanation:'The strongest distractor is plausible but conflicts with the decisive clue.',
    guideline:{source:'Internal UKMLA card atlas',title:condition.name,checkedDate:null,url:null}
  };
}

function makeSet(schema,conditions,id='valid-set'){
  return{
    schemaVersion:'ukmla-ai-quiz-v2',quizId:id,topic:'All UKMLA topics',
    generatedAt:'2026-07-14T00:00:00.000Z',difficulty:'very_difficult',
    questions:schema.TYPES.map((_type,index)=>makeQuestion(schema,conditions,index))
  };
}

function configFor(harness,conditions){
  return{
    apiKey:'test-key',knowledge:false,topic:'All UKMLA topics',conditions,
    questionTypes:harness.schema.TYPES.map(item=>item[0]),persist:true,
    onProgress:message=>harness.progress.push(message)
  };
}

function validatePlanning(){
  const harness=buildContext([],[]);
  const conditions=makeConditions(harness.schema,{2:'physiology'});
  const set=makeSet(harness.schema,conditions);
  set.questions[1].options[1].text='This option is far too long because it explains the mechanism fully';
  set.questions[2].options[0].text='Treatment because physiology requires it';
  const errors=harness.schema.validate(set,{conditions,questionTypes:harness.schema.TYPES.map(item=>item[0]),knowledge:false},'category');
  const plan=harness.schema.repairPlan(errors,set);
  assert(plan.tier==='fields','Mechanical option failures did not select field repair.');
  assert(plan.fields.some(item=>item.questionNumber===2&&item.optionId==='B'&&item.path==='optionText'),'Q2B was not mapped to an atomic option patch.');
  assert(plan.fields.some(item=>item.questionNumber===3&&item.optionId==='A'),'Q3A was not mapped to an atomic option patch.');
  const prompt=harness.schema.targetedRepairPrompt('category',{conditions},plan,set,1,3,null);
  assert(prompt.includes('Return only atomic text patches'),'Field prompt requested a full question set.');
  assert(prompt.includes('BIOMEDICAL REPAIR RULES'),'Affected physiology repair lost biomedical constraints.');
  assert(!prompt.includes('"questionNumber":1,'),'Field prompt included an unaffected question.');
  const body=harness.schema.repairRequestBody(prompt,false,'field_test','fields');
  assert(body.text.format.schema.properties.patches,'Field repair did not use the compact patch schema.');
}

async function validateFieldRepairOnly(){
  const bootstrap=buildContext([],[]);
  const conditions=makeConditions(bootstrap.schema);
  const valid=makeSet(bootstrap.schema,conditions,'generation-valid');
  const invalid=clone(valid);
  invalid.quizId='category-invalid';
  invalid.questions[1].options[1].text='This option is too long because it includes an unnecessary explanation';
  invalid.questions[2].options[0].text='Treatment because the mechanism requires it';
  const responses=[
    valid,
    invalid,
    {patches:[
      {questionNumber:2,path:'optionText',optionId:'B',value:'Routine management'},
      {questionNumber:3,path:'optionText',optionId:'A',value:'Immediate management'}
    ]}
  ];
  const harness=buildContext(responses);
  const result=await harness.engine.runPipeline(configFor(harness,conditions));
  assert(result.questions.length===10,'Targeted field repair did not preserve the complete set.');
  assert(harness.requests.length===3,`Expected generation, checkpoint and one field repair call; received ${harness.requests.length}.`);
  assert(harness.requests[2].text.format.name==='ukmla_category_fields_repair_v4','Field repair request name is incorrect.');
  assert(harness.requests[2].text.format.schema.properties.patches,'Field repair used the full-set schema.');
  const prompt=harness.requests[2].input[1].content[0].text;
  assert(!prompt.includes('"questionNumber":1,'),'Field repair transmitted an unaffected question.');
  assert(harness.progress.some(message=>message.includes('Targeted field repair 1/3')),'Progress did not identify the targeted field repair.');
}

async function validateEscalationToQuestion(){
  const bootstrap=buildContext([],[]);
  const conditions=makeConditions(bootstrap.schema);
  const valid=makeSet(bootstrap.schema,conditions,'generation-valid');
  const invalid=clone(valid);
  invalid.questions[1].options[1].text='This option is too long because it includes an unnecessary explanation';
  const responses=[
    valid,
    invalid,
    {patches:[{questionNumber:2,path:'optionText',optionId:'B',value:'Still too long because the explanation remains present'}]},
    {questions:[valid.questions[1]]}
  ];
  const harness=buildContext(responses);
  const result=await harness.engine.runPipeline(configFor(harness,conditions));
  assert(result.questions.length===10,'Question-level escalation damaged the set.');
  assert(harness.requests.length===4,'Field failure did not escalate exactly once to affected-question repair.');
  assert(harness.requests[2].text.format.schema.properties.patches,'First repair was not field-only.');
  assert(harness.requests[3].text.format.schema.properties.questions,'Second repair was not affected-question-only.');
  assert(harness.requests[3].input[1].content[0].text.includes('question numbers 2'),'Question repair did not target Q2.');
  assert(!harness.requests[3].input[1].content[0].text.includes('"questionNumber":1,'),'Question repair included an unaffected question.');
  assert(harness.progress.some(message=>message.includes('Affected-question repair 2/3')),'Escalation progress was not reported.');
}

async function validateSetFallback(){
  const bootstrap=buildContext([],[]);
  const conditions=makeConditions(bootstrap.schema);
  const valid=makeSet(bootstrap.schema,conditions,'generation-valid');
  const structural=clone(valid);
  structural.questions.pop();
  const harness=buildContext([valid,structural,valid]);
  const result=await harness.engine.runPipeline(configFor(harness,conditions));
  assert(result.questions.length===10,'Full-set fallback did not restore the set.');
  assert(harness.requests.length===3,'Structural failure should use one full-set fallback call.');
  assert(harness.requests[2].text.format.schema.properties.questions.minItems===10,'Set-level failure did not use the full quiz schema.');
  assert(harness.progress.some(message=>message.includes('Full-set fallback repair 1/1')),'Full-set fallback was not identified in progress.');
}

async function validateExhaustionPreservesLastValid(){
  const bootstrap=buildContext([],[]);
  const conditions=makeConditions(bootstrap.schema);
  const valid=makeSet(bootstrap.schema,conditions,'generation-valid');
  const invalid=clone(valid);
  invalid.questions[1].options[1].text='This option is too long because it includes an unnecessary explanation';
  const invalidQuestion=clone(valid.questions[1]);
  invalidQuestion.options[1].text='This remains too long because it is still explanatory and verbose';
  const invalidSet=clone(valid);
  invalidSet.questions[1]=invalidQuestion;
  const harness=buildContext([
    valid,
    invalid,
    {patches:[{questionNumber:2,path:'optionText',optionId:'B',value:'Still too long because it remains explanatory'}]},
    {questions:[invalidQuestion]},
    invalidSet
  ]);
  let failure='';
  try{await harness.engine.runPipeline(configFor(harness,conditions));}catch(error){failure=String(error.message||error);}
  assert(failure.includes('targeted field, affected-question and full-set repair were exhausted'),'Exhaustion message is unclear.');
  const saved=harness.engine.loadJob();
  assert(saved.status==='paused','Exhausted repair was not paused.');
  assert(saved.repair?.exhausted===true,'Exhausted repair metadata is missing.');
  assert(saved.currentSet?.quizId==='generation-valid','Failed repair output replaced the last valid checkpoint state.');
  assert(saved.currentIndex===1,'Resume would not restart the failed checkpoint.');
  assert(saved.repair.attemptedTiers.join(',')==='fields,questions,set','Repair tiers were not exhausted in the correct order.');
}

async function validateFinalFieldRepair(){
  const bootstrap=buildContext([],[]);
  const conditions=makeConditions(bootstrap.schema);
  const finalInvalid=makeSet(bootstrap.schema,conditions,'final-invalid');
  finalInvalid.questions[0].rationale='This rationale is intentionally much too long and continues explaining several unnecessary details that are not needed for the candidate to understand why the answer is correct, so it should trigger the final deterministic word limit and targeted field repair.';
  const harness=buildContext([
    finalInvalid,
    {patches:[{questionNumber:1,path:'rationale',optionId:null,value:'The decisive clue supports the correct same-category answer.'}]}
  ],['generation','shuffle','final']);
  const result=await harness.engine.runPipeline(configFor(harness,conditions));
  assert(result.questions[0].rationale.startsWith('The decisive clue'),'Final validation did not merge the targeted rationale patch.');
  assert(harness.requests.length===2,'Final field repair made unnecessary broader API calls.');
  assert(harness.requests[1].text.format.schema.properties.patches,'Final validation did not use field repair first.');
}

(async()=>{
  validatePlanning();
  await validateFieldRepairOnly();
  await validateEscalationToQuestion();
  await validateSetFallback();
  await validateExhaustionPreservesLastValid();
  await validateFinalFieldRepair();
  console.log(JSON.stringify({
    testedPipeline:'legacy-separate-v1',
    mechanicalFailuresUseAtomicPatches:true,
    unaffectedQuestionsOmitted:true,
    fieldRepairCalls:1,
    escalationOrder:['fields','questions','set'],
    structuralFailuresUseFullSet:true,
    exhaustedRepairPreservesLastValidSet:true,
    finalValidationUsesTargetedRepair:true,
    biomedicalRepairRulesPreserved:true
  },null,2));
})().catch(error=>{console.error(error);process.exit(1);});
