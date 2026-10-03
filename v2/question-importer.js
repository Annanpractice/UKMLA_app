(function(){
'use strict';

const TOKEN_KEY='ukmlaJarvis2BuildTokenV1';
const WORKER_KEY='ukmlaJarvis2WorkerUrlV1';
const DEFAULT_WORKER='https://jarvis-2.j74569738.workers.dev';
const ENDPOINT='/v1/ukmla/card-match';
const MAX_QUESTIONS=30;
const STOP=new Set('a an and are as at be been being but by can could did do does for from had has have he her hers him his how i if in into is it its may might more most no not of on or our should so than that the their them then there these they this those to was we were what when where which who why will with would you your'.split(' '));

let root=null;
let state={questions:[],mappings:new Map(),sourceTitle:'Imported textbook questions',busy:false};
let observer=null;
let remounting=false;
let corpus=null;

function core(){return window.UKMLA_V2;}
function bank(){return window.UKMLA_QUESTION_BANK;}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function workerUrl(){return clean(localStorage.getItem(WORKER_KEY))||DEFAULT_WORKER;}
function token(){return clean(localStorage.getItem(TOKEN_KEY));}
function uid(prefix){return core()?.uid(prefix)||`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
function onQuestionsRoute(){return location.hash.startsWith('#/quiz');}
function workspace(){return document.getElementById('quiz-workspace');}
function tabBar(){return document.querySelector('#app .tabs');}
function isMounted(){return Boolean(root?.isConnected&&root.dataset.activeQuestionTab==='import');}

function rememberImportTab(){
  const api=core();
  if(!api)return;
  api.App.state.quizTab='import';
  api.saveJson(api.STORAGE.state,api.App.state);
}

function ensureTab(){
  if(!onQuestionsRoute())return;
  const bar=tabBar();
  if(!bar)return;
  let button=bar.querySelector('[data-question-importer-tab]');
  if(!button){
    button=document.createElement('button');
    button.className='tab';
    button.dataset.questionImporterTab='1';
    button.textContent='Import questions';
    button.setAttribute('aria-label','Import textbook questions');
    const bankTab=bar.querySelector('[data-quiz-tab="bank"]');
    if(bankTab)bar.insertBefore(button,bankTab);else bar.appendChild(button);
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      rememberImportTab();
      mount(workspace());
    });
  }
  const active=core()?.App?.state?.quizTab==='import'&&isMounted();
  button.classList.toggle('active',active);
  button.setAttribute('aria-selected',active?'true':'false');
}

function ensureMountedFromState(){
  if(remounting||!onQuestionsRoute()||core()?.App?.state?.quizTab!=='import')return;
  const container=workspace();
  if(!container||container.dataset.activeQuestionTab==='import')return;
  remounting=true;
  try{mount(container);}finally{remounting=false;}
}

function initObserver(){
  if(observer)return;
  const app=document.getElementById('app');
  if(!app)return;
  observer=new MutationObserver(()=>{ensureTab();ensureMountedFromState();});
  observer.observe(app,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(()=>{ensureTab();ensureMountedFromState();},0));
  ensureTab();ensureMountedFromState();
}

function renderStart(message=''){
  if(!isMounted())return;
  root.innerHTML=`<section class="quiz-layout" data-ukmla-question-workspace="import"><article class="quiz-card"><div class="eyebrow">Textbook question importer</div><h2>Import original questions</h2><p>Paste the structured JSON from your transcription GPT. The importer preserves the original stem, option wording, option order, answer and explanation, then searches the existing card atlas backwards.</p><div class="field"><label>Set title</label><input class="input" id="import-title" value="${escapeHtml(state.sourceTitle)}" placeholder="e.g. Oxford Handbook respiratory questions"></div><div class="field" style="margin-top:12px"><label>Question JSON</label><textarea class="input" id="import-json" rows="14" spellcheck="false" placeholder='{"questions":[{"stem":"...","options":{"A":"...","B":"..."},"correctAnswer":"A","explanation":"..."}]}'></textarea></div><div class="card-actions" style="margin-top:14px"><label class="btn" for="import-file">Choose JSON/text file</label><input id="import-file" type="file" accept=".json,.txt,application/json,text/plain" hidden><button class="btn primary" id="import-analyse">Analyse questions</button></div>${message?`<p style="color:var(--danger);margin-top:12px">${escapeHtml(message)}</p>`:''}<small class="question-source-note">Up to ${MAX_QUESTIONS} questions per import. Importing alone does not change card progress.</small></article><aside class="quiz-card"><div class="topic-meta"><span>Card mapping</span><strong>Luna + local shortlist</strong></div><p>The whole question and the known correct answer are used to find the three strongest local card candidates. Luna then chooses one card only when it genuinely covers the tested learning point.</p><p style="color:var(--muted)">If none fits, the question stays unmapped and the importer shows only a suggested future card title.</p><div class="background-build-note">The existing UKMLA-only Jarvis pairing is reused. This feature does not receive general Jarvis, Gmail or Calendar access.</div></aside></section>`;
  const input=root.querySelector('#import-json');
  const file=root.querySelector('#import-file');
  root.querySelector('#import-title')?.addEventListener('input',event=>{state.sourceTitle=clean(event.target.value)||'Imported textbook questions';});
  file?.addEventListener('change',async()=>{const selected=file.files?.[0];if(selected)input.value=await selected.text();});
  root.querySelector('#import-analyse')?.addEventListener('click',()=>void analyse(input.value));
}

function rawQuestions(value){
  if(Array.isArray(value))return value;
  if(Array.isArray(value?.questions))return value.questions;
  if(value&&typeof value==='object')return[value];
  throw new Error('The JSON must contain a question object or a questions array.');
}

function firstValue(object,keys){for(const key of keys){if(object?.[key]!=null&&object[key]!=='')return object[key];}return'';}

function optionRows(raw){
  if(Array.isArray(raw))return raw.map((item,index)=>{
    if(item&&typeof item==='object')return{id:clean(item.id||item.label||String.fromCharCode(65+index)).toUpperCase().slice(0,1),text:String(item.text??item.option??item.value??'').trim()};
    return{id:String.fromCharCode(65+index),text:String(item??'').trim()};
  }).filter(item=>item.text);
  if(raw&&typeof raw==='object')return Object.entries(raw).map(([id,text])=>({id:clean(id).toUpperCase().slice(0,1),text:String(text??'').trim()})).filter(item=>item.text);
  throw new Error('Each question needs an options array or A–E options object.');
}

function correctId(raw,options){
  if(raw&&typeof raw==='object')raw=raw.id??raw.label??raw.text??raw.answer??'';
  const value=clean(raw);
  if(!value)return'';
  const direct=value.match(/^([A-H])(?:\b|[.)\-:])/i)||value.match(/^([A-H])$/i);
  if(direct&&options.some(option=>option.id===direct[1].toUpperCase()))return direct[1].toUpperCase();
  if(/^\d+$/.test(value)){const index=Number(value)-1;if(options[index])return options[index].id;}
  const exact=options.find(option=>clean(option.text).toLowerCase()===value.toLowerCase());
  if(exact)return exact.id;
  const stripped=value.replace(/^[A-H][.)\-:]\s*/i,'').toLowerCase();
  const byText=options.find(option=>clean(option.text).toLowerCase()===stripped);
  return byText?.id||'';
}

function normaliseQuestion(raw,index){
  const stem=String(firstValue(raw,['stem','question','questionText','question_text','text'])||'').trim();
  const leadIn=String(firstValue(raw,['leadIn','lead_in','lead','prompt'])||'').trim();
  if(!stem)throw new Error(`Question ${index+1} has no stem/question text.`);
  const options=optionRows(firstValue(raw,['options','answers','choices','answerOptions','answer_options']));
  if(options.length<2||options.length>8)throw new Error(`Question ${index+1} must have 2–8 answer options.`);
  const rawAnswer=firstValue(raw,['correctOptionId','correct_option_id','correctAnswer','correct_answer','answer','correct']);
  const answerId=correctId(rawAnswer,options);
  if(!answerId)throw new Error(`Question ${index+1}: the correct answer could not be matched to an option.`);
  const rationale=String(firstValue(raw,['explanation','rationale','answerExplanation','answer_explanation','notes'])||'').trim();
  const reference=firstValue(raw,['reference','source','citation','page','book']);
  const answerText=options.find(option=>option.id===answerId)?.text||'';
  return{id:String(raw.id||raw.questionId||raw.question_id||`import-q${index+1}`),stem,leadIn,options,correctOptionId:answerId,correctAnswerText:answerText,rationale,reference:reference==null?'':String(reference)};
}

function tokens(text){
  return clean(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9+]+/g,' ').split(/\s+/).filter(token=>token&&(token.length>2||/^(?:iv|im|bp|hr|ecg|ct|mr|us|gi|dm|pe|hf)$/.test(token))&&!STOP.has(token));
}

function flattenValue(value){
  if(value==null)return'';
  if(Array.isArray(value))return value.map(flattenValue).filter(Boolean).join(' ');
  if(typeof value==='object')return Object.entries(value).map(([key,nested])=>`${clean(key)} ${flattenValue(nested)}`.trim()).filter(Boolean).join(' ');
  return clean(value);
}

function flattenFields(fields){
  return flattenValue(fields);
}

function buildCorpus(){
  const rawConditions=core()?.App?.conditions;
  const conditions=Array.isArray(rawConditions)?rawConditions:[];
  const docs=conditions.filter(condition=>condition&&typeof condition==='object').map(condition=>{
    const text=[condition.name,condition.topic,condition.profile,flattenFields(condition.fields),flattenValue(condition.labels)].map(flattenValue).filter(Boolean).join(' ');
    const set=new Set(tokens(text));
    return{condition,set,text:clean(text).toLowerCase()};
  });
  const df=new Map();
  for(const doc of docs)for(const token of doc.set)df.set(token,(df.get(token)||0)+1);
  corpus={docs,df,total:Math.max(1,docs.length)};
  return corpus;
}

function queryWeights(question){
  const weights=new Map();
  const add=(text,weight)=>{for(const token of tokens(text))weights.set(token,(weights.get(token)||0)+weight);};
  add(question.stem,1.6);add(question.leadIn,2.1);add(question.correctAnswerText,5.5);add(question.rationale,3.2);
  return weights;
}

function shortlist(question,count=3){
  const data=corpus||buildCorpus();
  const weights=queryWeights(question);
  const answer=clean(question.correctAnswerText).toLowerCase();
  const combined=clean(`${question.stem} ${question.leadIn} ${question.correctAnswerText} ${question.rationale}`).toLowerCase();
  const ranked=data.docs.map(doc=>{
    let score=0;
    for(const[token,weight]of weights){
      if(!doc.set.has(token))continue;
      const idf=Math.log((data.total+1)/((data.df.get(token)||0)+1))+1;
      score+=weight*idf;
    }
    const name=clean(doc.condition.name).toLowerCase();
    if(name&&combined.includes(name))score+=24;
    if(answer&&answer.length>3&&doc.text.includes(answer))score+=18;
    score/=Math.max(1,Math.sqrt(doc.set.size/35));
    return{condition:doc.condition,score};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
  return ranked.slice(0,count);
}

function candidatePayload(item){
  const condition=item.condition;
  return{
    conditionId:condition.id,
    name:condition.name,
    topicId:condition.topicId,
    topicName:condition.topic,
    fields:condition.fields&&typeof condition.fields==='object'?condition.fields:{},
    localScore:Number(item.score.toFixed(3))
  };
}

async function analyse(text){
  if(state.busy)return;
  try{
    const parsed=JSON.parse(String(text||''));
    const rows=rawQuestions(parsed);
    if(!rows.length)throw new Error('No questions were found.');
    if(rows.length>MAX_QUESTIONS)throw new Error(`Import a maximum of ${MAX_QUESTIONS} questions at once.`);
    state.questions=rows.map(normaliseQuestion);
    state.mappings=new Map(state.questions.map(question=>[question.id,{status:'pending',selectedConditionId:'',suggestedCardTitle:'',candidates:shortlist(question)}]));
    renderReview();
    if(token())await resolveWithLuna();
  }catch(error){renderStart(clean(error?.message||error));}
}

function renderReview(message=''){
  if(!isMounted())return;
  const paired=Boolean(token());
  const cards=state.questions.map((question,index)=>mappingCard(question,index)).join('');
  root.innerHTML=`<section data-ukmla-question-workspace="import"><section class="bank-hero"><div><div class="eyebrow">Textbook question importer</div><h2>Review card mapping</h2><p>${state.questions.length} original question${state.questions.length===1?'':'s'} ready. Wording and option order remain unchanged.</p></div><div class="bank-totals"><strong>${state.questions.length}</strong><span>questions</span><strong>${[...state.mappings.values()].filter(item=>item.status==='matched').length}</strong><span>mapped</span></div></section>${message?`<section class="panel" style="margin-bottom:14px"><p style="margin:0;color:var(--danger)">${escapeHtml(message)}</p></section>`:''}<section class="panel bank-toolbar"><div class="card-actions"><button class="btn" id="import-back">← Edit import</button><button class="btn" id="import-luna" ${state.busy||!paired?'disabled':''}>${state.busy?'Luna is matching…':paired?'Run Luna mapping':'Pair Jarvis 2 first'}</button><button class="btn primary" id="import-save" ${state.busy?'disabled':''}>Save to Question Bank</button></div>${!paired?'<small class="question-source-note">Open UKMLA Questions once and pair Jarvis 2; this importer will reuse the same UKMLA-only credential.</small>':''}</section><section class="bank-grid" style="grid-template-columns:1fr">${cards}</section></section>`;
  root.querySelector('#import-back')?.addEventListener('click',()=>renderStart());
  root.querySelector('#import-luna')?.addEventListener('click',()=>void resolveWithLuna());
  root.querySelector('#import-save')?.addEventListener('click',()=>void saveToBank());
  root.querySelectorAll('[data-map-choice]').forEach(input=>input.addEventListener('change',()=>manualChoice(input)));
}

function mappingCard(question,index){
  const mapping=state.mappings.get(question.id)||{};
  const selected=mapping.selectedConditionId?core()?.App?.byId?.get(mapping.selectedConditionId):null;
  let result='';
  if(mapping.status==='matched'&&selected){
    result=`<p style="margin:12px 0"><strong>Luna matched:</strong> ${escapeHtml(selected.name)} <span style="color:var(--muted)">· ${escapeHtml(selected.topic)}</span></p>`;
  }else if(mapping.status==='unmapped'){
    result=`<p style="margin:12px 0"><strong>You don’t have any cards on this topic. Suggested card for a future update: ${escapeHtml(mapping.suggestedCardTitle||'New card needed')}.</strong></p>`;
  }else result='<p style="margin:12px 0;color:var(--muted)">Waiting for Luna mapping.</p>';
  const choices=(mapping.candidates||[]).map(({condition})=>`<label style="display:flex;gap:10px;align-items:flex-start;padding:7px 0"><input type="radio" name="map-${escapeHtml(question.id)}" data-map-choice="${escapeHtml(question.id)}" value="${escapeHtml(condition.id)}" ${mapping.selectedConditionId===condition.id?'checked':''}><span>${escapeHtml(condition.name)} <small style="color:var(--muted)">· ${escapeHtml(condition.topic)}</small></span></label>`).join('');
  return`<article class="bank-card"><div class="bank-card-head"><div><span class="bank-source">Question ${index+1}</span><h3 style="font-size:1rem">${escapeHtml(question.stem)}</h3></div><span class="bank-offline">Original ✓</span></div><p>${escapeHtml(question.leadIn)}</p><small>Correct answer: ${escapeHtml(question.correctOptionId)} · ${escapeHtml(question.correctAnswerText)}</small>${result}<details ${mapping.status==='matched'?'open':''}><summary>Change mapping</summary><div style="margin-top:8px">${choices}<label style="display:flex;gap:10px;padding:7px 0"><input type="radio" name="map-${escapeHtml(question.id)}" data-map-choice="${escapeHtml(question.id)}" value="__none__" ${mapping.status==='unmapped'?'checked':''}><span>No matching card</span></label></div></details></article>`;
}

function manualChoice(input){
  const mapping=state.mappings.get(input.dataset.mapChoice);if(!mapping)return;
  if(input.value==='__none__'){
    mapping.status='unmapped';mapping.selectedConditionId='';
    if(!mapping.suggestedCardTitle)mapping.suggestedCardTitle='New card needed';
  }else{
    mapping.status='matched';mapping.selectedConditionId=input.value;mapping.suggestedCardTitle='';
  }
  renderReview();
}

async function resolveWithLuna(){
  if(state.busy||!token())return;
  state.busy=true;renderReview();
  try{
    const items=state.questions.map(question=>{
      const mapping=state.mappings.get(question.id);
      return{
        itemId:question.id,
        question:{stem:question.stem,leadIn:question.leadIn,correctAnswer:question.correctAnswerText,rationale:question.rationale},
        candidates:(mapping.candidates||[]).map(candidatePayload)
      };
    });
    const response=await fetch(`${workerUrl()}${ENDPOINT}`,{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json','X-Jarvis-Client':'ukmla-v2-importer'},body:JSON.stringify({items}),cache:'no-store'});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||`Jarvis 2 returned ${response.status}.`);
    for(const result of data?.results||[]){
      const mapping=state.mappings.get(String(result.itemId));if(!mapping)continue;
      if(result.status==='matched'&&(mapping.candidates||[]).some(item=>item.condition.id===result.selectedConditionId)){
        mapping.status='matched';mapping.selectedConditionId=result.selectedConditionId;mapping.suggestedCardTitle='';
      }else{
        mapping.status='unmapped';mapping.selectedConditionId='';mapping.suggestedCardTitle=clean(result.suggestedCardTitle)||'New card needed';
      }
    }
    for(const mapping of state.mappings.values())if(mapping.status==='pending'){mapping.status='unmapped';mapping.suggestedCardTitle='New card needed';}
    renderReview();
  }catch(error){renderReview(clean(error?.message||error));}
  finally{state.busy=false;if(isMounted())renderReview();}
}

function importedQuestion(question,index){
  const mapping=state.mappings.get(question.id)||{};
  const card=mapping.status==='matched'?core()?.App?.byId?.get(mapping.selectedConditionId):null;
  return{
    id:question.id||`import-q${index+1}`,
    questionNumber:index+1,
    questionType:'imported_textbook_sba',
    questionTypeLabel:'Imported textbook SBA',
    topicId:card?.topicId||'',
    topicName:card?.topic||'',
    targetConditionId:card?.id||'',
    targetCondition:card?.name||'',
    stem:question.stem,
    leadIn:question.leadIn,
    options:question.options.map(option=>({id:option.id,text:option.text})),
    correctOptionId:question.correctOptionId,
    rationale:question.rationale,
    importedReference:question.reference,
    importedMappingStatus:card?'confirmed':'unmapped',
    suggestedCardTitle:card?'':clean(mapping.suggestedCardTitle)
  };
}

async function saveToBank(){
  if(state.busy||!state.questions.length)return;
  const api=bank();
  if(!api?.storeSet){core()?.toast('Question Bank is not ready.');return;}
  const unresolved=[...state.mappings.values()].filter(item=>item.status==='pending').length;
  if(unresolved){core()?.toast('Run Luna mapping or mark each unresolved question as no match.');return;}
  const created=new Date().toISOString();
  const set={schemaVersion:'ukmla-imported-textbook-v1',quizId:uid('imported-set'),topic:state.sourceTitle||'Imported textbook questions',generatedAt:created,sourceType:'knowledge',questions:state.questions.map(importedQuestion)};
  const record=await api.storeSet(set,{sourceType:'knowledge',title:state.sourceTitle||'Imported textbook questions',verifiedAt:created,verificationLabel:'Original textbook wording preserved · card mapping reviewed'});
  if(!record){core()?.toast('The imported set could not be saved.');return;}
  api.markUnseen?.(record.setId);
  core()?.toast(`Imported ${state.questions.length} question${state.questions.length===1?'':'s'} into Question Bank.`);
  state={questions:[],mappings:new Map(),sourceTitle:'Imported textbook questions',busy:false};corpus=null;
  core().App.state.quizTab='bank';core().saveJson(core().STORAGE.state,core().App.state);
  window.UKMLA_QUESTION_WORKSPACE?.openTab?.('bank');
}

function mount(container){
  if(!container||!core())return;
  root=container;root.dataset.activeQuestionTab='import';rememberImportTab();
  document.querySelectorAll('[data-quiz-tab]').forEach(button=>button.classList.remove('active'));
  ensureTab();
  tabBar()?.querySelector('[data-question-importer-tab]')?.classList.add('active');
  if(state.questions.length)renderReview();else renderStart();
}

function init(){initObserver();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.UKMLA_QUESTION_IMPORTER={mount,shortlist,normaliseQuestion};
})();