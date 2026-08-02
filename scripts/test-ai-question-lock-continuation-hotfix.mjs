import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../v2/ai-question-lock-continuation-hotfix.js',import.meta.url),'utf8');
const JOB_KEY='ukmlaV2AiJobV1';
const listeners=new Map();
const progress=[];
let savedJob=null;
let previousCalls=0;
let transportCalls=0;

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function question(number,stem='passing'){
  return{
    id:`q${number}`,
    questionNumber:number,
    questionType:`type${number}`,
    questionTypeLabel:`Type ${number}`,
    targetConditionId:`c${number}`,
    targetCondition:`Condition ${number}`,
    topicId:`t${number}`,
    topicName:`Topic ${number}`,
    stem,
    options:'ABCDE'.split('').map(id=>({id,text:`Option ${id}`})),
    correctOptionId:'A'
  };
}

const candidate={questions:Array.from({length:10},(_,index)=>question(index+1))};
candidate.questions[0].stem='bad';
const lockedQ2=clone(candidate.questions[1]);
const conditions=Array.from({length:10},(_,index)=>({id:`c${index+1}`,name:`Condition ${index+1}`,topicId:`t${index+1}`,topic:`Topic ${index+1}`}));
const questionTypes=Array.from({length:10},(_,index)=>`type${index+1}`);

const schema={
  REPAIR_TIERS:{fields:'fields',questions:'questions',set:'set'},
  STAGES:[],
  stagesForPipeline(){return[
    {id:'generation',percent:25},
    {id:'sparse',percent:40},
    {id:'options_category',percent:67},
    {id:'distractors',percent:84},
    {id:'final',percent:100,local:true}
  ];},
  stageLabel(id){return id==='options_category'?'Option and answer-category review':id;},
  validate(set){return set.questions[0].stem==='bad'?['Q1: option category mismatch.']:[];},
  repairPlan(errors,candidate,forcedTier){
    const tier=forcedTier||this.REPAIR_TIERS.questions;
    return{
      tier,
      label:tier===this.REPAIR_TIERS.set?'Question regeneration':'Affected-question repair',
      errors:[...errors],
      questionNumbers:[1],
      fields:[]
    };
  },
  targetedRepairPrompt(stage,config,plan){return`${stage}:${plan.tier}:${plan.questionNumbers.join(',')}`;},
  repairRequestBody(prompt,knowledge,name,tier){return{prompt,name,tier};},
  applyRepair(set,response,plan){
    const next=clone(set);
    const allowed=new Set(plan.questionNumbers||[]);
    for(const item of response.questions||[]){
      if(allowed.has(Number(item.questionNumber)))next.questions[Number(item.questionNumber)-1]=clone(item);
    }
    return next;
  },
  outputText(data){return JSON.stringify(data);},
  balancedShuffle(set){return set;}
};

function restoreImmutableMetadata(set,config){
  set.questions.forEach((item,index)=>{
    item.questionNumber=index+1;
    item.questionType=config.questionTypes[index];
    item.questionTypeLabel=`Type ${index+1}`;
    item.targetConditionId=config.conditions[index].id;
    item.targetCondition=config.conditions[index].name;
    item.topicId=config.conditions[index].topicId;
    item.topicName=config.conditions[index].topic;
  });
  return set;
}

const locks={
  restoreImmutableMetadata,
  ledgerFor(errors,candidate,config,stage){
    const unresolved=errors.length?[1]:[];
    return{
      stageId:'options_category',
      validationStage:stage,
      locked:10-unresolved.length,
      failed:unresolved.length,
      unresolvedQuestionNumbers:unresolved,
      percent:unresolved.length?64.3:67,
      stageStartPercent:40,
      stageEndPercent:67
    };
  }
};

const document={
  addEventListener(type,handler){const rows=listeners.get(type)||[];rows.push(handler);listeners.set(type,rows);},
  dispatchEvent(event){for(const handler of listeners.get(event.type)||[])handler(event);if(event.type==='ukmlaV2AiProgress')progress.push(clone(event.detail));}
};
class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}

// Reproduce the merged PR #63 listener: it turns the internal exhausted status
// into friendly progress text by mutating the event payload before the engine throws.
document.addEventListener('ukmlaV2AiProgress',event=>{
  const detail=event.detail;
  if(!detail?.repair?.exhausted)return;
  detail.status='repairing';
  detail.currentSet=clone(candidate);
  detail.lastMessage='Option and answer-category review · continuing unresolved question repair · 9/10 locked · repairing Q1 · API call 5';
});

const engine={
  async runPipeline(runConfig){
    previousCalls++;
    if(previousCalls===1){
      const exhausted={
        id:'job-1',
        status:'paused',
        currentStage:'options_category',
        currentIndex:2,
        percent:64.3,
        pipelineMode:'combined',
        currentSet:{questions:Array.from({length:10},(_,index)=>question(index+1,'older checkpoint'))},
        apiCalls:5,
        apiAttemptsByStage:{options_category:5},
        apiSuccessByStage:{options_category:4},
        completedStageIds:['generation','sparse'],
        conditions,
        questionTypes,
        repair:{
          stageId:'options_category',
          stageLabel:'Option and answer-category review',
          validationStage:'options_category',
          tier:'set',
          tierLabel:'Question regeneration',
          exhausted:true
        },
        lastMessage:'Option and answer-category review stopped after targeted field, affected-question and full-set repair were exhausted.'
      };
      savedJob=clone(exhausted);
      document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:exhausted}));
      assert.match(exhausted.lastMessage,/continuing unresolved question repair/,'the old listener must reproduce the production mutation');
      throw new Error(exhausted.lastMessage);
    }
    assert.equal(runConfig.job.currentIndex,3,'continuation should advance to the next checkpoint');
    assert.equal(runConfig.job.status,'active');
    return runConfig.job.currentSet;
  },
  loadJob(){return clone(savedJob);}
};

const transport={
  async send(token,body){
    transportCalls++;
    assert.equal(body.tier,'questions','continuation must request compact question JSON');
    const repaired=question(1,'repaired');
    // A hostile copy of a passing question must not be needed or returned.
    return{questions:[repaired]};
  }
};

const window={
  UKMLA_V2_AI_ENGINE:engine,
  UKMLA_V2_AI_SCHEMA:schema,
  UKMLA_V2_AI_TRANSPORT:transport,
  UKMLA_AI_QUESTION_LOCK_REPAIR:locks,
  UKMLA_V2:{saveJson(key,value){assert.equal(key,JOB_KEY);savedJob=clone(value);}}
};
const context={window,document,CustomEvent,setTimeout,clearTimeout,Date,JSON,Math,Error,TypeError,Number,String,Boolean,RegExp,Set,Map,Promise,console};
vm.runInNewContext(source,context,{filename:'ai-question-lock-continuation-hotfix.js'});

const result=await engine.runPipeline({
  apiKey:'test-key',
  persist:true,
  pipelineMode:'combined',
  conditions,
  questionTypes,
  knowledge:false,
  onProgress(){}
});

assert.equal(previousCalls,2,'the original pipeline should resume after question repair');
assert.equal(transportCalls,1,'only unresolved Q1 should require an API repair call');
assert.equal(result.questions[0].stem,'repaired');
assert.deepEqual(result.questions[1],lockedQ2,'passing Q2 must remain byte-for-byte unchanged');
assert.equal(savedJob.currentIndex,3);
assert.equal(savedJob.status,'active');
assert.equal(savedJob.checkpointProgress.locked,10);
assert.ok(progress.some(item=>item.currentSet?.questions?.[0]?.stem==='bad'),'the latest 9/10 candidate must be persisted before continuation');
assert.ok(!source.includes('MutationObserver'));
console.log('Question-lock continuation signal hotfix regression passed.');
