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
  addEventListener(){}
  dispatchEvent(){return true;}
  getElementById(){return null;}
}
class CustomEventStub{
  constructor(type,init={}){this.type=type;this.detail=init.detail;}
}

function createHarness(mode,query=''){
  const localStorage=new MemoryStorage();
  const document=new EventTargetStub();
  const requests=[];
  const responses=[];
  const core={
    saveJson:(key,value)=>{localStorage.setItem(key,JSON.stringify(value));return true;},
    loadJson:(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}},
    coverageState:()=>({cycle:7}),
    STORAGE:{sets:'sets'}
  };
  const transport={send:async(_token,body)=>{
    requests.push(body);
    if(!responses.length)throw new Error('No mocked response remains.');
    return{output_text:JSON.stringify(responses.shift())};
  }};
  const window={UKMLA_V2:core,UKMLA_V2_AI_TRANSPORT:transport,addEventListener:()=>{}};
  const context={
    window,document,localStorage,CustomEvent:CustomEventStub,
    navigator:{onLine:true},console,location:{search:query},URLSearchParams,
    setTimeout:()=>0,clearTimeout:()=>{},Date,JSON,Math,Promise,TypeError,Error
  };
  vm.createContext(context);
  for(const file of ['v2/ai-schema.js','v2/biomedical-ai.js','v2/ai-pipeline-mode.js','v2/ai-targeted-repair.js','v2/ai-engine.js']){
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  const schema=context.window.UKMLA_V2_AI_SCHEMA;
  if(mode)schema.setPipelineMode(mode);
  return{context,schema,engine:context.window.UKMLA_V2_AI_ENGINE,requests,responses,localStorage};
}

function makeConditions(schema){
  return schema.TYPES.map((_type,index)=>({
    id:`condition-${index+1}`,
    topicId:`topic-${index+1}`,
    topic:`Topic ${index+1}`,
    name:`Condition ${index+1}`,
    profile:'clinical',
    fields:{investigations:'Investigation',treatment:'Treatment',escalation:'Escalation',mimics:'Mimic',redFlags:'Red flag'},
    labels:{},sourceRefs:[]
  }));
}

function makeSet(schema,conditions,id){
  return{
    schemaVersion:'ukmla-ai-quiz-v2',quizId:id,topic:'All UKMLA topics',
    generatedAt:'2026-07-14T00:00:00.000Z',difficulty:'very_difficult',
    questions:schema.TYPES.map((type,index)=>({
      id:`q-${index+1}`,
      questionNumber:index+1,
      questionType:type[0],
      questionTypeLabel:type[1],
      topicId:conditions[index].topicId,
      topicName:conditions[index].topic,
      targetConditionId:conditions[index].id,
      targetCondition:conditions[index].name,
      learningPoint:'Use the decisive clue to distinguish close clinical alternatives.',
      stem:'A stable adult has one decisive clinical finding requiring careful interpretation.',
      leadIn:'Select the single best answer.',
      options:'ABCDE'.split('').map((letter,optionIndex)=>({
        id:letter,
        text:`${['Immediate','Routine','Delayed','Conservative','Specialist'][optionIndex]} management`,
        topicId:conditions[index].topicId,
        topicName:conditions[index].topic,
        conditionId:conditions[index].id,
        conditionName:conditions[index].name,
        param:'treatment'
      })),
      correctOptionId:'A',
      decisiveClue:'One decisive clinical finding',
      rationale:'The decisive clue supports the correct same-category answer.',
      strongestDistractorId:'B',
      strongestDistractorExplanation:'The strongest distractor is plausible but conflicts with the decisive clue.',
      guideline:{source:'Internal UKMLA card atlas',title:conditions[index].name,checkedDate:null,url:null}
    }))
  };
}

async function runClean(mode,expectedCalls){
  const harness=createHarness(mode);
  const conditions=makeConditions(harness.schema);
  const set=makeSet(harness.schema,conditions,`set-${mode}`);
  for(let index=0;index<expectedCalls;index++)harness.responses.push(clone(set));
  const result=await harness.engine.runPipeline({
    apiKey:'test-key',knowledge:false,topic:'All UKMLA topics',conditions,
    questionTypes:harness.schema.TYPES.map(item=>item[0]),persist:true
  });
  assert(harness.requests.length===expectedCalls,`${mode} used ${harness.requests.length} API calls instead of ${expectedCalls}.`);
  assert(result.pipelineMode===mode,'Generated set did not retain its pipeline mode.');
  assert(result.buildTelemetry?.apiCalls===expectedCalls,'Generated set did not record the API-call count.');
  assert(result.schedulerSnapshot?.pipelineMode===mode,'Scheduler snapshot omitted the pipeline mode.');
  assert(Array.isArray(result.buildTelemetry?.stageTimings)&&result.buildTelemetry.stageTimings.length>0,'Stage timing telemetry is missing.');
  return{harness,result};
}

(async()=>{
  const bootstrap=createHarness(null);
  const modes=bootstrap.schema.PIPELINE_MODES;
  assert(bootstrap.schema.resolvePipelineMode(null)===modes.combined,'Combined trial is not the default for new builds.');

  const combined=await runClean(modes.combined,4);
  const combinedNames=combined.harness.requests.map(request=>request.text.format.name);
  assert(combinedNames.includes('ukmla_options_category_v3'),'Combined build did not call the combined checkpoint.');
  assert(!combinedNames.some(name=>name==='ukmla_options_v3'||name==='ukmla_category_v3'),'Combined build still made separate option/category calls.');

  const legacy=await runClean(modes.legacy,5);
  const legacyNames=legacy.harness.requests.map(request=>request.text.format.name);
  assert(legacyNames.includes('ukmla_options_v3')&&legacyNames.includes('ukmla_category_v3'),'Legacy rollback no longer restores both separate calls.');
  assert(!legacyNames.includes('ukmla_options_category_v3'),'Legacy rollback accidentally used the combined checkpoint.');

  const queryHarness=createHarness(null,'?pipeline=legacy');
  assert(queryHarness.schema.resolvePipelineMode(null)===modes.legacy,'The emergency ?pipeline=legacy override failed.');
  assert(queryHarness.localStorage.getItem(queryHarness.schema.PIPELINE_STORAGE_KEY)===modes.legacy,'Query rollback was not persisted.');

  const ui=fs.readFileSync('v2/ai-ui.js','utf8');
  assert(ui.includes('id="ai-pipeline-mode"'),'The visible pipeline selector is missing.');
  assert(ui.includes('Legacy mode restores separate option and semantic-category API reviews'),'The rollback explanation is missing.');

  const html=fs.readFileSync('v2/app.html','utf8');
  assert(html.indexOf('biomedical-ai.js')<html.indexOf('ai-pipeline-mode.js'),'Pipeline mode loads before biomedical rules.');
  assert(html.indexOf('ai-pipeline-mode.js')<html.indexOf('ai-targeted-repair.js'),'Targeted repair loads before pipeline mode.');
  assert(html.indexOf('ai-targeted-repair.js')<html.indexOf('ai-engine.js'),'Engine loads before targeted repair.');

  console.log(JSON.stringify({
    defaultMode:modes.combined,
    combinedCleanApiCalls:combined.harness.requests.length,
    legacyCleanApiCalls:legacy.harness.requests.length,
    qualityRulesRemoved:false,
    separateValidatorsRetained:true,
    visibleRollbackSelector:true,
    queryRollback:true,
    pipelineTelemetry:true
  },null,2));
})().catch(error=>{console.error(error);process.exit(1);});
