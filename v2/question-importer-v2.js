(function(){
'use strict';

const MAX_QUESTIONS=30;
const STOP=new Set('a an and are as at be been being but by can could did do does for from had has have he her hers him his how i if in into is it its may might more most no not of on or our should so than that the their them then there these they this those to was we were what when where which who why will with would you your'.split(' '));
let root=null;
let observer=null;
let remounting=false;
let corpus=null;
let state={questions:[],sourceTitle:'Imported textbook questions'};

function core(){return window.UKMLA_V2;}
function bank(){return window.UKMLA_QUESTION_BANK;}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function uid(prefix){return core()?.uid(prefix)||`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
function onQuestionsRoute(){return location.hash.startsWith('#/quiz');}
function workspace(){return document.getElementById('quiz-workspace');}
function tabBar(){return document.querySelector('#app .tabs');}
function isMounted(){return Boolean(root?.isConnected&&root.dataset.activeQuestionTab==='import');}

function rememberImportTab(){const api=core();if(!api)return;api.App.state.quizTab='import';api.saveJson(api.STORAGE.state,api.App.state);}
function ensureTab(){
  if(!onQuestionsRoute())return;
  const bar=tabBar();if(!bar)return;
  let button=bar.querySelector('[data-question-importer-tab]');
  if(!button){
    button=document.createElement('button');button.className='tab';button.dataset.questionImporterTab='1';button.textContent='Import questions';button.setAttribute('aria-label','Import textbook questions');
    const bankTab=bar.querySelector('[data-quiz-tab="bank"]');if(bankTab)bar.insertBefore(button,bankTab);else bar.appendChild(button);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();rememberImportTab();mount(workspace());});
  }
  const active=core()?.App?.state?.quizTab==='import'&&isMounted();button.classList.toggle('active',active);button.setAttribute('aria-selected',active?'true':'false');
}
function ensureMountedFromState(){
  if(remounting||!onQuestionsRoute()||core()?.App?.state?.quizTab!=='import')return;
  const container=workspace();if(!container||container.dataset.activeQuestionTab==='import')return;
  remounting=true;try{mount(container);}finally{remounting=false;}
}
function initObserver(){
  if(observer)return;const app=document.getElementById('app');if(!app)return;
  observer=new MutationObserver(()=>{ensureTab();ensureMountedFromState();});observer.observe(app,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(()=>{ensureTab();ensureMountedFromState();},0));ensureTab();ensureMountedFromState();
}

function renderStart(message=''){
  if(!isMounted())return;
  root.innerHTML=`<section class="quiz-layout" data-ukmla-question-workspace="import"><article class="quiz-card"><div class="eyebrow">Textbook question importer</div><h2>Import original questions</h2><p>Paste structured question JSON. The original stem, options, correct answer and explanation are preserved without rewriting.</p><div class="field"><label>Set title</label><input class="input" id="import-title" value="${escapeHtml(state.sourceTitle)}" placeholder="e.g. Emergency presentations"></div><div class="field" style="margin-top:12px"><label>Question JSON</label><textarea class="input" id="import-json" rows="14" spellcheck="false" placeholder='{"questions":[{"stem":"...","options":{"A":"...","B":"..."},"correctAnswer":"A","explanation":"..."}]}'></textarea></div><div class="card-actions" style="margin-top:14px"><label class="btn" for="import-file">Choose JSON/text file</label><input id="import-file" type="file" accept=".json,.txt,application/json,text/plain" hidden><button class="btn primary" id="import-analyse">Review questions</button></div>${message?`<p style="color:var(--danger);margin-top:12px">${escapeHtml(message)}</p>`:''}<small class="question-source-note">Up to ${MAX_QUESTIONS} questions per import. Use Map Questions in the saved Question Bank to have Luna assign cards.</small></article><aside class="quiz-card"><h3>AI-led card mapping</h3><p>Save the original questions first. Mapping is carried out by Luna on request, without manual card selection or a separate approval step.</p><p class="question-source-note">Where the atlas lacks relevant teaching material, hold the question-mark button during a question to view Luna's suggested missing cards.</p></aside></section>`;
  const input=root.querySelector('#import-json');const file=root.querySelector('#import-file');
  root.querySelector('#import-title')?.addEventListener('input',event=>{state.sourceTitle=clean(event.target.value)||'Imported textbook questions';});
  file?.addEventListener('change',async()=>{const selected=file.files?.[0];if(selected)input.value=await selected.text();});
  root.querySelector('#import-analyse')?.addEventListener('click',()=>analyse(input.value));
}

function rawQuestions(value){if(Array.isArray(value))return value;if(Array.isArray(value?.questions))return value.questions;if(value&&typeof value==='object')return[value];throw new Error('The JSON must contain a question object or a questions array.');}
function firstValue(object,keys){for(const key of keys){if(object?.[key]!=null&&object[key]!=='')return object[key];}return'';}
function optionRows(raw){
  if(Array.isArray(raw))return raw.map((item,index)=>item&&typeof item==='object'?{id:clean(item.id||item.label||String.fromCharCode(65+index)).toUpperCase().slice(0,1),text:String(item.text??item.option??item.value??'').trim()}:{id:String.fromCharCode(65+index),text:String(item??'').trim()}).filter(item=>item.text);
  if(raw&&typeof raw==='object')return Object.entries(raw).map(([id,text])=>({id:clean(id).toUpperCase().slice(0,1),text:String(text??'').trim()})).filter(item=>item.text);
  throw new Error('Each question needs an options array or A–E options object.');
}
function correctId(raw,options){
  if(raw&&typeof raw==='object')raw=raw.id??raw.label??raw.text??raw.answer??'';const value=clean(raw);if(!value)return'';
  const direct=value.match(/^([A-H])(?:\b|[.)\-:])/i)||value.match(/^([A-H])$/i);if(direct&&options.some(option=>option.id===direct[1].toUpperCase()))return direct[1].toUpperCase();
  if(/^\d+$/.test(value)){const index=Number(value)-1;if(options[index])return options[index].id;}
  const exact=options.find(option=>clean(option.text).toLowerCase()===value.toLowerCase());if(exact)return exact.id;
  const stripped=value.replace(/^[A-H][.)\-:]\s*/i,'').toLowerCase();return options.find(option=>clean(option.text).toLowerCase()===stripped)?.id||'';
}
function normaliseQuestion(raw,index){
  const stem=String(firstValue(raw,['stem','question','questionText','question_text','text'])||'').trim();const leadIn=String(firstValue(raw,['leadIn','lead_in','lead','prompt'])||'').trim();if(!stem)throw new Error(`Question ${index+1} has no stem/question text.`);
  const options=optionRows(firstValue(raw,['options','answers','choices','answerOptions','answer_options']));if(options.length<2||options.length>8)throw new Error(`Question ${index+1} must have 2–8 answer options.`);
  const answerId=correctId(firstValue(raw,['correctOptionId','correct_option_id','correctAnswer','correct_answer','answer','correct']),options);if(!answerId)throw new Error(`Question ${index+1}: the correct answer could not be matched to an option.`);
  const rationale=String(firstValue(raw,['explanation','rationale','answerExplanation','answer_explanation','notes'])||'').trim();const reference=firstValue(raw,['reference','source','citation','page','book']);const answerText=options.find(option=>option.id===answerId)?.text||'';
  return{id:String(raw.id||raw.questionId||raw.question_id||`import-q${index+1}`),stem,leadIn,options,correctOptionId:answerId,correctAnswerText:answerText,rationale,reference:reference==null?'':String(reference)};
}

function tokens(text){return clean(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9+]+/g,' ').split(/\s+/).filter(token=>token&&(token.length>2||/^(?:iv|im|bp|hr|ecg|ct|mr|us|gi|dm|pe|hf)$/.test(token))&&!STOP.has(token));}
function flattenValue(value){if(value==null)return'';if(Array.isArray(value))return value.map(flattenValue).filter(Boolean).join(' ');if(typeof value==='object')return Object.entries(value).map(([key,nested])=>`${clean(key)} ${flattenValue(nested)}`.trim()).filter(Boolean).join(' ');return clean(value);}
function buildCorpus(){
  const conditions=Array.isArray(core()?.App?.conditions)?core().App.conditions:[];const docs=conditions.filter(condition=>condition&&typeof condition==='object').map(condition=>{const text=[condition.name,condition.topic,condition.profile,flattenValue(condition.fields),flattenValue(condition.labels)].map(flattenValue).filter(Boolean).join(' ');return{condition,set:new Set(tokens(text)),text:clean(text).toLowerCase()};});
  const df=new Map();for(const doc of docs)for(const token of doc.set)df.set(token,(df.get(token)||0)+1);corpus={docs,df,total:Math.max(1,docs.length)};return corpus;
}
function queryWeights(question){const weights=new Map();const add=(text,weight)=>{for(const token of tokens(text))weights.set(token,(weights.get(token)||0)+weight);};add(question.stem,1.6);add(question.leadIn,2.1);add(question.correctAnswerText,5.5);add(question.rationale,3.2);return weights;}
function shortlist(question,count=12){
  const data=corpus||buildCorpus();const weights=queryWeights(question);const answer=clean(question.correctAnswerText).toLowerCase();const combined=clean(`${question.stem} ${question.leadIn} ${question.correctAnswerText} ${question.rationale}`).toLowerCase();
  return data.docs.map(doc=>{let score=0;for(const[token,weight]of weights){if(!doc.set.has(token))continue;const idf=Math.log((data.total+1)/((data.df.get(token)||0)+1))+1;score+=weight*idf;}const name=clean(doc.condition.name).toLowerCase();if(name&&combined.includes(name))score+=24;if(answer&&answer.length>3&&doc.text.includes(answer))score+=18;score/=Math.max(1,Math.sqrt(doc.set.size/35));return{condition:doc.condition,score};}).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,count);
}
function candidatePayload(item){const condition=item.condition;return{conditionId:condition.id,name:condition.name,topicId:condition.topicId,topicName:condition.topic,fields:condition.fields&&typeof condition.fields==='object'?condition.fields:{},localScore:Number(item.score.toFixed(3))};}

function analyse(text){
  try{
    const rows=rawQuestions(JSON.parse(String(text||'')));
    if(!rows.length)throw new Error('No questions were found.');
    if(rows.length>MAX_QUESTIONS)throw new Error(`Import a maximum of ${MAX_QUESTIONS} questions at once.`);
    state.questions=rows.map((row,index)=>({...normaliseQuestion(row,index),id:`import-q${index+1}`}));
    renderReview();
  }catch(error){renderStart(clean(error?.message||error));}
}

function renderReview(){
  if(!isMounted())return;
  const cards=state.questions.map((question,index)=>`<article class="bank-card"><div class="bank-card-head"><div><span class="bank-source">Question ${index+1}</span><h3 style="font-size:1rem">${escapeHtml(question.stem)}</h3></div><span class="bank-offline">Original ✓</span></div><p>${escapeHtml(question.leadIn)}</p><small>Correct answer: ${escapeHtml(question.correctOptionId)} · ${escapeHtml(question.correctAnswerText)}</small></article>`).join('');
  root.innerHTML=`<section data-ukmla-question-workspace="import"><section class="bank-hero"><div><div class="eyebrow">Textbook question importer</div><h2>Ready to save</h2><p>${state.questions.length} original question${state.questions.length===1?'':'s'} ready. Luna can map them from the Question Bank afterwards.</p></div><div class="bank-totals"><strong>${state.questions.length}</strong><span>questions</span></div></section><section class="panel bank-toolbar"><div class="card-actions"><button class="btn" id="import-back">← Edit import</button><button class="btn primary" id="import-save">Save to Question Bank</button></div></section><section class="bank-grid" style="grid-template-columns:1fr">${cards}</section></section>`;
  root.querySelector('#import-back')?.addEventListener('click',()=>renderStart());
  root.querySelector('#import-save')?.addEventListener('click',()=>void saveToBank());
}

function importedQuestion(question,index){
  return{
    id:question.id||`import-q${index+1}`,questionNumber:index+1,questionType:'imported_textbook_sba',questionTypeLabel:'Imported textbook SBA',
    topicId:'',topicName:'',targetConditionId:'',targetCondition:'',
    stem:question.stem,leadIn:question.leadIn,
    options:question.options.map(option=>({id:option.id,text:option.text})),
    correctOptionId:question.correctOptionId,rationale:question.rationale,importedReference:question.reference,
    importedMappingStatus:'pending',suggestedCardTitle:''
  };
}

async function saveToBank(){
  if(!state.questions.length)return;
  const api=bank();
  if(!api?.storeSet){core()?.toast('Question Bank is not ready.');return;}
  const created=new Date().toISOString();
  const set={schemaVersion:'ukmla-imported-textbook-v1',quizId:uid('imported-set'),topic:state.sourceTitle||'Imported textbook questions',generatedAt:created,sourceType:'knowledge',questions:state.questions.map(importedQuestion)};
  const record=await api.storeSet(set,{sourceType:'knowledge',title:state.sourceTitle||'Imported textbook questions',verifiedAt:created,verificationLabel:'Original textbook wording preserved · Luna mapping available'});
  if(!record){core()?.toast('The imported set could not be saved.');return;}
  api.markUnseen?.(record.setId);
  core()?.toast(`Saved ${state.questions.length} questions. Choose Map Questions to ask Luna to link them to cards.`);
  state={questions:[],sourceTitle:'Imported textbook questions'};
  core().App.state.quizTab='bank';
  core().saveJson(core().STORAGE.state,core().App.state);
  window.UKMLA_QUESTION_WORKSPACE?.openTab?.('bank');
}

function mount(container){
  if(!container||!core())return;root=container;root.dataset.activeQuestionTab='import';rememberImportTab();document.querySelectorAll('[data-quiz-tab]').forEach(button=>button.classList.remove('active'));ensureTab();tabBar()?.querySelector('[data-question-importer-tab]')?.classList.add('active');if(state.questions.length)renderReview();else renderStart();
}
function init(){initObserver();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.UKMLA_QUESTION_IMPORTER={mount,shortlist,candidatePayload,normaliseQuestion};
})();
