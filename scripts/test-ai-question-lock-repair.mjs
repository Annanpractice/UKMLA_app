import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../v2/ai-unlimited-repair.js',import.meta.url),'utf8');
const JOB_KEY='ukmlaV2AiJobV1';
const listeners=new Map();
const progress=[];
let savedJob=null;
let transportCalls=[];

function clone(value){return JSON.parse(JSON.stringify(value));}
function question(number,text='good'){
  return{
    id:`q${number}`,
    questionNumber:number,
    questionType:`type${number}`,
    questionTypeLabel:`Type ${number}`,
    targetConditionId:`c${number}`,
    targetCondition:`Condition ${number}`,
    topicId:`t${number}`,
    topicName:`Topic ${number}`,
    stem:text,
    options:[1,2,3,4,5].map((_,index)=>({id:'ABCDE'[index],text:`Option ${index+1}`})),
    correctOptionId:'A'
  };
}
const candidate={questions:Array.from({length:10},(_,index)=>question(index+1))};
candidate.questions[1].stem='bad';
candidate.questions[1].questionType='wrong-type';
const originalQ1=clone(candidate.questions[0]);

const TYPES=Array.from({length:10},(_,index)=>[`type${index+1}`,`Type ${index+1}`]);
const conditions=Array.from({length:10},(_,index)=>({id:`c${index+1}`,name:`Condition ${index+1}`,topicId:`t${index+1}`,topic:`Topic ${index+1}`,fields:{}}));
const config={
  apiKey:'test-key',
  persist:true,
  pipelineMode:'combined',
  questionTypes:TYPES.map(item=>item[0]),
  conditions,
  knowledge:false,
  onProgress(){}
};

const schema={
  TYPES,
  STAGES:[],
  REPAIR_TIERS:{fields:'fields',questions:'questions',set:'set'},
  REPAIR_TIER_LABELS:{fields:'Targeted field repair',questions:'Affected-question repair',set:'Full-set fallback repair'},
  stagesForPipeline(){return[
    {id:'generation',percent:25},
    {id:'sparse',percent:40},
    {id:'options_category',percent:67},
    {id:'distractors',percent:84},
    {id:'final',percent:100,local:true}
  ];},
  stageLabel(id){return id==='options_category'?'Option and answer-category review':id;},
  checkpointInstruction(){return'Keep options concise.';},
  validate(set){
    const errors=[];
    if(set.questions.length!==10)errors.push('Exactly ten questions are required.');
    set.questions.forEach((item,index)=>{
      if(item.stem==='bad')errors.push(`Q${index+1}: stem exceeds limit.`);
      if(item.questionType!==`type${index+1}`)errors.push(`Q${index+1}: type changed.`);
      if(item.targetConditionId!==`c${index+1}`)errors.push(`Q${index+1}: target changed.`);
    });
    if(new Set(set.questions.map(item=>item.questionType)).size!==10)errors.push('Question types are not unique.');
    return errors;
  },
  repairPlan(errors,candidate,forcedTier){
    const tier=forcedTier||(errors.every(error=>/stem exceeds/.test(error))?'fields':'questions');
    return{
      tier,
      label:this.REPAIR_TIER_LABELS[tier],
      errors:[...errors],
      questionNumbers:[2],
      fields:tier==='fields'?[{questionNumber:2,path:'stem',optionId:null,error:errors[0]}]:[]
    };
  },
  targetedRepairPrompt(stage,config,plan){return`${stage}:${plan.tier}:${plan.questionNumbers.join(',')}`;},
  repairRequestBody(prompt,knowledge,name,tier){return{prompt,name,tier};},
  applyRepair(set,response,plan){
    const next=clone(set);
    if(plan.tier==='fields'){
      for(const patch of response.patches||[])next.questions[patch.questionNumber-1][patch.path]=patch.value;
    }else{
      const allowed=new Set(plan.questionNumbers);
      for(const item of response.questions||[]){if(allowed.has(item.questionNumber))next.questions[item.questionNumber-1]=clone(item);}
    }
    return next;
  },
  outputText(data){return JSON.stringify(data);},
  balancedShuffle(set){return set;},
  questionRepairSchema(){return{};}
};

const document={
  addEventListener(type,handler){const rows=listeners.get(type)||[];rows.push(handler);listeners.set(type,rows);},
  dispatchEvent(event){for(const handler of listeners.get(event.type)||[])handler(event);if(event.type==='ukmlaV2AiProgress')progress.push(clone(event.detail));},
  getElementById(){return null;},
  createElement(){return{className:'',id:'',textContent:'',hidden:false,insertAdjacentElement(){}};}
};
class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}

let originalCalls=0;
const engine={
  async runPipeline(runConfig){
    originalCalls++;
    if(originalCalls===1){
      const job={
        id:'job1',status:'active',currentStage:'options_category',currentIndex:2,percent:40,
        pipelineMode:'combined',currentSet:clone(candidate),apiCalls:1,apiAttemptsByStage:{options_category:1},
        apiSuccessByStage:{options_category:1},completedStageIds:['generation','sparse'],questionTypes:config.questionTypes,
        conditions,repair:{stageId:'options_category',stageLabel:'Option and answer-category review',exhausted:false}
      };
      document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:job}));
      schema.validate(candidate,config,'options_category');
      savedJob={...job,status:'paused',currentSet:{questions:Array.from({length:10},(_,index)=>question(index+1,'old'))},repair:{stageId:'options_category',stageLabel:'Option and answer-category review',tier:'set',tierLabel:'Full-set fallback repair',exhausted:true}};
      document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:savedJob}));
      throw new Error('Option and answer-category review stopped after targeted field, affected-question and full-set repair were exhausted.');
    }
    assert.equal(runConfig.job.currentIndex,3,'resume should advance to the next checkpoint');
    return runConfig.job.currentSet;
  },
  loadJob(){return savedJob&&clone(savedJob);}
};

const transport={
  async send(token,body){
    transportCalls.push(clone(body));
    if(transportCalls.length===1)return{patches:[{questionNumber:2,path:'stem',optionId:null,value:'bad'}]};
    if(transportCalls.length===2){
      const q2=question(2,'bad');
      return{questions:[{...question(1,'malicious-change')},q2]};
    }
    return{questions:[{...question(1,'malicious-change')},question(2,'repaired')]};
  }
};

const window={
  UKMLA_V2_AI_ENGINE:engine,
  UKMLA_V2_AI_SCHEMA:schema,
  UKMLA_V2_AI_TRANSPORT:transport,
  UKMLA_V2:{saveJson(key,value){assert.equal(key,JOB_KEY);savedJob=clone(value);}},
  addEventListener(){},
  removeEventListener(){}
};
const context={window,document,CustomEvent,setTimeout,clearTimeout,Date,JSON,Math,Error,TypeError,Number,String,Boolean,RegExp,Set,Map,Promise,console};
vm.runInNewContext(source,context,{filename:'ai-unlimited-repair.js'});

const result=await engine.runPipeline(config);
assert.equal(result.questions[1].stem,'repaired');
assert.deepEqual(result.questions[0],originalQ1,'passing Q1 must remain byte-for-byte unchanged');
assert.equal(result.questions[1].questionType,'type2','immutable type assignment should be restored locally');
assert.equal(transportCalls.length,3,'only the unresolved question should progress through three repair tiers');
assert.deepEqual(transportCalls.map(call=>call.tier),['fields','questions','questions'],'the final fallback must use compact question JSON, never the full-set schema');
assert.ok(progress.some(item=>item.checkpointProgress?.locked===9&&item.percent>40&&item.percent<67),'intra-checkpoint progress should move above 40% when nine questions are locked');
assert.equal(savedJob.status,'active');
assert.equal(savedJob.percent,67);
assert.equal(savedJob.checkpointProgress.locked,10);
assert.equal(savedJob.currentIndex,3);
assert.ok(!source.includes('retries remain unlimited'));
assert.ok(source.includes('Question regeneration'));
assert.ok(!source.includes('MutationObserver'));
console.log('Question-lock repair regression passed.');
