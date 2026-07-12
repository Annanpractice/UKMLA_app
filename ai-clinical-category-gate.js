(function(){
  'use strict';

  if(window.__UKMLA_CLINICAL_CATEGORY_GATE__) return;
  window.__UKMLA_CLINICAL_CATEGORY_GATE__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  let runningGate=false;

  const CATEGORIES=[
    'diagnosis',
    'investigation',
    'treatment',
    'contraindication',
    'emergency_management',
    'procedure',
    'referral',
    'escalation_management',
    'disposition_referral'
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

  const CATEGORY_RULES=`\n\nHARD CLINICAL-CATEGORY LOCK — THIS IS MANDATORY FOR EVERY QUESTION:\nThe lead-in and all five answer options must belong to one single semantic clinical category. Never mix diagnoses, investigations, treatments, contraindications, procedures, referrals or dispositions in the same option set. The category is determined as follows:\n- sparse_most_likely_diagnosis: answerCategory = diagnosis; all five options are candidate diagnoses only.\n- close_mimic_discrimination: answerCategory = diagnosis; all five options are candidate diagnoses only.\n- first_line_investigation: answerCategory = investigation; all five options are tests or investigations only.\n- dangerous_diagnosis_priority_exclusion: answerCategory = diagnosis; all five options are dangerous or plausible diagnoses to exclude, not tests or treatments.\n- next_step_after_initial_result: choose exactly one answerCategory from investigation, treatment, procedure or referral before writing the options; all five options must remain in that chosen category.\n- immediate_emergency_management: answerCategory = emergency_management; all five options are immediate stabilising interventions or management actions only.\n- stable_first_line_treatment: answerCategory = treatment; all five options are treatments only.\n- contraindication_caveat_switch: answerCategory = contraindication; all five options are patient factors, clinical circumstances or treatment caveats that would contraindicate or alter the standard pathway. Do not use candidate diagnoses or treatment choices as the option category. A medical condition may appear only when it is framed as the contraindicating circumstance.\n- failure_or_deterioration: answerCategory = escalation_management; all five options are escalation or step-up management actions only.\n- escalation_referral_disposition: answerCategory = disposition_referral; all five options are referral, admission, transfer, discharge or follow-up dispositions only.\n\nThe lead-in must explicitly ask for that category: diagnosis, investigation, treatment, contraindicating factor, immediate management, escalation step or disposition. All five options must also be at the same level of abstraction. Regenerate any item where even one option belongs to a different category.`;

  const CATEGORY_SYSTEM=`You are the final clinical-category editor for a UKMLA SBA set. Return the complete ten-question set in exactly the supplied JSON schema and nothing else. For every question, verify that the lead-in and all five options answer one single clinical category. Repair category drift even when the wording is otherwise good. Preserve the target condition, question type, tested learning point, correct clinical meaning, rationale, hidden topic/condition/param metadata and correct-answer mapping.\n\nCategory rules:\n1 and 2: diagnoses only.\n3: investigations only.\n4: diagnoses to exclude only.\n5: choose one of investigation, treatment, procedure or referral and use only that category.\n6: immediate emergency-management actions only.\n7: treatments only.\n8: contraindicating factors/caveats only; not candidate diagnoses or treatment choices.\n9: escalation-management actions only.\n10: disposition/referral options only.\n\nThe answerCategory field must truthfully describe the visible options. If the lead-in and options do not match, rewrite them. Do not alter a correct answer merely to satisfy wording; rewrite the surrounding distractors and lead-in around the preserved clinical answer. Keep stems sparse and options short.`;

  function emit(message,detail){
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message,detail:detail||null}}));
  }

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function outputText(data){
    if(data&&typeof data.output_text==='string') return data.output_text;
    for(const item of (data&&data.output)||[]){
      for(const content of item.content||[]){
        if(content&&content.type==='output_text'&&typeof content.text==='string') return content.text;
      }
    }
    return '';
  }

  function formatName(body){
    return body&&body.text&&body.text.format&&body.text.format.name||'';
  }

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

  function clean(value){
    return String(value||'').replace(/\s+/g,' ').trim();
  }

  function audit(raw){
    let set;
    try{set=JSON.parse(raw);}catch{return {set:null,issues:['Clinical-category output was not valid JSON.']};}
    const issues=[];
    const questions=questionsOf(set);
    if(questions.length!==10) issues.push(`Expected 10 questions; received ${questions.length}.`);
    questions.forEach((question,index)=>{
      const number=question.questionNumber||index+1;
      const allowed=EXPECTED[question.questionType]||[];
      const category=clean(question.answerCategory);
      if(!category) issues.push(`Q${number}: answerCategory is missing.`);
      else if(allowed.length&&!allowed.includes(category)) issues.push(`Q${number}: ${question.questionType} cannot use answerCategory ${category}.`);
      const lead=clean(question.leadIn);
      if(!lead) issues.push(`Q${number}: lead-in is missing.`);
      else if(category==='diagnosis'&&!/(diagnos|condition|cause)/i.test(lead)) issues.push(`Q${number}: diagnosis options but the lead-in does not ask for a diagnosis.`);
      else if(category==='investigation'&&!/(investigat|test|imaging|scan)/i.test(lead)) issues.push(`Q${number}: investigation options but the lead-in does not ask for an investigation.`);
      else if(category==='treatment'&&!/(treat|therapy|drug|medication|management)/i.test(lead)) issues.push(`Q${number}: treatment options but the lead-in does not ask for treatment.`);
      else if(category==='contraindication'&&!/(contraindicat|factor|feature|circumstance|unsafe|avoid|preclude)/i.test(lead)) issues.push(`Q${number}: contraindication options but the lead-in does not ask for a contraindicating factor.`);
      else if(category==='disposition_referral'&&!/(disposition|refer|admit|transfer|discharge|follow.?up|setting|urgency)/i.test(lead)) issues.push(`Q${number}: disposition options but the lead-in does not ask for disposition or referral.`);
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
        {role:'user',content:[{type:'input_text',text:`Clinical-category rules:\n${CATEGORY_RULES}\n\nCurrent ten-question set:\n${raw}\n\nDetected category issues:\n${issues.length?issues.join('\n'):'Perform a full semantic category review even though no mechanical mismatch was detected.'}`}]}],
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
    emit('Running the clinical-category checkpoint on all ten questions…',initial.issues);
    let bestData=await runPass(body,raw,headers,initial.issues);
    if(!bestData){
      emit('Clinical-category checkpoint could not complete; preserving the prior validated set.');
      return response;
    }

    let bestRaw=outputText(bestData);
    let bestAudit=audit(bestRaw);
    if(bestAudit.issues.length){
      emit(`Clinical-category checkpoint found ${bestAudit.issues.length} remaining mismatch${bestAudit.issues.length===1?'':'es'}; correcting once more…`,bestAudit.issues);
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
    if(bestAudit.issues.length===0) emit('Clinical-category checkpoint passed: each option set matches its lead-in.');
    else emit(`Clinical-category checkpoint completed with ${bestAudit.issues.length} residual warning${bestAudit.issues.length===1?'':'s'}.`,bestAudit.issues);

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
