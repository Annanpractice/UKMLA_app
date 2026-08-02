import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../v2/ai-unlimited-repair.js',import.meta.url),'utf8');
const JOB_KEY='ukmlaV2AiJobV1';
let savedJob=null;
let calls=0;
const receivedJobs=[];

const schema={
  REPAIR_TIERS:{fields:'fields',questions:'questions',set:'set'},
  repairPlan(errors,candidate,forcedTier){
    const tier=forcedTier||(errors.some(error=>!/^Q\d+/i.test(error))?'set':'questions');
    return{tier,errors:[...errors],questionNumbers:[2],label:tier};
  },
  stageLabel(){return'Option and answer-category review';}
};

const originalRunPipeline=async config=>{
  calls++;
  receivedJobs.push(config.job?JSON.parse(JSON.stringify(config.job)):null);
  savedJob={
    ...(config.job||{}),
    createdAt:config.job?.createdAt||new Date().toISOString(),
    status:'paused',
    percent:40,
    currentStage:'options_category',
    apiCalls:Number(config.job?.apiCalls||0)+1,
    apiAttemptsByStage:{options_category:Number(config.job?.apiAttemptsByStage?.options_category||0)+1},
    repairContinuationCount:Number(config.job?.repairContinuationCount||0),
    repair:{
      stageId:'options_category',
      stageLabel:'Option and answer-category review',
      tier:'set',
      tierLabel:'Full-set fallback repair',
      exhausted:true,
      startedAt:new Date().toISOString()
    }
  };
  throw new Error('Option and answer-category review stopped after targeted field, affected-question and full-set repair were exhausted.');
};

const engine={runPipeline:originalRunPipeline,loadJob:()=>savedJob&&JSON.parse(JSON.stringify(savedJob))};
const listeners=new Map();
const document={
  addEventListener(type,handler){listeners.set(type,handler);},
  dispatchEvent(){},
  getElementById(){return null;},
  createElement(){return{className:'',id:'',textContent:'',hidden:false};}
};
const window={
  UKMLA_V2_AI_ENGINE:engine,
  UKMLA_V2_AI_SCHEMA:schema,
  UKMLA_V2:{saveJson(key,value){assert.equal(key,JOB_KEY);savedJob=JSON.parse(JSON.stringify(value));}},
  addEventListener(){}
};
class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
const context={window,document,CustomEvent,setTimeout,clearTimeout,setInterval(){return 1;},Date,JSON,Math,Error,Number,String,Boolean,RegExp,Set};
vm.runInNewContext(source,context,{filename:'ai-unlimited-repair.js'});

const mixedPlan=schema.repairPlan(['Q2: type changed.','Question types are not unique.'],{});
assert.equal(mixedPlan.tier,'questions','derived uniqueness errors should not force full-set repair');
assert.deepEqual([...mixedPlan.errors],['Q2: type changed.']);

await assert.rejects(
  engine.runPipeline({persist:true,onProgress(){}}),
  error=>error.code==='UKMLA_REPAIR_BUDGET_PAUSED'
);
assert.equal(calls,3,'initial cycle plus two automatic continuations should run');
assert.equal(savedJob.status,'paused');
assert.equal(savedJob.repairBudgetPaused,true);
assert.equal(savedJob.repairContinuationCount,3);
assert.match(savedJob.lastMessage,/paused safely/i);
assert.equal(savedJob.repairBudget.maxAutomaticContinuations,2);

const firstPaused=JSON.parse(JSON.stringify(savedJob));
calls=0;
receivedJobs.length=0;
await assert.rejects(
  engine.runPipeline({persist:true,job:firstPaused,onProgress(){}}),
  error=>error.code==='UKMLA_REPAIR_BUDGET_PAUSED'
);
assert.equal(calls,3,'manual resume should receive a fresh automatic continuation budget');
assert.equal(receivedJobs[0].repairBudgetPaused,false);
assert.equal(receivedJobs[0].status,'active');
assert.equal(savedJob.repairContinuationCount,6);

assert.ok(!source.includes('retries remain unlimited'));
assert.ok(!source.includes('MutationObserver'));
console.log('AI repair budget regression passed.');
