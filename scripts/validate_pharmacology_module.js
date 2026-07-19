#!/usr/bin/env node
'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

function loadData(){
  const sandbox={window:{}};
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('v2/pharmacology-data.js'),sandbox,{filename:'pharmacology-data.js'});
  const sectionFiles=fs.readdirSync(path.join(root,'v2'))
    .filter(name=>name.startsWith('pharmacology-data-')&&name.endsWith('.js'))
    .sort();
  for(const name of sectionFiles){
    vm.runInContext(read(`v2/${name}`),sandbox,{filename:name});
  }
  return sandbox.UKMLA_PHARMACOLOGY_DATA;
}

const data=loadData();
assert.equal(data.schemaVersion,'ukmla-pharmacology-v1');
assert.equal(data.topic,'Clinical Pharmacology & Safe Prescribing');
assert.equal(data.checkedDate,'2026-07-19');
assert.equal(data.cards.length,108);
assert.equal(new Set(data.cards.map(card=>card.name)).size,108);
assert.deepEqual(Array.from(data.fieldOrder),['indication','prescribe','checkMonitor','interactionsAvoid','toxicityAct']);

const requiredFields=new Set(data.fieldOrder);
for(const card of data.cards){
  assert(card.name&&card.section);
  assert.deepEqual(new Set(Object.keys(card.fields)),requiredFields);
  assert(Object.values(card.fields).every(value=>String(value).trim()));
  assert(Array.isArray(card.sourceRefs)&&card.sourceRefs.length);
}
const names=new Set(data.cards.map(card=>card.name));
[
  'Symptomatic bradycardia and atropine',
  'Regular narrow-complex SVT and adenosine',
  'Paediatric bradycardia and tachyarrhythmia',
  'Adult community-acquired pneumonia',
  'Atypical pneumonia coverage',
  'Non-severe hospital-acquired pneumonia',
  'Severe or resistant hospital-acquired pneumonia',
  'Pre-hospital suspected meningococcal disease',
  'Cellulitis and erysipelas',
  'MRSA cellulitis or severe skin infection',
  'Provoked versus unprovoked VTE duration',
  'Extended VTE prevention dose',
  'Haloperidol for acute delirium',
  'Topical corticosteroid potency ladder',
  'Paediatric mg/kg dose calculation',
  'Cockcroft–Gault creatinine clearance'
].forEach(name=>assert(names.has(name),`Missing sentinel card: ${name}`));

const counts=data.cards.reduce((result,card)=>{
  result[card.section]=(result[card.section]||0)+1;
  return result;
},{});
assert.equal(counts.Cardiovascular,26);
assert.equal(counts.Antimicrobials,23);
assert.equal(counts['Emergency & acute'],18);
assert(data.cards.filter(card=>card.paediatric).length>=10);
assert(data.cards.filter(card=>card.calculationRequired).length>=18);
assert(data.cards.filter(card=>card.antimicrobial).length>=20);

const events=[];
const app={
  loaded:true,
  conditions:[],
  topics:[],
  byId:new Map(),
  byTopic:new Map(),
  data:{conditionCount:0,topicCount:0},
  state:{quizTab:'basic'}
};
const fakeCore={
  App:app,
  STORAGE:{state:'state'},
  TYPE_LABELS:{},
  TYPE_PARAM:{},
  render(){},
  saveJson(){return true;},
  escapeHtml(value){return String(value);},
  events(){return events;},
  eventIndex(){return{type:{}};},
  appendEvent(event){events.push(event);return event;},
  coverageState(){return{cycle:1,covered:[]};},
  topicProgress(){return{health:50};},
  selectCoverageCandidates(items,count){return items.slice(0,count);},
  shuffle(items){return items.slice();},
  scoreAnswer(question,option){return option.id===question.correctOptionId;},
  uid(prefix){return`${prefix}-test`;},
  toast(){},
  go(){}
};
const sandbox={
  window:null,
  document:{readyState:'loading',addEventListener(){},getElementById(){return null;},querySelector(){return null;}},
  location:{hash:'#/home'},
  MutationObserver:function(){this.observe=()=>{};},
  requestAnimationFrame(fn){return fn();},
  setTimeout(){return 0;},
  setInterval(){return 1;},
  clearInterval(){},
  console
};
sandbox.window=sandbox;
sandbox.UKMLA_V2=fakeCore;
sandbox.UKMLA_PHARMACOLOGY_DATA=data;
vm.createContext(sandbox);
vm.runInContext(read('v2/pharmacology.js'),sandbox,{filename:'pharmacology.js'});
assert(sandbox.UKMLA_PHARMACOLOGY);
assert(sandbox.UKMLA_PHARMACOLOGY.injectData());
assert.equal(app.conditions.length,108);
assert.equal(app.topics.length,1);
assert.equal(app.topics[0].count,108);
assert.equal(app.conditions[0].profile,'pharmacology');
assert.deepEqual(new Set(Object.keys(app.conditions[0].fields)),new Set(['mimics','treatment','investigations','redFlags','escalation']));
assert(Object.keys(fakeCore.TYPE_LABELS).filter(key=>key.startsWith('pharm_')).length===10);

for(const scope of ['calculations','mixed','cardiovascular','antimicrobials','paediatrics','high-risk','topical','emergency']){
  const set=sandbox.UKMLA_PHARMACOLOGY.selectPlan(scope);
  assert.equal(set.length,10,`${scope} did not create ten questions`);
  assert.equal(new Set(set.map(question=>question.id)).size,10,`${scope} produced duplicate IDs`);
  assert(set.every(question=>question.profile==='pharmacology'));
  assert(set.every(question=>question.options.length===5));
  assert(set.every(question=>new Set(question.options.map(option=>option.text)).size===5));
}
const calculations=sandbox.UKMLA_PHARMACOLOGY.selectPlan('calculations');
assert(calculations.every(question=>question.questionType==='pharm_dose_calculation'));
assert(calculations.every(question=>question.calculationRequired));
assert(calculations.every(question=>question.options.every(option=>/\d/.test(option.text))));

const html=read('v2/app.html');
const order=[
  'core.js',
  'pharmacology-data.js',
  'ai-schema.js',
  'biomedical-ai.js',
  'pharmacology-ai.js',
  'ai-giveaway-validator.js',
  'biomedical-basic.js',
  'pharmacology.js',
  'question-workspace.js'
];
for(let index=1;index<order.length;index++){
  assert(html.indexOf(order[index-1])<html.indexOf(order[index]),`Incorrect script order: ${order[index-1]} / ${order[index]}`);
}

const worker=read('service-worker.js');
['pharmacology-data.js',...fs.readdirSync(path.join(root,'v2')).filter(name=>name.startsWith('pharmacology-data-')),'pharmacology-ai.js','pharmacology.js','ukmla-cards-v24-clinical-pharmacology'].forEach(marker=>assert(worker.includes(marker)));

const ai=read('v2/pharmacology-ai.js');
[
  'Never invent a dose',
  'mg/kg/dose',
  'Cockcroft–Gault',
  'local-policy caveats',
  'schema.__pharmacologyAware'
].forEach(marker=>assert(ai.includes(marker)));

console.log(`Validated ${data.cards.length} clinical-pharmacology cards across ${Object.keys(counts).length} sections.`);
console.log(`Paediatric: ${data.cards.filter(card=>card.paediatric).length}; calculation-linked: ${data.cards.filter(card=>card.calculationRequired).length}; antimicrobial-tagged: ${data.cards.filter(card=>card.antimicrobial).length}.`);
