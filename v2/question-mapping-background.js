(function(){
'use strict';

// One AI decision per imported question. Mapping results are checkpointed and
// committed automatically; the user is never asked to approve a shortlist.
const TOKEN_KEY='ukmlaJarvis2BuildTokenV1';
const WORKER_KEY='ukmlaJarvis2WorkerUrlV1';
const WORKER_DEFAULT='https://jarvis-2.j74569738.workers.dev';
const QUEUE_KEY='ukmlaQuestionMappingQueueV1';
const ENDPOINT='/v1/ukmla/card-match';
const BATCH_SIZE=5;
const CANDIDATE_COUNT=12;
const TIMEOUT_MS=45000;
let processing=false;
let retryTimer=null;

function core(){return window.UKMLA_V2;}
function bank(){return window.UKMLA_QUESTION_BANK;}
function importer(){return window.UKMLA_QUESTION_IMPORTER;}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function parse(raw,fallback){try{return JSON.parse(raw||'null')??fallback;}catch(_){return fallback;}}
function now(){return new Date().toISOString();}
function uid(){return core()?.uid('mapping-job')||'mapping-job-'+Date.now();}
function token(){return clean(localStorage.getItem(TOKEN_KEY));}
function workerUrl(){return clean(localStorage.getItem(WORKER_KEY))||WORKER_DEFAULT;}
function queue(){return parse(localStorage.getItem(QUEUE_KEY),[]).filter(item=>item?.id&&item?.setId);}
function activeJob(setId){return queue().find(item=>String(item.setId)===String(setId))||null;}
function notify(){
  document.dispatchEvent(new CustomEvent('ukmlaQuestionMappingProgress',{detail:{queue:queue()}}));
}
function saveQueue(items){
  localStorage.setItem(QUEUE_KEY,JSON.stringify(items));
  notify();
}
function isImported(question){return question?.questionType==='imported_textbook_sba';}
function correctAnswer(question){
  return (question.options||[]).find(option=>String(option?.id)===String(question.correctOptionId))?.text||'';
}
function candidateList(question){
  const match=importer();
  if(!match?.shortlist||!match?.candidatePayload)throw new Error('Card atlas search is not ready.');
  const enriched={...question,correctAnswerText:correctAnswer(question)};
  return match.shortlist(enriched,CANDIDATE_COUNT).map(item=>{
    const card=match.candidatePayload(item);
    // Keep enough clinical context for Luna, without sending every long atlas field.
    const fields={};
    let budget=1100;
    for(const [key,value] of Object.entries(card.fields||{})){
      if(budget<=0)break;
      const flat=typeof value==='string'?value:JSON.stringify(value);
      const excerpt=String(flat??'').slice(0,Math.min(300,budget));
      if(!excerpt)continue;
      fields[key]=excerpt;
      budget-=excerpt.length;
    }
    return {...card,fields};
  });
}
function requestItems(batch){
  const candidatesByQuestion=new Map();
  const items=batch.map(question=>{
    const candidates=candidateList(question);
    candidatesByQuestion.set(String(question.id),candidates);
    return {
      itemId:String(question.id),
      question:{
        stem:question.stem||'',
        leadIn:question.leadIn||'',
        correctAnswer:correctAnswer(question),
        rationale:question.rationale||''
      },
      candidates,
      missingCardLimit:4
    };
  });
  return {items,candidatesByQuestion};
}
async function callLuna(items){
  const auth=token();
  if(!auth)throw new Error('Luna is not paired with Jarvis 2.');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const response=await fetch(workerUrl()+ENDPOINT,{
      method:'POST',
      headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json','X-Jarvis-Client':'ukmla-v2-question-mapper'},
      body:JSON.stringify({items}),cache:'no-store',signal:controller.signal
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||'Luna returned '+response.status+'.');
    if(!Array.isArray(data?.results))throw new Error('Luna returned no mapping decisions.');
    return data.results;
  }finally{clearTimeout(timer);}
}
function suggestions(result){
  const values=[];
  const add=item=>{
    if(typeof item==='string'){const title=clean(item).slice(0,120);if(title&&!values.includes(title))values.push(title);}
    else if(item&&typeof item==='object')add(item.title||item.name||item.suggestedCardTitle);
  };
  const returned=result?.suggestedCardTitles||result?.suggestedCards||result?.missingCards||[];
  if(Array.isArray(returned))returned.forEach(add);
  add(result?.suggestedCardTitle);
  return values.slice(0,4);
}
function normaliseResults(batch,raw,candidatesByQuestion){
  const byId=new Map(raw.map(item=>[String(item?.itemId||''),item]));
  return batch.map(question=>{
    const id=String(question.id),result=byId.get(id);
    if(!result)throw new Error('Luna missed a question in its response; retrying this batch.');
    if(result.status==='matched'){
      const card=(candidatesByQuestion.get(id)||[]).find(item=>String(item.conditionId)===String(result.selectedConditionId));
      if(!card||!core()?.App?.byId?.get(String(card.conditionId)))throw new Error('Luna selected an invalid card; retrying this batch.');
      return {questionId:id,status:'matched',selectedConditionId:String(card.conditionId),
        selectedConditionName:clean(card.name),topicId:clean(card.topicId),topicName:clean(card.topicName)};
    }
    if(result.status!=='unmapped')throw new Error('Luna returned an unrecognised mapping decision.');
    return {questionId:id,status:'unmapped',suggestedCardTitles:suggestions(result),
      missingCardExplanation:clean(result.missingCardExplanation||result.explanation||result.reason||'').slice(0,450)};
  });
}
function storeJob(job){
  const items=queue();
  const index=items.findIndex(item=>item.id===job.id);
  if(index<0)return false;
  items[index]={...job,updatedAt:now()};
  saveQueue(items);
  return true;
}
function scheduleRetry(){
  clearTimeout(retryTimer);
  const items=queue();
  if(!items.length||!token())return;
  const soonest=Math.min(...items.map(item=>Math.max(Date.now(),Number(item.nextAttemptAt||0))));
  retryTimer=setTimeout(()=>void processQueue(),Math.max(1000,soonest-Date.now()+50));
}
async function enqueueSet(setId){
  const api=bank();
  if(!api?.loadSet)return false;
  const set=await api.loadSet(setId);
  const questions=(set?.questions||[]).filter(isImported);
  if(!questions.length){core()?.toast('This set does not contain imported textbook questions.');return false;}
  if(activeJob(setId)){core()?.toast('Luna mapping is already queued for this set.');return true;}
  const id=String(setId),record=api.bankIndex?.().find(item=>String(item.setId)===id);
  const job={id:uid(),setId:id,title:clean(record?.title||set.topic||'Imported questions'),
    questionIds:questions.map(question=>String(question.id)),results:[],
    createdAt:now(),updatedAt:now(),status:'queued',attempts:0,nextAttemptAt:0,
    progressDone:0,total:questions.length,lastError:''};
  saveQueue([...queue(),job]);
  core()?.toast(token()?'Luna is mapping the saved questions.':'Mapping queued; pair Jarvis 2 to connect Luna.');
  setTimeout(()=>void processQueue(),100);
  return true;
}
function cancelSet(setId){
  saveQueue(queue().filter(item=>String(item.setId)!==String(setId)));
}
async function processJob(job){
  const set=await bank()?.loadSet?.(job.setId);
  if(!set)throw new Error('Saved question set is not on this device.');
  // Old queued jobs can be resumed after migration to the new implementation.
  if(!Array.isArray(job.questionIds)||!job.questionIds.length){
    job.questionIds=(set.questions||[]).filter(isImported).map(q=>String(q.id));
    job.results=[];
    job.total=job.questionIds.length;
  }
  const requested=new Set(job.questionIds.map(String));
  const questions=(set.questions||[]).filter(q=>isImported(q)&&requested.has(String(q.id)));
  const done=new Set((job.results||[]).map(item=>String(item.questionId)));
  const remaining=questions.filter(question=>!done.has(String(question.id)));
  job.total=questions.length;
  for(let offset=0;offset<remaining.length;offset+=BATCH_SIZE){
    const batch=remaining.slice(offset,offset+BATCH_SIZE);
    const request=requestItems(batch);
    const raw=await callLuna(request.items);
    const result=normaliseResults(batch,raw,request.candidatesByQuestion);
    if(!activeJob(job.setId))return false; // Removed while a network request was running.
    job.results=[...(job.results||[]),...result];
    job.progressDone=job.results.length;
    job.status='running';
    job.lastError='';
    if(!storeJob(job))return false;
  }
  if(job.results.length!==questions.length)throw new Error('Not all questions received Luna decisions.');
  if(!activeJob(job.setId))return false;
  // Reload immediately before writing to preserve intervening question-bank updates.
  const latest=await bank().loadSet(job.setId);
  if(!latest||!activeJob(job.setId))return false;
  const results=new Map(job.results.map(row=>[String(row.questionId),row]));
  const mapped=[];
  for(const question of latest.questions||[]){
    const result=results.get(String(question.id));
    if(!result)continue;
    if(result.status==='matched'){
      Object.assign(question,{
        targetConditionId:result.selectedConditionId,targetCondition:result.selectedConditionName,
        topicId:result.topicId,topicName:result.topicName,importedMappingStatus:'confirmed',
        suggestedCardTitle:'',suggestedCardTitles:[],missingCardExplanation:'',
        mappingModel:'Luna',mappingVerifiedAt:now()
      });
      mapped.push(question);
    }else{
      Object.assign(question,{
        targetConditionId:'',targetCondition:'',topicId:'',topicName:'',
        importedMappingStatus:'unmapped',suggestedCardTitle:result.suggestedCardTitles?.[0]||'',
        suggestedCardTitles:result.suggestedCardTitles||[],
        missingCardExplanation:result.missingCardExplanation||'',
        mappingModel:'Luna',mappingVerifiedAt:now()
      });
    }
    delete question.importedMappingCandidates;
  }
  const record=bank().bankIndex().find(row=>String(row.setId)===String(job.setId));
  const saved=await bank().storeSet(latest,{
    setId:job.setId,sourceType:latest.sourceType||'imported',
    title:record?.title||job.title,verifiedAt:now(),
    verificationLabel:'Original questions preserved · Luna card mapping complete'
  });
  if(!saved)throw new Error('Mapped question set could not be saved.');
  // Backfill analytics for earlier attempts that preceded card mapping.
  for(const question of mapped){
    for(const attempt of bank().attempts?.().filter(item=>String(item.setId)===String(job.setId))||[]){
      const answer=attempt.answers?.[String(question.id)];
      if(!answer)continue;
      const base={source:'imported',quizId:attempt.attemptId,questionId:String(question.id),
        conditionId:question.targetConditionId,conditionName:question.targetCondition,
        topicId:question.topicId,topicName:question.topicName,
        questionType:question.questionType,questionTypeLabel:question.questionTypeLabel,
        at:answer.answeredAt||now()};
      core()?.logPresented({...base,id:'present:'+attempt.attemptId+':'+question.id});
      core()?.logAnswered({...base,id:'answer:'+attempt.attemptId+':'+question.id,
        presentationId:'present:'+attempt.attemptId+':'+question.id,
        selectedOptionId:answer.selectedOptionId,
        correctOptionId:answer.correctOptionId||question.correctOptionId,
        correct:Boolean(answer.correct)});
    }
  }
  document.dispatchEvent(new CustomEvent('ukmlaQuestionMappingUpdated',{detail:{setId:job.setId,completed:questions.length}}));
  return true;
}
async function processQueue(){
  if(processing||!token())return;
  const jobs=queue();
  const job=jobs.find(item=>Number(item.nextAttemptAt||0)<=Date.now());
  if(!job){scheduleRetry();return;}
  processing=true;
  try{
    job.status='running';
    job.lastError='';
    storeJob(job);
    const success=await processJob(job);
    if(success){
      cancelSet(job.setId);
      core()?.toast('Luna finished mapping '+job.title+'.');
    }
  }catch(error){
    const existing=activeJob(job.setId);
    if(existing){
      const attempts=Number(existing.attempts||0)+1;
      existing.status='queued';
      existing.lastError=clean(error?.message||error);
      existing.attempts=attempts;
      existing.nextAttemptAt=Date.now()+Math.min(300000,30000*Math.pow(2,Math.min(3,attempts-1)));
      storeJob(existing);
    }
  }finally{
    processing=false;
    scheduleRetry();
    if(queue().some(item=>Number(item.nextAttemptAt||0)<=Date.now()))setTimeout(()=>void processQueue(),200);
  }
}
function init(){
  setTimeout(()=>void processQueue(),900);
  setInterval(()=>void processQueue(),60000);
  window.addEventListener('storage',event=>{
    if(event.key===TOKEN_KEY||event.key===QUEUE_KEY)setTimeout(()=>void processQueue(),200);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.UKMLA_QUESTION_MAPPING={enqueueSet,processQueue,queue,activeJob,cancelSet};
})();