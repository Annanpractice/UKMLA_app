(function(){
  'use strict';

  const TOPIC_NAME='Clinical Pharmacology & Safe Prescribing';
  const TOPIC_ID='topic-clinical-pharmacology-safe-prescribing';
  const PROFILE='pharmacology';
  const FIELD_MAP={
    indication:'mimics',
    prescribe:'treatment',
    checkMonitor:'investigations',
    interactionsAvoid:'redFlags',
    toxicityAct:'escalation'
  };
  const LABELS={
    mimics:'Indication / recognise',
    treatment:'Prescribe',
    investigations:'Check / monitor',
    redFlags:'Interactions / avoid',
    escalation:'Toxicity / act'
  };
  const TYPES={
    pharm_indication:{label:'Pharmacology: indication recognition',param:'mimics',field:'mimics'},
    pharm_exact_regimen:{label:'Pharmacology: exact regimen',param:'treatment',field:'treatment'},
    pharm_dose_calculation:{label:'Pharmacology: dose calculation',param:'treatment',field:'treatment'},
    pharm_dose_modifier:{label:'Pharmacology: dose modifier',param:'investigations',field:'investigations'},
    pharm_contraindication_switch:{label:'Pharmacology: contraindication switch',param:'redFlags',field:'redFlags'},
    pharm_interaction_hazard:{label:'Pharmacology: interaction hazard',param:'redFlags',field:'redFlags'},
    pharm_adverse_effect:{label:'Pharmacology: adverse-effect recognition',param:'escalation',field:'escalation'},
    pharm_monitoring_action:{label:'Pharmacology: monitoring action',param:'investigations',field:'investigations'},
    pharm_prescription_review:{label:'Pharmacology: prescription review',param:'treatment',field:'treatment'},
    pharm_antidote_escalation:{label:'Pharmacology: antidote or escalation',param:'escalation',field:'escalation'}
  };
  const CARD_TYPE_PLAN=[
    'pharm_indication','pharm_exact_regimen','pharm_dose_modifier',
    'pharm_contraindication_switch','pharm_interaction_hazard',
    'pharm_adverse_effect','pharm_monitoring_action',
    'pharm_prescription_review','pharm_antidote_escalation'
  ];

  let root=null;
  let quiz=null;
  let observing=false;
  let injected=false;

  function core(){return window.UKMLA_V2;}
  function data(){return window.UKMLA_PHARMACOLOGY_DATA;}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function escapeHtml(value){return core().escapeHtml(value);}
  function slug(value,limit=42){return(clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'item').slice(0,limit);}
  function fnv1aBase36(value){
    let result=2166136261;
    for(const char of String(value)){result^=char.codePointAt(0);result=Math.imul(result,16777619)>>>0;}
    return result.toString(36).padStart(7,'0').slice(-7);
  }
  function conditionId(name){return`${TOPIC_ID}-${slug(name)}-${fnv1aBase36(`${TOPIC_ID}|${name}`)}`;}
  function profileItems(){return core().App.conditions.filter(item=>item.profile===PROFILE);}
  function topicRecord(){return core().App.topics.find(topic=>topic.id===TOPIC_ID);}

  function injectData(){
    const api=core();
    const source=data();
    if(!api?.App?.loaded||!source?.cards?.length)return false;
    if(api.App.conditions.some(item=>item.profile===PROFILE)){injected=true;return true;}

    const records=source.cards.map(card=>{
      const fields={
        mimics:clean(card.fields.indication),
        treatment:clean(card.fields.prescribe),
        investigations:clean(card.fields.checkMonitor),
        redFlags:clean(card.fields.interactionsAvoid),
        escalation:clean(card.fields.toxicityAct)
      };
      const metadata={...card};
      delete metadata.name;delete metadata.fields;delete metadata.sourceRefs;delete metadata.section;
      return{
        id:conditionId(card.name),
        topicId:TOPIC_ID,
        topic:TOPIC_NAME,
        name:clean(card.name),
        profile:PROFILE,
        section:clean(card.section),
        fields,
        labels:{...LABELS},
        sourceRefs:Array.isArray(card.sourceRefs)?card.sourceRefs.slice():[],
        checkedDate:source.checkedDate,
        ...metadata,
        search:clean([TOPIC_NAME,card.section,card.name,...Object.values(fields),...(card.sourceRefs||[])].join(' '))
      };
    });

    const topic={id:TOPIC_ID,name:TOPIC_NAME,count:records.length};
    api.App.conditions.push(...records);
    api.App.topics.push(topic);
    api.App.topics.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    api.App.byTopic.set(TOPIC_ID,records);
    for(const record of records)api.App.byId.set(record.id,record);
    if(api.App.data){
      api.App.data.conditionCount=api.App.conditions.length;
      api.App.data.topicCount=api.App.topics.length;
      api.App.data.pharmacologySourceVersion=source.schemaVersion;
      api.App.data.pharmacologyCheckedDate=source.checkedDate;
    }
    injected=true;
    registerTypes();
    api.render();
    return true;
  }

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
    if(!injected||!api||!location.hash.startsWith('#/quiz'))return;
    registerTypes();
    const tabs=document.querySelector('#app .tabs');
    const workspace=document.getElementById('quiz-workspace');
    if(!tabs||!workspace)return;
    let button=tabs.querySelector('[data-quiz-tab="pharmacology"]');
    if(!button){
      button=document.createElement('button');
      button.className='tab';
      button.dataset.quizTab='pharmacology';
      button.textContent='Pharmacology';
      tabs.appendChild(button);
      button.onclick=()=>{
        persistTab('pharmacology');
        tabs.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab===button));
        mount(workspace);
      };
    }
    if(api.App.state.quizTab==='pharmacology'&&!button.classList.contains('active')){
      tabs.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab===button));
      mount(workspace);
    }
  }

  function scopeCards(scope){
    const items=profileItems();
    if(scope==='antimicrobials')return items.filter(item=>item.section==='Antimicrobials'||item.antimicrobial);
    if(scope==='cardiovascular')return items.filter(item=>item.section==='Cardiovascular'||item.section==='Anticoagulation');
    if(scope==='high-risk')return items.filter(item=>['High-risk medicines','Geriatrics & frailty'].includes(item.section));
    if(scope==='paediatrics')return items.filter(item=>item.paediatric);
    if(scope==='topical')return items.filter(item=>item.section==='Topical & dermatology');
    if(scope==='emergency')return items.filter(item=>item.section==='Emergency & acute');
    return items;
  }

  function analyticsHtml(){
    const events=core().events().filter(event=>event.profile===PROFILE||event.source==='pharmacology');
    const answered=events.filter(event=>event.kind==='answered');
    const correct=answered.filter(event=>event.correct).length;
    const calculations=answered.filter(event=>event.calculationRequired).length;
    const typeRows=Object.entries(TYPES).map(([id,meta])=>{
      const rows=answered.filter(event=>event.questionType===id);
      const hits=rows.filter(event=>event.correct).length;
      return{label:meta.label,count:rows.length,accuracy:rows.length?Math.round(hits/rows.length*100):null};
    }).filter(row=>row.count).sort((a,b)=>a.accuracy-b.accuracy).slice(0,4);
    return`<div class="rank-list">
      <div class="rank-row"><span>Cards</span><strong>${profileItems().length}</strong></div>
      <div class="rank-row"><span>Attempts</span><strong>${answered.length}</strong></div>
      <div class="rank-row"><span>Accuracy</span><strong>${answered.length?Math.round(correct/answered.length*100):0}%</strong></div>
      <div class="rank-row"><span>Calculations completed</span><strong>${calculations}</strong></div>
      ${typeRows.map(row=>`<div class="rank-row"><span>${escapeHtml(row.label.replace('Pharmacology: ',''))}</span><strong>${row.accuracy}%</strong></div>`).join('')}
    </div>`;
  }

  function mount(container){
    root=container;
    quiz=null;
    const items=profileItems();
    const calculations=items.filter(item=>item.calculationRequired).length;
    const antimicrobials=items.filter(item=>item.section==='Antimicrobials').length;
    root.innerHTML=`<section class="biomedical-hero"><div><div class="eyebrow">Safe prescribing</div><h2>Clinical Pharmacology &amp; Safe Prescribing</h2><p>Exact regimens, calculations, monitoring, interactions, toxicity and escalation. Verify the live BNF/BNFc and local antimicrobial policy before real prescribing.</p></div><div class="biomedical-counts"><strong>${items.length}</strong><span>five-field cards</span><strong>${calculations}</strong><span>calculation-linked cards</span><strong>${antimicrobials}</strong><span>antimicrobial cards</span></div></section>
    <section class="quiz-layout"><article class="quiz-card"><h2>Local prescribing drill</h2>
      <div class="field"><label>Scope</label><select class="select" id="pharm-scope">
        <option value="mixed">Mixed prescribing · includes calculations</option>
        <option value="calculations">Calculations only</option>
        <option value="cardiovascular">Cardiovascular &amp; anticoagulation</option>
        <option value="antimicrobials">Antimicrobials</option>
        <option value="emergency">Emergency medicines</option>
        <option value="paediatrics">Paediatrics</option>
        <option value="high-risk">High-risk medicines &amp; frailty</option>
        <option value="topical">Topical &amp; dermatology</option>
      </select></div>
      <button class="btn primary" id="pharm-start" style="width:100%;margin-top:16px">Generate 10-question drill</button>
      <button class="btn ghost" id="pharm-ai" style="width:100%;margin-top:9px">Open AI question generator</button>
    </article><aside class="quiz-card"><h2>Tracked performance</h2>${analyticsHtml()}</aside></section>
    <section id="pharm-play" style="margin-top:18px"></section>`;
    root.querySelector('#pharm-start').onclick=()=>startLocal(root.querySelector('#pharm-scope').value);
    root.querySelector('#pharm-ai').onclick=()=>{persistTab('ai');core().App.state.topicId=TOPIC_ID;core().saveJson(core().STORAGE.state,core().App.state);core().render();};
  }

  function questionStem(target,typeId){
    const stems={
      pharm_indication:`Which prescribing situation best matches ${target.name}?`,
      pharm_exact_regimen:`Which prescription is correct for ${target.name}?`,
      pharm_dose_modifier:`Which check or dose modifier is required for ${target.name}?`,
      pharm_contraindication_switch:`Which contraindication or caveat changes the usual plan for ${target.name}?`,
      pharm_interaction_hazard:`Which interaction hazard is most important in ${target.name}?`,
      pharm_adverse_effect:`Which toxicity response is correct for ${target.name}?`,
      pharm_monitoring_action:`Which monitoring action is required for ${target.name}?`,
      pharm_prescription_review:`Which prescription-review action best applies to ${target.name}?`,
      pharm_antidote_escalation:`Which urgent action or escalation best applies to ${target.name}?`
    };
    return stems[typeId]||`Which statement best applies to ${target.name}?`;
  }

  function fieldCandidates(target,field,pool){
    const value=target.fields?.[field];
    let candidates=pool.filter(item=>item.id!==target.id&&item.fields?.[field]&&item.fields[field]!==value);
    const sameSection=candidates.filter(item=>item.section===target.section);
    if(sameSection.length>=4)candidates=sameSection;
    return core().shuffle(candidates);
  }

  function buildCardQuestion(target,typeId,pool,number){
    const meta=TYPES[typeId];
    const correctText=target.fields?.[meta.field];
    if(!correctText)return null;
    const distractors=fieldCandidates(target,meta.field,pool).slice(0,4);
    if(distractors.length<4)return null;
    const options=core().shuffle([
      {text:correctText,conditionId:target.id,conditionName:target.name,topicId:target.topicId,topicName:target.topic,correct:true},
      ...distractors.map(item=>({text:item.fields[meta.field],conditionId:item.id,conditionName:item.name,topicId:item.topicId,topicName:item.topic,correct:false}))
    ]).map((option,index)=>({...option,id:'ABCDE'[index],param:meta.param}));
    return{
      id:`pharm-card-q${number}-${target.id}`,
      questionNumber:number,
      questionType:typeId,
      questionTypeLabel:meta.label,
      param:meta.param,
      topicId:target.topicId,
      topicName:target.topic,
      targetConditionId:target.id,
      targetCondition:target.name,
      profile:PROFILE,
      section:target.section,
      highRiskClass:target.highRiskClass||'',
      calculationRequired:false,
      stem:questionStem(target,typeId),
      leadIn:'Select the single best answer.',
      options,
      correctOptionId:options.find(option=>option.correct).id,
      rationale:`${target.name} — ${target.labels?.[meta.field]||meta.field}: ${correctText}`
    };
  }

  function numberText(value,unit){
    const rounded=Math.abs(value-Math.round(value))<0.0001?String(Math.round(value)):String(Math.round(value*100)/100);
    return`${rounded} ${unit}`;
  }

  function calculationTemplates(){
    const find=name=>profileItems().find(item=>item.name===name)||profileItems()[0];
    const make=(target,stem,correct,distractors,rationale)=>({target,stem,correct,distractors,rationale});
    const crcl=(140-80)*55*1.23/100*0.85;
    return[
      make(find('Paediatric oral-liquid volume'),'A 16 kg child requires 12.5 mg/kg per dose. The liquid contains 250 mg/5 mL. What volume is one dose?',numberText(4,'mL'),['2 mL','8 mL','10 mL','20 mL'],'Dose 200 mg; concentration 50 mg/mL; volume 4 mL.'),
      make(find('Paediatric routine maintenance fluids'),'Calculate routine maintenance for a 28 kg child using Holliday–Segar, expressed hourly.',numberText(69.2,'mL/hour'),['48 mL/hour','58.3 mL/hour','83.3 mL/hour','116.7 mL/hour'],'Daily volume 1000 + 500 + 160 = 1660 mL; divide by 24.'),
      make(find('Paediatric IV fluid bolus'),'An 18 kg child requires a 10 mL/kg isotonic crystalloid bolus. What volume is prescribed?',numberText(180,'mL'),['90 mL','160 mL','360 mL','500 mL'],'18 × 10 = 180 mL, followed by reassessment.'),
      make(find('Adult diabetic ketoacidosis'),'A 62 kg adult needs fixed-rate insulin at 0.1 units/kg/hour. The infusion is 1 unit/mL. What rate is required?',numberText(6.2,'mL/hour'),['0.62 mL/hour','3.1 mL/hour','10 mL/hour','62 mL/hour'],'0.1 × 62 = 6.2 units/hour; at 1 unit/mL this is 6.2 mL/hour.'),
      make(find('Paediatric cardiac-arrest drugs'),'An 18 kg child in cardiac arrest requires adrenaline 10 micrograms/kg. The solution is 0.1 mg/mL. What volume is given?',numberText(1.8,'mL'),['0.18 mL','0.9 mL','18 mL','180 mL'],'Dose 180 micrograms = 0.18 mg; at 0.1 mg/mL the volume is 1.8 mL.'),
      make(find('Cockcroft–Gault creatinine clearance'),'Estimate Cockcroft–Gault CrCl for an 80-year-old woman, weight 55 kg, serum creatinine 100 micromol/L. Use 1.23 and multiply by 0.85 for women.',numberText(crcl,'mL/min'),['24.5 mL/min','40.6 mL/min','53 mL/min','68.9 mL/min'],'(140−80) × 55 × 1.23 ÷ 100 × 0.85 = 34.5 mL/min.'),
      make(find('Fingertip units and topical quantity'),'Both adult legs require 8 fingertip units each per application. One FTU is 0.5 g. How much is needed once daily for 14 days?',numberText(112,'g'),['28 g','56 g','84 g','224 g'],'16 FTU × 0.5 g × 14 = 112 g.'),
      make(find('Percentage, ratio and unit conversion'),'What concentration in mg/mL is a 1% w/v solution?',numberText(10,'mg/mL'),['0.1 mg/mL','1 mg/mL','100 mg/mL','1000 mg/mL'],'1% w/v is 1 g/100 mL = 1000 mg/100 mL = 10 mg/mL.'),
      make(find('Strong opioid prescribing'),'Morphine 5 mg is prescribed every 4 hours when required, with no extra doses. What is the maximum over 24 hours?',numberText(30,'mg'),['20 mg','25 mg','40 mg','120 mg'],'Six four-hourly doses × 5 mg = 30 mg in 24 hours.'),
      make(find('Gentamicin once-daily prescribing'),'A protocol specifies gentamicin 5 mg/kg for a 72 kg adult. What initial dose is calculated before protocol rounding?',numberText(360,'mg'),['72 mg','144 mg','350 mg','500 mg'],'72 × 5 = 360 mg; subsequent dosing depends on renal function and timed levels.'),
      make(find('Infusion-rate calculation'),'A 500 mL crystalloid bolus is to run over 15 minutes. What pump rate gives the prescribed volume?',numberText(2000,'mL/hour'),['500 mL/hour','1000 mL/hour','1500 mL/hour','3000 mL/hour'],'15 minutes is 0.25 hour; 500 ÷ 0.25 = 2000 mL/hour.'),
      make(find('Paediatric bradycardia and tachyarrhythmia'),'A 22 kg child with stable SVT is prescribed adenosine 0.2 mg/kg. What first dose is calculated?',numberText(4.4,'mg'),['2.2 mg','6 mg','11 mg','44 mg'],'22 × 0.2 = 4.4 mg, below the 6 mg maximum.')
    ];
  }

  function buildCalculationQuestion(template,number){
    const target=template.target;
    const optionTexts=core().shuffle([template.correct,...template.distractors]);
    const options=optionTexts.map((text,index)=>({
      id:'ABCDE'[index],text,conditionId:target.id,conditionName:target.name,
      topicId:target.topicId,topicName:target.topic,param:'treatment',correct:text===template.correct
    }));
    return{
      id:`pharm-calc-q${number}-${slug(target.name)}-${fnv1aBase36(template.stem)}`,
      questionNumber:number,
      questionType:'pharm_dose_calculation',
      questionTypeLabel:TYPES.pharm_dose_calculation.label,
      param:'treatment',
      topicId:target.topicId,
      topicName:target.topic,
      targetConditionId:target.id,
      targetCondition:target.name,
      profile:PROFILE,
      section:'Calculations & prescribing',
      highRiskClass:target.highRiskClass||'',
      calculationRequired:true,
      stem:template.stem,
      leadIn:'Select the single best calculated answer.',
      options,
      correctOptionId:options.find(option=>option.correct).id,
      rationale:template.rationale
    };
  }

  function selectPlan(scope){
    const all=profileItems();
    const pool=scopeCards(scope);
    if(scope==='calculations'){
      return core().shuffle(calculationTemplates()).slice(0,10).map((template,index)=>buildCalculationQuestion(template,index+1));
    }
    const baseCalcCount=scope==='paediatrics'?3:scope==='topical'?1:scope==='mixed'?3:2;
    const calcCount=Math.max(baseCalcCount,10-Math.min(pool.length,10-baseCalcCount));
    const cardCount=10-calcCount;
    const targets=core().selectCoverageCandidates(pool,Math.min(cardCount,pool.length),{uniqueTopics:false});
    if(targets.length<cardCount)return[];
    const cardQuestions=targets.map((target,index)=>buildCardQuestion(target,CARD_TYPE_PLAN[index%CARD_TYPE_PLAN.length],all,index+1)).filter(Boolean);
    if(cardQuestions.length!==cardCount)return[];
    let templates=calculationTemplates();
    if(scope==='paediatrics')templates=templates.filter(item=>item.target.paediatric);
    else if(scope==='topical')templates=templates.filter(item=>item.target.section==='Topical & dermatology');
    else if(scope==='cardiovascular')templates=templates.filter(item=>['Cardiovascular','Anticoagulation','Calculations & prescribing'].includes(item.target.section));
    else if(scope==='antimicrobials')templates=templates.filter(item=>item.target.antimicrobial||item.target.section==='Antimicrobials');
    if(templates.length<calcCount)templates=calculationTemplates();
    const calcQuestions=core().shuffle(templates).slice(0,calcCount).map((template,index)=>buildCalculationQuestion(template,cardCount+index+1));
    return core().shuffle([...cardQuestions,...calcQuestions]).map((question,index)=>({...question,questionNumber:index+1}));
  }

  function startLocal(scope){
    const questions=selectPlan(scope);
    if(questions.length!==10){core().toast('Could not build ten distinct pharmacology questions.');return;}
    quiz={id:core().uid('pharmacology-quiz'),source:'pharmacology',scope,questions,index:0,answers:[],correct:0};
    window.UKMLA_QUESTION_BANK?.storeSet({
      schemaVersion:'ukmla-local-pharmacology-v1',
      quizId:quiz.id,
      topic:TOPIC_NAME,
      generatedAt:new Date().toISOString(),
      sourceType:'pharmacology',
      questions
    },{sourceType:'pharmacology',title:`Pharmacology · ${scope}`});
    drawQuestion();
  }

  function logPresented(question){
    const api=core();
    return api.appendEvent({
      id:`present:${quiz.id}:${question.id}`,
      kind:'presented',
      source:'pharmacology',
      quizId:quiz.id,
      questionId:question.id,
      conditionId:question.targetConditionId,
      conditionName:question.targetCondition,
      topicId:question.topicId,
      topicName:question.topicName,
      questionType:question.questionType,
      questionTypeLabel:question.questionTypeLabel,
      profile:PROFILE,
      section:question.section,
      highRiskClass:question.highRiskClass||'',
      calculationRequired:Boolean(question.calculationRequired),
      coverageCycle:api.coverageState().cycle,
      at:new Date().toISOString(),
      topicHealthBefore:api.topicProgress(question.topicName).health
    });
  }

  function logAnswered(question,optionId,correct){
    const api=core();
    return api.appendEvent({
      id:`answer:${quiz.id}:${question.id}`,
      kind:'answered',
      presentationId:`present:${quiz.id}:${question.id}`,
      source:'pharmacology',
      quizId:quiz.id,
      questionId:question.id,
      conditionId:question.targetConditionId,
      conditionName:question.targetCondition,
      topicId:question.topicId,
      topicName:question.topicName,
      questionType:question.questionType,
      questionTypeLabel:question.questionTypeLabel,
      profile:PROFILE,
      section:question.section,
      highRiskClass:question.highRiskClass||'',
      calculationRequired:Boolean(question.calculationRequired),
      selectedOptionId:optionId,
      correctOptionId:question.correctOptionId,
      correct:Boolean(correct),
      at:new Date().toISOString(),
      topicHealthAfter:api.topicProgress(question.topicName).health
    });
  }

  function drawQuestion(){
    if(!quiz||!root)return;
    const container=root.querySelector('#pharm-play');
    const question=quiz.questions[quiz.index];
    const answer=quiz.answers[quiz.index];
    if(!answer)logPresented(question);
    container.innerHTML=`<article class="quiz-card" style="max-width:940px;margin:auto"><div class="topic-meta"><span>Question ${quiz.index+1} of ${quiz.questions.length}</span><span>${escapeHtml(question.questionTypeLabel)}</span></div><div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="--value:${Math.round((quiz.index+1)/quiz.questions.length*100)}%"></div></div><div class="quiz-stem">${escapeHtml(question.stem)}</div><p>${escapeHtml(question.leadIn)}</p><div class="options">${question.options.map(option=>`<button class="option ${answer?(option.id===question.correctOptionId?'correct':option.id===answer.selectedOptionId?'wrong':''):''}" data-pharm-option="${option.id}" ${answer?'disabled':''}><span class="letter">${option.id}</span><span>${escapeHtml(option.text)}</span></button>`).join('')}</div>${answer?`<div class="feedback"><strong>${answer.correct?'Correct.':'Incorrect.'}</strong> ${escapeHtml(question.rationale)}</div><div class="card-actions"><button class="btn" id="pharm-prev" ${quiz.index===0?'disabled':''}>Previous</button><button class="btn primary" id="pharm-next">${quiz.index===quiz.questions.length-1?'Results':'Next'}</button></div>`:''}</article>`;
    container.querySelectorAll('[data-pharm-option]').forEach(button=>button.onclick=()=>answerQuestion(button.dataset.pharmOption));
    container.querySelector('#pharm-prev')?.addEventListener('click',()=>{quiz.index--;drawQuestion();});
    container.querySelector('#pharm-next')?.addEventListener('click',()=>{if(quiz.index===quiz.questions.length-1)drawResult();else{quiz.index++;drawQuestion();}});
  }

  function answerQuestion(optionId){
    const question=quiz.questions[quiz.index];
    if(quiz.answers[quiz.index])return;
    const option=question.options.find(item=>item.id===optionId);
    const correct=core().scoreAnswer(question,option);
    quiz.answers[quiz.index]={selectedOptionId:optionId,correct};
    if(correct)quiz.correct++;
    logAnswered(question,optionId,correct);
    drawQuestion();
  }

  function drawResult(){
    const percent=Math.round(quiz.correct/quiz.questions.length*100);
    const calculations=quiz.questions.filter(item=>item.calculationRequired);
    const calcCorrect=calculations.filter((item,index)=>{
      const absolute=quiz.questions.indexOf(item);
      return quiz.answers[absolute]?.correct;
    }).length;
    root.querySelector('#pharm-play').innerHTML=`<article class="quiz-card" style="max-width:780px;margin:auto;text-align:center"><div class="eyebrow">Prescribing drill complete</div><div class="boast-number" style="margin:28px 0">${quiz.correct}/${quiz.questions.length}</div><h2>${percent}%</h2><p>${calculations.length?`${calcCorrect}/${calculations.length} calculation questions correct. `:''}Topic health, pharmacology question types, card coverage, Question Bank history and analytics have been updated.</p><div class="card-actions" style="justify-content:center"><button class="btn primary" id="pharm-again">Another drill</button><button class="btn" id="pharm-analytics">Open analytics</button></div></article>`;
    root.querySelector('#pharm-again').onclick=()=>mount(root);
    root.querySelector('#pharm-analytics').onclick=()=>core().go('analytics');
  }

  function initialise(){
    if(!injectData())return false;
    registerTypes();
    if(!observing){
      observing=true;
      const app=document.getElementById('app');
      if(app)new MutationObserver(()=>requestAnimationFrame(integrate)).observe(app,{childList:true,subtree:true});
      window.addEventListener('hashchange',()=>setTimeout(integrate,0));
    }
    integrate();
    return true;
  }

  let attempts=0;
  const timer=setInterval(()=>{
    attempts++;
    if(initialise()||attempts>200)clearInterval(timer);
  },50);
  if(document.readyState!=='loading')initialise();
  else document.addEventListener('DOMContentLoaded',initialise,{once:true});

  window.UKMLA_PHARMACOLOGY={
    TOPIC_ID,TOPIC_NAME,PROFILE,TYPES,injectData,profileItems,scopeCards,
    calculationTemplates,buildCalculationQuestion,selectPlan,mount
  };
})();
