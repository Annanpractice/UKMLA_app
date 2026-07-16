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
  for(const file of ['v2/ai-schema.js','v2/biomedical-ai.js','v2/ai-giveaway-validator.js','v2/ai-pipeline-mode.js','v2/ai-sba-audit.js','v2/ai-targeted-repair.js','v2/ai-engine.js']){
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

function validateGiveawayRouting(harness){
  const conditions=makeConditions(harness.schema);
  const set=makeSet(harness.schema,conditions,'giveaway-route');
  const question=set.questions[0];
  question.stem='After a surgical-neck humeral fracture, examination shows weak shoulder abduction and numbness over the lateral shoulder.';
  question.leadIn='Which nerve is injured?';
  const texts=['Radial nerve','Musculocutaneous nerve','Thoracodorsal nerve','Suprascapular nerve','Axillary nerve affecting deltoid and lateral shoulder sensation'];
  question.options=question.options.map((option,index)=>({...option,id:'ABCDE'[index],text:texts[index]}));
  question.correctOptionId='E';
  const config={conditions,questionTypes:harness.schema.TYPES.map(item=>item[0]),knowledge:false};
  const errors=harness.schema.validate(set,config,'options_category');
  assert(errors.some(error=>error.includes('correct option E repeats or paraphrases stem clues')),'Giveaway validator did not produce a repairable question error.');
  const plan=harness.schema.repairPlan(errors,set);
  assert(plan.tier==='questions','Semantic clue duplication should repair the affected question, not one field or the full set.');
  assert(plan.questionNumbers.join(',')==='1','Giveaway repair did not isolate the affected question.');
  const prompt=harness.schema.targetedRepairPrompt('options_category',config,plan,set,1,2,null);
  assert(prompt.includes('question numbers 1'),'Affected-question prompt omitted the giveaway question.');
  assert(!prompt.includes('"questionNumber":2,'),'Affected-question prompt included unaffected questions.');
}

function validateSbaAudit(harness){
  const conditions=makeConditions(harness.schema);
  const set=makeSet(harness.schema,conditions,'sba-audit-prompt');
  const config={conditions,questionTypes:harness.schema.TYPES.map(item=>item[0]),knowledge:false,currentSet:set};
  const stages=harness.schema.stagesForPipeline(harness.schema.PIPELINE_MODES.combined);
  const distractorIndex=stages.findIndex(stage=>stage.id==='distractors');
  const auditIndex=stages.findIndex(stage=>stage.id==='sba_audit');
  assert(auditIndex===distractorIndex+1,'SBA audit is not immediately after distractor review.');
  const prompt=harness.schema.checkpointPrompt('sba_audit',config);
  assert(prompt.includes('Could a knowledgeable but imperfect candidate reasonably choose this distractor because of a specific misconception?'),'SBA audit omitted the mandatory distractor plausibility question.');
  for(const wording of ['KEYWORD DUMPS','Cushing response acute raised ICP bradycardia high blood pressure triad','risking','via','limiting','At least three','obviously unethical','comparable structures']){
    assert(prompt.includes(wording),`SBA audit prompt omitted: ${wording}`);
  }
  const optionPrompt=harness.schema.checkpointPrompt('options_category',config);
  assert(optionPrompt.includes('Cushing response acute raised ICP bradycardia high blood pressure triad'),'Combined option checkpoint was not reinforced against screenshot-style answer dumps.');
  const distractorPrompt=harness.schema.checkpointPrompt('distractors',config);
  assert(distractorPrompt.includes('At least three of the four wrong options must be genuine close competitors.'),'Distractor checkpoint was not reinforced with the three-near-miss rule.');
}

function validateScreenshotFailure(harness){
  const conditions=makeConditions(harness.schema);
  const set=makeSet(harness.schema,conditions,'screenshot-regression');
  const question=set.questions[0];
  question.stem='Following severe head trauma, the patient develops an acute, sustained rise in systolic blood pressure.';
  question.leadIn='Most likely diagnosis?';
  const texts=[
    'Cushing response acute raised ICP bradycardia high blood pressure triad',
    'Opioid overdose respiratory depression miosis reduced consciousness naloxone',
    'Hypertensive emergency severe hypertension end organ damage urgent treatment now',
    'Neurogenic shock hypotension bradycardia warm reduced SVR distributive shock',
    'Vasovagal syncope bradycardia hypotension fainting common benign'
  ];
  question.options=question.options.map((option,index)=>({...option,id:'ABCDE'[index],text:texts[index]}));
  question.correctOptionId='A';
  const config={conditions,questionTypes:harness.schema.TYPES.map(item=>item[0]),knowledge:false};
  const errors=harness.schema.validate(set,config,'sba_audit');
  assert(errors.some(error=>error.includes('clue-stacked keyword strings')),'Screenshot-style keyword-dump options passed the local SBA hard gate.');
  assert(errors.some(error=>error.includes('diagnostic options contain management or treatment wording')),'Treatment wording inside diagnostic options was not rejected.');
  const plan=harness.schema.repairPlan(errors,set);
  assert(plan.tier==='questions','Screenshot-style failure should trigger affected-question repair.');
  assert(plan.questionNumbers.join(',')==='1','Screenshot-style failure did not isolate question 1.');
}

async function runClean(mode,expectedCalls,query=''){
  const harness=createHarness(mode,query);
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
  for(const stageId of result.buildTelemetry?.requiredApiStages||[]){
    assert(Number(result.buildTelemetry?.apiSuccessByStage?.[stageId]||0)>=1,`Required API checkpoint ${stageId} was not recorded as successful.`);
  }
  return{harness,result};
}

(async()=>{
  const bootstrap=createHarness(null);
  const modes=bootstrap.schema.PIPELINE_MODES;
  assert(bootstrap.schema.resolvePipelineMode(null)===modes.combined,'Combined trial is not the default for new builds.');
  assert(typeof bootstrap.schema.analyseGiveawayQuestion==='function','Local anti-giveaway validator did not initialise.');
  assert(typeof bootstrap.schema.isSbaAuditEnabled==='function','SBA audit checkpoint did not initialise.');
  assert(bootstrap.schema.isSbaAuditEnabled()===true,'SBA audit is not enabled by default.');
  validateGiveawayRouting(bootstrap);
  validateSbaAudit(bootstrap);
  validateScreenshotFailure(bootstrap);

  const combined=await runClean(modes.combined,5);
  const combinedNames=combined.harness.requests.map(request=>request.text.format.name);
  assert(combinedNames.includes('ukmla_options_category_v3'),'Combined build did not call the combined checkpoint.');
  assert(combinedNames.includes('ukmla_sba_audit_v3'),'Combined build did not call the SBA quality audit.');
  assert(!combinedNames.some(name=>name==='ukmla_options_v3'||name==='ukmla_category_v3'),'Combined build still made separate option/category calls.');
  assert(combined.result.buildTelemetry?.sbaAudit?.required===true,'Combined telemetry did not mark the SBA audit as required.');
  assert(combined.result.buildTelemetry?.sbaAudit?.successfulApiCalls===1,'Combined telemetry did not prove one successful SBA audit API call.');
  assert(combined.result.buildTelemetry?.apiSuccessByStage?.options_category===1,'Combined option/category API checkpoint was not recorded as successful.');
  assert(combined.result.buildTelemetry?.apiSuccessByStage?.distractors===1,'Distractor API checkpoint was not recorded as successful.');

  const auditOff=await runClean(modes.combined,4,'?sbaAudit=off');
  const auditOffNames=auditOff.harness.requests.map(request=>request.text.format.name);
  assert(!auditOffNames.includes('ukmla_sba_audit_v3'),'The emergency ?sbaAudit=off override did not remove the audit API call.');
  assert(auditOff.harness.schema.isSbaAuditEnabled()===false,'The emergency SBA audit switch did not report disabled state.');
  assert(auditOff.result.buildTelemetry?.sbaAudit?.required===false,'Audit-off telemetry still marked the SBA audit as required.');

  const legacy=await runClean(modes.legacy,5);
  const legacyNames=legacy.harness.requests.map(request=>request.text.format.name);
  assert(legacyNames.includes('ukmla_options_v3')&&legacyNames.includes('ukmla_category_v3'),'Legacy rollback no longer restores both separate calls.');
  assert(!legacyNames.includes('ukmla_options_category_v3'),'Legacy rollback accidentally used the combined checkpoint.');
  assert(!legacyNames.includes('ukmla_sba_audit_v3'),'Independent SBA audit altered the legacy rollback pipeline.');

  const queryHarness=createHarness(null,'?pipeline=legacy');
  assert(queryHarness.schema.resolvePipelineMode(null)===modes.legacy,'The emergency ?pipeline=legacy override failed.');
  assert(queryHarness.localStorage.getItem(queryHarness.schema.PIPELINE_STORAGE_KEY)===modes.legacy,'Query rollback was not persisted.');

  const ui=fs.readFileSync('v2/ai-ui.js','utf8');
  assert(ui.includes('id="ai-pipeline-mode"'),'The visible pipeline selector is missing.');
  assert(ui.includes('Legacy mode restores separate option and semantic-category API reviews'),'The rollback explanation is missing.');

  const html=fs.readFileSync('v2/app.html','utf8');
  assert(html.indexOf('biomedical-ai.js')<html.indexOf('ai-giveaway-validator.js'),'Giveaway validator loads before biomedical validation.');
  assert(html.indexOf('ai-giveaway-validator.js')<html.indexOf('ai-pipeline-mode.js'),'Pipeline mode captured validation before the giveaway checker.');
  assert(html.indexOf('ai-pipeline-mode.js')<html.indexOf('ai-sba-audit.js'),'SBA audit loads before pipeline mode.');
  assert(html.indexOf('ai-sba-audit.js')<html.indexOf('ai-targeted-repair.js'),'Targeted repair loads before the SBA audit.');
  assert(html.indexOf('ai-targeted-repair.js')<html.indexOf('ai-engine.js'),'Engine loads before targeted repair.');
  const serviceWorker=fs.readFileSync('service-worker.js','utf8');
  assert(serviceWorker.includes('ai-giveaway-validator.js'),'Offline cache omitted the local giveaway validator.');
  assert(serviceWorker.includes('ai-sba-audit.js'),'Offline cache omitted the SBA audit checkpoint.');

  const engineSource=fs.readFileSync('v2/ai-engine.js','utf8');
  assert(engineSource.includes('assertRequiredApiCheckpoints'),'Runtime does not hard-stop when an API checkpoint is skipped.');
  assert(engineSource.includes('apiSuccessByStage'),'Runtime does not record successful API calls by checkpoint.');

  console.log(JSON.stringify({
    defaultMode:modes.combined,
    combinedCleanApiCalls:combined.harness.requests.length,
    combinedAuditOffApiCalls:auditOff.harness.requests.length,
    legacyCleanApiCalls:legacy.harness.requests.length,
    qualityRulesRemoved:false,
    separateValidatorsRetained:true,
    localGiveawayValidator:true,
    screenshotRegressionRejected:true,
    giveawayRepairTier:'questions',
    unaffectedQuestionsOmitted:true,
    dedicatedSbaAuditApiCall:true,
    requiredApiCheckpointProof:true,
    sbaAuditEmergencySwitch:true,
    legacyRollbackUnchanged:true,
    visibleRollbackSelector:true,
    queryRollback:true,
    pipelineTelemetry:true
  },null,2));
})().catch(error=>{console.error(error);process.exit(1);});