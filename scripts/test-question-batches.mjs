import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const storage=new Map();
const window={UKMLA_V2:{loadJson:(k,d)=>storage.has(k)?JSON.parse(storage.get(k)):d,saveJson:(k,v)=>storage.set(k,JSON.stringify(v))}};
const context=vm.createContext({window,localStorage:{removeItem:k=>storage.delete(k)},Date,Set});
vm.runInContext(fs.readFileSync('v2/ai-question-batches.js','utf8'),context);
const batches=window.UKMLA_QUESTION_BATCHES;
const conditions=Array.from({length:30},(_,i)=>({id:`c${i}`}));
const makeSet=(cards)=>({quizId:'same-model-id',questions:cards.map((c,i)=>({id:`q${i}`,questionNumber:i+1,targetConditionId:c.id})),buildTelemetry:{apiCalls:6}});
let calls=[],failAt=-1;
window.UKMLA_V2_AI_ENGINE={loadJob:()=>null,clearJob(){},async clearPendingSet(){},async runPipeline(config){
  calls.push(config);assert.equal(config.conditions.length,10);assert.equal(config.questionTypes.length,10);
  if(calls.length===failAt)throw Error('Connection stopped');
  config.onProgress('Checked',100,'complete','existing-pipeline');return makeSet(config.conditions);
}};
for(const count of [20,30]){
  calls=[];const batch=batches.create(conditions.slice(0,count),'All','browser');
  const result=await batches.runBrowser({batch,questionTypes:Array(10).fill('type'),onProgress(){}});
  assert.equal(calls.length,count/10);assert.equal(result.questions.length,count);
  assert.equal(new Set(result.questions.map(q=>q.id)).size,count);
  assert.equal(result.questions.at(-1).questionNumber,count);
  assert.equal(result.buildTelemetry.apiCalls,6*count/10);
}
calls=[];failAt=2;
const batch=batches.create(conditions,'All','browser');
await assert.rejects(batches.runBrowser({batch,questionTypes:Array(10).fill('type')}),/Connection stopped/);
assert.equal(batches.load().sets.length,1);
failAt=-1;calls=[];
const resumed=await batches.runBrowser({batch:batches.load(),questionTypes:Array(10).fill('type')});
assert.equal(calls.length,2);assert.equal(resumed.questions.length,30);
assert.throws(()=>batches.merge(batch),/Every batch/);
assert.throws(()=>batches.create(Array(20).fill(conditions[0]),'All','browser'),/distinct/);
assert.equal(batches.count('30'),30);assert.equal(batches.count('100'),10);
console.log('Question batch checks passed: counts, same pipeline, unique targets, numbering, telemetry, interrupted resume, incomplete rejection.');
// Exercise durable submission and recovery with the existing ten-question server contract.
batches.clear();
const nodes=new Map(['ai-mode','ai-topic','ai-count','ai-start'].map(id=>[id,{value:id==='ai-count'?'30':id==='ai-mode'?'random':'topic',addEventListener(){}}]));
const root={isConnected:true,dataset:{activeQuestionTab:'ai'},querySelector:s=>nodes.get(s.slice(1))||null};
let posted=[],stored=[],failStore=false,failPost=0;
window.UKMLA_V2={...window.UKMLA_V2,App:{conditions,topics:[]},selectCoverageCandidates:(pool,count)=>pool.slice(0,count),escapeHtml:String,toast(){}};
window.UKMLA_V2_AI={storeSet:async set=>{if(failStore)throw Error('Storage unavailable');stored.push(set);},renderSet(){}};
window.UKMLA_V2_AI_SCHEMA={TYPES:Array.from({length:10},(_,i)=>[`type${i}`,`Type ${i}`]),LIMITS:{},requestBody:config=>config,generationPrompt:config=>config,checkpointInstruction:id=>id};
window.addEventListener=()=>{};
Object.assign(context,{
 localStorage:{getItem:k=>k.includes('BuildToken')?'token':storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 document:{addEventListener(){},dispatchEvent(){},querySelectorAll:()=>[]},CustomEvent:class{},setTimeout:()=>1,clearTimeout(){},
 fetch:async (url,options)=>{
   if(options.method==='POST'){
     if(failPost===posted.length+1)throw Error('Offline');
     const payload=JSON.parse(options.body);assert.equal(payload.conditions.length,10);assert.equal(payload.questionTypes.length,10);
     posted.push(payload);return {ok:true,json:async()=>({job:{id:`job${posted.length}`,status:'queued'}})};
   }
   const index=Number(url.match(/job(\d+)$/)?.[1])-1;
   return {ok:true,json:async()=>({job:{id:`job${index+1}`,status:'complete',percent:100,result:makeSet(posted[index].conditions)}})};
 }
});
let source=fs.readFileSync('v2/ai-jarvis-background.js','utf8');
source=source.replace("if(token())setTimeout", "window.testServer={startBuild,refresh,setRoot(value){root=value;}};\nif(token())setTimeout");
vm.runInContext(source,context);
window.testServer.setRoot(root);
await window.testServer.startBuild();
assert.equal(posted.length,3);assert.equal(batches.load().jobs.length,3);
failStore=true;await window.testServer.refresh();
assert.equal(batches.load().jobs.length,3);assert.equal(stored.length,0);
failStore=false;await window.testServer.refresh();
assert.equal(stored.length,1);assert.equal(stored[0].questions.length,30);assert.equal(batches.load(),null);
// Partial submission resumes only unsent batches and preserves the fixed content.
posted=[];failPost=2;
await window.testServer.startBuild();assert.equal(posted.length,1);assert.equal(batches.load().jobs.length,1);
failPost=0;await window.testServer.refresh();await window.testServer.startBuild();
assert.equal(posted.length,3);await window.testServer.refresh();assert.equal(stored.length,2);
console.log('Durable batch checks passed: 30 questions, unchanged server contract, storage retry, interrupted submission resume.');
