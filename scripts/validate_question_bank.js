const fs = require('fs');
const vm = require('vm');

class MemoryStorage {
  constructor(){ this.map = new Map(); }
  get length(){ return this.map.size; }
  key(index){ return [...this.map.keys()][index] ?? null; }
  getItem(key){ return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key,value){ this.map.set(String(key),String(value)); }
  removeItem(key){ this.map.delete(String(key)); }
  clear(){ this.map.clear(); }
}

class SimpleEvent {
  constructor(type,init={}){ this.type=type; Object.assign(this,init); }
}
class SimpleEventTarget {
  constructor(){ this.listeners=new Map(); this.readyState='loading'; }
  addEventListener(type,listener){ if(!this.listeners.has(type))this.listeners.set(type,[]); this.listeners.get(type).push(listener); }
  dispatchEvent(event){ for(const listener of this.listeners.get(event.type)||[])listener(event); return true; }
  getElementById(){ return null; }
}

const localStorage = new MemoryStorage();
const document = new SimpleEventTarget();
let uidCounter=0;
const core = {
  STORAGE:{sets:'ukmlaAiGeneratedQuizSetsV1'},
  App:{quiz:null},
  loadJson(key,fallback){ try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;} },
  saveJson(key,value){ localStorage.setItem(key,JSON.stringify(value)); return true; },
  uid(prefix){ uidCounter+=1; return `${prefix}-device-test-${uidCounter}`; },
  toast(){},
  events(){ return []; },
  escapeHtml(value){ return String(value??''); },
  TYPE_PARAM:{},
  scoreAnswer(){ return true; },
  logPresented(){},
  logAnswered(){},
  analyticsSummary(){ return 'UKMLA QUIZ ANALYTICS\nOverall accuracy: 50%\n'; },
  copyText(){},
  downloadText(){}
};

const context = {
  window:{UKMLA_V2:core},
  document,
  localStorage,
  Event:SimpleEvent,
  CustomEvent:SimpleEvent,
  location:{hash:'#/home'},
  navigator:{},
  confirm:()=>true,
  setTimeout:()=>0,
  clearTimeout:()=>{},
  requestAnimationFrame:fn=>fn(),
  MutationObserver:class{ observe(){} },
  URL,
  Blob,
  console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('v2/question-bank.js','utf8'),context,{filename:'v2/question-bank.js'});
const bank=context.window.UKMLA_QUESTION_BANK;
if(!bank)throw new Error('Question Bank did not initialise.');

const set={
  schemaVersion:'ukmla-ai-quiz-v2',
  quizId:'set-001',
  topic:'Cardiology',
  generatedAt:'2026-07-14T10:00:00.000Z',
  sourceType:'ai',
  questions:Array.from({length:10},(_,index)=>({
    id:`q${index+1}`,
    questionNumber:index+1,
    questionType:'first_line_investigation',
    questionTypeLabel:'First-line investigation',
    topicId:'topic-cardio',
    topicName:'Cardiovascular Problems',
    targetConditionId:`condition-${index+1}`,
    targetCondition:`Condition ${index+1}`,
    stem:`Stem ${index+1}`,
    leadIn:'Select the single best answer.',
    options:'ABCDE'.split('').map(letter=>({id:letter,text:`Option ${letter}`,topicName:'Cardiovascular Problems'})),
    correctOptionId:'A',
    rationale:'Rationale'
  }))
};
const record=bank.storeSet(set,{sourceType:'ai'});
if(!record||record.setId!=='set-001')throw new Error('Validated set was not stored.');
if(bank.bankIndex().length!==1)throw new Error('Question Bank index count is incorrect.');
if(!localStorage.getItem(`${bank.SET_PREFIX}set-001`))throw new Error('Full set payload was not stored separately.');

const originalPayload=localStorage.getItem(`${bank.SET_PREFIX}set-001`);
localStorage.setItem(`${bank.SET_PREFIX}set-001`,'{broken-json');
if(bank.bankIndex().length!==1)throw new Error('Bank index attempted to parse the full set payload.');
if(bank.loadSet('set-001')!==null)throw new Error('Corrupt payload should fail closed when explicitly opened.');
localStorage.setItem(`${bank.SET_PREFIX}set-001`,originalPayload);

const attempt=bank.beginAttempt('set-001',{attemptId:'attempt-001'});
for(let index=0;index<10;index++){
  bank.recordAnswer(attempt.attemptId,{questionId:`q${index+1}`,questionIndex:index,selectedOptionId:index<7?'A':'B',correctOptionId:'A',correct:index<7});
}
const completed=bank.attemptById('attempt-001');
if(completed.status!=='completed'||completed.percent!==70||completed.correctCount!==7)throw new Error('Attempt completion or percentage is incorrect.');

const synthetic=Array.from({length:12},(_,index)=>({
  schemaVersion:bank.SCHEMA,
  attemptId:`rolling-${index}`,
  setId:'set-001',
  sourceType:'ai',
  title:'Cardiology',
  questionCount:10,
  status:'completed',
  currentIndex:9,
  answers:{},
  presentedQuestionIds:[],
  correctCount:index%11,
  percent:(index%11)*10,
  startedAt:`2026-07-${String(index+1).padStart(2,'0')}T09:00:00.000Z`,
  updatedAt:`2026-07-${String(index+1).padStart(2,'0')}T10:00:00.000Z`,
  completedAt:`2026-07-${String(index+1).padStart(2,'0')}T10:00:00.000Z`,
  deviceId:'device-test'
}));
localStorage.setItem(bank.ATTEMPTS_KEY,JSON.stringify(synthetic));
const rolling=bank.rollingStats(10);
if(rolling.count!==10||rolling.correct!==54||rolling.questions!==100||rolling.percent!==54){
  throw new Error(`Rolling last-ten calculation is incorrect: ${JSON.stringify(rolling)}`);
}

vm.runInContext(fs.readFileSync('v2/sync.js','utf8'),context,{filename:'v2/sync.js'});
const sync=context.window.UKMLA_V2_SYNC;
if(!sync)throw new Error('Sync module did not initialise.');
const values=sync.localValues();
if(!values[`${bank.SET_PREFIX}set-001`])throw new Error('Dynamic Question Bank payload was omitted from sync.');
if(!values[bank.INDEX_KEY]||!values[bank.ATTEMPTS_KEY])throw new Error('Question Bank index or attempts were omitted from sync.');
if(!sync.backupPayload().values[`${bank.SET_PREFIX}set-001`])throw new Error('Full Question Bank payload was omitted from backup.');

const mergedAttempts=JSON.parse(sync.mergeValue(bank.ATTEMPTS_KEY,
  JSON.stringify([{attemptId:'same',status:'completed',updatedAt:'2026-07-01',correctCount:8}]),
  JSON.stringify([{attemptId:'same',status:'in_progress',updatedAt:'2026-07-14',correctCount:3}])
));
if(mergedAttempts[0].status!=='completed'||mergedAttempts[0].correctCount!==8)throw new Error('An incomplete remote attempt replaced a completed attempt.');

const analyticsDocument=new SimpleEventTarget();
const analyticsContext={...context,document:analyticsDocument,window:{...context.window}};
vm.createContext(analyticsContext);
vm.runInContext(fs.readFileSync('v2/question-analytics.js','utf8'),analyticsContext,{filename:'v2/question-analytics.js'});
const analytics=analyticsContext.window.UKMLA_QUESTION_ANALYTICS;
if(!analytics)throw new Error('Question analytics did not initialise.');
const svg=analytics.chartSvg(synthetic.slice(0,3));
if(!svg.includes('run-chart-line')||!svg.includes('Median'))throw new Error('Run chart SVG is missing line or median.');
const csv=analytics.runChartCsv();
if(!csv.includes('attempt_id,set_id,completed_at'))throw new Error('Run chart CSV headers are missing.');

const html=fs.readFileSync('v2/app.html','utf8');
for(const file of ['question-bank.css','question-bank.js','question-analytics.js','service-worker.js']){
  if(!html.includes(file))throw new Error(`App shell does not reference ${file}.`);
}
const workspace=fs.readFileSync('v2/question-workspace.js','utf8');
if(!workspace.includes("bank:'Question Bank'")||!workspace.includes('UKMLA_QUESTION_BANK.mount(container)'))throw new Error('Question Bank tab is not wired to its workspace.');
const serviceWorker=fs.readFileSync('service-worker.js','utf8');
if(!serviceWorker.includes('ukmla-cards-v6-auto-checkpoint-repair')||!serviceWorker.includes("url.origin!==self.location.origin"))throw new Error('Offline service worker safeguards are missing.');

console.log(JSON.stringify({
  bankIndexRecords:bank.bankIndex().length,
  payloadStoredSeparately:true,
  completedAttemptPercent:70,
  rollingLastTenPercent:rolling.percent,
  rollingAttempts:rolling.count,
  dynamicPayloadIncludedInSync:true,
  completedAttemptWinsMerge:true,
  runChartSvg:true,
  offlineShell:true
},null,2));
