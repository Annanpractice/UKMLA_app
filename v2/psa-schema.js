(function(){
  'use strict';

  const SECTIONS=[
    {id:'prescribing',label:'Prescribing',officialCount:8,marks:10,totalMarks:80,responseMode:'prescription',timeMinutes:44},
    {id:'prescription_review',label:'Prescription review',officialCount:8,marks:4,totalMarks:32,responseMode:'multi_select',timeMinutes:18},
    {id:'planning_management',label:'Planning management',officialCount:8,marks:2,totalMarks:16,responseMode:'single_select',timeMinutes:9},
    {id:'providing_information',label:'Providing information',officialCount:6,marks:2,totalMarks:12,responseMode:'single_select',timeMinutes:7},
    {id:'calculation',label:'Calculation skills',officialCount:8,marks:2,totalMarks:16,responseMode:'numeric',timeMinutes:9},
    {id:'adverse_reactions',label:'Adverse drug reactions',officialCount:8,marks:2,totalMarks:16,responseMode:'single_select',timeMinutes:9},
    {id:'drug_monitoring',label:'Drug monitoring',officialCount:8,marks:2,totalMarks:16,responseMode:'single_select',timeMinutes:9},
    {id:'data_interpretation',label:'Data interpretation',officialCount:6,marks:2,totalMarks:12,responseMode:'single_select',timeMinutes:7}
  ];
  const HIGH_RISK=['Anticoagulants','Antibiotics','Insulin','Opioids','Intravenous fluids','Methotrexate','Lithium','Aminoglycosides','Digoxin','Steroids','Other'];
  const DOMAINS=['Medicine','Surgery','Older adult medicine','Paediatrics','Psychiatry','Obstetrics and gynaecology','General practice','Emergency medicine'];
  const GENERATION_STAGES=[
    {id:'generate',label:'Generate section items',percent:34},
    {id:'clinical_audit',label:'Clinical and prescribing accuracy audit',percent:67},
    {id:'rubric_audit',label:'Mark scheme and answerability audit',percent:100}
  ];
  const MARKING_STAGES=[
    {id:'local',label:'Deterministic objective marking',percent:18},
    {id:'primary',label:'Primary rubric marking',percent:52},
    {id:'safety',label:'Independent safety-critical audit',percent:78},
    {id:'adjudication',label:'Disagreement adjudication',percent:94},
    {id:'final',label:'Final marks and analytics',percent:100}
  ];

  function section(id){return SECTIONS.find(item=>item.id===id);}
  function countsForMode(mode,sectionId,count){
    if(mode==='full')return Object.fromEntries(SECTIONS.map(item=>[item.id,item.officialCount]));
    if(mode==='half')return{prescribing:4,prescription_review:4,planning_management:4,providing_information:3,calculation:4,adverse_reactions:4,drug_monitoring:4,data_interpretation:3};
    return{[sectionId]:Math.max(1,Math.min(Number(count)||5,10))};
  }
  function timeForMode(mode,counts){
    if(mode==='full')return 120*60;
    if(mode==='half')return 60*60;
    const itemCount=Object.values(counts).reduce((sum,value)=>sum+value,0);
    return itemCount*120;
  }

  function prescriptionSchema(){return{type:'object',additionalProperties:false,required:['medicine','formulation','strength','dose','route','frequency','duration','instructions'],properties:{medicine:{type:'string'},formulation:{type:'string'},strength:{type:'string'},dose:{type:'string'},route:{type:'string'},frequency:{type:'string'},duration:{type:'string'},instructions:{type:'string'}}};}
  function expectedSchema(){return{type:'object',additionalProperties:false,required:['optionIds','numericValue','numericTolerance','acceptedUnits','prescription','reviewIds','shortText'],properties:{optionIds:{type:'array',items:{type:'string'}},numericValue:{anyOf:[{type:'number'},{type:'null'}]},numericTolerance:{anyOf:[{type:'number'},{type:'null'}]},acceptedUnits:{type:'array',items:{type:'string'}},prescription:prescriptionSchema(),reviewIds:{type:'array',items:{type:'string'}},shortText:{type:'string'}}};}
  function itemSchema(sectionId){
    const meta=section(sectionId);
    return{type:'object',additionalProperties:false,required:['id','sectionId','sectionLabel','marks','clinicalDomain','highRiskClass','stem','context','responseMode','options','medicationList','expectedAnswer','markingRubric','safetyCriticalErrors','bnfTargets','rationale','modelAnswer'],properties:{
      id:{type:'string'},sectionId:{type:'string',enum:[meta.id]},sectionLabel:{type:'string',enum:[meta.label]},marks:{type:'integer',enum:[meta.marks]},clinicalDomain:{type:'string',enum:DOMAINS},highRiskClass:{type:'string',enum:HIGH_RISK},stem:{type:'string'},context:{type:'string'},responseMode:{type:'string',enum:[meta.responseMode]},
      options:{type:'array',items:{type:'object',additionalProperties:false,required:['id','text'],properties:{id:{type:'string'},text:{type:'string'}}}},
      medicationList:{type:'array',items:{type:'object',additionalProperties:false,required:['id','drug','directions','note'],properties:{id:{type:'string'},drug:{type:'string'},directions:{type:'string'},note:{type:'string'}}}},
      expectedAnswer:expectedSchema(),
      markingRubric:{type:'array',minItems:1,items:{type:'object',additionalProperties:false,required:['criterion','marks','safetyCritical'],properties:{criterion:{type:'string'},marks:{type:'integer',minimum:1,maximum:10},safetyCritical:{type:'boolean'}}}},
      safetyCriticalErrors:{type:'array',items:{type:'string'}},bnfTargets:{type:'array',minItems:1,items:{type:'string'}},rationale:{type:'string'},modelAnswer:{type:'string'}
    }};
  }
  function batchSchema(sectionId,count){return{type:'object',additionalProperties:false,required:['schemaVersion','sectionId','sectionLabel','items'],properties:{schemaVersion:{type:'string',enum:['ukmla-psa-section-v1']},sectionId:{type:'string',enum:[sectionId]},sectionLabel:{type:'string',enum:[section(sectionId).label]},items:{type:'array',minItems:count,maxItems:count,items:itemSchema(sectionId)}}};}

  function generationPrompt(sectionId,count,context){
    const meta=section(sectionId);
    const requirements={
      prescribing:'Write complete prescription tasks. Allocate five marks to appropriate medicine selection and five to formulation, strength, dose, route, frequency and duration. Include clinically realistic patient modifiers and a detailed rubric totalling ten.',
      prescription_review:'Provide six to ten current prescriptions and exactly two unsafe, ineffective or inappropriate entries. Each correct selection is worth two marks. Include renal function, allergies, observations or laboratory data needed to judge them.',
      planning_management:'Ask for the single most appropriate initial intervention. Use five homogeneous options. The diagnosis may be implicit but the best treatment must be defensible.',
      providing_information:'Ask for the single most important counselling, safety-net or administration point. Use five plausible options.',
      calculation:'Create a calculation requiring interpretation, unit conversion and a final value with unit. Supply a numeric answer, a clinically reasonable tolerance and accepted units. Avoid ambiguous rounding.',
      adverse_reactions:'Ask about causation, interaction, diagnosis or immediate management of an adverse drug reaction. Use five homogeneous options.',
      drug_monitoring:'Ask what to monitor, when to monitor it, or how a result should alter treatment. Use five homogeneous options.',
      data_interpretation:'Supply relevant observations or laboratory results and ask for the safest prescribing interpretation or action. Use five homogeneous options.'
    }[sectionId];
    return`Create ${count} original UK Prescribing Safety Assessment-style items for the ${meta.label} section. These must test work expected of a new Foundation Year 1 doctor and must not reproduce official practice-paper wording.\n\nSECTION RULES:\n${requirements}\n\nAcross the batch, vary clinical domain and preferentially include high-risk medicines such as anticoagulants, antibiotics, insulin, opioids and intravenous fluids where appropriate. Open-book use of the BNF should help verify doses, contraindications, interactions or monitoring, but clinical reasoning must still be required. Provide concise BNF navigation targets without copying BNF prose. All answer keys and rubrics must be internally consistent and safe.\n\nPAPER CONTEXT:\n${JSON.stringify(context)}`;
  }
  function checkpointPrompt(stage,sectionId,count,current){
    const meta=section(sectionId);
    const instructions=stage==='clinical_audit'
      ?'Independently audit every clinical claim, medicine choice, dose, route, frequency, duration, interaction, contraindication, renal or hepatic modifier, monitoring requirement and calculation. Repair unsafe, ambiguous or implausible content. Ensure one defensible answer and realistic F1-level scenarios.'
      :'Independently audit the hidden answer keys and marking rubrics. Rubric marks must total the stated item marks. Prescribing items must award five marks for selection and five for prescription details. Prescription-review items must contain exactly two markable erroneous entries. Numerical tolerances and accepted units must be fair. Ensure the model answer, rationale and safety-critical errors agree with the key.';
    return`Return the complete ${count}-item ${meta.label} batch in the identical JSON schema. Preserve item IDs and section identity.\n\nMANDATORY CHECKPOINT:\n${instructions}\n\nCURRENT BATCH:\n${JSON.stringify(current)}`;
  }
  function requestBody(prompt,sectionId,count,name){return{model:'gpt-5-mini',input:[{role:'system',content:[{type:'input_text',text:'Return only the requested schema-conforming PSA section JSON.'}]},{role:'user',content:[{type:'input_text',text:prompt}]}],text:{format:{type:'json_schema',name,strict:true,schema:batchSchema(sectionId,count)}}};}
  function outputText(data){if(typeof data?.output_text==='string')return data.output_text;for(const item of data?.output||[])for(const content of item.content||[])if(content?.type==='output_text'&&typeof content.text==='string')return content.text;return'';}
  function validateBatch(batch,sectionId,count){
    const meta=section(sectionId),errors=[];
    if(!batch||batch.sectionId!==sectionId||!Array.isArray(batch.items)||batch.items.length!==count)errors.push('Batch count or section identity is invalid.');
    const ids=new Set();
    for(const item of batch?.items||[]){
      if(ids.has(item.id))errors.push(`Duplicate item ID ${item.id}.`);ids.add(item.id);
      if(item.sectionId!==sectionId||item.responseMode!==meta.responseMode||item.marks!==meta.marks)errors.push(`${item.id}: section metadata mismatch.`);
      const rubricTotal=(item.markingRubric||[]).reduce((sum,row)=>sum+Number(row.marks||0),0);if(rubricTotal!==meta.marks)errors.push(`${item.id}: rubric totals ${rubricTotal}, expected ${meta.marks}.`);
      if(meta.responseMode==='single_select'&&item.options.length!==5)errors.push(`${item.id}: five options required.`);
      if(meta.responseMode==='multi_select'&&(item.medicationList.length<6||item.medicationList.length>10||item.expectedAnswer.reviewIds.length!==2))errors.push(`${item.id}: review chart or two-answer key invalid.`);
      if(meta.responseMode==='numeric'&&(typeof item.expectedAnswer.numericValue!=='number'||!item.expectedAnswer.acceptedUnits.length))errors.push(`${item.id}: numeric key invalid.`);
      if(meta.responseMode==='prescription'&&!item.expectedAnswer.prescription.medicine)errors.push(`${item.id}: prescription key invalid.`);
    }
    return errors;
  }

  function markingResultSchema(){return{type:'object',additionalProperties:false,required:['itemId','awardedMarks','maxMarks','safetyCritical','criterionResults','errorTags','feedback'],properties:{itemId:{type:'string'},awardedMarks:{type:'number',minimum:0,maximum:10},maxMarks:{type:'number',minimum:1,maximum:10},safetyCritical:{type:'boolean'},criterionResults:{type:'array',items:{type:'object',additionalProperties:false,required:['criterion','awarded','available','reason'],properties:{criterion:{type:'string'},awarded:{type:'number',minimum:0,maximum:10},available:{type:'number',minimum:1,maximum:10},reason:{type:'string'}}}},errorTags:{type:'array',items:{type:'string'}},feedback:{type:'string'}}};}
  function markingBatchSchema(count){return{type:'object',additionalProperties:false,required:['results'],properties:{results:{type:'array',minItems:count,maxItems:count,items:markingResultSchema()}}};}
  function markingPrompt(stage,records,prior){
    const instruction=stage==='primary'
      ?'Mark each response strictly against its supplied hidden rubric. Award partial credit only where a rubric criterion is demonstrably met. For prescriptions, assess medicine selection separately from prescription details. Do not infer an unstated dose, route, frequency or duration.'
      :stage==='safety'
        ?'Act as an independent senior prescribing-safety examiner. Re-mark every response, concentrating on potentially harmful drug selection, dose, route, frequency, duration, allergy, interaction, organ impairment and unit errors. Do not copy the prior marks; identify unsafe over-credit or under-credit.'
        :'Adjudicate only the disputed marks using the question, answer, rubric, primary mark and safety audit. Select the fairest defensible final mark. A safety-critical error must not receive credit for the affected criterion.';
    return`${instruction}\n\nReturn one result for every supplied record in the same order.\n\nRECORDS:\n${JSON.stringify(records)}${prior?`\n\nPRIOR MARKING:\n${JSON.stringify(prior)}`:''}`;
  }
  function markingRequest(prompt,count,name){return{model:'gpt-5-mini',input:[{role:'system',content:[{type:'input_text',text:'Return only the requested schema-conforming PSA marking results.'}]},{role:'user',content:[{type:'input_text',text:prompt}]}],text:{format:{type:'json_schema',name,strict:true,schema:markingBatchSchema(count)}}};}

  window.UKMLA_PSA_SCHEMA={SECTIONS,HIGH_RISK,DOMAINS,GENERATION_STAGES,MARKING_STAGES,section,countsForMode,timeForMode,batchSchema,generationPrompt,checkpointPrompt,requestBody,outputText,validateBatch,markingPrompt,markingRequest};
})();
