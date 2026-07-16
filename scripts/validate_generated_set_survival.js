const fs=require('fs');
const vm=require('vm');

function assert(condition,message){if(!condition)throw new Error(message);}

class MemoryStorage{
  constructor(limit=1_000_000){this.map=new Map();this.limit=limit;}
  get length(){return this.map.size;}
  key(index){return[...this.map.keys()][index]??null;}
  getItem(key){return this.map.has(String(key))?this.map.get(String(key)):null;}
  setItem(key,value){
    const next=new Map(this.map);
    next.set(String(key),String(value));
    const chars=[...next].reduce((sum,[k,v])=>sum+k.length+v.length,0);
    if(chars>this.limit){const error=new Error('Quota exceeded');error.name='QuotaExceededError';throw error;}
    this.map=next;
  }
  removeItem(key){this.map.delete(String(key));}
  clear(){this.map.clear();}
}
class SimpleEvent{constructor(type,init={}){this.type=type;Object.assign(this,init);}}
class EventTarget{
  constructor(){this.listeners=new Map();this.readyState='loading';this.visibilityState='visible';}
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);}
  removeEventListener(type,listener){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==listener));}
  dispatchEvent(event){for(const listener of this.listeners.get(event.type)||[])listener(event);return true;}
  getElementById(){return null;}
}

(async()=>{
  const localStorage=new MemoryStorage();
  const document=new EventTarget();
  let uidCount=0;
  const core={
    STORAGE:{sets:'ukmlaAiGeneratedQuizSetsV1'},
    loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}},
    saveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}},
    uid(prefix){uidCount+=1;return`${prefix}-test-${uidCount}`;},
    toast(){},events(){return[];},escapeHtml(value){return String(value??'');},
    scoreAnswer(){return true;},logPresented(){},logAnswered(){},TYPE_PARAM:{},go(){},
    App:{quiz:null}
  };
  const windowTarget=new EventTarget();
  const window={
    ...windowTarget,
    addEventListener:windowTarget.addEventListener.bind(windowTarget),
    removeEventListener:windowTarget.removeEventListener.bind(windowTarget),
    dispatchEvent:windowTarget.dispatchEvent.bind(windowTarget),
    UKMLA_V2:core,
    UKMLA_V2_AI_SCHEMA:{},
    __UKMLA_LARGE_STORAGE_TEST__:true
  };
  const context={
    window,document,localStorage,
    Event:SimpleEvent,CustomEvent:SimpleEvent,
    navigator:{storage:{estimate:async()=>({quota:50_000_000,usage:1_000_000})}},
    setTimeout:fn=>{fn();return 1;},clearTimeout(){},confirm:()=>true,
    console,Map,Set,Date,JSON,Math,Promise,Error,TypeError,String,Number,Boolean,Array,RegExp
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('v2/large-storage.js','utf8'),context,{filename:'v2/large-storage.js'});
  vm.runInContext(fs.readFileSync('v2/question-bank.js','utf8'),context,{filename:'v2/question-bank.js'});
  vm.runInContext(fs.readFileSync('v2/ai-engine.js','utf8'),context,{filename:'v2/ai-engine.js'});

  const large=window.UKMLA_LARGE_STORAGE;
  const bank=window.UKMLA_QUESTION_BANK;
  const engine=window.UKMLA_V2_AI_ENGINE;
  assert(large&&bank&&engine,'Storage modules did not initialise.');
  assert(typeof bank.reconcileIndex==='function','Question Bank index reconciliation is missing.');
  assert(typeof engine.persistCompletedSet==='function'&&typeof engine.recoverableSets==='function','Durable completed-set queue is missing.');

  const makeSet=id=>({
    schemaVersion:'ukmla-ai-quiz-v2',quizId:id,topic:'All UKMLA topics',generatedAt:'2026-07-16T12:00:00.000Z',sourceType:'ai',
    questions:Array.from({length:10},(_,index)=>({
      id:`q${index+1}`,questionNumber:index+1,questionType:'first_line_investigation',questionTypeLabel:'First-line investigation',
      topicId:'topic-a',topicName:'Topic A',targetConditionId:`condition-${index+1}`,targetCondition:`Condition ${index+1}`,
      stem:`Stem ${index+1}`,leadIn:'Select the single best answer.',options:'ABCDE'.split('').map(letter=>({id:letter,text:`Option ${letter}`})),
      correctOptionId:'A',rationale:'Rationale',strongestDistractorExplanation:'Distractor'
    }))
  });

  const quotaSet=makeSet('quota-protected-set');
  localStorage.limit=1500;
  localStorage.setItem('quota-filler','x'.repeat(1380));
  const quotaRecord=await bank.storeSet(quotaSet,{sourceType:'ai'});
  assert(quotaRecord?.setId==='quota-protected-set','A full local index caused storeSet to fail.');
  assert(await large.has(`${bank.SET_PREFIX}quota-protected-set`),'IndexedDB payload was deleted when the local index was full.');
  assert(bank.bankIndex().some(item=>item.setId==='quota-protected-set'),'Volatile fallback index did not expose the protected set.');

  localStorage.removeItem('quota-filler');
  localStorage.limit=1_000_000;
  await bank.reconcileIndex();
  const persistedIndex=JSON.parse(localStorage.getItem(bank.INDEX_KEY)||'[]');
  assert(persistedIndex.some(item=>item.setId==='quota-protected-set'),'IndexedDB set was not rebuilt into the Question Bank index.');

  const pendingSet=makeSet('pending-completed-set');
  const job={id:'job-pending',status:'complete',percent:100,currentSet:pendingSet,pipelineMode:'combined',createdAt:'2026-07-16T12:00:00.000Z'};
  await engine.persistCompletedSet(pendingSet,job);
  const pendingKey=`${engine.PENDING_SET_PREFIX}pending-completed-set`;
  assert(await large.has(pendingKey),'Completed set was not written to the durable pending queue.');
  const lightweight=JSON.parse(localStorage.getItem('ukmlaV2AiJobV1')||'null');
  assert(lightweight&&lightweight.currentSet===null&&lightweight.pendingSetKey===pendingKey,'Completion record still stores the full set in localStorage.');
  const recoverable=await engine.recoverableSets();
  assert(recoverable.some(item=>item.set.quizId==='pending-completed-set'),'Pending IndexedDB set was not recoverable after completion.');

  const stored=await engine.storeSet(pendingSet);
  assert(stored?.setId==='pending-completed-set','Pending completed set could not be committed to the Question Bank.');
  assert(!(await large.has(pendingKey)),'Pending recovery payload was not removed after verified bank storage.');
  assert(localStorage.getItem('ukmlaV2AiJobV1')===null,'Lightweight completion record was not cleared after verified storage.');
  assert((await bank.loadSet('pending-completed-set'))?.questions?.length===10,'Verified Question Bank set could not be read back.');

  const recoverySource=fs.readFileSync('v2/ai-save-recovery.js','utf8');
  assert(recoverySource.includes('recoverableSets')&&recoverySource.includes('pendingCompletedSets'),'Recovery runtime does not scan the durable pending queue.');

  console.log(JSON.stringify({
    indexedDbPayloadSurvivesIndexQuota:true,
    indexRebuiltFromIndexedDb:true,
    completedSetQueuedBeforeBankSave:true,
    lightweightLocalRecoveryPointer:true,
    pendingSetCommittedAndVerified:true
  },null,2));
})().catch(error=>{console.error(error);process.exit(1);});
