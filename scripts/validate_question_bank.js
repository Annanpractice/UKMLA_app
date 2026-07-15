const fs=require('fs');
const vm=require('vm');

function assert(condition,message){if(!condition)throw new Error(message);}

class MemoryStorage{
  constructor(limit=900000){this.map=new Map();this.limit=limit;}
  get length(){return this.map.size;}
  key(index){return[...this.map.keys()][index]??null;}
  getItem(key){return this.map.has(String(key))?this.map.get(String(key)):null;}
  setItem(key,value){
    const next=new Map(this.map);
    next.set(String(key),String(value));
    const chars=[...next].reduce((sum,[k,v])=>sum+k.length+v.length,0);
    if(chars>this.limit){const error=new Error('The quota has been exceeded.');error.name='QuotaExceededError';throw error;}
    this.map=next;
  }
  removeItem(key){this.map.delete(String(key));}
  clear(){this.map.clear();}
}
class SimpleEvent{constructor(type,init={}){this.type=type;Object.assign(this,init);}}
class SimpleEventTarget{
  constructor(){this.listeners=new Map();this.readyState='loading';}
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);}
  dispatchEvent(event){for(const listener of this.listeners.get(event.type)||[])listener(event);return true;}
  getElementById(){return null;}
}

(async()=>{
  const localStorage=new MemoryStorage();
  const document=new SimpleEventTarget();
  let uidCounter=0;
  const core={
    STORAGE:{sets:'ukmlaAiGeneratedQuizSetsV1',knowledge:'ukmlaKnowledgePackStatsV1'},
    App:{quiz:null},
    loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}},
    saveJson(key,value){localStorage.setItem(key,JSON.stringify(value));return true;},
    uid(prefix){uidCounter+=1;return`${prefix}-device-test-${uidCounter}`;},
    toast(){},events(){return[];},escapeHtml(value){return String(value??'');},TYPE_PARAM:{},
    scoreAnswer(){return true;},logPresented(){},logAnswered(){},analyticsSummary(){return'UKMLA QUIZ ANALYTICS\n';},
    copyText(){},downloadText(){}
  };
  const context={
    window:{UKMLA_V2:core,__UKMLA_LARGE_STORAGE_TEST__:true},document,localStorage,
    Event:SimpleEvent,CustomEvent:SimpleEvent,location:{hash:'#/home'},navigator:{storage:{estimate:async()=>({quota:50_000_000,usage:2_000_000})}},
    confirm:()=>true,setTimeout:()=>0,clearTimeout:()=>{},requestAnimationFrame:fn=>fn(),MutationObserver:class{observe(){}},
    URL,Blob,console,Map,Set,Date,JSON,Math,Promise,Error
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('v2/large-storage.js','utf8'),context,{filename:'v2/large-storage.js'});
  vm.runInContext(fs.readFileSync('v2/question-bank.js','utf8'),context,{filename:'v2/question-bank.js'});
  const large=context.window.UKMLA_LARGE_STORAGE;
  const bank=context.window.UKMLA_QUESTION_BANK;
  assert(large&&bank,'IndexedDB storage or Question Bank did not initialise.');
  await bank.migrateLegacy();

  const set={
    schemaVersion:'ukmla-ai-quiz-v2',quizId:'set-001',topic:'Cardiology',generatedAt:'2026-07-14T10:00:00.000Z',sourceType:'ai',
    questions:Array.from({length:10},(_,index)=>({
      id:`q${index+1}`,questionNumber:index+1,questionType:'first_line_investigation',questionTypeLabel:'First-line investigation',
      topicId:'topic-cardio',topicName:'Cardiovascular Problems',targetConditionId:`condition-${index+1}`,targetCondition:`Condition ${index+1}`,
      stem:`Stem ${index+1}`,leadIn:'Select the single best answer.',
      options:'ABCDE'.split('').map(letter=>({id:letter,text:`Option ${letter}`,topicName:'Cardiovascular Problems'})),correctOptionId:'A',rationale:'Rationale'
    }))
  };
  const record=await bank.storeSet(set,{sourceType:'ai'});
  assert(record?.setId==='set-001','Validated set was not stored.');
  assert(bank.bankIndex().length===1,'Question Bank index count is incorrect.');
  assert(localStorage.getItem(`${bank.SET_PREFIX}set-001`)===null,'Full payload remained in localStorage.');
  assert(await large.has(`${bank.SET_PREFIX}set-001`),'Full payload was not stored in IndexedDB.');
  assert((await bank.loadSet('set-001'))?.questions?.length===10,'IndexedDB payload could not be reopened.');

  const originalPayload=await large.getRaw(`${bank.SET_PREFIX}set-001`);
  await large.putRaw(`${bank.SET_PREFIX}set-001`,'{broken-json');
  assert(bank.bankIndex().length===1,'Bank index attempted to parse full payload.');
  assert(await bank.loadSet('set-001')===null,'Corrupt IndexedDB payload should fail closed.');
  await large.putRaw(`${bank.SET_PREFIX}set-001`,originalPayload);

  const legacyKey=`${bank.SET_PREFIX}legacy-local`;
  localStorage.setItem(legacyKey,JSON.stringify({...set,quizId:'legacy-local',setId:'legacy-local'}));
  const migrated=await large.migrateLocalPrefix(bank.SET_PREFIX);
  assert(migrated.migrated===1,'Legacy localStorage payload was not migrated.');
  assert(localStorage.getItem(legacyKey)===null&&await large.has(legacyKey),'Legacy payload was removed before IndexedDB verification.');

  const attempt=bank.beginAttempt('set-001',{attemptId:'attempt-001'});
  for(let index=0;index<10;index++)bank.recordAnswer(attempt.attemptId,{questionId:`q${index+1}`,questionIndex:index,selectedOptionId:index<7?'A':'B',correctOptionId:'A',correct:index<7});
  const completed=bank.attemptById('attempt-001');
  assert(completed.status==='completed'&&completed.percent===70&&completed.correctCount===7,'Attempt completion is incorrect.');

  const synthetic=Array.from({length:12},(_,index)=>({
    schemaVersion:bank.SCHEMA,attemptId:`rolling-${index}`,setId:'set-001',sourceType:'ai',title:'Cardiology',questionCount:10,status:'completed',
    currentIndex:9,answers:{},presentedQuestionIds:[],correctCount:index%11,percent:(index%11)*10,
    startedAt:`2026-07-${String(index+1).padStart(2,'0')}T09:00:00.000Z`,updatedAt:`2026-07-${String(index+1).padStart(2,'0')}T10:00:00.000Z`,
    completedAt:`2026-07-${String(index+1).padStart(2,'0')}T10:00:00.000Z`,deviceId:'device-test'
  }));
  localStorage.setItem(bank.ATTEMPTS_KEY,JSON.stringify(synthetic));
  const rolling=bank.rollingStats(10);
  assert(rolling.count===10&&rolling.correct===54&&rolling.questions===100&&rolling.percent===54,`Rolling calculation is incorrect: ${JSON.stringify(rolling)}`);

  vm.runInContext(fs.readFileSync('v2/sync.js','utf8'),context,{filename:'v2/sync.js'});
  const sync=context.window.UKMLA_V2_SYNC;
  assert(sync,'Sync module did not initialise.');
  const values=await sync.localValues();
  assert(values[`${bank.SET_PREFIX}set-001`],'IndexedDB payload was omitted from sync.');
  assert(values[bank.INDEX_KEY]&&values[bank.ATTEMPTS_KEY],'Index or attempts were omitted from sync.');
  const backup=await sync.backupPayload();
  assert(backup.schemaVersion==='ukmla-v2-backup-4-indexeddb','Backup schema was not advanced.');
  assert(backup.values[`${bank.SET_PREFIX}set-001`],'IndexedDB payload was omitted from backup.');

  const largeRemoteSet={...set,quizId:'remote-large',setId:'remote-large',questions:set.questions.map(q=>({...q,rationale:'x'.repeat(25000)}))};
  const remoteValues={
    [bank.INDEX_KEY]:JSON.stringify([...bank.bankIndex(),{...record,setId:'remote-large',payloadKey:`${bank.SET_PREFIX}remote-large`}]),
    [`${bank.SET_PREFIX}remote-large`]:JSON.stringify(largeRemoteSet),
    ukmlaQuizProgressV1:JSON.stringify({Cardiology:{health:72,attempts:8,correct:6}})
  };
  await sync.mergeRemote(remoteValues);
  assert(await large.has(`${bank.SET_PREFIX}remote-large`),'Large pulled payload was not placed in IndexedDB.');
  assert(localStorage.getItem(`${bank.SET_PREFIX}remote-large`)===null,'Large pulled payload consumed localStorage quota.');

  localStorage.setItem('ukmlaV2StateV1',JSON.stringify({safe:true}));
  const beforeState=localStorage.getItem('ukmlaV2StateV1');
  let quotaFailure='';
  try{await sync.mergeRemote({ukmlaV2StateV1:JSON.stringify({huge:'y'.repeat(1_200_000)})});}catch(error){quotaFailure=String(error.message||error);}
  assert(quotaFailure.includes('No partial import was kept'),'Quota failure did not report rollback safety.');
  assert(localStorage.getItem('ukmlaV2StateV1')===beforeState,'Quota failure left a partial localStorage import.');

  const mergedAttempts=JSON.parse(sync.mergeValue(bank.ATTEMPTS_KEY,
    JSON.stringify([{attemptId:'same',status:'completed',updatedAt:'2026-07-01',correctCount:8}]),
    JSON.stringify([{attemptId:'same',status:'in_progress',updatedAt:'2026-07-14',correctCount:3}])
  ));
  assert(mergedAttempts[0].status==='completed'&&mergedAttempts[0].correctCount===8,'Incomplete attempt replaced completed attempt.');

  const analyticsDocument=new SimpleEventTarget();
  const analyticsContext={...context,document:analyticsDocument,window:{...context.window}};
  vm.createContext(analyticsContext);
  vm.runInContext(fs.readFileSync('v2/question-analytics.js','utf8'),analyticsContext,{filename:'v2/question-analytics.js'});
  const analytics=analyticsContext.window.UKMLA_QUESTION_ANALYTICS;
  assert(analytics,'Question analytics did not initialise.');
  assert(analytics.chartSvg(synthetic.slice(0,3)).includes('Median'),'Run chart median is missing.');
  assert(analytics.runChartCsv().includes('attempt_id,set_id,completed_at'),'Run chart CSV headers are missing.');

  const html=fs.readFileSync('v2/app.html','utf8');
  assert(html.indexOf('large-storage.js')<html.indexOf('question-bank.js'),'IndexedDB layer does not load before Question Bank.');
  assert(html.includes('sync.js?v=4'),'IndexedDB-aware sync shell version is missing.');
  const serviceWorker=fs.readFileSync('service-worker.js','utf8');
  assert(serviceWorker.includes('ukmla-cards-v9-indexeddb-storage')&&serviceWorker.includes('large-storage.js'),'Offline cache does not include IndexedDB storage.');

  console.log(JSON.stringify({
    payloadBackend:'indexeddb',legacyLocalPayloadMigration:true,localStoragePayloadRemoved:true,
    backupIncludesIndexedDb:true,pullIncludesIndexedDb:true,quotaRollback:true,completedAttemptPercent:70,
    rollingLastTenPercent:rolling.percent,completedAttemptWinsMerge:true,offlineShell:true
  },null,2));
})().catch(error=>{console.error(error);process.exit(1);});
