import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const DAY=86400000;
const now=Date.now();
const storage=new Map();
let events=[];
let index;
const card=(id,topic='resp')=>({id,topicId:topic,topic, name:id,fields:{Ix:'Local investigation detail',Tx:'Local management nuance'},sourceRefs:['Local card']});
const api={App:{loaded:true,conditions:[]},events:()=>events,eventIndex:()=>index,topicProgress:()=>({health:50})};
const window={UKMLA_V2:api};
const document={readyState:'loading',addEventListener(){}};
const context=vm.createContext({window,document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Date,Set,Map,setTimeout(){}});
vm.runInContext(fs.readFileSync('v2/answered-coverage.js','utf8'),context);
api.coverageState=window.UKMLA_ANSWERED_COVERAGE.rebuildCoverage;
api.selectCoverageCandidates=window.UKMLA_ANSWERED_COVERAGE.selectCoverageCandidates;
document.readyState='complete';
vm.runInContext(fs.readFileSync('v2/coverage-soft-diversity.js','utf8'),context);
const scheduler=window.UKMLA_ADAPTIVE_SELECTION;
function reset(cards,answers,covered=[]){
  storage.clear();api.App.conditions=cards;
  events=answers.map(([id,correct,age=4],i)=>({id:`event-${i}`,kind:'answered',source:'ai',conditionId:id,correct,at:new Date(now-age*DAY+i).toISOString()}));
  index={answers:events,conditionAnswered:{},conditionPresented:{}};
  for(const e of events){const row=index.conditionAnswered[e.conditionId]??={answered:0,correct:0};row.answered++;row.correct+=Number(e.correct);row.last=e.at;index.conditionPresented[e.conditionId]=row.answered;}
  const canonical={version:3,basis:'answered',cycle:2,completedCycles:1,covered,historicalCovered:[],startedAt:new Date(now-DAY).toISOString(),exactAnsweredFrom:new Date(now-10*DAY).toISOString(),migrationCycle:1};
  storage.set('ukmlaAnsweredCoverageStateV2',JSON.stringify(canonical));storage.set('ukmlaCoverageStateV1',JSON.stringify(canonical));
}
const correct=card('correct-once'),wrong=card('wrong-twice');
reset([correct,wrong],[['correct-once',true],['wrong-twice',false],['wrong-twice',false]],['correct-once','wrong-twice']);
assert.equal(api.selectCoverageCandidates([correct,wrong],1,{uniqueTopics:false})[0],wrong,'Repeated mistakes must beat fewer correct attempts');
reset([correct,wrong],[['correct-once',true],['wrong-twice',false],['wrong-twice',false]]);
assert.equal(api.selectCoverageCandidates([correct,wrong],1)[0],wrong,'A fresh cycle must not erase mistakes');

const cards=[...Array.from({length:30},(_,i)=>card(`weak-${i}`,`topic-${i%3}`)),...Array.from({length:20},(_,i)=>card(`new-${i}`,`topic-${i%3}`)),...Array.from({length:15},(_,i)=>card(`due-${i}`,`topic-${i%3}`)),card('not-due')];
const answers=[...cards.filter(c=>c.id.startsWith('weak')).map(c=>[c.id,false]),...cards.filter(c=>c.id.startsWith('due')).map(c=>[c.id,true]),['not-due',true,0]];
reset(cards,answers);
for(const n of [10,20,30]){
  const original=JSON.stringify(cards);
  const result=api.selectCoverageCandidates([...cards,cards[0]],n);
  assert.equal(result.length,n);assert.equal(new Set(result.map(c=>c.id)).size,n);
  assert.deepEqual(JSON.parse(JSON.stringify(api.adaptiveSelectionSnapshot.counts)),{weak:n*.6,unanswered:n*.3,due:n*.1,not_due:0});
  for(let i=0;i<n;i+=10){const batch=result.slice(i,i+10);assert.equal(batch.filter(c=>c.id.startsWith('weak')).length,6);assert.equal(batch.filter(c=>c.id.startsWith('new')).length,3);}
  assert.equal(JSON.stringify(cards),original,'Source content must be unchanged');
  result.forEach(item=>assert.ok(cards.includes(item),'Return original source-card objects'));
}
const scoped=cards.filter(c=>c.topicId==='topic-0');
assert.ok(api.selectCoverageCandidates(scoped,10,{uniqueTopics:false}).every(c=>c.topicId==='topic-0'));

const recovery=card('recovery'),strong=card('strong'),unknown=card('unknown');
reset([recovery,strong,unknown],[['recovery',false,10],['recovery',true,1],['strong',true,1]]);
assert.equal(scheduler.profiles([recovery])[0].bucket,'weak');
reset([recovery,strong,unknown],[['recovery',false,10],['recovery',true,5],['recovery',true,1],['strong',true,1]]);
assert.equal(scheduler.profiles([recovery])[0].bucket,'not_due');
reset([recovery,strong,unknown],[['recovery',false,10],['recovery',true,5],['recovery',true,1],['recovery',false,0]]);
assert.equal(scheduler.profiles([recovery])[0].bucket,'weak','A new error must restore priority');

reset([strong,unknown],[['strong',true,0]]);
assert.equal(api.selectCoverageCandidates([strong,unknown],1)[0],unknown);
assert.equal(api.selectCoverageCandidates([strong,unknown],10).length,2,'Small pools still fill available unique cards');
assert.equal(api.selectCoverageCandidates([],10).length,0);
assert.equal(api.selectCoverageCandidates([strong],0).length,0);
reset(cards,[]);
assert.equal(api.selectCoverageCandidates(cards,30).length,30,'No history still supplies unique targets');
assert.equal(api.adaptiveSelectionSnapshot.counts.unanswered,30);

reset([wrong,correct],[['wrong-twice',false],['correct-once',true]]);
events=[];index.answers=[];
assert.equal(api.selectCoverageCandidates([correct,wrong],1)[0],wrong,'Aggregate-only imported history is respected');
reset([wrong,correct],[['wrong-twice',false],['correct-once',true]]);
events.push({...events[0]});
assert.equal(scheduler.profiles([wrong])[0].answered,1,'Duplicate event IDs do not inflate history');
events=[{...events[0],source:'knowledge'}];index={answers:events,conditionAnswered:{},conditionPresented:{}};
assert.equal(scheduler.profiles([wrong])[0].bucket,'unanswered','Study-pack answers must not overwrite atlas history');

// Source boundary and the local best-fit format planner still consume exactly
// the selected cards, with all IDs, fields and source references unchanged.
reset(cards,answers);
const targets=api.selectCoverageCandidates(cards,10);
vm.runInContext(fs.readFileSync('v2/ai-schema.js','utf8'),context);
const schema=window.UKMLA_V2_AI_SCHEMA;
const prompt=schema.generationPrompt({conditions:targets,questionTypes:schema.TYPES.map(t=>t[0]),topic:'All'});
const payload=JSON.parse(prompt.split('\nSOURCE:\n')[1]);
assert.deepEqual(payload.targets.map(c=>c.conditionId),Array.from(targets,c=>c.id));
payload.targets.forEach((row,i)=>{assert.deepEqual(row.fields,targets[i].fields);assert.deepEqual(row.sourceRefs,targets[i].sourceRefs);});
assert.match(prompt,/factual boundary/);
assert.match(fs.readFileSync('v2/core.js','utf8'),/const selected=window.UKMLA_V2.selectCoverageCandidates\(pool/,'Local quiz must use the shared scheduler');
console.log('Adaptive selection passed: wrong-first, 10/20/30 mix, cycle survival, recovery, spaced review, scopes, small pools, imported history and unchanged source payload.');
