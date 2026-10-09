import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('v2/question-mapping-background.js','utf8');

function harness(total=2){
  const rows=Array.from({length:total},(_,index)=>({
    id:'q'+(index+1),questionType:'imported_textbook_sba',
    stem:index%2===0?'Matching clinical topic':'Rare learning point',leadIn:'Choose an answer',
    options:[{id:'A',text:'Correct therapy'},{id:'B',text:'Wrong therapy'}],
    correctOptionId:'A',rationale:'Original explanation',importedMappingStatus:'pending'
  }));
  let set={setId:'set1',topic:'Imported questions',sourceType:'imported',questions:rows};
  const original=JSON.stringify(set.questions);
  const values=new Map([['ukmlaJarvis2BuildTokenV1','ukmla_test_token']]);
  const events=[];
  let calls=0;
  let failAt=0;
  const storage={
    getItem(key){return values.get(key)??null;},
    setItem(key,value){values.set(key,String(value));},
    removeItem(key){values.delete(key);}
  };
  const card={id:'card-1',name:'Matching clinical card',topicId:'a',topic:'Topic A',fields:{Tx:'Correct therapy'}};
  const core={
    App:{byId:new Map([['card-1',card]])},
    uid:()=>'mapping-test-1',
    toast(message){events.push(message);},
    logPresented(){},logAnswered(){}
  };
  const bank={
    async loadSet(){return structuredClone(set);},
    async storeSet(next){set=structuredClone(next);return {setId:'set1'};},
    bankIndex(){return[{setId:'set1',title:'Original questions'}];},
    attempts(){return[];}
  };
  const importer={
    shortlist(question){return question.stem.startsWith('Matching')?[{condition:card,score:20}]:[];},
    candidatePayload(item){return{
      conditionId:item.condition.id,name:item.condition.name,topicId:item.condition.topicId,
      topicName:item.condition.topic,fields:item.condition.fields,localScore:item.score
    };}
  };
  const worker=async(_url,options)=>{
    calls++;
    if(calls===failAt)throw new Error('Transient connectivity failure');
    const {items}=JSON.parse(options.body);
    return{ok:true,async json(){return{results:items.map(item=>item.candidates.length
      ?{itemId:item.itemId,status:'matched',selectedConditionId:'card-1'}
      :{itemId:item.itemId,status:'unmapped',suggestedCardTitle:'Rare condition overview',
        suggestedCardTitles:['Rare condition overview','Rare condition management','Rare condition red flags'],
        missingCardExplanation:'The atlas does not cover the tested mechanism.'}
    )};}};
  };
  const document={
    readyState:'loading',
    addEventListener(){},
    dispatchEvent(event){events.push(event.type);}
  };
  class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}}
  const context=vm.createContext({
    window:{UKMLA_V2:core,UKMLA_QUESTION_BANK:bank,UKMLA_QUESTION_IMPORTER:importer},
    localStorage:storage,document,fetch:worker,CustomEvent,AbortController,
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},
    Date,Math,JSON,Map,Set,Promise,Error
  });
  vm.runInContext(source,context);
  return{
    api:context.window.UKMLA_QUESTION_MAPPING,events,values,original,
    get set(){return set;},get calls(){return calls;},failOn(n){failAt=n;}
  };
}

test('Luna maps imported questions without a user approval queue',async()=>{
  const h=harness();
  assert.equal(await h.api.enqueueSet('set1'),true);
  assert.equal(await h.api.enqueueSet('set1'),true,'duplicate taps must not queue duplicate work');
  assert.equal(h.api.queue().length,1);
  await h.api.processQueue();
  assert.equal(h.calls,1);
  assert.equal(h.api.queue().length,0);
  assert.equal(h.set.questions[0].importedMappingStatus,'confirmed');
  assert.equal(h.set.questions[0].targetConditionId,'card-1');
  assert.equal(h.set.questions[1].importedMappingStatus,'unmapped');
  assert.equal(h.set.questions[1].suggestedCardTitles.length,3);
  assert.match(h.set.questions[1].missingCardExplanation,/does not cover/);
  assert.equal(h.set.questions[0].stem,'Matching clinical topic');
  assert.equal(h.set.questions[0].rationale,'Original explanation');
  assert.equal(h.values.has('ukmlaQuestionMappingRecommendationsV1'),false);
  assert.ok(h.events.includes('ukmlaQuestionMappingUpdated'));
});

test('failed batches retain completed AI decisions and resume only remaining questions',async()=>{
  const h=harness(6);
  h.failOn(2);
  await h.api.enqueueSet('set1');
  await h.api.processQueue();
  assert.equal(h.calls,2);
  assert.equal(h.api.queue()[0].results.length,5);
  let pending=JSON.parse(h.values.get('ukmlaQuestionMappingQueueV1'));
  pending[0].nextAttemptAt=0;
  h.values.set('ukmlaQuestionMappingQueueV1',JSON.stringify(pending));
  await h.api.processQueue();
  assert.equal(h.calls,3,'only the previously failed question should be retried');
  assert.equal(h.api.queue().length,0);
  assert.equal(h.set.questions.filter(q=>q.importedMappingStatus==='confirmed').length,3);
  assert.equal(h.set.questions.filter(q=>q.importedMappingStatus==='unmapped').length,3);
});

test('no matching candidate is not falsely marked as a confirmed card',async()=>{
  const h=harness(2);
  await h.api.enqueueSet('set1');
  await h.api.processQueue();
  assert.equal(h.set.questions[1].targetConditionId,'');
  assert.ok(h.set.questions[1].suggestedCardTitles[0]);
});