(function(){
  'use strict';

  if(window.__UKMLA_LEARNING_CORE__) return;
  window.__UKMLA_LEARNING_CORE__=true;

  const KEYS={
    events:'ukmlaLearningEventsV1',
    registry:'ukmlaLearningRegistryV1',
    coverage:'ukmlaCoverageStateV1',
    packs:'ukmlaKnowledgePackStatsV1',
    progress:'ukmlaQuizProgressV1',
    sets:'ukmlaAiGeneratedQuizSetsV1',
    device:'ukmlaRemoteDeviceIdV1'
  };
  const TYPE_LABELS={
    sparse_most_likely_diagnosis:'Sparse presentation: most likely diagnosis',
    close_mimic_discrimination:'Close-mimic discrimination',
    first_line_investigation:'First-line investigation',
    dangerous_diagnosis_priority_exclusion:'Dangerous diagnosis: priority exclusion',
    next_step_after_initial_result:'Next step after an initial result',
    immediate_emergency_management:'Immediate emergency management',
    stable_first_line_treatment:'Standard first-line treatment',
    contraindication_caveat_switch:'Contraindication or caveat switch',
    failure_or_deterioration:'Failure or deterioration',
    escalation_referral_disposition:'Escalation, referral or disposition'
  };
  const BASIC_TYPE_MAP={
    'Mimics':'close_mimic_discrimination',
    'Ix':'first_line_investigation',
    'Red flags':'dangerous_diagnosis_priority_exclusion',
    'Tx':'stable_first_line_treatment',
    'Escalate':'escalation_referral_disposition'
  };

  let renderQueued=false;
  let currentBasic=null;

  function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}
  function load(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}
    catch(_){return fallback;}
  }
  function save(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function slug(value){
    const out=clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return out.slice(0,42)||'item';
  }
  function hash(value){
    let result=2166136261;
    const text=String(value||'');
    for(let i=0;i<text.length;i++){result^=text.charCodeAt(i);result=Math.imul(result,16777619);}
    return (result>>>0).toString(36).padStart(7,'0').slice(-7);
  }
  function deviceId(){
    let value=localStorage.getItem(KEYS.device);
    if(!value){value=`device-${Math.random().toString(36).slice(2,9)}-${Date.now().toString(36)}`;localStorage.setItem(KEYS.device,value);}
    return value;
  }
  function topicTitle(section){
    const h2=section?.querySelector('h2');
    if(!h2) return 'Uncategorised';
    const copy=h2.cloneNode(true);
    copy.querySelectorAll('.inferred,.learning-topic-count').forEach(node=>node.remove());
    return clean(copy.textContent);
  }
  function conditionTitle(card){
    const summary=card?.querySelector('summary');
    if(!summary) return '';
    const copy=summary.cloneNode(true);
    copy.querySelectorAll('.learning-condition-count').forEach(node=>node.remove());
    return clean(copy.textContent);
  }
  function stableTopicId(title){return `topic-${slug(title)}-${hash(title)}`;}
  function stableConditionId(topicId,name){return `${topicId}-${slug(name)}-${hash(`${topicId}|${name}`)}`;}

  function ensureIds(){
    const registry=load(KEYS.registry,{version:1,topics:{},conditions:{}});
    document.querySelectorAll('.section').forEach(section=>{
      const title=topicTitle(section);
      if(!title) return;
      const topicId=section.dataset.topicId||stableTopicId(title);
      section.dataset.topicId=topicId;
      registry.topics[topicId]={id:topicId,name:title,updatedAt:new Date().toISOString()};
      section.querySelectorAll('.card').forEach(card=>{
        const name=conditionTitle(card);
        if(!name) return;
        const conditionId=card.dataset.conditionId||stableConditionId(topicId,name);
        card.dataset.conditionId=conditionId;
        card.dataset.topicId=topicId;
        registry.conditions[conditionId]={id:conditionId,name,topicId,topicName:title,updatedAt:new Date().toISOString()};
      });
    });
    save(KEYS.registry,registry);
    return registry;
  }

  function catalogue(){
    ensureIds();
    return [...document.querySelectorAll('.section .card')].map(card=>{
      const section=card.closest('.section');
      const fields={};
      card.querySelectorAll('.items li').forEach(li=>{
        const label=li.querySelector('.label');
        if(!label) return;
        const key=clean(label.textContent).replace(/:$/,'');
        if(['Ix','Tx','Escalate','Mimics','Red flags'].includes(key)) fields[key]=clean(li.textContent.replace(label.textContent,''));
      });
      return {
        conditionId:card.dataset.conditionId,
        id:card.dataset.conditionId,
        name:conditionTitle(card),
        topicId:section?.dataset.topicId||'',
        topic:topicTitle(section),
        topicName:topicTitle(section),
        fields,
        card,
        section
      };
    }).filter(item=>item.conditionId&&item.name&&Object.keys(item.fields).length);
  }

  function events(){return load(KEYS.events,[]);}
  function appendEvent(event){
    const list=events();
    if(list.some(item=>item.id===event.id)) return false;
    list.push(event);
    save(KEYS.events,list);
    updateCoverage(event);
    scheduleRefresh();
    document.dispatchEvent(new CustomEvent('ukmlaLearningEvent',{detail:event}));
    return true;
  }

  function coverageState(){
    const state=load(KEYS.coverage,{version:1,cycle:1,completedCycles:0,covered:[],startedAt:new Date().toISOString()});
    if(!Array.isArray(state.covered)) state.covered=[];
    if(!Number.isFinite(Number(state.cycle))) state.cycle=1;
    if(!Number.isFinite(Number(state.completedCycles))) state.completedCycles=0;
    return state;
  }
  function updateCoverage(event){
    if(event.kind!=='presented'||event.source==='knowledge') return;
    const state=coverageState();
    if(!state.covered.includes(event.conditionId)) state.covered.push(event.conditionId);
    const known=new Set(catalogue().map(item=>item.conditionId));
    const complete=known.size>0&&[...known].every(id=>state.covered.includes(id));
    if(complete){
      state.completedCycles+=1;
      state.cycle+=1;
      state.covered=[];
      state.startedAt=new Date().toISOString();
    }
    state.updatedAt=new Date().toISOString();
    save(KEYS.coverage,state);
  }

  function stats(){
    const list=events();
    const conditions={};
    const topics={};
    const types={};
    const topicTypes={};
    const presentations=list.filter(event=>event.kind==='presented');
    const answers=list.filter(event=>event.kind==='answered');
    function conditionRow(event){
      return conditions[event.conditionId]||(conditions[event.conditionId]={conditionId:event.conditionId,conditionName:event.conditionName,topicId:event.topicId,topicName:event.topicName,presented:0,answered:0,correct:0,ai:0,basic:0,knowledge:0,firstPresentedAt:null,lastPresentedAt:null,lastAnsweredAt:null});
    }
    function topicRow(event){
      return topics[event.topicId]||(topics[event.topicId]={topicId:event.topicId,topicName:event.topicName,presented:0,answered:0,correct:0,uniqueConditions:new Set(),lastPresentedAt:null});
    }
    function typeRow(event){
      return types[event.questionType]||(types[event.questionType]={questionType:event.questionType,label:event.questionTypeLabel||TYPE_LABELS[event.questionType]||event.questionType,presented:0,answered:0,correct:0,lastAnsweredAt:null});
    }
    presentations.forEach(event=>{
      const c=conditionRow(event);c.presented+=1;c[event.source]=(c[event.source]||0)+1;c.firstPresentedAt=c.firstPresentedAt||event.at;c.lastPresentedAt=event.at;
      const t=topicRow(event);t.presented+=1;t.uniqueConditions.add(event.conditionId);t.lastPresentedAt=event.at;
      typeRow(event).presented+=1;
    });
    answers.forEach(event=>{
      const c=conditionRow(event);c.answered+=1;c.correct+=event.correct?1:0;c.lastAnsweredAt=event.at;
      const t=topicRow(event);t.answered+=1;t.correct+=event.correct?1:0;
      const q=typeRow(event);q.answered+=1;q.correct+=event.correct?1:0;q.lastAnsweredAt=event.at;
      const key=`${event.topicId}|${event.questionType}`;
      const tt=topicTypes[key]||(topicTypes[key]={topicId:event.topicId,topicName:event.topicName,questionType:event.questionType,label:event.questionTypeLabel||TYPE_LABELS[event.questionType]||event.questionType,answered:0,correct:0});
      tt.answered+=1;tt.correct+=event.correct?1:0;
    });
    Object.values(topics).forEach(row=>{row.uniqueConditionCount=row.uniqueConditions.size;delete row.uniqueConditions;row.accuracy=row.answered?Math.round(row.correct/row.answered*100):null;});
    Object.values(conditions).forEach(row=>{row.accuracy=row.answered?Math.round(row.correct/row.answered*100):null;row.health=row.answered?Math.round((row.correct+1)/(row.answered+2)*100):50;});
    Object.values(types).forEach(row=>{row.accuracy=row.answered?Math.round(row.correct/row.answered*100):null;});
    Object.values(topicTypes).forEach(row=>{row.accuracy=row.answered?Math.round(row.correct/row.answered*100):null;});
    return {events:list,presentations,answers,conditions,topics,types,topicTypes,totalCompleted:answers.length,totalPresented:presentations.length};
  }

  function uniqueId(prefix){return `${prefix}-${deviceId()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
  function progressHealth(topicName){return Number(load(KEYS.progress,{})?.[topicName]?.health??50);}

  function logPresented(meta){
    ensureIds();
    const registry=load(KEYS.registry,{topics:{},conditions:{}});
    const condition=registry.conditions?.[meta.conditionId];
    const topic=registry.topics?.[meta.topicId];
    const coverage=coverageState();
    const event={
      id:meta.id||`present:${meta.quizId||'quiz'}:${meta.questionId||meta.questionNumber||uniqueId('q')}`,
      kind:'presented',
      source:meta.source||'ai',
      quizId:meta.quizId||'',
      questionId:String(meta.questionId||meta.questionNumber||''),
      conditionId:meta.conditionId||'',
      conditionName:meta.conditionName||condition?.name||'',
      topicId:meta.topicId||condition?.topicId||'',
      topicName:meta.topicName||condition?.topicName||topic?.name||'',
      questionType:meta.questionType||'',
      questionTypeLabel:meta.questionTypeLabel||TYPE_LABELS[meta.questionType]||meta.questionType||'',
      coverageCycle:meta.source==='knowledge'?null:coverage.cycle,
      packId:meta.packId||null,
      at:meta.at||new Date().toISOString(),
      topicHealthBefore:Number.isFinite(Number(meta.topicHealthBefore))?Number(meta.topicHealthBefore):progressHealth(meta.topicName||condition?.topicName||'')
    };
    if(!event.conditionId||!event.topicId||!event.questionType) return null;
    appendEvent(event);
    return event;
  }

  function logAnswered(meta){
    const event={
      id:meta.id||`answer:${meta.quizId||'quiz'}:${meta.questionId||meta.questionNumber||uniqueId('q')}`,
      kind:'answered',
      presentationId:meta.presentationId||'',
      source:meta.source||'ai',
      quizId:meta.quizId||'',
      questionId:String(meta.questionId||meta.questionNumber||''),
      conditionId:meta.conditionId||'',
      conditionName:meta.conditionName||'',
      topicId:meta.topicId||'',
      topicName:meta.topicName||'',
      questionType:meta.questionType||'',
      questionTypeLabel:meta.questionTypeLabel||TYPE_LABELS[meta.questionType]||meta.questionType||'',
      packId:meta.packId||null,
      selectedOptionId:meta.selectedOptionId||'',
      correctOptionId:meta.correctOptionId||'',
      correct:Boolean(meta.correct),
      at:meta.at||new Date().toISOString(),
      topicHealthAfter:Number.isFinite(Number(meta.topicHealthAfter))?Number(meta.topicHealthAfter):progressHealth(meta.topicName||'')
    };
    if(!event.conditionId||!event.topicId||!event.questionType) return null;
    appendEvent(event);
    return event;
  }

  function conditionByName(topicName,name){
    const targetName=clean(name).toLowerCase();
    const targetTopic=clean(topicName).toLowerCase();
    return catalogue().find(item=>item.name.toLowerCase()===targetName&&(!targetTopic||item.topic.toLowerCase()===targetTopic))||catalogue().find(item=>item.name.toLowerCase()===targetName)||null;
  }

  function latestSet(){return load(KEYS.sets,[])[0]||null;}
  function observeAi(area){
    const progress=area.querySelector('.aiq-progress');
    if(!progress) return;
    const match=clean(progress.textContent).match(/Question\s+(\d+)\s+of\s+(\d+)/i);
    if(!match) return;
    const index=Number(match[1])-1;
    const set=latestSet();
    const q=set?.questions?.[index];
    if(!q) return;
    const quizId=set.quizId||`ai-${set.generatedAt||'set'}`;
    const qid=q.id||String(index+1);
    const key=`${quizId}:${qid}`;
    if(area.dataset.learningPresentationKey===key) return;
    area.dataset.learningPresentationKey=key;
    const condition=conditionByName(q.topic,q.targetCondition);
    const conditionId=q.targetConditionId||condition?.conditionId||`external-${hash(`${q.topic}|${q.targetCondition}`)}`;
    const topicId=q.topicId||condition?.topicId||`topic-${slug(q.topic)}-${hash(q.topic)}`;
    const source=set.sourceType==='knowledge_dump'?'knowledge':'ai';
    const presentation=logPresented({
      id:`present:${quizId}:${qid}`,
      source,quizId,questionId:qid,
      conditionId,conditionName:q.targetCondition,topicId,topicName:q.topic,
      questionType:q.questionType,questionTypeLabel:q.questionTypeLabel,packId:set.packId||null
    });
    area.dataset.learningPresentationId=presentation?.id||'';
  }

  function handleAiClick(event){
    const button=event.target.closest('#aiq-play .aiq-option');
    if(!button) return;
    const area=document.getElementById('aiq-play');
    const progress=area?.querySelector('.aiq-progress');
    const match=clean(progress?.textContent).match(/Question\s+(\d+)\s+of\s+(\d+)/i);
    if(!match) return;
    const index=Number(match[1])-1;
    const set=latestSet();
    const q=set?.questions?.[index];
    if(!q) return;
    const quizId=set.quizId||`ai-${set.generatedAt||'set'}`;
    const qid=q.id||String(index+1);
    const condition=conditionByName(q.topic,q.targetCondition);
    const conditionId=q.targetConditionId||condition?.conditionId||`external-${hash(`${q.topic}|${q.targetCondition}`)}`;
    const topicId=q.topicId||condition?.topicId||`topic-${slug(q.topic)}-${hash(q.topic)}`;
    const selected=button.dataset.id||clean(button.querySelector('b')?.textContent).replace('.','');
    setTimeout(()=>logAnswered({
      id:`answer:${quizId}:${qid}`,presentationId:`present:${quizId}:${qid}`,
      source:set.sourceType==='knowledge_dump'?'knowledge':'ai',quizId,questionId:qid,
      conditionId,conditionName:q.targetCondition,topicId,topicName:q.topic,
      questionType:q.questionType,questionTypeLabel:q.questionTypeLabel,packId:set.packId||null,
      selectedOptionId:selected,correctOptionId:q.correctOptionId,correct:selected===q.correctOptionId
    }),0);
  }

  function matchBasicCondition(topicName,stem){
    const lower=clean(stem).toLowerCase();
    return catalogue().filter(item=>item.topic===topicName&&lower.includes(item.name.toLowerCase())).sort((a,b)=>b.name.length-a.name.length)[0]||null;
  }
  function observeBasic(body){
    const resultText=clean(body.querySelector('.quiz-stem')?.textContent);
    if(/^Result:/i.test(resultText)){if(currentBasic)currentBasic.active=false;return;}
    const meta=[...body.querySelectorAll('.quiz-meta span')].map(node=>clean(node.textContent));
    const questionMeta=meta.find(text=>/^Question\s+/i.test(text));
    const topic=clean(meta.find(text=>/^Topic:/i.test(text))?.replace(/^Topic:\s*/i,''));
    const param=clean(meta.find(text=>/^Type:/i.test(text))?.replace(/^Type:\s*/i,''));
    const match=questionMeta?.match(/Question\s+(\d+)\s+of\s+(\d+)/i);
    const stem=clean(body.querySelector('.quiz-stem')?.textContent);
    if(!match||!topic||!param||!stem) return;
    const index=Number(match[1]);
    if(index===1&&!currentBasic?.active) currentBasic={id:`basic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,active:true};
    if(!currentBasic) currentBasic={id:`basic-${Date.now().toString(36)}`,active:true};
    const condition=matchBasicCondition(topic,stem);
    if(!condition) return;
    const questionType=BASIC_TYPE_MAP[param]||'sparse_most_likely_diagnosis';
    const key=`${currentBasic.id}:${index}`;
    if(body.dataset.learningPresentationKey===key) return;
    body.dataset.learningPresentationKey=key;
    logPresented({id:`present:${currentBasic.id}:${index}`,source:'basic',quizId:currentBasic.id,questionId:index,conditionId:condition.conditionId,conditionName:condition.name,topicId:condition.topicId,topicName:condition.topic,questionType,questionTypeLabel:TYPE_LABELS[questionType]});
    currentBasic.current={index,condition,questionType,param};
  }
  function handleBasicClick(event){
    const button=event.target.closest('#quiz-body .quiz-option');
    if(!button||!currentBasic?.current) return;
    const chosenIndex=Number(button.dataset.index);
    const snapshot=currentBasic.current;
    setTimeout(()=>{
      const feedback=document.querySelector('#quiz-body #quiz-feedback');
      if(!feedback||feedback.hidden) return;
      const correct=/^Correct\./i.test(clean(feedback.querySelector('strong')?.textContent));
      logAnswered({id:`answer:${currentBasic.id}:${snapshot.index}`,presentationId:`present:${currentBasic.id}:${snapshot.index}`,source:'basic',quizId:currentBasic.id,questionId:snapshot.index,conditionId:snapshot.condition.conditionId,conditionName:snapshot.condition.name,topicId:snapshot.condition.topicId,topicName:snapshot.condition.topic,questionType:snapshot.questionType,questionTypeLabel:TYPE_LABELS[snapshot.questionType],selectedOptionId:String(chosenIndex),correctOptionId:'',correct});
    },25);
  }

  function scheduleRefresh(){
    if(renderQueued) return;
    renderQueued=true;
    requestAnimationFrame(()=>{renderQueued=false;refreshBadges();renderAnalytics();});
  }
  function formatSup(value){return String(value);}
  function refreshBadges(){
    ensureIds();
    const data=stats();
    document.querySelectorAll('.card[data-condition-id]').forEach(card=>{
      const summary=card.querySelector('summary');
      if(!summary) return;
      let badge=summary.querySelector('.learning-condition-count');
      if(!badge){badge=document.createElement('sup');badge.className='learning-condition-count';summary.appendChild(document.createTextNode(' '));summary.appendChild(badge);}
      const count=data.conditions[card.dataset.conditionId]?.presented||0;
      badge.textContent=formatSup(count);badge.title=count?`Tested ${count} time${count===1?'':'s'}`:'Not yet tested';badge.classList.toggle('untested',count===0);
    });
    document.querySelectorAll('.nav a[href^="#"]').forEach(link=>{
      const section=document.querySelector(link.getAttribute('href'));
      if(!section?.dataset.topicId) return;
      let badge=link.querySelector('.learning-topic-count');
      if(!badge){badge=document.createElement('sup');badge.className='learning-topic-count';link.appendChild(badge);}
      const count=data.topics[section.dataset.topicId]?.presented||0;
      badge.textContent=formatSup(count);badge.title=`${count} target question${count===1?'':'s'} from this topic`;
    });
    let total=document.getElementById('learning-total-completed-stat');
    if(!total){
      total=document.createElement('span');total.id='learning-total-completed-stat';total.className='stat';
      document.querySelector('.stats')?.appendChild(total);
    }
    if(total) total.textContent=`${data.totalCompleted} questions completed`;
  }

  function pct(row){return row.answered?Math.round(row.correct/row.answered*100):0;}
  function summaryText(){
    const data=stats();
    const cat=catalogue();
    const coverage=coverageState();
    const tested=new Set(data.presentations.filter(e=>e.source!=='knowledge').map(e=>e.conditionId));
    const unseen=cat.filter(item=>!tested.has(item.conditionId));
    const overall=data.totalCompleted?Math.round(data.answers.filter(e=>e.correct).length/data.totalCompleted*1000)/10:0;
    const weakTopics=Object.values(data.topics).filter(r=>r.answered).sort((a,b)=>pct(a)-pct(b)||b.answered-a.answered).slice(0,8);
    const weakConditions=Object.values(data.conditions).filter(r=>r.answered).sort((a,b)=>pct(a)-pct(b)||b.answered-a.answered).slice(0,10);
    const typeRows=Object.keys(TYPE_LABELS).map(type=>data.types[type]||{questionType:type,label:TYPE_LABELS[type],answered:0,correct:0}).sort((a,b)=>pct(a)-pct(b)||b.answered-a.answered);
    const weakCombos=Object.values(data.topicTypes).filter(r=>r.answered>=2).sort((a,b)=>pct(a)-pct(b)||b.answered-a.answered).slice(0,10);
    const mostTested=Object.values(data.conditions).sort((a,b)=>b.presented-a.presented).slice(0,10);
    const underTopics=Object.values(data.topics).sort((a,b)=>a.presented-b.presented).slice(0,8);
    const recent=data.answers.slice(-20);const previous=data.answers.slice(-40,-20);
    const recentPct=recent.length?Math.round(recent.filter(e=>e.correct).length/recent.length*100):0;
    const previousPct=previous.length?Math.round(previous.filter(e=>e.correct).length/previous.length*100):null;
    const trend=previousPct===null?'Insufficient earlier data':recentPct>previousPct?'improving':recentPct<previousPct?'declining':'stable';
    const lines=[
      'UKMLA QUIZ ANALYTICS',
      `Generated: ${new Date().toLocaleString()}`,'',
      'BOASTING RIGHTS',
      `Total questions completed: ${data.totalCompleted}`,
      `Total target questions presented: ${data.totalPresented}`,
      `Overall accuracy: ${overall}%`,'',
      'COVERAGE',
      `Encyclopedia conditions tested: ${tested.size}/${cat.length}`,
      `Conditions never tested: ${unseen.length}`,
      `Current coverage cycle: ${coverage.cycle}`,
      `Completed full coverage cycles: ${coverage.completedCycles}`,
      `Current cycle covered: ${coverage.covered.length}/${cat.length}`,
      `Estimated ten-question quizzes to complete current cycle: ${Math.ceil(Math.max(0,cat.length-coverage.covered.length)/10)}`,'',
      'LOWEST-PERFORMING TOPICS',
      ...weakTopics.map((r,i)=>`${i+1}. ${r.topicName} — ${pct(r)}% — ${r.correct}/${r.answered} correct — ${r.presented} presented`),'',
      'LOWEST-PERFORMING CONDITIONS',
      ...weakConditions.map((r,i)=>`${i+1}. ${r.conditionName} (${r.topicName}) — ${pct(r)}% — ${r.correct}/${r.answered} correct — tested ${r.presented}`),'',
      'QUESTION-TYPE PERFORMANCE',
      ...typeRows.map((r,i)=>`${i+1}. ${r.label} — ${r.answered?pct(r)+'%':'not answered'} — ${r.correct||0}/${r.answered||0} correct`),'',
      'WEAKEST TOPIC × QUESTION-TYPE COMBINATIONS',
      ...(weakCombos.length?weakCombos.map((r,i)=>`${i+1}. ${r.topicName} × ${r.label} — ${pct(r)}% — ${r.correct}/${r.answered} correct`):['No combination has at least two answered questions yet.']),'',
      'MOST FREQUENTLY TESTED CONDITIONS',
      ...mostTested.map((r,i)=>`${i+1}. ${r.conditionName} (${r.topicName}) — ${r.presented}`),'',
      'UNDERTESTED TOPICS',
      ...underTopics.map((r,i)=>`${i+1}. ${r.topicName} — ${r.presented} target questions`),'',
      'RECENT PERFORMANCE',
      `Last ${recent.length} questions: ${recent.length?recentPct+'%':'none'}`,
      `Previous ${previous.length} questions: ${previous.length?previousPct+'%':'none'}`,
      `Trend: ${trend}`,'',
      'SCHEDULER PRIORITY',
      '1. Balance topic coverage.',
      '2. Select unseen conditions within those topics.',
      '3. Use the weakest question types when extra questions are available.',
      '4. Revisit low-health conditions after unseen coverage.',
      '5. Penalise recent repetition.'
    ];
    return lines.join('\n');
  }

  function csvText(){
    const columns=['event_id','event_type','source','quiz_id','question_id','topic_id','topic_name','condition_id','condition_name','question_type','question_type_label','presented_at_or_answered_at','correct','coverage_cycle','pack_id','topic_health_before','topic_health_after'];
    const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
    return [columns.join(','),...events().map(event=>[
      event.id,event.kind,event.source,event.quizId,event.questionId,event.topicId,event.topicName,event.conditionId,event.conditionName,event.questionType,event.questionTypeLabel,event.at,event.kind==='answered'?event.correct:'',event.coverageCycle??'',event.packId??'',event.topicHealthBefore??'',event.topicHealthAfter??''
    ].map(quote).join(','))].join('\n');
  }
  async function copyText(text,button){
    try{await navigator.clipboard.writeText(text);}
    catch(_){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}
    if(button){const old=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=old,1400);}
  }

  function injectStyles(){
    if(document.getElementById('learning-analytics-style')) return;
    const style=document.createElement('style');style.id='learning-analytics-style';style.textContent=`
      .learning-condition-count,.learning-topic-count{display:inline-flex;align-items:center;justify-content:center;min-width:1.25rem;height:1.25rem;margin-left:.32rem;padding:0 .3rem;border:1px solid rgba(20,128,190,.35);border-radius:999px;background:rgba(37,160,230,.12);color:#086fa8;font-family:Aptos,Calibri,sans-serif;font-size:.67rem;font-weight:900;line-height:1;vertical-align:super;box-shadow:0 0 8px rgba(0,153,255,.18)}
      .learning-condition-count.untested{background:rgba(112,105,95,.08);border-color:rgba(112,105,95,.2);color:#8c857c;box-shadow:none}
      .learning-topic-count{grid-column:auto;margin-left:.05rem}
      #learning-analytics{margin:1.4rem max(1.2rem,4vw);padding:1.2rem;background:var(--panel,#fffefa);border:1px solid var(--line,#d8d0c4);border-radius:18px;box-shadow:var(--shadow,0 10px 30px rgba(29,27,24,.08));scroll-margin-top:1rem}
      .learning-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1rem;align-items:center;padding:1rem;border-radius:16px;background:linear-gradient(135deg,#071b34,#073e6d);color:#e9faff;box-shadow:0 0 24px rgba(0,136,255,.24)}
      .learning-total{font-size:clamp(2.2rem,7vw,5rem);font-weight:950;line-height:.9;color:#7de8ff;text-shadow:0 0 12px rgba(0,185,255,.9)}
      .learning-total-label{margin-top:.45rem;text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;color:#afdff1}
      .learning-coverage-ring{min-width:9rem;text-align:right;font-weight:800;color:#d8f6ff}
      .learning-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin:1rem 0}
      .learning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem}
      .learning-card{padding:.85rem;border:1px solid var(--line,#d8d0c4);border-radius:14px;background:#fff}
      .learning-card h3{margin:.05rem 0 .55rem;font-size:1rem}
      .learning-card ol{margin:.2rem 0;padding-left:1.25rem}.learning-card li{margin:.3rem 0}
      .learning-type-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.55rem;padding:.35rem 0;border-bottom:1px solid rgba(216,208,196,.55)}
      .learning-muted{color:var(--muted,#70695f)}
      @media(max-width:650px){.learning-hero{grid-template-columns:1fr}.learning-coverage-ring{text-align:left}.learning-actions button{width:100%}}
    `;document.head.appendChild(style);
  }

  function ensureAnalytics(){
    if(document.getElementById('learning-analytics')) return;
    injectStyles();
    const section=document.createElement('section');section.id='learning-analytics';
    const ai=document.getElementById('ai-generated-quiz');
    if(ai?.parentNode) ai.parentNode.insertBefore(section,ai); else document.body.appendChild(section);
    const sidebar=document.querySelector('.nav');
    if(sidebar&&!sidebar.querySelector('a[href="#learning-analytics"]')){
      const li=document.createElement('li');li.innerHTML='<a href="#learning-analytics"><span class="topic-bulb" style="--bulb-color:hsl(199 90% 42%)"></span><span>Learning analytics</span><small>log</small><span class="topic-score">↗</span></a>';sidebar.prepend(li);
    }
  }

  function renderAnalytics(){
    ensureAnalytics();
    const section=document.getElementById('learning-analytics');if(!section)return;
    const data=stats();const cat=catalogue();const cov=coverageState();
    const tested=new Set(data.presentations.filter(e=>e.source!=='knowledge').map(e=>e.conditionId));
    const accuracy=data.totalCompleted?Math.round(data.answers.filter(e=>e.correct).length/data.totalCompleted*100):0;
    const weakTypes=Object.keys(TYPE_LABELS).map(type=>data.types[type]||{questionType:type,label:TYPE_LABELS[type],answered:0,correct:0}).sort((a,b)=>pct(a)-pct(b)||b.answered-a.answered);
    const weakTopics=Object.values(data.topics).filter(r=>r.answered).sort((a,b)=>pct(a)-pct(b)).slice(0,6);
    const weakConditions=Object.values(data.conditions).filter(r=>r.answered).sort((a,b)=>pct(a)-pct(b)).slice(0,6);
    section.innerHTML=`<h2>Learning analytics</h2><p class="learning-muted">Coverage, performance and question-type analytics from AI and basic HTML quizzes. Counts refer to target questions, not distractor appearances.</p><div class="learning-hero"><div><div class="learning-total">${data.totalCompleted}</div><div class="learning-total-label">questions completed</div></div><div class="learning-coverage-ring">${tested.size}/${cat.length} conditions tested<br>${accuracy}% overall accuracy<br>Coverage cycle ${cov.cycle}</div></div><div class="learning-actions"><button id="learning-copy-summary" type="button">Copy analytics summary</button><button id="learning-copy-raw" type="button">Copy raw CSV</button><button id="learning-download-csv" type="button">Download CSV</button></div><div class="learning-grid"><div class="learning-card"><h3>Question-type performance</h3>${weakTypes.map(row=>`<div class="learning-type-row"><span>${clean(row.label)}</span><strong>${row.answered?pct(row)+'% · '+row.correct+'/'+row.answered:'—'}</strong></div>`).join('')}</div><div class="learning-card"><h3>Lowest-performing topics</h3>${weakTopics.length?`<ol>${weakTopics.map(row=>`<li>${clean(row.topicName)} — <strong>${pct(row)}%</strong> (${row.correct}/${row.answered})</li>`).join('')}</ol>`:'<p class="learning-muted">No answered questions yet.</p>'}</div><div class="learning-card"><h3>Lowest-performing conditions</h3>${weakConditions.length?`<ol>${weakConditions.map(row=>`<li>${clean(row.conditionName)} — <strong>${pct(row)}%</strong> (${row.correct}/${row.answered})</li>`).join('')}</ol>`:'<p class="learning-muted">No answered questions yet.</p>'}</div><div class="learning-card"><h3>Coverage status</h3><p><strong>${tested.size}</strong> tested · <strong>${cat.length-tested.size}</strong> unseen</p><p><strong>${cov.covered.length}/${cat.length}</strong> covered in the current cycle.</p><p><strong>${Math.ceil(Math.max(0,cat.length-cov.covered.length)/10)}</strong> ten-question quizzes estimated to complete it.</p></div></div>`;
    section.querySelector('#learning-copy-summary').addEventListener('click',event=>copyText(summaryText(),event.currentTarget));
    section.querySelector('#learning-copy-raw').addEventListener('click',event=>copyText(csvText(),event.currentTarget));
    section.querySelector('#learning-download-csv').addEventListener('click',()=>{const blob=new Blob([csvText()],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ukmla-learning-events-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  }

  function selectCoverageCandidates(items,count,options={}){
    const data=stats();const cov=coverageState();const covered=new Set(cov.covered);const now=Date.now();
    const grouped=new Map();
    items.forEach(item=>{if(!grouped.has(item.topicId))grouped.set(item.topicId,[]);grouped.get(item.topicId).push(item);});
    const topicScores=[...grouped.entries()].map(([topicId,group])=>{
      const row=data.topics[topicId]||{presented:0};
      const cycleCovered=group.filter(item=>covered.has(item.conditionId)).length;
      const health=progressHealth(group[0]?.topicName||group[0]?.topic||'');
      return {topicId,group,ratio:group.length?cycleCovered/group.length:1,lifetimeRate:group.length?row.presented/group.length:0,health,jitter:Math.random()};
    }).sort((a,b)=>a.ratio-b.ratio||a.lifetimeRate-b.lifetimeRate||a.health-b.health||a.jitter-b.jitter);
    function rank(group){
      return group.slice().sort((a,b)=>{
        const sa=data.conditions[a.conditionId]||{presented:0,answered:0,health:50,lastPresentedAt:null};
        const sb=data.conditions[b.conditionId]||{presented:0,answered:0,health:50,lastPresentedAt:null};
        const neverA=sa.presented===0?0:1,neverB=sb.presented===0?0:1;
        const cycleA=covered.has(a.conditionId)?1:0,cycleB=covered.has(b.conditionId)?1:0;
        const timeA=sa.lastPresentedAt?now-new Date(sa.lastPresentedAt).getTime():Number.MAX_SAFE_INTEGER;
        const timeB=sb.lastPresentedAt?now-new Date(sb.lastPresentedAt).getTime():Number.MAX_SAFE_INTEGER;
        return neverA-neverB||cycleA-cycleB||sa.presented-sb.presented||sa.health-sb.health||timeB-timeA||Math.random()-.5;
      });
    }
    const selected=[];const used=new Set();
    if(options.uniqueTopics!==false){
      for(const topic of topicScores){const choice=rank(topic.group).find(item=>!used.has(item.conditionId));if(choice){selected.push(choice);used.add(choice.conditionId);}if(selected.length>=count)break;}
    }
    if(selected.length<count){
      const remaining=rank(items).filter(item=>!used.has(item.conditionId));
      for(const item of remaining){selected.push(item);used.add(item.conditionId);if(selected.length>=count)break;}
    }
    return selected.slice(0,count);
  }

  function initObservers(){
    const observer=new MutationObserver(records=>{
      const relevant=records.some(record=>{
        const target=record.target?.nodeType===1?record.target:record.target?.parentElement;
        if(target?.closest?.('#learning-analytics,.learning-condition-count,.learning-topic-count')) return false;
        if(target?.closest?.('#aiq-play,#quiz-body')) return true;
        return [...(record.addedNodes||[])].some(node=>node.nodeType===1&&(node.matches?.('.card,.section,#aiq-play,#quiz-body')||node.querySelector?.('.card,.section,#aiq-play,#quiz-body')));
      });
      if(!relevant) return;
      ensureIds();
      const ai=document.getElementById('aiq-play');if(ai)observeAi(ai);
      const basic=document.getElementById('quiz-body');if(basic)observeBasic(basic);
      scheduleRefresh();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('click',event=>{handleAiClick(event);handleBasicClick(event);},true);
    document.addEventListener('ukmlaRemoteDataImported',()=>{ensureIds();scheduleRefresh();});
  }

  function init(){ensureIds();ensureAnalytics();refreshBadges();renderAnalytics();initObservers();}
  window.UKMLA_LEARNING={KEYS,TYPE_LABELS,BASIC_TYPE_MAP,ensureIds,catalogue,events,stats,coverageState,logPresented,logAnswered,selectCoverageCandidates,summaryText,csvText,conditionByName,stableConditionId,stableTopicId,hash,slug,refresh:scheduleRefresh};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
