(function(){
  'use strict';

  if(window.__UKMLA_BASIC_COVERAGE_QUIZ__) return;
  window.__UKMLA_BASIC_COVERAGE_QUIZ__=true;

  const PARAMS=['Ix','Tx','Escalate','Mimics','Red flags'];
  const TYPE_FOR_PARAM={Ix:'first_line_investigation',Tx:'stable_first_line_treatment',Escalate:'escalation_referral_disposition',Mimics:'close_mimic_discrimination','Red flags':'dangerous_diagnosis_priority_exclusion'};
  const STEM={Ix:'Which investigation is most appropriate for',Tx:'Which treatment is most appropriate for',Escalate:'Which escalation or safety-net action best applies to',Mimics:'Which statement best distinguishes','Red flags':'Which danger feature is most important in'};
  const letters=['A','B','C','D','E'];
  let active=null;

  function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}
  function load(){try{return JSON.parse(localStorage.getItem('ukmlaQuizProgressV1')||'{}')||{};}catch(_){return {};}}
  function save(progress){localStorage.setItem('ukmlaQuizProgressV1',JSON.stringify(progress));}
  function nudge(value,target,weight){return Math.round(Math.max(0,Math.min(100,Number(value)||0))*(1-weight)+target*weight);}
  function ensureTopic(progress,name){
    if(!progress[name]||typeof progress[name]!=='object')progress[name]={health:50,attempts:0,correct:0,params:{},borrowedHits:0,sameTopicConfusions:0};
    const topic=progress[name];topic.params=topic.params||{};PARAMS.forEach(param=>{if(!topic.params[param])topic.params[param]={health:50,attempts:0,correct:0,borrowedHits:0,sameTopicConfusions:0};});
    return topic;
  }
  function shuffle(items){const copy=items.slice();for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
  function weakestParams(){
    const stats=window.UKMLA_LEARNING?.stats();
    return PARAMS.slice().sort((a,b)=>{
      const ta=stats?.types?.[TYPE_FOR_PARAM[a]],tb=stats?.types?.[TYPE_FOR_PARAM[b]];
      const aa=ta?.answered?ta.correct/ta.answered:null,ab=tb?.answered?tb.correct/tb.answered:null;
      if(aa===null&&ab!==null)return 1;if(aa!==null&&ab===null)return -1;return (aa??1)-(ab??1);
    });
  }
  function paramPlan(){
    const selected=document.getElementById('quiz-param')?.value;
    if(PARAMS.includes(selected))return Array(10).fill(selected);
    const order=weakestParams();
    return [order[0],order[0],order[0],order[1],order[1],order[2],order[2],order[3],order[4],order[4]];
  }
  function distractors(target,param,pool){
    const same=pool.filter(item=>item.conditionId!==target.conditionId&&item.fields[param]&&item.topic===target.topic);
    const other=pool.filter(item=>item.conditionId!==target.conditionId&&item.fields[param]&&item.topic!==target.topic);
    const chosen=[];const seen=new Set([target.fields[param]]);
    for(const item of shuffle([...same,...other])){const text=clean(item.fields[param]);if(!text||seen.has(text))continue;seen.add(text);chosen.push({text,source:item});if(chosen.length===4)break;}
    return chosen;
  }
  function buildQuestion(condition,param,pool,index){
    const correct={text:condition.fields[param],source:condition,isCorrect:true};const wrong=distractors(condition,param,pool);
    if(!correct.text||wrong.length<4)return null;
    const options=shuffle([correct,...wrong.map(item=>({...item,isCorrect:false}))]);
    return {index,condition,param,questionType:TYPE_FOR_PARAM[param],stem:`${STEM[param]} ${condition.name}?`,options,correctIndex:options.findIndex(option=>option.isCorrect)};
  }
  function sourcePool(mode,button){
    const catalogue=window.UKMLA_LEARNING?.catalogue()||[];
    if(mode==='visible')return catalogue.filter(item=>!item.card.hidden);
    if(mode==='section'){const section=button.closest('.section');return catalogue.filter(item=>item.section===section);}
    return catalogue;
  }
  function selectConditions(pool,count,uniqueTopics){
    let selected=window.UKMLA_LEARNING.selectCoverageCandidates(pool,Math.min(count,pool.length),{uniqueTopics});
    if(selected.length<count&&selected.length){let i=0;while(selected.length<count){selected.push(selected[i%selected.length]);i++;}}
    return selected.slice(0,count);
  }
  function start(mode,button){
    const body=document.getElementById('quiz-body');if(!body)return;
    const pool=sourcePool(mode,button);if(!pool.length){body.innerHTML='<div class="quiz-empty">No quiz-ready conditions are available in that selection.</div>';return;}
    const conditions=selectConditions(pool,10,mode==='all');const plan=paramPlan();const questions=conditions.map((condition,index)=>buildQuestion(condition,plan[index],pool,index+1)).filter(Boolean);
    if(!questions.length){body.innerHTML='<div class="quiz-empty">The selected cards did not provide enough distinct answer options.</div>';return;}
    active={id:`basic-coverage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,questions,index:0,correct:0,answers:[],source:mode};
    render();document.getElementById('quiz-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function score(question,chosen){
    const progress=load();const topic=ensureTopic(progress,question.condition.topic);const aspect=topic.params[question.param];const correct=chosen.isCorrect;const target=correct?100:0;
    topic.health=nudge(topic.health,target,.18);topic.attempts=(topic.attempts||0)+1;if(correct)topic.correct=(topic.correct||0)+1;
    aspect.health=nudge(aspect.health,target,.18);aspect.attempts=(aspect.attempts||0)+1;if(correct)aspect.correct=(aspect.correct||0)+1;
    if(!correct){if(chosen.source.topic!==question.condition.topic){const borrowed=ensureTopic(progress,chosen.source.topic);borrowed.health=nudge(borrowed.health,25,.10);borrowed.borrowedHits=(borrowed.borrowedHits||0)+1;const bp=borrowed.params[question.param];bp.health=nudge(bp.health,25,.10);bp.borrowedHits=(bp.borrowedHits||0)+1;}else{topic.sameTopicConfusions=(topic.sameTopicConfusions||0)+1;aspect.sameTopicConfusions=(aspect.sameTopicConfusions||0)+1;}}
    save(progress);document.dispatchEvent(new Event('ukmlaRemoteDataImported'));return correct;
  }
  function render(){
    const body=document.getElementById('quiz-body');if(!active||!body)return;const q=active.questions[active.index];
    body.innerHTML=`<div class="quiz-question-card"><div class="quiz-meta"><span>Question ${active.index+1} of ${active.questions.length}</span><span>Source: coverage-first basic quiz</span><span>Topic: ${clean(q.condition.topic)}</span><span>Type: ${clean(q.param)}</span></div><div class="quiz-stem">${clean(q.stem)}</div><div class="quiz-options">${q.options.map((option,index)=>`<button class="quiz-option" type="button" data-index="${index}" title="Borrowed from: ${clean(option.source.topic)} / ${clean(option.source.name)}"><span class="quiz-letter">${letters[index]}</span>${clean(option.text)}</button>`).join('')}</div><div id="quiz-feedback" class="quiz-feedback" hidden></div></div>`;
    body.querySelectorAll('.quiz-option').forEach(button=>button.addEventListener('click',()=>answer(Number(button.dataset.index))));
  }
  function answer(index){
    if(!active)return;const q=active.questions[active.index],chosen=q.options[index];if(!chosen)return;const correct=score(q,chosen);if(correct)active.correct++;active.answers.push({question:q,chosen,correct});
    const body=document.getElementById('quiz-body');body.querySelectorAll('.quiz-option').forEach((button,i)=>{button.disabled=true;if(i===q.correctIndex)button.classList.add('correct');if(i===index&&!correct)button.classList.add('incorrect');});
    const feedback=body.querySelector('#quiz-feedback');feedback.hidden=false;feedback.innerHTML=`<strong>${correct?'Correct.':'Not quite.'}</strong><div><strong>${clean(q.condition.name)} → ${clean(q.param)}:</strong> ${clean(q.options[q.correctIndex].text)}</div>${!correct?`<div style="margin-top:.45rem"><strong>You chose:</strong> ${clean(chosen.text)}</div>`:''}<div style="margin-top:.65rem"><button class="quiz-next" type="button">${active.index+1===active.questions.length?'Show result':'Next question'}</button></div>`;
    feedback.querySelector('.quiz-next').addEventListener('click',()=>{active.index++;if(active.index>=active.questions.length)result();else render();});
  }
  function result(){
    const body=document.getElementById('quiz-body');const pct=Math.round(active.correct/active.questions.length*100);body.innerHTML=`<div class="quiz-question-card"><div class="quiz-stem">Result: ${active.correct}/${active.questions.length} (${pct}%)</div><p>Coverage-first selection prioritised underrepresented topics and unseen conditions before performance remediation.</p><div class="quiz-actions"><button type="button" id="basic-coverage-again">Coverage-first 10 again</button><button type="button" id="basic-coverage-analytics">Open learning analytics</button></div></div>`;body.querySelector('#basic-coverage-again').addEventListener('click',()=>start('all',body));body.querySelector('#basic-coverage-analytics').addEventListener('click',()=>document.getElementById('learning-analytics')?.scrollIntoView({behavior:'smooth'}));active=null;
  }
  function modeFor(target){if(target.closest('#quiz-all-areas,#quiz-all-areas-side'))return'all';if(target.closest('#quiz-visible,#quiz-visible-side'))return'visible';if(target.closest('.quiz-section-button'))return'section';return null;}
  document.addEventListener('click',event=>{const mode=modeFor(event.target);if(!mode)return;event.preventDefault();event.stopImmediatePropagation();start(mode,event.target);},true);
})();
