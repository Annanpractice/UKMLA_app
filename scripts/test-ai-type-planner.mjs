import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const TYPES=[
  ['sparse_most_likely_diagnosis','Sparse presentation: most likely diagnosis'],
  ['close_mimic_discrimination','Close-mimic discrimination'],
  ['first_line_investigation','First-line investigation'],
  ['dangerous_diagnosis_priority_exclusion','Dangerous diagnosis: priority exclusion'],
  ['next_step_after_initial_result','Next step after an initial result'],
  ['immediate_emergency_management','Immediate emergency management'],
  ['stable_first_line_treatment','Standard first-line treatment'],
  ['contraindication_caveat_switch','Contraindication or caveat switch'],
  ['failure_or_deterioration','Failure or deterioration'],
  ['escalation_referral_disposition','Escalation, referral or disposition']
];

function makeContext(){
  const store=new Map();
  const listeners=new Map();
  const document={
    readyState:'loading',
    addEventListener(type,fn){listeners.set(type,fn);},
    querySelector(){return null;},
    dispatchEvent(){},
    createElement(){return{};}
  };
  const window={
    UKMLA_V2_AI_SCHEMA:{TYPES},
    UKMLA_V2_AI_TRANSPORT:null,
    UKMLA_V2:{eventIndex:()=>({type:{},topicType:{}})},
    addEventListener(){},
    localStorage:null
  };
  const localStorage={
    getItem:key=>store.has(key)?store.get(key):null,
    setItem:(key,value)=>store.set(key,String(value)),
    removeItem:key=>store.delete(key)
  };
  window.localStorage=localStorage;
  const context={window,document,localStorage,console,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout,URLSearchParams,Math,JSON,Date,Set,Map,Promise,Number,String,Object,Array,RegExp};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('v2/ai-type-planner.js','utf8'),context,{filename:'ai-type-planner.js'});
  return{context,planner:context.window.UKMLA_QUESTION_TYPE_PLANNER,store};
}

function condition(id,fields,profile='clinical',topicId=`topic-${id}`){
  return{id,name:id,topicId,topic:`Topic ${id}`,profile,fields:{investigations:'',treatment:'',escalation:'',mimics:'',redFlags:'',...fields}};
}

const {context,planner}=makeContext();
const typeIds=TYPES.map(item=>item[0]);
const conditions=[
  condition('diagnosis',{mimics:'Sparse presentation with one decisive clinical feature and several mimics.'}),
  condition('mimics',{mimics:'Differentiate this condition versus four close mimics, including A, B, C and D.'}),
  condition('investigation',{investigations:'First-line initial investigation is the screening test.'}),
  condition('danger',{redFlags:'Urgently exclude this dangerous diagnosis; same-day red flags apply.'}),
  condition('next-result',{investigations:'After the initial result, confirm with repeat testing and staging.'}),
  condition('emergency',{escalation:'Immediate emergency resuscitation, IV treatment and urgent admission.'}),
  condition('stable-treatment',{treatment:'First-line conservative oral treatment and lifestyle management.'}),
  condition('caveat',{treatment:'Avoid in pregnancy or renal impairment; switch if contraindicated.'},'pharmacology'),
  condition('failure',{escalation:'Escalate if refractory, worsening or persistent despite first-line treatment.'}),
  condition('referral',{escalation:'Refer to specialist pathway or admit for MDT review and disposition.'})
];

const local=planner.localPlan(conditions,typeIds,{type:{},topicType:{}});
assert.equal(local.questionTypes.length,10);
assert.equal(new Set(local.questionTypes).size,10,'all ten question types must be used exactly once');
assert.equal(local.questionTypes[2],'first_line_investigation');
assert.equal(local.questionTypes[3],'dangerous_diagnosis_priority_exclusion');
assert.equal(local.questionTypes[5],'immediate_emergency_management');
assert.equal(local.questionTypes[7],'contraindication_caveat_switch');
assert.equal(local.questionTypes[8],'failure_or_deterioration');
assert.equal(local.questionTypes[9],'escalation_referral_disposition');

planner.setMode(planner.MODES.fixed);
const fixed=await planner.plan({conditions,questionTypes:typeIds,index:{type:{},topicType:{}},useAi:false});
assert.deepEqual([...fixed.questionTypes],typeIds,'fixed mode must preserve the original order');
assert.equal(fixed.source,'fixed');

planner.setMode(planner.MODES.balanced);
const identical=Array.from({length:10},(_,i)=>condition(`same-${i}`,{
  investigations:'Initial test then repeat after the result.',
  treatment:'First-line treatment; avoid if contraindicated.',
  escalation:'Urgent referral if persistent or worsening.',
  mimics:'Close mimics A, B, C and D.',
  redFlags:'Red flags require urgent exclusion.'
},'clinical','same-topic'));
const ambiguousLocal=planner.localPlan(identical,typeIds,{type:{},topicType:{}});
assert.equal(ambiguousLocal.ambiguous,true,'equivalent conditions should trigger genuine ambiguity');

const reversed=[...typeIds].reverse();
context.window.UKMLA_V2_AI_TRANSPORT={
  async send(){return{output_text:JSON.stringify({assignments:identical.map((item,index)=>({conditionId:item.id,questionType:reversed[index]}))})};}
};
const hybrid=await planner.plan({conditions:identical,questionTypes:typeIds,index:{type:{},topicType:{}},apiKey:'sk-test-key-long-enough',useAi:true});
assert.equal(hybrid.aiAttempted,true);
assert.equal(hybrid.aiAccepted,true);
assert.equal(hybrid.source,'hybrid-ai-tiebreak');
assert.equal(new Set(hybrid.questionTypes).size,10);

context.window.UKMLA_V2_AI_TRANSPORT={async send(){return{output_text:'{"assignments":[]}'}}};
const fallback=await planner.plan({conditions:identical,questionTypes:typeIds,index:{type:{},topicType:{}},apiKey:'sk-test-key-long-enough',useAi:true});
assert.equal(fallback.aiAttempted,true);
assert.equal(fallback.aiAccepted,false);
assert.equal(fallback.source,'local-deterministic');
assert.equal(new Set(fallback.questionTypes).size,10);

console.log('Best-fit balanced question-type planner regression passed.');
