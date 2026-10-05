(function(){
'use strict';

const TOKEN_KEY='ukmlaJarvis2BuildTokenV1';
const WORKER_KEY='ukmlaJarvis2WorkerUrlV1';
const DEFAULT_WORKER='https://jarvis-2.j74569738.workers.dev';
const ENDPOINT='/v1/ukmla/card-match';
const QUEUE_KEY='ukmlaQuestionMappingQueueV1';
const RECOMMENDATIONS_KEY='ukmlaQuestionMappingRecommendationsV1';
const BATCH_SIZE=5;
const REQUEST_TIMEOUT_MS=25000;
const RETRY_BASE_MS=30000;
let processing=false;
let observer=null;
let retryTimer=null;

function core(){return window.UKMLA_V2;}
function bank(){return window.UKMLA_QUESTION_BANK;}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function parse(value,fallback){try{return JSON.parse(value||'null')??fallback;}catch(_){return fallback;}}
function clone(value){return JSON.parse(JSON.stringify(value));}
function now(){return new Date().toISOString();}
function workerUrl(){return clean(localStorage.getItem(WORKER_KEY))||DEFAULT_WORKER;}
function token(){return clean(localStorage.getItem(TOKEN_KEY));}
function uid(prefix){return core()?.uid(prefix)||`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function onQuestionsRoute(){return location.hash.startsWith('#/quiz');}

function queue(){return parse(localStorage.getItem(QUEUE_KEY),[]).filter(item=>item&&item.id&&item.setId);}
function saveQueue(items){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(items||[]));}catch(_){}notify();}
function recommendations(){return parse(localStorage.getItem(RECOMMENDATIONS_KEY),[]).filter(item=>item&&item.id&&item.setId);}
function saveRecommendations(items){try{localStorage.setItem(RECOMMENDATIONS_KEY,JSON.stringify(items||[]));}catch(_){}notify();}
function bankRecord(setId){return bank()?.bankIndex?.().find(item=>String(item.setId)===String(setId))||null;}
function candidateFor(question,conditionId){return(question?.importedMappingCandidates||[]).find(item=>String(item?.conditionId)===String(conditionId))||null;}
function pendingQuestions(set){return(set?.questions||[]).filter(question=>question?.questionType==='imported_textbook_sba'&&question?.importedMappingStatus==='pending'&&Array.isArray(question?.importedMappingCandidates)&&question.importedMappingCandidates.length);}
function correctAnswerText(question){return(question?.options||[]).find(option=>String(option?.id)===String(question?.correctOptionId))?.text||'';}

function notify(){
  document.dispatchEvent(new CustomEvent('ukmlaQuestionMappingRecommendationsChanged',{detail:{unread:unreadCount(),queued:queue().length}}));
  scheduleUi();
}
function unreadCount(){return recommendations().filter(item=>item.unread!==false).length;}

async function enqueueSet(setId,options={}){
  const api=bank();
  if(!api?.loadSet)return false;
  const set=await api.loadSet(setId);
  const pending=pendingQuestions(set);
  if(!pending.length)return false;
  const items=queue();
  if(!items.some(item=>String(item.setId)===String(setId))){
    const record=bankRecord(setId);
    items.push({
      id:uid('mapping-job'),
      setId:String(setId),
      title:clean(options.title||record?.title||set?.topic||'Imported textbook questions'),
      createdAt:now(),updatedAt:now(),status:'queued',attempts:0,nextAttemptAt:0,
      progressDone:0,total:pending.length,lastError:''
    });
    saveQueue(items);
  }
  setTimeout(()=>void processQueue(),150);
  return true;
}

function requestItems(questions){
  return questions.map(question=>({
    itemId:String(question.id),
    question:{
      stem:question.stem||'',
      leadIn:question.leadIn||'',
      correctAnswer:correctAnswerText(question),
      rationale:question.rationale||''
    },
    candidates:(question.importedMappingCandidates||[]).map(candidate=>({
      conditionId:candidate.conditionId,
      name:candidate.name,
      topicId:candidate.topicId,
      topicName:candidate.topicName,
      fields:candidate.fields&&typeof candidate.fields==='object'?candidate.fields:{},
      localScore:Number(candidate.localScore||0)
    }))
  }));
}

async function callLuna(items){
  const auth=token();
  if(!auth)throw new Error('Luna mapping is waiting for Jarvis 2 pairing.');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(`${workerUrl()}${ENDPOINT}`,{
      method:'POST',
      headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json','X-Jarvis-Client':'ukmla-v2-background-mapper'},
      body:JSON.stringify({items}),cache:'no-store',signal:controller.signal
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||`Jarvis 2 returned ${response.status}.`);
    return Array.isArray(data?.results)?data.results:[];
  }catch(error){
    if(error?.name==='AbortError')throw new Error('Luna mapping timed out; it will retry automatically.');
    throw error;
  }finally{clearTimeout(timer);}
}

function normaliseResults(set,rawResults){
  const byId=new Map((set?.questions||[]).map(question=>[String(question.id),question]));
  return(rawResults||[]).map(result=>{
    const question=byId.get(String(result.itemId));
    if(!question)return null;
    const candidate=candidateFor(question,result.selectedConditionId);
    if(result.status==='matched'&&candidate){
      return{
        questionId:String(question.id),questionNumber:Number(question.questionNumber||0),status:'matched',
        selectedConditionId:String(candidate.conditionId),selectedConditionName:clean(candidate.name),
        topicId:clean(candidate.topicId),topicName:clean(candidate.topicName),suggestedCardTitle:''
      };
    }
    return{
      questionId:String(question.id),questionNumber:Number(question.questionNumber||0),status:'unmapped',
      selectedConditionId:'',selectedConditionName:'',topicId:'',topicName:'',
      suggestedCardTitle:clean(result.suggestedCardTitle)||'New card needed'
    };
  }).filter(Boolean);
}

function scheduleRetry(){
  clearTimeout(retryTimer);
  const items=queue();
  if(!items.length)return;
  const next=Math.min(...items.map(item=>Math.max(Date.now(),Number(item.nextAttemptAt||0))));
  retryTimer=setTimeout(()=>void processQueue(),Math.max(1000,next-Date.now()+50));
}

async function processJob(job){
  const api=bank();
  const set=await api?.loadSet?.(job.setId);
  if(!set)throw new Error('Saved question set is unavailable.');
  const pending=pendingQuestions(set);
  if(!pending.length)return{results:[],empty:true};
  const results=[];
  for(let offset=0;offset<pending.length;offset+=BATCH_SIZE){
    const batch=pending.slice(offset,offset+BATCH_SIZE);
    const raw=await callLuna(requestItems(batch));
    results.push(...normaliseResults(set,raw));
    job.progressDone=Math.min(pending.length,offset+batch.length);
    job.updatedAt=now();
    const items=queue();
    const index=items.findIndex(item=>item.id===job.id);
    if(index>=0){items[index]={...items[index],...job};saveQueue(items);}
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  const seen=new Set(results.map(item=>item.questionId));
  for(const question of pending){
    if(!seen.has(String(question.id)))results.push({
      questionId:String(question.id),questionNumber:Number(question.questionNumber||0),status:'unmapped',
      selectedConditionId:'',selectedConditionName:'',topicId:'',topicName:'',suggestedCardTitle:'New card needed'
    });
  }
  return{results,empty:false};
}

async function processQueue(){
  if(processing)return;
  const auth=token();
  if(!auth){scheduleRetry();scheduleUi();return;}
  const items=queue();
  const job=items.find(item=>Number(item.nextAttemptAt||0)<=Date.now());
  if(!job){scheduleRetry();return;}
  processing=true;
  try{
    job.status='running';job.updatedAt=now();job.lastError='';
    saveQueue(items.map(item=>item.id===job.id?job:item));
    const outcome=await processJob(job);
    const nextQueue=queue().filter(item=>item.id!==job.id);
    saveQueue(nextQueue);
    if(!outcome.empty){
      const recs=recommendations().filter(item=>String(item.setId)!==String(job.setId));
      recs.unshift({
        id:uid('mapping-recommendation'),setId:job.setId,title:job.title,createdAt:job.createdAt,
        completedAt:now(),unread:true,appliedAt:'',results:outcome.results
      });
      saveRecommendations(recs.slice(0,50));
      core()?.toast(`Luna finished card recommendations for ${job.title}.`);
    }
  }catch(error){
    const failed=queue();
    const index=failed.findIndex(item=>item.id===job.id);
    if(index>=0){
      const attempts=Number(failed[index].attempts||0)+1;
      failed[index]={...failed[index],status:'queued',attempts,lastError:clean(error?.message||error),updatedAt:now(),nextAttemptAt:Date.now()+Math.min(5*60*1000,RETRY_BASE_MS*Math.pow(2,Math.min(3,attempts-1)))};
      saveQueue(failed);
    }
  }finally{
    processing=false;
    scheduleRetry();
    setTimeout(()=>void processQueue(),250);
  }
}

async function applyRecommendation(id){
  const recs=recommendations();
  const rec=recs.find(item=>item.id===id);
  if(!rec)return false;
  const api=bank();
  const set=await api?.loadSet?.(rec.setId);
  if(!set)return false;
  const resultMap=new Map((rec.results||[]).map(result=>[String(result.questionId),result]));
  for(const question of set.questions||[]){
    const result=resultMap.get(String(question.id));
    if(!result)continue;
    if(result.status==='matched'){
      question.targetConditionId=result.selectedConditionId;
      question.targetCondition=result.selectedConditionName;
      question.topicId=result.topicId;
      question.topicName=result.topicName;
      question.importedMappingStatus='confirmed';
      question.suggestedCardTitle='';
    }else{
      question.targetConditionId='';question.targetCondition='';question.topicId='';question.topicName='';
      question.importedMappingStatus='unmapped';
      question.suggestedCardTitle=result.suggestedCardTitle||'New card needed';
    }
    delete question.importedMappingCandidates;
  }
  const record=bankRecord(rec.setId);
  await api.storeSet(set,{
    setId:rec.setId,sourceType:set.sourceType||'knowledge',title:record?.title||rec.title,
    verifiedAt:now(),verificationLabel:'Original textbook wording preserved · Luna card recommendations applied'
  });
  rec.appliedAt=now();rec.unread=false;
  saveRecommendations(recs);
  core()?.toast('Luna card recommendations applied to the saved questions.');
  return true;
}

function exportRecommendation(id){
  const rec=recommendations().find(item=>item.id===id);
  if(!rec)return false;
  const matchedIds=[...new Set((rec.results||[]).filter(item=>item.status==='matched').map(item=>item.selectedConditionId))];
  const cards=matchedIds.map(id=>core()?.App?.byId?.get(id)).filter(Boolean).map(clone);
  const missing=(rec.results||[]).filter(item=>item.status==='unmapped').map(item=>({questionId:item.questionId,questionNumber:item.questionNumber,suggestedCardTitle:item.suggestedCardTitle}));
  const payload={schemaVersion:'ukmla-recommended-cards-v1',sourceSetId:rec.setId,sourceTitle:rec.title,generatedAt:rec.completedAt,recommendedCards:cards,suggestedFutureCards:missing};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`ukmla-recommended-cards-${String(rec.setId).replace(/[^a-z0-9_-]+/gi,'-')}.json`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return true;
}

function dismissRecommendation(id){
  const recs=recommendations();
  const rec=recs.find(item=>item.id===id);if(!rec)return;
  rec.unread=false;saveRecommendations(recs);
}

function injectStyle(){
  if(document.getElementById('ukmla-luna-map-style'))return;
  const style=document.createElement('style');style.id='ukmla-luna-map-style';style.textContent=`
  .luna-map-wrap{position:relative;display:inline-flex}.luna-map-button{position:relative}.luna-map-badge{display:inline-flex;min-width:1.25rem;height:1.25rem;padding:0 .32rem;align-items:center;justify-content:center;border-radius:999px;background:var(--danger,#b33);color:#fff;font-size:.72rem;font-weight:800;margin-left:.35rem}.luna-map-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:120;width:min(430px,92vw);max-height:68vh;overflow:auto;padding:12px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 18px 50px rgba(0,0,0,.24)}.luna-map-menu[hidden]{display:none}.luna-map-job,.luna-map-rec{padding:10px;border:1px solid var(--line);border-radius:12px;margin:8px 0}.luna-map-rec ul{margin:8px 0;padding-left:18px}.luna-map-rec .card-actions{gap:6px}.luna-map-muted{color:var(--muted);font-size:.82rem}@media(max-width:700px){.luna-map-menu{position:fixed;left:12px;right:12px;top:118px;width:auto;max-height:68vh}}
  `;document.head.appendChild(style);
}

function menuHtml(){
  const jobs=queue();
  const recs=recommendations().slice(0,8);
  const jobHtml=jobs.map(job=>`<div class="luna-map-job"><strong>${escapeHtml(job.title)}</strong><div class="luna-map-muted">${job.status==='running'?'Mapping':token()?'Queued':'Waiting for Jarvis pairing'} · ${Number(job.progressDone||0)}/${Number(job.total||0)}</div>${job.lastError?`<div class="luna-map-muted">${escapeHtml(job.lastError)}</div>`:''}</div>`).join('');
  const recHtml=recs.map(rec=>{
    const matched=(rec.results||[]).filter(item=>item.status==='matched');
    const missing=(rec.results||[]).filter(item=>item.status==='unmapped');
    const preview=[...matched.slice(0,4).map(item=>`Q${item.questionNumber||'?'} → ${escapeHtml(item.selectedConditionName)}`),...missing.slice(0,2).map(item=>`Q${item.questionNumber||'?'} → ${escapeHtml(item.suggestedCardTitle||'New card needed')}`)];
    return`<div class="luna-map-rec" data-rec-id="${escapeHtml(rec.id)}"><strong>${escapeHtml(rec.title)}</strong><div class="luna-map-muted">${matched.length} card match${matched.length===1?'':'es'} · ${missing.length} possible card gap${missing.length===1?'':'s'}${rec.appliedAt?' · applied':''}</div>${preview.length?`<ul>${preview.map(text=>`<li>${text}</li>`).join('')}</ul>`:''}<div class="card-actions"><button class="btn" data-luna-export="${escapeHtml(rec.id)}">Export recommended cards</button>${rec.appliedAt?'':`<button class="btn primary" data-luna-apply="${escapeHtml(rec.id)}">Apply recommendations</button>`}<button class="btn" data-luna-dismiss="${escapeHtml(rec.id)}">Dismiss</button></div></div>`;
  }).join('');
  return`${jobs.length?`<div class="eyebrow">Background mapping</div>${jobHtml}`:''}<div class="eyebrow" style="margin-top:${jobs.length?'12px':'0'}">Luna recommendations</div>${recHtml||'<p class="luna-map-muted">No completed recommendations yet.</p>'}`;
}

function ensureControl(){
  if(!onQuestionsRoute())return;
  injectStyle();
  const head=document.querySelector('#app .page-head');if(!head)return;
  let actions=head.querySelector('.page-actions');if(!actions){actions=document.createElement('div');actions.className='page-actions';head.appendChild(actions);}
  let wrap=actions.querySelector('[data-luna-map-control]');
  if(!wrap){
    wrap=document.createElement('div');wrap.className='luna-map-wrap';wrap.dataset.lunaMapControl='1';
    wrap.innerHTML='<button class="btn luna-map-button" type="button" data-luna-map-toggle aria-expanded="false">Luna <span class="luna-map-badge" hidden></span></button><div class="luna-map-menu" data-luna-map-menu hidden></div>';
    actions.appendChild(wrap);
    const button=wrap.querySelector('[data-luna-map-toggle]');const menu=wrap.querySelector('[data-luna-map-menu]');
    button.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',open?'true':'false');if(open)renderControl();});
    menu.addEventListener('click',event=>{
      const apply=event.target.closest('[data-luna-apply]');if(apply)void applyRecommendation(apply.dataset.lunaApply).then(renderControl);
      const exp=event.target.closest('[data-luna-export]');if(exp)exportRecommendation(exp.dataset.lunaExport);
      const dismiss=event.target.closest('[data-luna-dismiss]');if(dismiss){dismissRecommendation(dismiss.dataset.lunaDismiss);renderControl();}
    });
  }
  renderControl();
}

function renderControl(){
  const wrap=document.querySelector('[data-luna-map-control]');if(!wrap)return;
  const badge=wrap.querySelector('.luna-map-badge');const count=unreadCount();const jobs=queue().length;
  badge.textContent=String(count||jobs);badge.hidden=!(count||jobs);
  const menu=wrap.querySelector('[data-luna-map-menu]');if(menu&&!menu.hidden)menu.innerHTML=menuHtml();
}

let uiScheduled=false;
function scheduleUi(){if(uiScheduled)return;uiScheduled=true;requestAnimationFrame(()=>{uiScheduled=false;ensureControl();});}
function initObserver(){
  if(observer)return;
  const app=document.getElementById('app');if(!app)return;
  observer=new MutationObserver(scheduleUi);observer.observe(app,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(scheduleUi,0));
  document.addEventListener('ukmlaQuestionBankChanged',scheduleUi);
  scheduleUi();
}

function init(){initObserver();setTimeout(()=>void processQueue(),900);setInterval(()=>void processQueue(),60000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

window.UKMLA_QUESTION_MAPPING={enqueueSet,processQueue,recommendations,unreadCount,applyRecommendation,exportRecommendation,dismissRecommendation,queue};
})();
