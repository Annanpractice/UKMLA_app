(function(){
  'use strict';

  let root=null;
  let quiz=null;

  const TYPES={
    anatomy_localisation:{label:'Applied anatomy: localisation',param:'investigations',field:'exactAnswer'},
    anatomy_consequence:{label:'Applied anatomy: predicted deficit',param:'treatment',field:'clinicalPattern'},
    anatomy_discrimination:{label:'Applied anatomy: discriminator',param:'mimics',field:'discriminator'},
    anatomy_application:{label:'Applied anatomy: OSPE sequence',param:'escalation',field:'examUse'},
    physiology_mechanism:{label:'Clinical physiology: mechanism',param:'investigations',field:'mechanism'},
    physiology_pattern:{label:'Clinical physiology: predicted pattern',param:'treatment',field:'clinicalPattern'},
    physiology_discrimination:{label:'Clinical physiology: discriminator',param:'mimics',field:'discriminator'},
    physiology_application:{label:'Clinical physiology: application',param:'escalation',field:'examUse'}
  };

  function core(){return window.UKMLA_V2;}
  function escapeHtml(value){return core().escapeHtml(value);}
  function clean(value){return core().clean(value);}
  function profileItems(profile){return core().App.conditions.filter(item=>item.profile===profile);}
  function topicForProfile(profile){return core().App.topics.find(topic=>(core().App.byTopic.get(topic.id)||[]).some(item=>item.profile===profile));}
  function shuffle(items){return core().shuffle(items);}

  function registerTypes(){
    const api=core();
    if(!api)return;
    for(const [id,meta] of Object.entries(TYPES)){
      api.TYPE_LABELS[id]=meta.label;
      api.TYPE_PARAM[id]=meta.param;
    }
  }

  function persistTab(value){
    const api=core();
    api.App.state.quizTab=value;
    api.saveJson(api.STORAGE.state,api.App.state);
  }

  function integrate(){
    const api=core();
    if(!api||!location.hash.startsWith('#/quiz'))return;
    registerTypes();
    const tabs=document.querySelector('#app .tabs');
    const workspace=document.getElementById('quiz-workspace');
    if(!tabs||!workspace)return;
    let button=tabs.querySelector('[data-quiz-tab="biomedical"]');
    if(!button){
      button=document.createElement('button');
      button.className='tab';
      button.dataset.quizTab='biomedical';
      button.textContent='Anatomy & Physiology';
      tabs.appendChild(button);
      button.onclick=()=>{
        persistTab('biomedical');
        tabs.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab===button));
        mount(workspace);
      };
    }
    if(api.App.state.quizTab==='biomedical'&&!button.classList.contains('active')){
      tabs.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab===button));
      mount(workspace);
    }
  }

  function anatomyGroup(item){
    const text=`${item.name} ${Object.values(item.fields||{}).join(' ')}`.toLowerCase();
    const groups=[
      ['upper-limb',/(humer|axill|radial|ulnar|median|carpal|scap|shoulder|elbow|wrist|hand|brachial|clavicle)/],
      ['lower-limb',/(femoral|fibular|tibial|sciatic|gluteal|obturator|hip|knee|ankle|malleol|achilles|foot|tarsal)/],
      ['head-neck-neuro',/(cranial|cn |pterion|cavernous|carotid|hypogloss|corneal|pharyn|laryn|parotid|cribriform|horner|medull|capsule|brain|emissary)/],
      ['thorax-cardiac',/(lung|bronch|trache|carina|hilum|phrenic|vagus|thoracic|aortic|mitral|cardiac|heart|coarct|ductus arteriosus|sa node)/],
      ['abdomen-hepatobiliary',/(inguinal|pancrea|portal|liver|spleen|gallbladder|bile|morison|omentum|appendix|oesoph|ureter|suprarenal|nutcracker)/],
      ['pelvis-obstetric',/(pudendal|pelvic|bladder|urethral|puborectalis|placent|umbilical|oocyte|foramen ovale|ductus venosus)/],
      ['spine-procedure',/(epidural|dural|lumbar|vertebra|disc|ligamentum flavum|l4 landmark)/]
    ];
    return groups.find(([,pattern])=>pattern.test(text))?.[0]||'general';
  }

  function candidatesFor(target,field,pool){
    let candidates=pool.filter(item=>item.id!==target.id&&item.fields?.[field]&&item.fields[field]!==target.fields[field]);
    if(target.profile==='physiology'){
      const subsystem=target.fields?.subsystem;
      const same=candidates.filter(item=>item.fields?.subsystem===subsystem);
      if(same.length>=4)candidates=same;
    }else{
      const group=anatomyGroup(target);
      const same=candidates.filter(item=>anatomyGroup(item)===group);
      if(same.length>=4)candidates=same;
    }
    return candidates;
  }

  function questionStem(target,typeId){
    const fields=target.fields||{};
    switch(typeId){
      case'anatomy_localisation':return`A clinical or OSPE stem identifies ${target.name} and gives the finding “${fields.clinicalPattern}”. Which exact structure, relation or landmark is being tested?`;
      case'anatomy_consequence':return`A lesion, fracture or procedure involves ${target.name} and the key anatomical answer is “${fields.exactAnswer}”. Which clinical association or deficit should follow?`;
      case'anatomy_discrimination':return`Which statement gives the most useful discriminator when localising a difficult question about ${target.name}?`;
      case'anatomy_application':return`Which applied spotter or lesion-localisation sequence is correct for ${target.name}?`;
      case'physiology_mechanism':return`A patient demonstrates the following pattern: ${fields.clinicalPattern} Which mechanism best explains this in ${target.name}?`;
      case'physiology_pattern':return`The relevant mechanism is: ${fields.mechanism} Which clinical or laboratory pattern should be expected?`;
      case'physiology_discrimination':return`Which statement best prevents the common interpretation error in ${target.name}?`;
      case'physiology_application':return`Which applied clinical use best demonstrates the physiology of ${target.name}?`;
      default:return`Which statement best applies to ${target.name}?`;
    }
  }

  function buildQuestion(target,typeId,pool,number){
    const meta=TYPES[typeId];
    const correctText=target.fields?.[meta.field];
    if(!correctText)return null;
    const distractors=shuffle(candidatesFor(target,meta.field,pool)).slice(0,4);
    if(distractors.length<4)return null;
    const options=shuffle([
      {text:correctText,conditionId:target.id,conditionName:target.name,topicId:target.topicId,topicName:target.topic,correct:true},
      ...distractors.map(item=>({text:item.fields[meta.field],conditionId:item.id,conditionName:item.name,topicId:item.topicId,topicName:item.topic,correct:false}))
    ]).map((option,index)=>({...option,id:'ABCDE'[index]}));
    return{
      id:`biomed-q${number}`,
      questionNumber:number,
      questionType:typeId,
      questionTypeLabel:meta.label,
      param:meta.param,
      topicId:target.topicId,
      topicName:target.topic,
      targetConditionId:target.id,
      targetCondition:target.name,
      stem:questionStem(target,typeId),
      leadIn:'Select the single best answer.',
      options,
      correctOptionId:options.find(option=>option.correct).id,
      rationale:`${target.name} — ${target.labels?.[meta.field]||meta.field}: ${correctText}`
    };
  }

  function typePlan(profile,count){
    const ids=profile==='anatomy'
      ?['anatomy_localisation','anatomy_consequence','anatomy_discrimination','anatomy_application']
      :['physiology_mechanism','physiology_pattern','physiology_discrimination','physiology_application'];
    return Array.from({length:count},(_,index)=>ids[index%ids.length]);
  }

  function selectTargets(scope){
    const anatomy=profileItems('anatomy');
    const physiology=profileItems('physiology');
    if(scope==='anatomy')return core().selectCoverageCandidates(anatomy,Math.min(10,anatomy.length),{uniqueTopics:false});
    if(scope==='physiology')return core().selectCoverageCandidates(physiology,Math.min(10,physiology.length),{uniqueTopics:false});
    const a=core().selectCoverageCandidates(anatomy,5,{uniqueTopics:false});
    const p=core().selectCoverageCandidates(physiology,5,{uniqueTopics:false});
    return shuffle([...a,...p]);
  }

  function mount(container){
    root=container;
    quiz=null;
    const anatomy=profileItems('anatomy');
    const physiology=profileItems('physiology');
    root.innerHTML=`<section class="biomedical-hero"><div><div class="eyebrow">Biomedical sciences</div><h2>Applied anatomy and clinical physiology</h2><p>Cards are tested through lesion localisation, relations, mechanism-to-finding reasoning and close discriminators rather than isolated definitions.</p></div><div class="biomedical-counts"><strong>${anatomy.length}</strong><span>anatomy cards</span><strong>${physiology.length}</strong><span>physiology cards</span></div></section><section class="quiz-layout"><article class="quiz-card"><h2>Local applied drill</h2><div class="field"><label>Scope</label><select class="select" id="biomedical-scope"><option value="mixed">Mixed · 5 anatomy + 5 physiology</option><option value="anatomy">Clinical anatomy only</option><option value="physiology">Clinical physiology only</option></select></div><button class="btn primary" id="biomedical-start" style="width:100%;margin-top:16px">Generate 10-question drill</button><button class="btn ghost" id="biomedical-ai" style="width:100%;margin-top:9px">Open difficult AI topic quiz</button></article><aside class="quiz-card"><h2>How it is tested</h2><div class="rank-list"><div class="rank-row"><span>Anatomy</span><span>localise → predict deficit</span></div><div class="rank-row"><span>Physiology</span><span>mechanism → interpret pattern</span></div><div class="rank-row"><span>Distractors</span><span>same region or system</span></div><div class="rank-row"><span>Tracking</span><span>topic + question type</span></div></div></aside></section><section id="biomedical-play" style="margin-top:18px"></section>`;
    root.querySelector('#biomedical-start').onclick=()=>startLocal(root.querySelector('#biomedical-scope').value);
    root.querySelector('#biomedical-ai').onclick=()=>openAi(root.querySelector('#biomedical-scope').value);
  }

  function startLocal(scope){
    const targets=selectTargets(scope);
    if(targets.length<10){core().toast('Not enough biomedical cards are available.');return;}
    const anatomyTypes=typePlan('anatomy',targets.filter(item=>item.profile==='anatomy').length);
    const physiologyTypes=typePlan('physiology',targets.filter(item=>item.profile==='physiology').length);
    let ai=0,pi=0;
    const questions=targets.map((target,index)=>{
      const typeId=target.profile==='anatomy'?anatomyTypes[ai++]:physiologyTypes[pi++];
      return buildQuestion(target,typeId,profileItems(target.profile),index+1);
    }).filter(Boolean);
    if(questions.length!==10){core().toast('Could not build ten distinct biomedical questions.');return;}
    quiz={id:core().uid('biomedical-quiz'),source:'biomedical',questions,index:0,answers:[],correct:0};
    drawQuestion();
  }

  function drawQuestion(){
    if(!quiz)return;
    const container=root.querySelector('#biomedical-play');
    const question=quiz.questions[quiz.index];
    const answer=quiz.answers[quiz.index];
    if(!answer)core().logPresented({id:`present:${quiz.id}:${question.id}`,source:quiz.source,quizId:quiz.id,questionId:question.id,conditionId:question.targetConditionId,conditionName:question.targetCondition,topicId:question.topicId,topicName:question.topicName,questionType:question.questionType,questionTypeLabel:question.questionTypeLabel});
    container.innerHTML=`<article class="quiz-card" style="max-width:920px;margin:auto"><div class="topic-meta"><span>Question ${quiz.index+1} of ${quiz.questions.length}</span><span>${escapeHtml(question.questionTypeLabel)}</span></div><div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="--value:${Math.round((quiz.index+1)/quiz.questions.length*100)}%"></div></div><div class="quiz-stem">${escapeHtml(question.stem)}</div><p>${escapeHtml(question.leadIn)}</p><div class="options">${question.options.map(option=>`<button class="option ${answer?(option.id===question.correctOptionId?'correct':option.id===answer.selectedOptionId?'wrong':''):''}" data-biomedical-option="${option.id}" ${answer?'disabled':''}><span class="letter">${option.id}</span><span>${escapeHtml(option.text)}</span></button>`).join('')}</div>${answer?`<div class="feedback"><strong>${answer.correct?'Correct.':'Incorrect.'}</strong> ${escapeHtml(question.rationale)}</div><div class="card-actions"><button class="btn" id="biomedical-prev" ${quiz.index===0?'disabled':''}>Previous</button><button class="btn primary" id="biomedical-next">${quiz.index===quiz.questions.length-1?'Results':'Next'}</button></div>`:''}</article>`;
    container.querySelectorAll('[data-biomedical-option]').forEach(button=>button.onclick=()=>answerQuestion(button.dataset.biomedicalOption));
    container.querySelector('#biomedical-prev')?.addEventListener('click',()=>{quiz.index--;drawQuestion();});
    container.querySelector('#biomedical-next')?.addEventListener('click',()=>{if(quiz.index===quiz.questions.length-1)drawResult();else{quiz.index++;drawQuestion();}});
  }

  function answerQuestion(optionId){
    const question=quiz.questions[quiz.index];
    if(quiz.answers[quiz.index])return;
    const option=question.options.find(item=>item.id===optionId);
    const correct=core().scoreAnswer(question,option);
    quiz.answers[quiz.index]={selectedOptionId:optionId,correct};
    if(correct)quiz.correct++;
    core().logAnswered({id:`answer:${quiz.id}:${question.id}`,presentationId:`present:${quiz.id}:${question.id}`,source:quiz.source,quizId:quiz.id,questionId:question.id,conditionId:question.targetConditionId,conditionName:question.targetCondition,topicId:question.topicId,topicName:question.topicName,questionType:question.questionType,questionTypeLabel:question.questionTypeLabel,selectedOptionId:optionId,correctOptionId:question.correctOptionId,correct});
    drawQuestion();
  }

  function drawResult(){
    const container=root.querySelector('#biomedical-play');
    const percent=Math.round(quiz.correct/quiz.questions.length*100);
    container.innerHTML=`<article class="quiz-card" style="max-width:760px;margin:auto;text-align:center"><div class="eyebrow">Biomedical drill complete</div><div class="boast-number" style="margin:28px 0">${quiz.correct}/${quiz.questions.length}</div><h2>${percent}%</h2><p>Clinical Anatomy, Clinical Physiology and their applied question-type analytics have been updated.</p><div class="card-actions" style="justify-content:center"><button class="btn primary" id="biomedical-again">Another drill</button><button class="btn" id="biomedical-analytics">Open analytics</button></div></article>`;
    container.querySelector('#biomedical-again').onclick=()=>mount(root);
    container.querySelector('#biomedical-analytics').onclick=()=>core().go('analytics');
  }

  function openAi(scope){
    const tabs=document.querySelector('#app .tabs');
    const button=tabs?.querySelector('[data-quiz-tab="ai"]');
    const workspace=document.getElementById('quiz-workspace');
    if(!button||!workspace||!window.UKMLA_V2_AI)return;
    persistTab('ai');
    tabs.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab===button));
    window.UKMLA_V2_AI.mount(workspace);
    const mode=workspace.querySelector('#ai-mode');
    const topicField=workspace.querySelector('#ai-topic-field');
    const topicSelect=workspace.querySelector('#ai-topic');
    const desired=scope==='physiology'?topicForProfile('physiology'):topicForProfile('anatomy');
    if(mode&&topicField&&topicSelect&&desired){mode.value='topic';topicField.hidden=false;topicSelect.value=desired.id;}
  }

  function init(){
    registerTypes();
    const app=document.getElementById('app');
    if(app)new MutationObserver(()=>requestAnimationFrame(integrate)).observe(app,{childList:true});
    window.addEventListener('hashchange',()=>setTimeout(integrate,0));
    integrate();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.UKMLA_BIOMEDICAL={mount,TYPES};
})();
