(function(){
'use strict';

const PHARM_SOURCE='pharmacology';
const PHARM_TOPIC_ID='topic-clinical-pharmacology-safe-prescribing';
const ATTEMPT_SOURCES=new Set(['basic','ai','biomedical','pharmacology']);
const ANSWER_SOURCES=new Set(['basic','ai','biomedical','pharmacology']);
const PHARM_TYPES=[
  'pharm_indication',
  'pharm_exact_regimen',
  'pharm_dose_calculation',
  'pharm_dose_modifier',
  'pharm_contraindication_switch',
  'pharm_interaction_hazard',
  'pharm_adverse_effect',
  'pharm_monitoring_action',
  'pharm_prescription_review',
  'pharm_antidote_escalation'
];
const GENERIC_FALLBACK={
  sparse_most_likely_diagnosis:'pharm_indication',
  close_mimic_discrimination:'pharm_adverse_effect',
  first_line_investigation:'pharm_monitoring_action',
  dangerous_diagnosis_priority_exclusion:'pharm_interaction_hazard',
  next_step_after_initial_result:'pharm_dose_modifier',
  immediate_emergency_management:'pharm_antidote_escalation',
  stable_first_line_treatment:'pharm_exact_regimen',
  contraindication_caveat_switch:'pharm_contraindication_switch',
  failure_or_deterioration:'pharm_prescription_review',
  escalation_referral_disposition:'pharm_antidote_escalation'
};
const RECENT_QUESTION_WINDOW=30;
const TREND_BLOCK_SIZE=10;
const RUN_CHART_SET_GROUP=5;
const setCache=new Map();
let observer=null;
let scheduled=false;
let running=false;
let rerun=false;
let historicalPromise=null;

function core(){return window.UKMLA_V2;}
function bank(){return window.UKMLA_QUESTION_BANK;}
function analytics(){return window.UKMLA_QUESTION_ANALYTICS;}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'');}
function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
function formatDate(value,compact=false){
  if(!value)return'—';
  try{return new Date(value).toLocaleDateString(undefined,compact?{day:'numeric',month:'short'}:{day:'numeric',month:'short',year:'numeric'});}catch(_){return String(value);}
}
function typeLabel(id){return core()?.TYPE_LABELS?.[id]||id;}
function isPharmType(value){return PHARM_TYPES.includes(String(value||''));}
function conditionForEvent(event){return core()?.App?.byId?.get?.(event?.conditionId)||null;}
function isPharmacologyEvent(event){
  if(!event)return false;
  if(event.source===PHARM_SOURCE||event.profile==='pharmacology'||event.topicId===PHARM_TOPIC_ID)return true;
  if(isPharmType(event.questionType)||isPharmType(event.pharmacologyQuestionType))return true;
  return conditionForEvent(event)?.profile==='pharmacology';
}
function allAnswerEvents(){
  return(core()?.events?.()||[])
    .filter(event=>event?.kind==='answered'&&ANSWER_SOURCES.has(event.source))
    .sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
}
function richQuestionText(question){
  return clean([
    question?.stem,question?.leadIn,question?.learningPoint,question?.rationale,
    question?.strongestDistractorExplanation,question?.targetCondition,
    question?.questionTypeLabel,
    ...(question?.options||[]).map(option=>option?.text)
  ].join(' ')).toLowerCase();
}
function classifyQuestion(question){
  const explicit=String(question?.pharmacologyQuestionType||'');
  if(isPharmType(explicit))return explicit;
  const primary=String(question?.questionType||'');
  if(isPharmType(primary))return primary;
  const text=richQuestionText(question);
  const hasNumbers=/\d/.test(text);
  const hasUnits=/\b(?:mg|microgram|mcg|g|kg|ml|litre|l\/min|ml\/hour|units?|mmol|percent|%)\b/i.test(text);
  if(question?.calculationRequired||(hasNumbers&&hasUnits&&/\b(?:calculat|dose|rate|volume|concentration|dilut|infusion)\b/i.test(text)))return'pharm_dose_calculation';
  if(/\b(?:interaction|interact|enzyme inducer|enzyme inhibitor|cyp\w*|qt prolong|serotonin syndrome|potentiat)\b/i.test(text))return'pharm_interaction_hazard';
  if(/\b(?:contraindicat|caveat|allerg|pregnan|breastfeed|avoid|switch|not suitable|must not)\b/i.test(text))return'pharm_contraindication_switch';
  if(/\b(?:antidote|overdose|poison|emergency|urgent|immediate|resusc|escalat|critical care|same-day)\b/i.test(text))return'pharm_antidote_escalation';
  if(/\b(?:adverse effect|side effect|toxicity|toxic effect|drug reaction|iatrogenic)\b/i.test(text))return'pharm_adverse_effect';
  if(/\b(?:monitor|monitoring|drug level|therapeutic level|inr|ecg|electrolyte|u&e|renal function|liver function|blood count|fbc|check)\b/i.test(text))return'pharm_monitoring_action';
  if(/\b(?:dose adjust|adjustment|modifier|reduce the dose|increase the dose|renal impairment|hepatic impairment|creatinine clearance|body weight|frailty|older adult)\b/i.test(text))return'pharm_dose_modifier';
  if(/\b(?:prescription review|medication review|deprescrib|reconcil|withhold|omit|stop medicine|duplicate therapy|review the prescription)\b/i.test(text))return'pharm_prescription_review';
  if(/\b(?:regimen|prescrib|dose|route|frequency|duration|course|administration)\b/i.test(text))return'pharm_exact_regimen';
  if(/\b(?:indication|indicated|appropriate use|used to treat|recognise the medicine|which patient)\b/i.test(text))return'pharm_indication';
  return GENERIC_FALLBACK[primary]||'pharm_prescription_review';
}
async function setForEvent(event){
  const api=bank();
  if(!api?.loadSet)return null;
  const attempt=api.attemptById?.(event.quizId);
  const setId=attempt?.setId||event.quizId;
  if(!setId)return null;
  if(!setCache.has(setId))setCache.set(setId,Promise.resolve(api.loadSet(setId)).catch(()=>null));
  return setCache.get(setId);
}
async function questionForEvent(event){
  const set=await setForEvent(event);
  if(!set?.questions?.length)return null;
  const id=String(event.questionId||'');
  return set.questions.find((question,index)=>String(question?.id||index+1)===id)||null;
}
async function classifyEvent(event){
  const explicit=String(event?.pharmacologyQuestionType||'');
  if(isPharmType(explicit))return explicit;
  if(isPharmType(event?.questionType))return event.questionType;
  if(!isPharmacologyEvent(event))return null;
  const question=await questionForEvent(event);
  return classifyQuestion(question||event);
}
async function pharmacologyStats(events=allAnswerEvents()){
  const rows=events.filter(isPharmacologyEvent);
  const classified=await Promise.all(rows.map(async event=>({event,type:await classifyEvent(event)})));
  const result=Object.fromEntries(PHARM_TYPES.map(type=>[type,{type,label:typeLabel(type),answered:0,correct:0,accuracy:null}]));
  for(const item of classified){
    const row=result[item.type];
    if(!row)continue;
    row.answered++;
    if(item.event.correct)row.correct++;
  }
  for(const row of Object.values(result))row.accuracy=row.answered?Math.round(row.correct/row.answered*100):null;
  return result;
}
function recentWeight(index){
  if(index<RECENT_QUESTION_WINDOW)return Math.max(.58,1-index*.014);
  return .12*Math.pow(.88,index-RECENT_QUESTION_WINDOW);
}
function weightedPerformance(rows){
  const newest=(rows||[]).slice().sort((a,b)=>String(b.at||b.answeredAt||'').localeCompare(String(a.at||a.answeredAt||'')));
  if(!newest.length)return{percent:50,answered:0,recentCount:0,correctWeight:0,totalWeight:0};
  let correctWeight=2,totalWeight=4;
  newest.forEach((event,index)=>{
    const weight=recentWeight(index);
    totalWeight+=weight;
    if(event.correct)correctWeight+=weight;
  });
  return{percent:Math.round(correctWeight/totalWeight*100),answered:newest.length,recentCount:Math.min(RECENT_QUESTION_WINDOW,newest.length),correctWeight,totalWeight};
}
function completedTenTrend(rows){
  const ordered=(rows||[]).slice().sort((a,b)=>String(a.at||a.answeredAt||'').localeCompare(String(b.at||b.answeredAt||'')));
  const milestone=Math.floor(ordered.length/TREND_BLOCK_SIZE)*TREND_BLOCK_SIZE;
  if(milestone<TREND_BLOCK_SIZE*2)return null;
  const currentRows=ordered.slice(0,milestone);
  const previousRows=ordered.slice(0,milestone-TREND_BLOCK_SIZE);
  const latestBlock=ordered.slice(milestone-TREND_BLOCK_SIZE,milestone);
  const priorBlock=ordered.slice(milestone-TREND_BLOCK_SIZE*2,milestone-TREND_BLOCK_SIZE);
  const current=weightedPerformance(currentRows).percent;
  const previous=weightedPerformance(previousRows).percent;
  return{delta:current-previous,milestone,current,previous,latestCorrect:latestBlock.filter(item=>item.correct).length,priorCorrect:priorBlock.filter(item=>item.correct).length};
}
function eligibleAttempts(){
  return(bank()?.completedAttempts?.()||[])
    .filter(attempt=>ATTEMPT_SOURCES.has(attempt.sourceType))
    .sort((a,b)=>String(a.completedAt||'').localeCompare(String(b.completedAt||'')));
}
function runChartCsv(attempts=eligibleAttempts()){
  const groups=analytics()?.aggregateAttempts?.(attempts)||[];
  const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
  const columns=['block_number','first_completed_at','last_completed_at','set_count','correct','questions','percentage','attempt_ids','set_ids'];
  return[columns.join(','),...groups.map(item=>[item.groupNumber,item.startedAt,item.completedAt,item.setCount,item.correctCount,item.questionCount,item.percent,item.attemptIds.join('|'),item.setIds.join('|')].map(quote).join(','))].join('\n');
}
async function mirrorPharmacologyEvent(event){
  if(!event||event.source!==PHARM_SOURCE||!event.quizId||!['presented','answered'].includes(event.kind))return null;
  const api=bank();
  if(!api)return null;
  let attempt=api.attemptById?.(event.quizId)||null;
  if(!attempt){
    await api.reconcileIndex?.();
    const record=api.bankIndex?.().find(item=>String(item.setId)===String(event.quizId));
    if(!record)return null;
    attempt=api.beginAttempt?.(record.setId,{attemptId:event.quizId})||null;
  }
  if(!attempt)return null;
  const set=await setForEvent(event);
  const questionId=String(event.questionId||'');
  const found=set?.questions?.findIndex((question,index)=>String(question?.id||index+1)===questionId);
  const questionIndex=Math.max(0,Number(found)>=0?Number(found):0);
  if(event.kind==='presented')return api.recordPresented?.(attempt.attemptId,questionId,questionIndex)||attempt;
  return api.recordAnswer?.(attempt.attemptId,{
    questionId,
    questionIndex,
    selectedOptionId:event.selectedOptionId,
    correctOptionId:event.correctOptionId,
    correct:Boolean(event.correct),
    answeredAt:event.at
  })||attempt;
}
async function reconcileHistorical(){
  if(historicalPromise)return historicalPromise;
  historicalPromise=(async()=>{
    const events=(core()?.events?.()||[])
      .filter(event=>event?.source===PHARM_SOURCE&&['presented','answered'].includes(event.kind))
      .sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
    for(const event of events)await mirrorPharmacologyEvent(event);
    return events.length;
  })().catch(()=>0);
  return historicalPromise;
}
function updateQuestionTypeCard(stats){
  const card=[...document.querySelectorAll('#app .metric-card')].find(item=>item.querySelector('h3')?.textContent==='Question types');
  if(!card)return;
  const byLabel=new Map([...card.querySelectorAll('.rank-row')].map(row=>[clean(row.querySelector('span:first-child')?.textContent),row]));
  for(const type of PHARM_TYPES){
    const row=stats[type];
    const node=byLabel.get(typeLabel(type));
    if(!node)continue;
    const value=node.querySelector('span:last-child');
    setText(value,row.answered?`${row.accuracy}%`:'—');
    node.title=row.answered?`${row.correct}/${row.answered} correct across local and AI pharmacology questions.`:'No pharmacology answers recorded for this category yet.';
  }
}
function updateOverallCard(rows){
  const grid=document.querySelector('#app .analytics-grid');
  const first=grid?.querySelector('.metric-card:not(.run-chart-card)');
  if(!first)return;
  const weighted=weightedPerformance(rows);
  const trend=completedTenTrend(rows);
  setText(first.querySelector('h3'),'Recency-weighted accuracy');
  setText(first.querySelector('.metric-big'),`${weighted.percent}%`);
  const trendText=trend?.delta>0?` · +${trend.delta} points after the latest completed 10`:'';
  setText(first.querySelector('p'),`${weighted.answered} answers; latest ${Math.min(RECENT_QUESTION_WINDOW,weighted.answered)} dominate${trendText}`);
}
function updateTopicCard(rows){
  const card=[...document.querySelectorAll('#app .metric-card')].find(item=>item.querySelector('h3')?.textContent==='Recency-weighted topics'||item.querySelector('h3')?.textContent==='Weakest topics');
  if(!card)return;
  setText(card.querySelector('h3'),'Recency-weighted topics');
  const ranked=(core()?.App?.topics||[]).map(topic=>{
    const topicRows=rows.filter(event=>event.topicId===topic.id);
    return{topic,rows:topicRows,performance:weightedPerformance(topicRows)};
  }).filter(item=>item.rows.length).sort((a,b)=>a.performance.percent-b.performance.percent).slice(0,10);
  const list=card.querySelector('.rank-list');
  if(list)list.innerHTML=ranked.length?ranked.map(item=>`<div class="rank-row"><span>${escapeHtml(item.topic.name)}</span><span>${item.performance.percent}%</span></div>`).join(''):'<p>No topic answers logged yet.</p>';
}
function updateRunChart(){
  const api=analytics();
  const grid=document.querySelector('#app .analytics-grid');
  if(!api?.chartSvg||!api?.aggregateAttempts||!grid)return;
  const completed=eligibleAttempts();
  const groups=api.aggregateAttempts(completed);
  let chart=document.getElementById('question-run-chart');
  if(!chart){
    chart=document.createElement('article');
    chart.id='question-run-chart';
    chart.className='metric-card run-chart-card';
    grid.prepend(chart);
  }
  const signature=completed.map(item=>`${item.attemptId}:${item.updatedAt}:${item.percent}:${item.sourceType}`).join('|');
  if(chart.dataset.pharmacologySignature===signature)return;
  chart.dataset.pharmacologySignature=signature;
  const recentGroups=groups.slice(-10).reverse();
  const pending=completed.length%RUN_CHART_SET_GROUP;
  chart.innerHTML=`<div class="run-chart-head"><div><h3>Performance run chart</h3><p>Each point aggregates five completed question sets—normally 50 questions. Clinical pharmacology sets are included.${pending?` ${pending}/${RUN_CHART_SET_GROUP} sets are banked toward the next point.`:''}</p></div><button class="btn ghost" id="download-run-chart">Download 50-question CSV</button></div>${api.chartSvg(completed)}<div class="run-chart-history">${recentGroups.map(item=>`<div class="run-chart-row"><span>${escapeHtml(formatDate(item.completedAt))}</span><span>Block ${item.groupNumber} · ${item.setCount} sets</span><strong>${item.percent}%</strong></div>`).join('')}</div>`;
  chart.querySelector('#download-run-chart').onclick=()=>core().downloadText(runChartCsv(completed),`ukmla-50-question-run-chart-${new Date().toISOString().slice(0,10)}.csv`,'text/csv');
}
async function summaryText(){
  const rows=allAnswerEvents();
  const weighted=weightedPerformance(rows);
  const trend=completedTenTrend(rows);
  const stats=await pharmacologyStats(rows);
  const completed=eligibleAttempts();
  const groups=analytics()?.aggregateAttempts?.(completed)||[];
  const pending=completed.length%RUN_CHART_SET_GROUP;
  let base=analytics()?.analyticsSummary?.()||core()?.analyticsSummary?.()||'';
  base=base.replace(/Weighted accuracy:.*recorded answers/,`Weighted accuracy: ${weighted.percent}% across ${weighted.answered} recorded answers`);
  base=base.replace(/Latest completed ten-question change:.*(?:\n|$)/,trend?`Latest completed ten-question change: ${trend.delta>=0?'+':''}${trend.delta} points (${trend.latestCorrect}/10 versus ${trend.priorCorrect}/10)\n`:'Latest completed ten-question change: needs 20 answers\n');
  base=base.replace(/Completed five-set blocks:.*(?:\n|$)/,`Completed five-set blocks: ${groups.length}\n`);
  base=base.replace(/Pending sets toward next block:.*(?:\n|$)/,`Pending sets toward next block: ${pending}/${RUN_CHART_SET_GROUP}\n`);
  const lines=PHARM_TYPES.map((type,index)=>{
    const row=stats[type];
    return`${index+1}. ${typeLabel(type)} — ${row.answered?`${row.accuracy}% — ${row.correct}/${row.answered}`:'not answered'}`;
  });
  return`${base}\n\nPHARMACOLOGY QUESTION-TYPE PERFORMANCE\n${lines.join('\n')}`;
}
async function decorateAnalytics(){
  if(!location.hash.startsWith('#/analytics'))return;
  const rows=allAnswerEvents();
  const stats=await pharmacologyStats(rows);
  updateQuestionTypeCard(stats);
  updateOverallCard(rows);
  updateTopicCard(rows);
  updateRunChart();
  const copy=document.getElementById('copy-summary');
  if(copy){
    copy.dataset.pharmacologySummary='1';
    copy.onclick=async()=>core().copyText(await summaryText(),'Analytics copied');
  }
}
function decorateHome(){
  if(!location.hash.startsWith('#/home')&&location.hash!=='')return;
  const rows=allAnswerEvents();
  const weighted=weightedPerformance(rows);
  const card=document.querySelector('#app .hero-stats .stat:nth-child(3)');
  if(card){
    setText(card.querySelector('strong'),`${weighted.percent}%`);
    setText(card.querySelector('span'),'recency-weighted accuracy');
  }
  const pharmTopic=core()?.App?.topics?.find?.(topic=>topic.id===PHARM_TOPIC_ID);
  if(pharmTopic){
    const topicRows=rows.filter(event=>event.topicId===PHARM_TOPIC_ID);
    const topicCard=document.querySelector(`#app [data-topic="${PHARM_TOPIC_ID}"]`);
    if(topicCard&&topicRows.length){
      const performance=weightedPerformance(topicRows);
      const fill=topicCard.querySelector('.health-fill');
      const value=topicCard.querySelector('.health-value');
      if(fill)fill.style.setProperty('--value',`${performance.percent}%`);
      if(value)setText(value,`${performance.percent}%`);
    }
  }
}
async function apply(){
  scheduled=false;
  if(running){rerun=true;return;}
  running=true;
  try{
    await reconcileHistorical();
    decorateHome();
    await decorateAnalytics();
  }finally{
    running=false;
    if(rerun){rerun=false;schedule();}
  }
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  setTimeout(()=>void apply(),0);
}
function initialise(){
  const app=document.getElementById('app');
  if(!app||!core()||!bank()||!analytics()){setTimeout(initialise,100);return;}
  if(!observer){
    observer=new MutationObserver(schedule);
    observer.observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    document.addEventListener('ukmlaLearningEvent',event=>{void mirrorPharmacologyEvent(event.detail).finally(schedule);});
    document.addEventListener('ukmlaQuestionBankChanged',schedule);
  }
  schedule();
}

window.UKMLA_PHARMACOLOGY_ANALYTICS={
  PHARM_TYPES,GENERIC_FALLBACK,isPharmacologyEvent,classifyQuestion,classifyEvent,
  allAnswerEvents,pharmacologyStats,weightedPerformance,completedTenTrend,
  eligibleAttempts,runChartCsv,mirrorPharmacologyEvent,reconcileHistorical,summaryText,schedule
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
