(function(){
  'use strict';

  const INDEX_KEY='ukmlaQuestionBankIndexV1';
  const ATTEMPTS_KEY='ukmlaQuestionBankAttemptsV1';
  const MIGRATION_KEY='ukmlaQuestionBankMigratedV2IndexedDb';
  const SET_PREFIX='ukmlaQuestionBankSetV1:';
  const SCHEMA='ukmla-question-bank-v1';
  const UNSEEN_KEY='ukmlaQuestionBankUnseenV1';
  const TRACKED_SOURCES=new Set(['basic','ai','biomedical','knowledge']);
  let root=null;
  let filter='not-completed';
  let search='';
  let player=null;
  let initialised=false;
  let migrationPromise=null;
  let reconciliationPromise=null;
  let volatileIndex=[];
  let volatileUnseen=new Set();

  function core(){return window.UKMLA_V2;}
  function large(){return window.UKMLA_LARGE_STORAGE;}
  function parse(value,fallback){try{return JSON.parse(value||'null')??fallback;}catch(_){return fallback;}}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function setKey(setId){return`${SET_PREFIX}${setId}`;}
  function now(){return new Date().toISOString();}
  function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'');}
  function deviceId(){return localStorage.getItem('ukmlaRemoteDeviceIdV1')||core()?.uid('bank-device')||`bank-device-${Date.now().toString(36)}`;}
  function uid(prefix){return core()?.uid(prefix)||`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}

  function hashText(text){
    let value=2166136261;
    for(let index=0;index<text.length;index++){
      value^=text.charCodeAt(index);
      value=Math.imul(value,16777619)>>>0;
    }
    return value.toString(36).padStart(7,'0');
  }

  function storedIndex(){return parse(localStorage.getItem(INDEX_KEY),[]);}
  function mergeIndex(records){
    const map=new Map();
    for(const record of records||[]){if(record?.setId)map.set(String(record.setId),record);}
    return[...map.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
  function bankIndex(){return mergeIndex([...storedIndex(),...volatileIndex]);}
  function saveIndex(records){
    volatileIndex=mergeIndex(records);
    try{localStorage.setItem(INDEX_KEY,JSON.stringify(volatileIndex));volatileIndex=[];return true;}
    catch(error){core()?.toast('Question Bank index is full. Saved sets remain protected in IndexedDB and will be rebuilt automatically.');return false;}
  }
  function attempts(){return parse(localStorage.getItem(ATTEMPTS_KEY),[]);}
  function saveAttempts(records){
    try{localStorage.setItem(ATTEMPTS_KEY,JSON.stringify(records));return true;}
    catch(error){core()?.toast('Attempt history could not be stored. Export a backup.');return false;}
  }
  function unseenSetIds(){return[...new Set([...parse(localStorage.getItem(UNSEEN_KEY),[]).map(String),...volatileUnseen])];}
  function saveUnseen(ids){
    volatileUnseen=new Set((ids||[]).map(String));
    try{localStorage.setItem(UNSEEN_KEY,JSON.stringify([...volatileUnseen]));volatileUnseen.clear();return true;}
    catch(_){return false;}
  }
  function unseenCount(){
    const available=new Set(bankIndex().map(record=>String(record.setId)));
    return unseenSetIds().filter(setId=>available.has(String(setId))).length;
  }
  function markUnseen(setId){
    const id=String(setId||'');
    if(!id)return false;
    const ids=unseenSetIds();
    if(!ids.includes(id))ids.push(id);
    saveUnseen(ids);
    notify();
    return true;
  }
  function markSeen(setId){
    const id=String(setId||'');
    if(!id)return false;
    saveUnseen(unseenSetIds().filter(item=>item!==id));
    notify();
    return true;
  }
  function notify(){
    document.dispatchEvent(new Event('ukmlaQuestionBankChanged'));
    document.dispatchEvent(new CustomEvent('ukmlaQuestionBankBadgeChanged',{detail:{count:unseenCount()}}));
  }

  function sourceType(set,meta={}){
    return meta.sourceType||set.sourceType||set.source||(
      String(set.schemaVersion||'').includes('knowledge')?'knowledge':
      String(set.schemaVersion||'').includes('biomedical')?'biomedical':
      String(set.schemaVersion||'').includes('ai')?'ai':'basic'
    );
  }
  function sourceLabel(value){return({basic:'Basic HTML',ai:'UKMLA Questions',biomedical:'Anatomy & Physiology',knowledge:'Uploaded study material'})[value]||'UKMLA Questions';}
  function verificationLabel(set,type,meta={}){
    if(meta.verificationLabel)return meta.verificationLabel;
    if(type==='ai')return'All clinical checkpoints passed';
    if(type==='knowledge')return'Source-fidelity checkpoint passed';
    if(type==='biomedical')return'Local biomedical set';
    return'Local deterministic set';
  }
  function titleFor(set,type,meta={}){
    if(meta.title)return meta.title;
    const topic=String(set.topic||meta.topic||'').trim();
    if(topic&&topic!=='All UKMLA topics')return topic;
    return sourceLabel(type);
  }

  async function storeSet(set,meta={}){
    if(!set||!Array.isArray(set.questions)||!set.questions.length)return null;
    if(!large())throw new Error('Large offline storage did not initialise.');
    const stored=clone(set);
    const setId=String(meta.setId||stored.quizId||stored.setId||uid('question-set'));
    stored.quizId=setId;
    stored.setId=setId;
    stored.questionBankSchema=SCHEMA;
    stored.sourceType=sourceType(stored,meta);
    stored.generatedAt=stored.generatedAt||meta.createdAt||now();
    const payload=JSON.stringify(stored);
    const contentHash=hashText(payload);

    try{await large().putRaw(setKey(setId),payload);}
    catch(error){core()?.toast('The complete question set could not be stored in IndexedDB.');return null;}

    const records=bankIndex();
    const existing=records.find(item=>item.setId===setId);
    const record={
      schemaVersion:SCHEMA,
      setId,
      payloadKey:setKey(setId),
      contentHash,
      title:titleFor(stored,stored.sourceType,meta),
      topic:String(stored.topic||meta.topic||'All UKMLA topics'),
      sourceType:stored.sourceType,
      sourceLabel:sourceLabel(stored.sourceType),
      questionCount:stored.questions.length,
      createdAt:existing?.createdAt||stored.generatedAt,
      verifiedAt:meta.verifiedAt||stored.generatedAt||now(),
      verificationLabel:verificationLabel(stored,stored.sourceType,meta),
      promptVersion:stored.schemaVersion||'',
      availableOffline:true,
      storageBackend:'indexeddb',
      updatedAt:now()
    };
    const next=[record,...records.filter(item=>item.setId!==setId)]
      .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    saveIndex(next);
    localStorage.removeItem(setKey(setId));
    notify();
    return record;
  }

  async function loadSet(setId){
    if(!large())return null;
    const key=setKey(setId);
    let raw=await large().getRaw(key);
    if(raw===null){
      const legacy=localStorage.getItem(key);
      if(legacy!==null){
        await large().putRaw(key,legacy);
        raw=legacy;
        localStorage.removeItem(key);
      }
    }
    return parse(raw,null);
  }

  async function reconcileIndex(){
    if(reconciliationPromise)return reconciliationPromise;
    reconciliationPromise=(async()=>{
      if(!large()?.entries)return bankIndex();
      const map=new Map(bankIndex().map(record=>[String(record.setId),record]));
      for(const[key,payload]of await large().entries(SET_PREFIX)){
        const stored=parse(payload,null);
        if(!stored||!Array.isArray(stored.questions)||!stored.questions.length)continue;
        const setId=String(stored.setId||stored.quizId||String(key).slice(SET_PREFIX.length));
        const existing=map.get(setId);
        const type=sourceType(stored);
        map.set(setId,{
          schemaVersion:SCHEMA,
          setId,
          payloadKey:setKey(setId),
          contentHash:hashText(String(payload)),
          title:titleFor(stored,type),
          topic:String(stored.topic||'All UKMLA topics'),
          sourceType:type,
          sourceLabel:sourceLabel(type),
          questionCount:stored.questions.length,
          createdAt:existing?.createdAt||stored.generatedAt||now(),
          verifiedAt:existing?.verifiedAt||stored.generatedAt||now(),
          verificationLabel:existing?.verificationLabel||verificationLabel(stored,type),
          promptVersion:stored.schemaVersion||'',
          availableOffline:true,
          storageBackend:'indexeddb',
          updatedAt:existing?.updatedAt||now()
        });
      }
      const next=mergeIndex([...map.values()]);
      saveIndex(next);
      notify();
      return next;
    })().finally(()=>{reconciliationPromise=null;});
    return reconciliationPromise;
  }

  async function removeSet(setId){
    localStorage.removeItem(setKey(setId));
    await large()?.deleteKey(setKey(setId));
    saveIndex(bankIndex().filter(item=>item.setId!==setId));
    saveAttempts(attempts().filter(item=>item.setId!==setId));
    saveUnseen(unseenSetIds().filter(item=>item!==String(setId)));
    notify();
  }

  function attemptById(attemptId){return attempts().find(item=>item.attemptId===attemptId)||null;}
  function setRecord(setId){return bankIndex().find(item=>item.setId===setId)||null;}
  function beginAttempt(setId,options={}){
    const all=attempts();
    if(options.resumeAttemptId){
      const existing=all.find(item=>item.attemptId===options.resumeAttemptId&&item.status==='in_progress');
      if(existing)return existing;
    }
    const record=setRecord(setId);
    if(!record)return null;
    const attemptId=String(options.attemptId||uid('question-attempt'));
    const existing=all.find(item=>item.attemptId===attemptId);
    if(existing)return existing;
    const attempt={
      schemaVersion:SCHEMA,
      attemptId,
      setId,
      sourceType:record.sourceType,
      title:record.title,
      questionCount:record.questionCount,
      status:'in_progress',
      currentIndex:0,
      answers:{},
      presentedQuestionIds:[],
      correctCount:0,
      percent:null,
      startedAt:now(),
      updatedAt:now(),
      completedAt:null,
      deviceId:deviceId()
    };
    all.unshift(attempt);
    saveAttempts(all);
    notify();
    return attempt;
  }

  function updateAttempt(attemptId,updater){
    const all=attempts();
    const index=all.findIndex(item=>item.attemptId===attemptId);
    if(index<0)return null;
    const current=all[index];
    const updated=updater(clone(current))||current;
    if(current.status==='completed'&&updated.status!=='completed')updated.status='completed';
    updated.updatedAt=now();
    all[index]=updated;
    saveAttempts(all);
    notify();
    return updated;
  }

  function recordPresented(attemptId,questionId,index){
    return updateAttempt(attemptId,attempt=>{
      attempt.presentedQuestionIds=Array.isArray(attempt.presentedQuestionIds)?attempt.presentedQuestionIds:[];
      if(!attempt.presentedQuestionIds.includes(String(questionId)))attempt.presentedQuestionIds.push(String(questionId));
      attempt.currentIndex=Math.max(0,Number(index)||0);
      return attempt;
    });
  }

  function recordAnswer(attemptId,answer){
    return updateAttempt(attemptId,attempt=>{
      attempt.answers=attempt.answers||{};
      const questionId=String(answer.questionId);
      if(!attempt.answers[questionId]){
        attempt.answers[questionId]={
          questionId,
          questionIndex:Number(answer.questionIndex)||0,
          selectedOptionId:String(answer.selectedOptionId||''),
          correctOptionId:String(answer.correctOptionId||''),
          correct:Boolean(answer.correct),
          answeredAt:answer.answeredAt||now()
        };
      }
      attempt.currentIndex=Math.max(attempt.currentIndex||0,Number(answer.questionIndex)||0);
      const answerRows=Object.values(attempt.answers);
      attempt.correctCount=answerRows.filter(item=>item.correct).length;
      if(answerRows.length>=Number(attempt.questionCount||0)){
        attempt.status='completed';
        attempt.completedAt=attempt.completedAt||now();
        attempt.percent=Math.round(attempt.correctCount/Math.max(1,attempt.questionCount)*100);
      }
      return attempt;
    });
  }

  function completeAttempt(attemptId){
    return updateAttempt(attemptId,attempt=>{
      const rows=Object.values(attempt.answers||{});
      attempt.correctCount=rows.filter(item=>item.correct).length;
      attempt.status='completed';
      attempt.completedAt=attempt.completedAt||now();
      attempt.percent=Math.round(attempt.correctCount/Math.max(1,attempt.questionCount)*100);
      return attempt;
    });
  }

  function completedAttempts(){
    return attempts().filter(item=>item.status==='completed'&&item.completedAt)
      .sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt)));
  }
  function rollingStats(limit=10){
    const recent=completedAttempts().slice(-limit);
    const correct=recent.reduce((sum,item)=>sum+Number(item.correctCount||0),0);
    const questions=recent.reduce((sum,item)=>sum+Number(item.questionCount||0),0);
    return{attempts:recent,count:recent.length,correct,questions,percent:questions?Math.round(correct/questions*100):0};
  }

  async function discoverSetForEvent(event){
    const api=core();
    if(!api)return null;
    const active=api.App.quiz;
    if(active&&active.id===event.quizId&&Array.isArray(active.questions)){
      return storeSet({
        schemaVersion:'ukmla-local-basic-v1',
        quizId:active.id,
        topic:'Local coverage',
        generatedAt:now(),
        sourceType:active.source||'basic',
        questions:active.questions
      },{sourceType:active.source||'basic',title:'Local coverage questions'});
    }
    return setRecord(event.quizId);
  }

  async function handleLearningEvent(event){
    if(!event||!TRACKED_SOURCES.has(event.source)||!event.quizId)return;
    let attempt=attemptById(event.quizId);
    if(!attempt){
      const record=await discoverSetForEvent(event);
      if(!record)return;
      attempt=beginAttempt(record.setId,{attemptId:event.quizId});
    }
    if(!attempt)return;
    if(event.kind==='presented')recordPresented(attempt.attemptId,event.questionId,Object.keys(attempt.answers||{}).length);
    if(event.kind==='answered')recordAnswer(attempt.attemptId,{
      questionId:event.questionId,
      questionIndex:Object.keys(attempt.answers||{}).length,
      selectedOptionId:event.selectedOptionId,
      correctOptionId:event.correctOptionId,
      correct:event.correct,
      answeredAt:event.at
    });
  }

  async function compactLegacyGeneratedSets(){
    const api=core();
    if(!api||!large())return{migrated:0,removedLegacy:false};
    const legacy=api.loadJson(api.STORAGE.sets,[]);
    let migrated=0;
    for(const set of legacy){
      const setId=String(set?.quizId||set?.setId||'');
      if(!setId)continue;
      if(!(await large().has(setKey(setId)))){
        const record=await storeSet(set,{sourceType:set.sourceType||'ai'});
        if(!record)throw new Error(`Could not migrate saved set ${setId}.`);
        migrated++;
      }
    }
    const allSafe=await Promise.all(legacy.filter(set=>set?.quizId||set?.setId).map(set=>large().has(setKey(set.quizId||set.setId))));
    if(allSafe.every(Boolean))localStorage.removeItem(api.STORAGE.sets);
    return{migrated,removedLegacy:allSafe.every(Boolean)};
  }

  async function migrateLegacy(){
    if(migrationPromise)return migrationPromise;
    migrationPromise=(async()=>{
      if(!large())throw new Error('IndexedDB storage is unavailable.');
      await large().migrateLocalPrefix(SET_PREFIX);
      const api=core();
      if(!api)return;

      await compactLegacyGeneratedSets();

      if(localStorage.getItem(MIGRATION_KEY)!=='1'){
        const grouped=new Map();
        for(const event of api.events()){
          if(event.kind!=='answered'||!TRACKED_SOURCES.has(event.source)||!event.quizId)continue;
          if(!grouped.has(event.quizId))grouped.set(event.quizId,[]);
          grouped.get(event.quizId).push(event);
        }
        const all=attempts();
        for(const [quizId,rows] of grouped){
          if(all.some(item=>item.attemptId===quizId))continue;
          const record=setRecord(quizId);
          const unique=[...new Map(rows.map(row=>[row.questionId,row])).values()];
          const expected=record?.questionCount||10;
          const complete=unique.length>=expected;
          all.push({
            schemaVersion:SCHEMA,
            attemptId:quizId,
            setId:record?.setId||`legacy:${quizId}`,
            sourceType:rows[0]?.source||'basic',
            title:record?.title||'Historical question set',
            questionCount:expected,
            status:complete?'completed':'in_progress',
            currentIndex:Math.max(0,unique.length-1),
            answers:Object.fromEntries(unique.map((row,index)=>[String(row.questionId),{questionId:String(row.questionId),questionIndex:index,selectedOptionId:row.selectedOptionId||'',correctOptionId:row.correctOptionId||'',correct:Boolean(row.correct),answeredAt:row.at}])),
            presentedQuestionIds:unique.map(row=>String(row.questionId)),
            correctCount:unique.filter(row=>row.correct).length,
            percent:complete?Math.round(unique.filter(row=>row.correct).length/Math.max(1,expected)*100):null,
            startedAt:unique[0]?.at||now(),
            updatedAt:unique.at(-1)?.at||now(),
            completedAt:complete?(unique.at(-1)?.at||now()):null,
            deviceId:'legacy'
          });
        }
        saveAttempts(all);
        localStorage.setItem(MIGRATION_KEY,'1');
      }
      notify();
    })().catch(error=>{migrationPromise=null;throw error;});
    return migrationPromise;
  }

  function latestAttemptFor(setId,status){
    return attempts().filter(item=>item.setId===setId&&(!status||item.status===status))
      .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||null;
  }
  function formatDate(value){
    if(!value)return'—';
    try{return new Date(value).toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(value);}
  }
  function matches(record){
    const text=`${record.title} ${record.topic} ${record.sourceLabel}`.toLowerCase();
    return!search||text.includes(search.toLowerCase());
  }

  function recordsForFilter(){
    const records=bankIndex().filter(matches);
    if(filter==='completed')return records.filter(record=>latestAttemptFor(record.setId,'completed'));
    if(filter==='all')return records;
    return records.filter(record=>latestAttemptFor(record.setId,'in_progress')||!latestAttemptFor(record.setId,'completed'));
  }

  function cardHtml(record){
    const inProgress=latestAttemptFor(record.setId,'in_progress');
    const completed=latestAttemptFor(record.setId,'completed');
    const answered=inProgress?Object.keys(inProgress.answers||{}).length:0;
    const action=inProgress?'Continue':completed?'Review':'Start';
    const status=inProgress?`${answered}/${record.questionCount} answered`:completed?`${completed.percent}% · ${completed.correctCount}/${completed.questionCount}`:'Ready to start';
    return`<article class="bank-card" data-bank-card="${escapeHtml(record.setId)}"><div class="bank-card-head"><div><span class="bank-source">${escapeHtml(record.sourceLabel)}</span><h3>${escapeHtml(record.title)}</h3></div><span class="bank-offline">Offline ✓</span></div><p>${escapeHtml(record.topic)} · ${record.questionCount} questions</p><div class="bank-meta"><span>${escapeHtml(status)}</span><span>${escapeHtml(formatDate(inProgress?.updatedAt||completed?.completedAt||record.createdAt))}</span></div><small>${escapeHtml(record.verificationLabel)}</small><div class="card-actions"><button class="btn primary" data-bank-open="${escapeHtml(record.setId)}" data-bank-action="${inProgress?'continue':completed?'review':'start'}">${action}</button>${completed?`<button class="btn" data-bank-open="${escapeHtml(record.setId)}" data-bank-action="attempt">Attempt again</button>`:''}<button class="btn ghost" data-bank-remove="${escapeHtml(record.setId)}">Remove</button></div></article>`;
  }

  function drawBankList(){
    if(!root)return;
    const list=root.querySelector('#bank-list');
    if(!list)return;
    const records=recordsForFilter();
    list.innerHTML=records.length?records.map(cardHtml).join(''):'<section class="empty"><h2>No matching question sets</h2><p>Validated sets will appear here automatically.</p></section>';
    list.querySelectorAll('[data-bank-open]').forEach(button=>button.onclick=()=>void openRecord(button.dataset.bankOpen,button.dataset.bankAction));
    list.querySelectorAll('[data-bank-remove]').forEach(button=>button.onclick=async()=>{
      if(confirm('Remove this saved set and its attempts from this device?')){await removeSet(button.dataset.bankRemove);drawBank();}
    });
  }

  function drawBank(){
    if(!root)return;
    const records=bankIndex();
    const allAttempts=attempts();
    const ready=records.filter(record=>!allAttempts.some(item=>item.setId===record.setId)).length;
    const inProgress=records.filter(record=>allAttempts.some(item=>item.setId===record.setId&&item.status==='in_progress')).length;
    const completed=records.filter(record=>allAttempts.some(item=>item.setId===record.setId&&item.status==='completed')).length;
    root.innerHTML=`<section class="bank-hero"><div><div class="eyebrow">Synced offline library</div><h2>Question Bank</h2><p>The lightweight index remains in local storage. Full question content is held in larger IndexedDB storage and opened only when selected.</p></div><div class="bank-totals"><strong>${records.length}</strong><span>saved sets</span><strong>${completed}</strong><span>completed</span></div></section><section class="panel bank-toolbar"><div class="tabs bank-filter-tabs"><button class="tab ${filter==='not-completed'?'active':''}" data-bank-filter="not-completed">Not completed <sup>${ready+inProgress}</sup></button><button class="tab ${filter==='completed'?'active':''}" data-bank-filter="completed">Completed <sup>${completed}</sup></button><button class="tab ${filter==='all'?'active':''}" data-bank-filter="all">All <sup>${records.length}</sup></button></div><div class="field"><label>Search saved sets</label><input class="input" id="bank-search" value="${escapeHtml(search)}" placeholder="Topic or source"></div></section><section class="bank-grid" id="bank-list"></section>`;
    root.dataset.activeQuestionTab='bank';
    root.querySelectorAll('[data-bank-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.bankFilter;drawBank();});
    root.querySelector('#bank-search').oninput=event=>{search=event.target.value;drawBankList();};
    drawBankList();
  }

  async function openRecord(setId,action){
    core()?.toast('Opening saved set…');
    const set=await loadSet(setId);
    if(!set){core()?.toast('This set is listed but its full content is not on this device. Pull sync or restore a backup.');return;}
    markSeen(setId);
    if(action==='review'){
      const attempt=latestAttemptFor(setId,'completed');
      if(attempt)renderReview(set,attempt,0);
      return;
    }
    let attempt;
    if(action==='continue')attempt=latestAttemptFor(setId,'in_progress');
    if(!attempt)attempt=beginAttempt(setId);
    if(!attempt)return;
    renderPlayer(set,attempt,Math.min(attempt.currentIndex||0,set.questions.length-1));
  }

  function renderPlayer(set,attempt,index){
    if(!root)return;
    player={set,attemptId:attempt.attemptId,index};
    const question=set.questions[index];
    const qid=String(question.id||index+1);
    let current=attemptById(attempt.attemptId)||attempt;
    const answer=current.answers?.[qid];
    if(!current.presentedQuestionIds?.includes(qid)){
      current=recordPresented(current.attemptId,qid,index)||current;
      core().logPresented({id:`present:${current.attemptId}:${qid}`,source:current.sourceType,quizId:current.attemptId,questionId:qid,conditionId:question.targetConditionId,conditionName:question.targetCondition,topicId:question.topicId,topicName:question.topicName,questionType:question.questionType,questionTypeLabel:question.questionTypeLabel});
    }
    root.innerHTML=`<article class="quiz-card bank-player" data-shared-quiz-status><div class="bank-player-top"><button class="btn ghost" id="bank-back">← Question Bank</button><span data-shared-status-label>Question ${index+1} of ${set.questions.length}</span></div><div class="progress-track"><div class="progress-fill" data-shared-status-fill data-default-value="${Math.round((index+1)/set.questions.length*100)}" style="--value:${Math.round((index+1)/set.questions.length*100)}%"></div></div><div class="topic-meta"><span>${escapeHtml(set.topic||setRecord(set.setId||set.quizId)?.title||'Saved set')}</span><span data-shared-status-detail>${escapeHtml(question.questionTypeLabel||'UKMLA question')}</span></div><div class="quiz-stem">${escapeHtml(question.stem)}</div><p>${escapeHtml(question.leadIn||'Select the single best answer.')}</p><div class="options">${question.options.map(option=>`<button class="option ${answer?(option.id===question.correctOptionId?'correct':option.id===answer.selectedOptionId?'wrong':''):''}" data-bank-option="${escapeHtml(option.id)}" ${answer?'disabled':''}><span class="letter">${escapeHtml(option.id)}</span><span>${escapeHtml(option.text)}</span></button>`).join('')}</div>${answer?`<div class="feedback"><strong>${answer.correct?'Correct.':'Incorrect.'}</strong> ${escapeHtml(question.rationale||'')}</div><div class="card-actions"><button class="btn" id="bank-prev" ${index===0?'disabled':''}>Previous</button><button class="btn primary" id="bank-next">${index===set.questions.length-1?'Results':'Next'}</button></div>`:''}</article>`;
    root.dataset.activeQuestionTab='bank';
    window.UKMLA_V2_AI?.refreshSharedStatus?.();
    root.querySelector('#bank-back').onclick=drawBank;
    root.querySelectorAll('[data-bank-option]').forEach(button=>button.onclick=()=>answerBankQuestion(button.dataset.bankOption));
    root.querySelector('#bank-prev')?.addEventListener('click',()=>renderPlayer(set,attemptById(current.attemptId),index-1));
    root.querySelector('#bank-next')?.addEventListener('click',()=>{
      if(index===set.questions.length-1)renderBankResult(set,attemptById(current.attemptId));
      else renderPlayer(set,attemptById(current.attemptId),index+1);
    });
  }

  function answerBankQuestion(optionId){
    const state=player;
    if(!state)return;
    const question=state.set.questions[state.index];
    const qid=String(question.id||state.index+1);
    const attempt=attemptById(state.attemptId);
    if(attempt?.answers?.[qid])return;
    const option=question.options.find(item=>item.id===optionId);
    if(!option)return;
    const correct=attempt.sourceType==='knowledge'
      ?option.id===question.correctOptionId
      :core().scoreAnswer({...question,param:core().TYPE_PARAM[question.questionType]},option);
    const updated=recordAnswer(state.attemptId,{questionId:qid,questionIndex:state.index,selectedOptionId:optionId,correctOptionId:question.correctOptionId,correct});
    core().logAnswered({id:`answer:${state.attemptId}:${qid}`,presentationId:`present:${state.attemptId}:${qid}`,source:attempt.sourceType,quizId:state.attemptId,questionId:qid,conditionId:question.targetConditionId,conditionName:question.targetCondition,topicId:question.topicId,topicName:question.topicName,questionType:question.questionType,questionTypeLabel:question.questionTypeLabel,selectedOptionId:optionId,correctOptionId:question.correctOptionId,correct});
    renderPlayer(state.set,updated,state.index);
  }

  function renderBankResult(set,attempt){
    const final=attempt.status==='completed'?attempt:completeAttempt(attempt.attemptId);
    root.innerHTML=`<article class="quiz-card" style="max-width:760px;margin:auto;text-align:center"><div class="eyebrow">Saved attempt complete</div><div class="boast-number" style="margin:28px 0">${final.correctCount}/${final.questionCount}</div><h2>${final.percent}%</h2><p>This attempt is stored separately from the immutable question set and will be included in sync, backup and the performance run chart.</p><div class="card-actions" style="justify-content:center"><button class="btn primary" id="bank-return">Question Bank</button><button class="btn" id="bank-analytics">Open analytics</button></div></article>`;
    root.querySelector('#bank-return').onclick=drawBank;
    root.querySelector('#bank-analytics').onclick=()=>core().go('analytics');
  }

  function renderReview(set,attempt,index){
    const question=set.questions[index];
    const qid=String(question.id||index+1);
    const answer=attempt.answers?.[qid];
    root.innerHTML=`<article class="quiz-card bank-player"><div class="bank-player-top"><button class="btn ghost" id="review-back">← Question Bank</button><span>Review ${index+1} of ${set.questions.length}</span></div><div class="quiz-stem">${escapeHtml(question.stem)}</div><p>${escapeHtml(question.leadIn||'')}</p><div class="options">${question.options.map(option=>`<div class="option ${option.id===question.correctOptionId?'correct':answer&&option.id===answer.selectedOptionId?'wrong':''}"><span class="letter">${escapeHtml(option.id)}</span><span>${escapeHtml(option.text)}</span></div>`).join('')}</div><div class="feedback"><strong>${answer?.correct?'Correct.':'Incorrect.'}</strong> ${escapeHtml(question.rationale||'')}</div><div class="card-actions"><button class="btn" id="review-prev" ${index===0?'disabled':''}>Previous</button><button class="btn primary" id="review-next">${index===set.questions.length-1?'Finish review':'Next'}</button></div></article>`;
    root.dataset.activeQuestionTab='bank';
    root.querySelector('#review-back').onclick=drawBank;
    root.querySelector('#review-prev')?.addEventListener('click',()=>renderReview(set,attempt,index-1));
    root.querySelector('#review-next').onclick=()=>index===set.questions.length-1?drawBank():renderReview(set,attempt,index+1);
  }

  async function mount(container){
    root=container;
    root.innerHTML='<section class="empty"><h2>Preparing offline Question Bank…</h2><p>Large saved sets are being verified in IndexedDB.</p></section>';
    try{await migrateLegacy();await reconcileIndex();drawBank();}
    catch(error){root.innerHTML=`<section class="empty"><h2>Question Bank storage could not initialise</h2><p>${escapeHtml(error.message)}</p></section>`;}
  }

  function initialise(){
    if(initialised||!core())return false;
    initialised=true;
    document.addEventListener('ukmlaLearningEvent',event=>void handleLearningEvent(event.detail));
    document.addEventListener('ukmlaAiCompletedSetStored',event=>markUnseen(event.detail?.setId));
    void migrateLegacy().catch(error=>core()?.toast(`Storage migration paused: ${error.message}`));
    return true;
  }
  function waitForCore(){if(!initialise())setTimeout(waitForCore,80);}
  waitForCore();

  window.UKMLA_QUESTION_BANK={
    INDEX_KEY,ATTEMPTS_KEY,SET_PREFIX,SCHEMA,
    mount,storeSet,loadSet,removeSet,bankIndex,reconcileIndex,attempts,beginAttempt,attemptById,
    unseenSetIds,unseenCount,markUnseen,markSeen,
    recordPresented,recordAnswer,completeAttempt,completedAttempts,rollingStats,sourceLabel,
    migrateLegacy,compactLegacyGeneratedSets
  };
})();
