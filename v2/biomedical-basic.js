(function(){
  'use strict';

  let activeQuiz=null;
  let observing=false;

  function core(){return window.UKMLA_V2;}
  function escapeHtml(value){return core().escapeHtml(value);}
  function standardCards(){return core().App.conditions.filter(item=>!['anatomy','physiology'].includes(item.profile));}
  function fieldValue(condition,param){
    if(condition.profile==='law'){
      const map={investigations:'rule',treatment:'act',escalation:'record',mimics:'recognise',redFlags:'avoid'};
      return condition.fields?.[map[param]]||'';
    }
    return condition.fields?.[param]||'';
  }
  function weakParams(){
    const map={investigations:'first_line_investigation',treatment:'stable_first_line_treatment',escalation:'escalation_referral_disposition',mimics:'close_mimic_discrimination',redFlags:'dangerous_diagnosis_priority_exclusion'};
    const stats=core().eventIndex().type;
    return core().PARAMS.slice().sort((a,b)=>{
      const left=stats[map[a]],right=stats[map[b]];
      const la=left?.answered?left.correct/left.answered:null;
      const ra=right?.answered?right.correct/right.answered:null;
      if(la===null&&ra!==null)return 1;
      if(la!==null&&ra===null)return-1;
      return(la??1)-(ra??1);
    });
  }
  function buildQuestion(condition,param,pool,number){
    const correctText=fieldValue(condition,param);
    if(!correctText)return null;
    const candidates=pool.filter(item=>item.id!==condition.id&&fieldValue(item,param)&&fieldValue(item,param)!==correctText);
    const same=candidates.filter(item=>item.topicId===condition.topicId);
    const other=candidates.filter(item=>item.topicId!==condition.topicId);
    const distractors=core().shuffle([...same,...other]).slice(0,4);
    if(distractors.length<4)return null;
    const options=core().shuffle([
      {text:correctText,conditionId:condition.id,conditionName:condition.name,topicId:condition.topicId,topicName:condition.topic,correct:true},
      ...distractors.map(item=>({text:fieldValue(item,param),conditionId:item.id,conditionName:item.name,topicId:item.topicId,topicName:item.topic,correct:false}))
    ]).map((option,index)=>({...option,id:'ABCDE'[index]}));
    const correct=options.find(option=>option.correct);
    const questionType={investigations:'first_line_investigation',treatment:'stable_first_line_treatment',escalation:'escalation_referral_disposition',mimics:'close_mimic_discrimination',redFlags:'dangerous_diagnosis_priority_exclusion'}[param];
    const stems={investigations:'Which investigation or rule is most appropriate for',treatment:'Which treatment or action is most appropriate for',escalation:'Which escalation or recording action best applies to',mimics:'Which statement best identifies or distinguishes',redFlags:'Which red flag or action to avoid best applies to'};
    return{id:`compat-q${number}`,questionNumber:number,questionType,questionTypeLabel:core().TYPE_LABELS[questionType],param,topicId:condition.topicId,topicName:condition.topic,targetConditionId:condition.id,targetCondition:condition.name,stem:`${stems[param]} ${condition.name}?`,leadIn:'Select the single best answer.',options,correctOptionId:correct.id,rationale:`${condition.name} — ${condition.labels?.[param]||core().PARAM_LABELS[param]||param}: ${correctText}`};
  }
  function startAll(workspace){
    const pool=standardCards();
    const selected=core().selectCoverageCandidates(pool,10,{uniqueTopics:true});
    const weak=weakParams();
    const questions=selected.map((condition,index)=>buildQuestion(condition,weak[index%weak.length],pool,index+1)).filter(Boolean);
    if(questions.length!==10){core().toast('Could not build ten distinct clinical/law questions.');return;}
    activeQuiz={id:core().uid('basic-compat-quiz'),source:'basic',workspace,questions,index:0,answers:[],correct:0};
    window.UKMLA_QUESTION_BANK?.storeSet({schemaVersion:'ukmla-local-basic-v1',quizId:activeQuiz.id,topic:'All clinical and law topics',generatedAt:new Date().toISOString(),sourceType:'basic',questions},{sourceType:'basic',title:'Local coverage questions'});
    drawQuestion();
  }
  function drawQuestion(){
    const quiz=activeQuiz;
    if(!quiz)return;
    const question=quiz.questions[quiz.index];
    const answer=quiz.answers[quiz.index];
    if(!answer)core().logPresented({id:`present:${quiz.id}:${question.id}`,source:quiz.source,quizId:quiz.id,questionId:question.id,conditionId:question.targetConditionId,conditionName:question.targetCondition,topicId:question.topicId,topicName:question.topicName,questionType:question.questionType});
    quiz.workspace.innerHTML=`<article class="quiz-card" style="max-width:900px;margin:0 auto"><div class="topic-meta"><span>Question ${quiz.index+1} of ${quiz.questions.length}</span><span>${escapeHtml(question.questionTypeLabel)}</span></div><div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="--value:${Math.round((quiz.index+1)/quiz.questions.length*100)}%"></div></div><div class="quiz-stem">${escapeHtml(question.stem)}</div><p>${escapeHtml(question.leadIn)}</p><div class="options">${question.options.map(option=>`<button class="option ${answer?(option.id===question.correctOptionId?'correct':option.id===answer.selectedOptionId?'wrong':''):''}" data-compat-option="${option.id}" ${answer?'disabled':''}><span class="letter">${option.id}</span><span>${escapeHtml(option.text)}</span></button>`).join('')}</div>${answer?`<div class="feedback"><strong>${answer.correct?'Correct.':'Incorrect.'}</strong> ${escapeHtml(question.rationale)}</div><div class="card-actions"><button class="btn" id="compat-prev" ${quiz.index===0?'disabled':''}>Previous</button><button class="btn primary" id="compat-next">${quiz.index===quiz.questions.length-1?'Results':'Next'}</button></div>`:''}</article>`;
    quiz.workspace.querySelectorAll('[data-compat-option]').forEach(button=>button.onclick=()=>answerQuestion(button.dataset.compatOption));
    quiz.workspace.querySelector('#compat-prev')?.addEventListener('click',()=>{quiz.index--;drawQuestion();});
    quiz.workspace.querySelector('#compat-next')?.addEventListener('click',()=>{if(quiz.index===quiz.questions.length-1)drawResult();else{quiz.index++;drawQuestion();}});
  }
  function answerQuestion(optionId){
    const quiz=activeQuiz;
    const question=quiz.questions[quiz.index];
    if(quiz.answers[quiz.index])return;
    const option=question.options.find(item=>item.id===optionId);
    const correct=core().scoreAnswer(question,option);
    quiz.answers[quiz.index]={selectedOptionId:optionId,correct};
    if(correct)quiz.correct++;
    core().logAnswered({id:`answer:${quiz.id}:${question.id}`,presentationId:`present:${quiz.id}:${question.id}`,source:quiz.source,quizId:quiz.id,questionId:question.id,conditionId:question.targetConditionId,conditionName:question.targetCondition,topicId:question.topicId,topicName:question.topicName,questionType:question.questionType,selectedOptionId:optionId,correctOptionId:question.correctOptionId,correct});
    drawQuestion();
  }
  function drawResult(){
    const quiz=activeQuiz;
    const percent=Math.round(quiz.correct/quiz.questions.length*100);
    quiz.workspace.innerHTML=`<article class="quiz-card" style="max-width:760px;margin:auto;text-align:center"><div class="eyebrow">Question set complete</div><div class="boast-number" style="margin:28px 0">${quiz.correct}/${quiz.questions.length}</div><h2>${percent}%</h2><p>Clinical/law topic health, condition coverage, Question Bank history and analytics have been updated.</p><div class="card-actions" style="justify-content:center"><button class="btn primary" id="compat-again">Another question set</button><button class="btn" id="compat-analytics">Open analytics</button></div></article>`;
    quiz.workspace.querySelector('#compat-again').onclick=()=>{activeQuiz=null;core().render();};
    quiz.workspace.querySelector('#compat-analytics').onclick=()=>core().go('analytics');
  }
  function patchBasic(){
    if(!location.hash.startsWith('#/quiz'))return;
    const tabs=document.querySelector('#app .tabs');
    const workspace=document.getElementById('quiz-workspace');
    const basic=tabs?.querySelector('[data-quiz-tab="basic"]');
    if(!workspace||!basic?.classList.contains('active'))return;
    const select=workspace.querySelector('#basic-scope');
    const start=workspace.querySelector('#basic-start');
    if(!select||!start||start.dataset.biomedicalCompatible)return;
    const biomedicalTopicIds=new Set(core().App.topics.filter(topic=>(core().App.byTopic.get(topic.id)||[]).some(item=>['anatomy','physiology'].includes(item.profile))).map(topic=>topic.id));
    [...select.options].forEach(option=>{if(biomedicalTopicIds.has(option.value))option.remove();});
    const original=start.onclick;
    start.dataset.biomedicalCompatible='true';
    start.onclick=()=>{if(select.value==='all')startAll(workspace);else original?.();};

    const cards=workspace.querySelectorAll('.quiz-card');
    const panel=cards[1];
    if(panel){
      const pool=standardCards();
      const covered=new Set(core().coverageState().covered);
      const coveredCount=pool.filter(item=>covered.has(item.id)).length;
      const heading=panel.querySelector('h2');if(heading)heading.textContent='Clinical and law coverage';
      const metric=panel.querySelector('.metric-big');if(metric)metric.textContent=`${coveredCount}/${pool.length}`;
      const paragraphs=panel.querySelectorAll('p');
      if(paragraphs[0])paragraphs[0].textContent=`clinical/law cards in coverage cycle ${core().coverageState().cycle}`;
      if(paragraphs[1])paragraphs[1].textContent=`${Math.ceil(Math.max(0,pool.length-coveredCount)/10)} ten-question sets estimated for this part of the atlas. Anatomy and physiology are tested in their dedicated tab.`;
    }
  }
  function init(){
    if(observing)return;observing=true;
    const app=document.getElementById('app');
    if(app)new MutationObserver(()=>requestAnimationFrame(patchBasic)).observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',()=>setTimeout(patchBasic,0));
    patchBasic();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.UKMLA_BIOMEDICAL_BASIC={patchBasic};
})();
