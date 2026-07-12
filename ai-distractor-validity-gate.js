(function(){
  'use strict';

  if(window.__UKMLA_DISTRACTOR_VALIDITY_GATE__) return;
  window.__UKMLA_DISTRACTOR_VALIDITY_GATE__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  let runningGate=false;

  const DOMAINS=[
    'cardiovascular','respiratory','cardiorespiratory','gastrointestinal','hepatobiliary','renal_urology',
    'endocrine_metabolic','haematology','oncology','neurology','psychiatry','musculoskeletal',
    'rheumatology','dermatology','infectious_disease','obstetrics','gynaecology','paediatrics',
    'ophthalmology','ent','surgery_trauma','emergency_general','ethics_law','public_health','mixed_system'
  ];

  const RELEVANCE_CLASSES=[
    'correct_answer','close_mimic','same_presentation_alternative','same_pathway_wrong_stage','same_treatment_class',
    'same_investigation_family','same_contraindication_family','same_escalation_scale','same_disposition_scale',
    'same_legal_issue_family','same_authority_family','same_lawful_action_family','same_documentation_escalation'
  ];

  const DISTRACTOR_RULES=`\n\nHARD DISTRACTOR-VALIDITY LOCK — MANDATORY FOR EVERY QUESTION:\nEvery distractor must be a genuine competitor for this exact patient, presentation, decision point and answer category. An option is invalid if a competent final-year medical student could dismiss it immediately because it concerns an unrelated organ system, unrelated procedure, impossible demographic, wrong care setting or wholly irrelevant pathway.\n\nGENERAL CLINICAL RULES:\n1. SAME CLINICAL FRAME: Define one hidden clinicalDomain and one hidden decisionFrame for the question. All five options must plausibly belong to that frame. Cross-system options are allowed only when they are genuine differentials or competing actions for the same presentation.\n2. REAL COMPETITORS: At least three of the four distractors must remain genuinely plausible until the decisive clue, timing, contraindication, severity threshold or pathway stage is applied. The fourth may be less likely but must still be relevant.\n3. NO ABSURD DECOYS: Do not use an unrelated examination, investigation, treatment or diagnosis merely because it matches the grammatical category.\n4. MATCH THE DECISION POINT:\n- diagnosis questions: use close differentials for the same presentation and demographic;\n- investigation questions: use tests a clinician might reasonably consider for that presentation at that stage;\n- treatment questions: use plausible treatments for the same condition or close mimic at the same severity;\n- contraindication questions: use real potential contraindicating factors for the actual proposed treatment/pathway;\n- emergency-management questions: use competing immediate actions in the same emergency;\n- escalation/disposition questions: use realistic alternatives along the same urgency or destination scale.\n\nWARD LAW, ETHICS AND PROFESSIONAL PRACTICE OVERRIDE:\nWhen question.topic is “Ward law, ethics and professional practice” or clinicalDomain is ethics_law, ignore the clinical wording implied by the internal questionType name. Do not convert the options into disease diagnoses, diagnostic tests or unrelated treatments. Use the question’s answerCategory and ward scenario instead:\n- legal_issue: close legal, ethical, safeguarding or professional issues that could plausibly fit the same facts;\n- legal_rule: competing legal or professional principles that a knowledgeable student might confuse;\n- authority_check: plausible documents, capacity checks, consent checks, legal authorities or verification steps;\n- lawful_action: realistic ward actions at the same stage, including less-restrictive or proportionate alternatives;\n- documentation_escalation: realistic records, senior referrals, safeguarding, information-governance, legal, statutory or court escalation routes.\nAll five options must remain within the same UK jurisdictional frame unless jurisdiction itself is the discriminator. An England-and-Wales statute is not a valid universal distractor for an unspecified Scottish scenario unless the question explicitly tests the jurisdiction difference.\n\nSAME LEVEL OF ABSTRACTION: Do not mix a broad strategy with a specific procedure, a general principle with a narrow statute, or a routine ward action with an extreme court intervention unless the decision point makes each genuinely plausible.\n\nHIDDEN JUSTIFICATION: Each option must include hidden clinicalDomain, relevanceClass and plausibilityReason metadata. For the correct option use relevanceClass = correct_answer. For every distractor, plausibilityReason must state briefly why a knowledgeable candidate might consider it before applying the decisive clue.\n\nREBUILD INVALID ITEMS: If even one distractor is irrelevant, replace it. If fewer than three strong competitors can be created, rebuild the entire question rather than padding the set with nonsense.`;

  const REVIEW_SYSTEM=`You are the final distractor-validity editor for a very difficult UKMLA SBA set. Return the complete ten-question set in exactly the supplied JSON schema and nothing else. Review each option as a senior UK medical educator. Category matching alone is not enough. A distractor must be credible for the exact vignette, demographic, care setting, decision point and pathway stage.\n\nReject and replace unrelated-organ-system options, impossible investigations, treatments for unrelated diseases, diagnoses outside a credible differential, irrelevant contraindications, actions at the wrong stage and absurd decoys.\n\nFor “Ward law, ethics and professional practice”, use ethics_law as the clinicalDomain and judge credibility within the legal/professional frame. Preserve legal issues as legal issues, authority checks as authority checks, lawful actions as lawful actions, and documentation/escalation responses as documentation/escalation responses. Never repair a valid legal SBA into a disease-diagnosis, diagnostic-test or drug-treatment question merely because of its internal questionType identifier.\n\nAt least three distractors per item must be strong competitors. Preserve the target condition, source anchor, answer category, question type, correct clinical or legal answer, concise wording, hidden scoring metadata and correct-answer mapping. Rewrite distractors, lead-in or the whole item when needed. Keep visible options short. Hidden plausibilityReason text may be longer but must remain concise and specific.`;

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
      question.properties.clinicalDomain={type:'string',enum:DOMAINS};
      question.properties.decisionFrame={type:'string'};
      question.required=Array.isArray(question.required)?question.required:[];
      for(const field of ['clinicalDomain','decisionFrame']) if(!question.required.includes(field)) question.required.push(field);
      const option=question.properties?.options?.items;
      if(option&&option.properties){
        option.properties.clinicalDomain={type:'string',enum:DOMAINS};
        option.properties.relevanceClass={type:'string',enum:RELEVANCE_CLASSES};
        option.properties.plausibilityReason={type:'string'};
        option.required=Array.isArray(option.required)?option.required:[];
        for(const field of ['clinicalDomain','relevanceClass','plausibilityReason']) if(!option.required.includes(field)) option.required.push(field);
      }
    }

    let added=false;
    for(const item of body.input||[]){
      if(item.role!=='user') continue;
      for(const content of item.content||[]){
        if(content.type!=='input_text'||typeof content.text!=='string') continue;
        if(!content.text.includes('HARD DISTRACTOR-VALIDITY LOCK')) content.text+=DISTRACTOR_RULES;
        added=true;
      }
    }
    if(!added){
      body.input=Array.isArray(body.input)?body.input:[];
      body.input.push({role:'user',content:[{type:'input_text',text:DISTRACTOR_RULES.trim()}]});
    }
    return body;
  }

  function questionsOf(set){
    if(Array.isArray(set)) return set;
    return set&&Array.isArray(set.questions)?set.questions:[];
  }

  function clean(value){ return String(value||'').replace(/\s+/g,' ').trim(); }

  function audit(raw){
    let set;
    try{set=JSON.parse(raw);}catch{return {issues:['Distractor-validity output was not valid JSON.']};}
    const issues=[];
    const questions=questionsOf(set);
    if(questions.length!==10) issues.push(`Expected 10 questions; received ${questions.length}.`);

    questions.forEach((question,index)=>{
      const number=question.questionNumber||index+1;
      const domain=clean(question.clinicalDomain);
      const frame=clean(question.decisionFrame);
      if(!domain) issues.push(`Q${number}: clinicalDomain is missing.`);
      if(!frame||frame.length<8) issues.push(`Q${number}: decisionFrame is missing or too vague.`);
      if(clean(question.topic)==='Ward law, ethics and professional practice'&&domain!=='ethics_law') issues.push(`Q${number}: ward-law question must use clinicalDomain ethics_law.`);
      const options=Array.isArray(question.options)?question.options:[];
      if(options.length!==5){ issues.push(`Q${number}: exactly five options are required.`); return; }
      let correctCount=0;
      let plausibleDistractors=0;
      options.forEach((option,optionIndex)=>{
        const letter=option.id||String.fromCharCode(65+optionIndex);
        const optionDomain=clean(option.clinicalDomain);
        const relevance=clean(option.relevanceClass);
        const reason=clean(option.plausibilityReason);
        if(!optionDomain) issues.push(`Q${number}${letter}: clinicalDomain is missing.`);
        else if(domain&&optionDomain!==domain&&domain!=='mixed_system'&&domain!=='cardiorespiratory') issues.push(`Q${number}${letter}: option domain ${optionDomain} does not match question domain ${domain}.`);
        if(!relevance) issues.push(`Q${number}${letter}: relevanceClass is missing.`);
        if(relevance==='correct_answer') correctCount+=1;
        else if(reason.length>=12&&!/irrelevant|obviously wrong|random|unrelated/i.test(reason)) plausibleDistractors+=1;
        if(!reason||reason.length<8) issues.push(`Q${number}${letter}: plausibilityReason is missing or too vague.`);
      });
      if(correctCount!==1) issues.push(`Q${number}: exactly one option must have relevanceClass correct_answer.`);
      if(plausibleDistractors<3) issues.push(`Q${number}: fewer than three distractors have specific plausibility justifications.`);
    });
    return {issues};
  }

  function checkpointBody(originalBody,raw,issues){
    const text=clone(originalBody.text||{});
    text.format=clone((originalBody.text&&originalBody.text.format)||{});
    text.format.name='ukmla_distractor_validity_checkpoint';
    return {
      model:originalBody.model||'gpt-5-mini',
      input:[
        {role:'system',content:[{type:'input_text',text:REVIEW_SYSTEM}]},
        {role:'user',content:[{type:'input_text',text:`Distractor-validity rules:\n${DISTRACTOR_RULES}\n\nCurrent ten-question set:\n${raw}\n\nDetected issues:\n${issues.length?issues.join('\n'):'Perform a full semantic distractor review even though the metadata audit found no mechanical defect.'}`}]}],
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
    emit('Running the distractor-validity checkpoint on all ten questions…',initial.issues);
    let bestData=await runPass(body,raw,headers,initial.issues);
    if(!bestData){
      emit('Distractor-validity checkpoint could not complete; preserving the prior validated set.');
      return response;
    }

    let bestRaw=outputText(bestData);
    let bestAudit=audit(bestRaw);
    if(bestAudit.issues.length){
      emit(`Distractor review found ${bestAudit.issues.length} remaining issue${bestAudit.issues.length===1?'':'s'}; correcting once more…`,bestAudit.issues);
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

    window.__ukmlaLastDistractorValidityAudit={passed:bestAudit.issues.length===0,issues:bestAudit.issues};
    if(bestAudit.issues.length===0) emit('Distractor-validity checkpoint passed: all options are credible within their decision frame.');
    else emit(`Distractor-validity checkpoint completed with ${bestAudit.issues.length} residual warning${bestAudit.issues.length===1?'':'s'}.`,bestAudit.issues);

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
