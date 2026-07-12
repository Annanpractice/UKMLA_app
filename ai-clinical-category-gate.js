(function(){
  'use strict';

  if(window.__UKMLA_CLINICAL_CATEGORY_GATE__) return;
  window.__UKMLA_CLINICAL_CATEGORY_GATE__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const LAW_TOPIC='Ward law, ethics and professional practice';
  let runningGate=false;

  const CATEGORIES=[
    'diagnosis','investigation','treatment','contraindication','emergency_management','procedure','referral','escalation_management','disposition_referral',
    'legal_issue','legal_rule','authority_check','lawful_action','documentation_escalation','unsafe_action'
  ];

  const EXPECTED={
    sparse_most_likely_diagnosis:['diagnosis'],
    close_mimic_discrimination:['diagnosis'],
    first_line_investigation:['investigation'],
    dangerous_diagnosis_priority_exclusion:['diagnosis'],
    next_step_after_initial_result:['investigation','treatment','procedure','referral'],
    immediate_emergency_management:['emergency_management'],
    stable_first_line_treatment:['treatment'],
    contraindication_caveat_switch:['contraindication'],
    failure_or_deterioration:['escalation_management'],
    escalation_referral_disposition:['disposition_referral']
  };

  const LAW_EXPECTED=[
    ['legal_issue'],
    ['legal_issue'],
    ['authority_check','legal_rule'],
    ['legal_issue'],
    ['lawful_action'],
    ['lawful_action'],
    ['lawful_action'],
    ['legal_rule','authority_check'],
    ['documentation_escalation'],
    ['documentation_escalation']
  ];

  const CATEGORY_RULES=`\n\nHARD CLINICAL-CATEGORY LOCK — THIS IS MANDATORY FOR EVERY QUESTION:\nThe lead-in and all five answer options must belong to one single semantic category. Never mix diagnoses, investigations, treatments, contraindications, procedures, referrals or dispositions in the same option set.\n\nSTANDARD CLINICAL TOPICS:\n- sparse_most_likely_diagnosis: diagnosis only.\n- close_mimic_discrimination: diagnosis only.\n- first_line_investigation: investigation only.\n- dangerous_diagnosis_priority_exclusion: diagnosis only.\n- next_step_after_initial_result: choose one of investigation, treatment, procedure or referral and keep all five options in it.\n- immediate_emergency_management: emergency-management actions only.\n- stable_first_line_treatment: treatments only.\n- contraindication_caveat_switch: contraindicating factors or caveats only.\n- failure_or_deterioration: escalation-management actions only.\n- escalation_referral_disposition: disposition or referral options only.\n\nWARD LAW, ETHICS AND PROFESSIONAL PRACTICE TOPIC:\nDo not force legal scenarios into diagnosis, investigation or treatment categories. Use the question position to select the category:\n1. legal_issue — five plausible legal/professional issues.\n2. legal_issue — five close legal or ethical alternatives.\n3. authority_check or legal_rule — five checks, documents, authorities or governing rules; not diagnostic tests.\n4. legal_issue — five plausible priority legal, safeguarding or patient-safety risks; not disease diagnoses.\n5. lawful_action — five competing lawful ward actions.\n6. lawful_action — five immediate necessary, proportionate or least-restrictive actions.\n7. lawful_action — five standard professional actions.\n8. legal_rule or authority_check — five capacity, voluntariness, confidentiality, authority, proportionality or jurisdiction caveats.\n9. documentation_escalation — five realistic documentation or senior-escalation responses.\n10. documentation_escalation — five senior, legal, safeguarding, governance, statutory or court escalation options.\n\nFor every topic, the lead-in must explicitly ask for the selected category and all five options must remain at the same level of abstraction. Regenerate any item where even one option belongs to a different category.`;

  const CATEGORY_SYSTEM=`You are the final semantic-category editor for a very difficult UKMLA SBA set. Return the complete ten-question set in exactly the supplied JSON schema and nothing else. For every question, verify that the lead-in and all five options answer one single category. Repair category drift even when the wording is otherwise good. Preserve the target condition, question type, tested learning point, correct clinical or legal meaning, rationale, hidden topic/condition/param metadata and correct-answer mapping.\n\nFor ordinary clinical topics, apply the diagnosis/investigation/treatment/contraindication/emergency/escalation/disposition mapping in the supplied rules.\n\nFor the topic “Ward law, ethics and professional practice”, use legal_issue, legal_rule, authority_check, lawful_action or documentation_escalation according to question position. Never turn a legal scenario into a disease-diagnosis question, diagnostic-investigation list or unrelated treatment list.\n\nThe answerCategory field must truthfully describe the visible options. If the lead-in and options do not match, rewrite them. Do not alter a correct answer merely to satisfy wording; rewrite the surrounding distractors and lead-in around the preserved answer. Keep stems sparse and options short.`;

  function emit(message,detail){
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message,detail:detail||null}}));
  }

  function clone(value){ return JSON.parse(JSON.stringify(value)); }

  function outputText(data){
    if(data&&typeof data.output_text==='string') return data.output_text;
    for(const item of (data&&data.output)||[]){
      for(const content of item.content||[]){
        if(content&&content.type==='output_text'&&typeof content.text==='string') return content.text;
      }
    }
    return '';
  }

  function formatName(body){ return body&&body.text&&body.text.format&&body.text.format.name||''; }

  function augmentSchema(body){
    const format=body&&body.text&&body.text.format;
    if(!format||format.name!=='ukmla_ai_quiz'||!format.schema) return body;
    const question=format.schema?.properties?.questions?.items;
    if(question&&question.properties){
      question.properties.answerCategory={type:'string',enum:CATEGORIES};
      question.required=Array.isArray(question.required)?question.required:[];
      if(!question.required.includes('answerCategory')) question.required.push('answerCategory');
    }
    let added=false;
    for(const item of body.input||[]){
      if(item.role!=='user') continue;
      for(const content of item.content||[]){
        if(content.type!=='input_text'||typeof content.text!=='string') continue;
        if(!content.text.includes('HARD CLINICAL-CATEGORY LOCK')) content.text+=CATEGORY_RULES;
        added=true;
      }
    }
    if(!added){
      body.input=Array.isArray(body.input)?body.input:[];
      body.input.push({role:'user',content:[{type:'input_text',text:CATEGORY_RULES.trim()}]});
    }
    return body;
  }

  function questionsOf(set){
    if(Array.isArray(set)) return set;
    return set&&Array.isArray(set.questions)?set.questions:[];
  }

  function clean(value){ return String(value||'').replace(/\s+/g,' ').trim(); }

  function isLawQuestion(question){
    return clean(question&&question.topic)===LAW_TOPIC||question&&question.contentProfile==='ward_law_ethics';
  }

  function allowedFor(question,index){
    if(isLawQuestion(question)) return LAW_EXPECTED[index]||[];
    return EXPECTED[question.questionType]||[];
  }

  function leadMatches(category,lead){
    const patterns={
      diagnosis:/(diagnos|condition|cause)/i,
      investigation:/(investigat|test|imaging|scan)/i,
      treatment:/(treat|therapy|drug|medication|management)/i,
      contraindication:/(contraindicat|factor|feature|circumstance|unsafe|avoid|preclude)/i,
      disposition_referral:/(disposition|refer|admit|transfer|discharge|follow.?up|setting|urgency)/i,
      legal_issue:/(issue|principle|concern|problem|risk|applies|most relevant)/i,
      legal_rule:/(rule|principle|law|framework|requirement|applies)/i,
      authority_check:/(check|verify|document|authority|capacity|consent|proxy|decision|information)/i,
      lawful_action:/(action|act|do next|response|management|step)/i,
      documentation_escalation:/(record|document|escalat|refer|seek advice|inform|report|notify)/i,
      unsafe_action:/(avoid|unsafe|must not|inappropriate)/i
    };
    return !patterns[category]||patterns[category].test(lead);
  }

  function audit(raw){
    let set;
    try{set=JSON.parse(raw);}catch{return {set:null,issues:['Clinical-category output was not valid JSON.']};}
    const issues=[];
    const questions=questionsOf(set);
    if(questions.length!==10) issues.push(`Expected 10 questions; received ${questions.length}.`);
    questions.forEach((question,index)=>{
      const number=question.questionNumber||index+1;
      const allowed=allowedFor(question,index);
      const category=clean(question.answerCategory);
      if(!category) issues.push(`Q${number}: answerCategory is missing.`);
      else if(allowed.length&&!allowed.includes(category)) issues.push(`Q${number}: this question cannot use answerCategory ${category}.`);
      const lead=clean(question.leadIn);
      if(!lead) issues.push(`Q${number}: lead-in is missing.`);
      else if(category&&!leadMatches(category,lead)) issues.push(`Q${number}: the lead-in does not clearly ask for ${category}.`);
      const options=Array.isArray(question.options)?question.options:[];
      if(options.length!==5) issues.push(`Q${number}: exactly five options are required.`);
    });
    return {set,issues};
  }

  function checkpointBody(originalBody,raw,issues){
    const text=clone(originalBody.text||{});
    text.format=clone((originalBody.text&&originalBody.text.format)||{});
    text.format.name='ukmla_clinical_category_checkpoint';
    return {
      model:originalBody.model||'gpt-5-mini',
      input:[
        {role:'system',content:[{type:'input_text',text:CATEGORY_SYSTEM}]},
        {role:'user',content:[{type:'input_text',text:`Semantic-category rules:\n${CATEGORY_RULES}\n\nCurrent ten-question set:\n${raw}\n\nDetected category issues:\n${issues.length?issues.join('\n'):'Perform a full semantic category review even though no mechanical mismatch was detected.'}`}]}],
      text
    };
  }

  async function runPass(originalBody,raw,headers,issues){
    runningGate=true;
    try{
      const response=await previousFetch(API,{method:'POST',headers,body:JSON.stringify(checkpointBody(originalBody,raw,issues))});
      if(!response.ok) return null;
      const data=await response.json();
      return outputText(data)?data:null;
    }finally{
      runningGate=false;
    }
  }

  async function applyGate(response,body,headers){
    let originalData;
    try{originalData=await response.clone().json();}catch{return response;}
    const raw=outputText(originalData);
    if(!raw) return response;

    const initial=audit(raw);
    emit('Running the semantic answer-category checkpoint on all ten questions…',initial.issues);
    let bestData=await runPass(body,raw,headers,initial.issues);
    if(!bestData){
      emit('Answer-category checkpoint could not complete; preserving the prior validated set.');
      return response;
    }

    let bestRaw=outputText(bestData);
    let bestAudit=audit(bestRaw);
    if(bestAudit.issues.length){
      emit(`Answer-category checkpoint found ${bestAudit.issues.length} remaining mismatch${bestAudit.issues.length===1?'':'es'}; correcting once more…`,bestAudit.issues);
      const retry=await runPass(body,bestRaw,headers,bestAudit.issues);
      if(retry){
        const retryRaw=outputText(retry);
        const retryAudit=audit(retryRaw);
        if(retryAudit.issues.length<=bestAudit.issues.length){
          bestData=retry;
          bestRaw=retryRaw;
          bestAudit=retryAudit;
        }
      }
    }

    window.__ukmlaLastClinicalCategoryAudit={passed:bestAudit.issues.length===0,issues:bestAudit.issues};
    if(bestAudit.issues.length===0) emit('Answer-category checkpoint passed: every option set matches its lead-in.');
    else emit(`Answer-category checkpoint completed with ${bestAudit.issues.length} residual warning${bestAudit.issues.length===1?'':'s'}.`,bestAudit.issues);

    return new Response(JSON.stringify(bestData),{
      status:response.status,
      statusText:response.statusText,
      headers:{'Content-Type':'application/json'}
    });
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(runningGate||url!==API||!init||String(init.method||'GET').toUpperCase()!=='POST') return previousFetch(input,init);
    let body;
    try{body=JSON.parse(init.body||'{}');}catch{return previousFetch(input,init);}
    if(formatName(body)!=='ukmla_ai_quiz') return previousFetch(input,init);

    body=augmentSchema(body);
    const response=await previousFetch(input,Object.assign({},init,{body:JSON.stringify(body)}));
    if(!response.ok) return response;
    return applyGate(response,body,init.headers);
  };
})();
