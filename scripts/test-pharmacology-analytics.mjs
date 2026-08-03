import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../v2/pharmacology-analytics.js',import.meta.url),'utf8');
const events=[
  {kind:'answered',source:'ai',quizId:'attempt-ai',questionId:'q1',conditionId:'drug-1',topicId:'topic-clinical-pharmacology-safe-prescribing',questionType:'stable_first_line_treatment',correct:true,at:'2026-08-01T10:00:00Z'},
  {kind:'answered',source:'pharmacology',quizId:'local-pharm',questionId:'q2',conditionId:'drug-2',topicId:'topic-clinical-pharmacology-safe-prescribing',questionType:'pharm_dose_calculation',correct:false,at:'2026-08-01T11:00:00Z'},
  {kind:'answered',source:'knowledge',quizId:'knowledge',questionId:'q3',conditionId:'drug-1',topicId:'topic-clinical-pharmacology-safe-prescribing',questionType:'stable_first_line_treatment',correct:true,at:'2026-08-01T12:00:00Z'}
];
const sets={
  'set-ai':{questions:[{id:'q1',questionType:'stable_first_line_treatment',stem:'Prescribe 5 mg orally once daily for 7 days.',leadIn:'Which exact regimen is correct?',options:[],targetCondition:'Drug one'}]},
  'local-pharm':{questions:[{id:'q2',questionType:'pharm_dose_calculation',calculationRequired:true,stem:'Calculate the dose.',options:[],targetCondition:'Drug two'}]}
};
const attempts=[{attemptId:'attempt-ai',setId:'set-ai',sourceType:'ai',status:'completed',completedAt:'2026-08-01T10:05:00Z',updatedAt:'2026-08-01T10:05:00Z',percent:100,correctCount:10,questionCount:10}];
const labels={
  pharm_indication:'Pharmacology: indication recognition',
  pharm_exact_regimen:'Pharmacology: exact regimen',
  pharm_dose_calculation:'Pharmacology: dose calculation',
  pharm_dose_modifier:'Pharmacology: dose modifier',
  pharm_contraindication_switch:'Pharmacology: contraindication switch',
  pharm_interaction_hazard:'Pharmacology: interaction hazard',
  pharm_adverse_effect:'Pharmacology: adverse-effect recognition',
  pharm_monitoring_action:'Pharmacology: monitoring action',
  pharm_prescription_review:'Pharmacology: prescription review',
  pharm_antidote_escalation:'Pharmacology: antidote or escalation'
};
const core={
  events:()=>events,
  App:{byId:new Map([['drug-1',{profile:'pharmacology'}],['drug-2',{profile:'pharmacology'}]]),topics:[]},
  TYPE_LABELS:labels,
  escapeHtml:value=>String(value),
  copyText:()=>{},downloadText:()=>{}
};
const bank={
  attemptById:id=>attempts.find(item=>item.attemptId===id)||null,
  loadSet:async id=>sets[id]||null,
  completedAttempts:()=>attempts,
  reconcileIndex:async()=>[],bankIndex:()=>[],beginAttempt:()=>null,recordPresented:()=>null,recordAnswer:()=>null
};
const analytics={
  aggregateAttempts:rows=>rows.length?[{groupNumber:1,startedAt:rows[0].completedAt,completedAt:rows.at(-1).completedAt,setCount:rows.length,correctCount:10,questionCount:10,percent:100,attemptIds:rows.map(row=>row.attemptId),setIds:rows.map(row=>row.setId)}]:[],
  chartSvg:()=>'<svg></svg>',analyticsSummary:()=>''
};
const document={readyState:'loading',addEventListener:()=>{},querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null};
const window={UKMLA_V2:core,UKMLA_QUESTION_BANK:bank,UKMLA_QUESTION_ANALYTICS:analytics,addEventListener:()=>{}};
const context={window,document,location:{hash:'#/analytics'},MutationObserver:class{},setTimeout:()=>0,clearTimeout:()=>{},console,Date,Map,Set,Promise,JSON,Math,String,Number,RegExp,Array,Object,Boolean};
vm.runInNewContext(source,context,{filename:'pharmacology-analytics.js'});
const api=window.UKMLA_PHARMACOLOGY_ANALYTICS;
assert.ok(api,'analytics extension should initialise its public API');
assert.equal(api.classifyQuestion({questionType:'stable_first_line_treatment',stem:'Which exact dose and route are correct?'}),'pharm_exact_regimen');
assert.equal(api.classifyQuestion({questionType:'first_line_investigation',stem:'Which INR monitoring action is required?'}),'pharm_monitoring_action');
assert.equal(api.classifyQuestion({questionType:'stable_first_line_treatment',calculationRequired:true,stem:'Calculate 5 mg/kg for a 20 kg child.'}),'pharm_dose_calculation');
assert.equal(api.classifyQuestion({questionType:'contraindication_caveat_switch',stem:'Which CYP3A4 interaction is most important?'}),'pharm_interaction_hazard');
assert.equal(api.allAnswerEvents().length,2,'knowledge answers should remain outside the recency question analytics');
assert.equal(await api.classifyEvent(events[0]),'pharm_exact_regimen','AI pharmacology events should resolve their stored question and gain a pharmacology category');
const stats=await api.pharmacologyStats();
assert.equal(stats.pharm_exact_regimen.answered,1);
assert.equal(stats.pharm_exact_regimen.accuracy,100);
assert.equal(stats.pharm_dose_calculation.answered,1);
assert.equal(stats.pharm_dose_calculation.accuracy,0);
assert.equal(api.eligibleAttempts().length,1);
assert.match(fs.readFileSync(new URL('../v2/daily-theme.js',import.meta.url),'utf8'),/pharmacology-analytics\.js\?v=1/);
assert.match(fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8'),/ukmla-cards-v42-pharmacology-analytics/);
console.log('Pharmacology analytics regression passed.');
