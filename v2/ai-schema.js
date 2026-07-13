(function(){
'use strict';

const TYPES=[
  ['sparse_most_likely_diagnosis','Sparse presentation: most likely diagnosis'],
  ['close_mimic_discrimination','Close-mimic discrimination'],
  ['first_line_investigation','First-line investigation'],
  ['dangerous_diagnosis_priority_exclusion','Dangerous diagnosis: priority exclusion'],
  ['next_step_after_initial_result','Next step after an initial result'],
  ['immediate_emergency_management','Immediate emergency management'],
  ['stable_first_line_treatment','Standard first-line treatment'],
  ['contraindication_caveat_switch','Contraindication or caveat switch'],
  ['failure_or_deterioration','Failure or deterioration'],
  ['escalation_referral_disposition','Escalation, referral or disposition']
];

const STAGES=[
  {id:'generation',label:'Generate ten questions',percent:25},
  {id:'sparse',label:'Sparse-stem difficulty review',percent:40},
  {id:'options',label:'Option normalisation',percent:55},
  {id:'category',label:'Semantic answer-category review',percent:70},
  {id:'distractors',label:'Distractor-validity review',percent:84},
  {id:'source',label:'Uploaded-source fidelity review',percent:91,knowledgeOnly:true},
  {id:'shuffle',label:'Balanced A–E shuffling',percent:96,local:true},
  {id:'final',label:'Final validation and rendering',percent:100,local:true}
];

const STAGE_ORDER=STAGES.map(stage=>stage.id);
const LIMITS={
  stemMaxWords:36,
  sparseDiagnosisStemMaxWords:28,
  stemMaxCharacters:250,
  stemMaxSentences:2,
  explicitExclusions:1,
  leadInMaxWords:14,
  decisiveClueMaxWords:14,
  optionMaxWords:10,
  optionMaxCharacters:80,
  learningPointMaxWords:22,
  rationaleMaxWords:35,
  distractorExplanationMaxWords:30
};

function wordCount(value){
  const text=String(value||'').trim();
  return text?text.split(/\s+/).length:0;
}

function sentenceCount(value){
  const text=String(value||'').trim();
  if(!text)return 0;
  return Math.max(1,text.split(/[.!?]+(?:\s+|$)/).filter(part=>part.trim()).length);
}

function explicitExclusionCount(value){
  const text=String(value||'');
  const patterns=[
    /\bno\b/gi,
    /\bwithout\b/gi,
    /\babsent\b/gi,
    /\bnegative for\b/gi,
    /\bden(?:y|ies|ied)\b/gi,
    /\bnot\b/gi,
    /\b(?:previous|prior|older|baseline)\b[^.;]{0,45}\b(?:normal|unchanged)\b/gi
  ];
  return patterns.reduce((total,pattern)=>total+(text.match(pattern)||[]).length,0);
}

function hasExplanatoryOptionClause(value){
  return /[;:]|\b(?:because|therefore|thereby|due to|resulting in|which causes?|so that)\b/i.test(String(value||''));
}

function stageAtLeast(stage,target){
  const current=STAGE_ORDER.indexOf(stage||'generation');
  const required=STAGE_ORDER.indexOf(target);
  return current>=required;
}

function shortString(maxLength){
  return{type:'string',minLength:1,maxLength};
}

function optionSchema(){
  return{
    type:'object',
    additionalProperties:false,
    required:['id','text','topicId','topicName','conditionId','conditionName','param'],
    properties:{
      id:{type:'string',enum:['A','B','C','D','E']},
      text:shortString(LIMITS.optionMaxCharacters),
      topicId:{type:'string'},
      topicName:{type:'string'},
      conditionId:{type:'string'},
      conditionName:{type:'string'},
      param:{type:'string',enum:['investigations','treatment','escalation','mimics','redFlags']}
    }
  };
}

function questionSchema(knowledge){
  const properties={
    id:{type:'string'},
    questionNumber:{type:'integer',minimum:1,maximum:10},
    questionType:{type:'string',enum:TYPES.map(item=>item[0])},
    questionTypeLabel:{type:'string',enum:TYPES.map(item=>item[1])},
    topicId:{type:'string'},
    topicName:{type:'string'},
    targetConditionId:{type:'string'},
    targetCondition:{type:'string'},
    learningPoint:shortString(160),
    stem:shortString(LIMITS.stemMaxCharacters),
    leadIn:shortString(120),
    options:{type:'array',minItems:5,maxItems:5,items:optionSchema()},
    correctOptionId:{type:'string',enum:['A','B','C','D','E']},
    decisiveClue:shortString(100),
    rationale:shortString(240),
    strongestDistractorId:{type:'string',enum:['A','B','C','D','E']},
    strongestDistractorExplanation:shortString(220),
    guideline:{
      type:'object',
      additionalProperties:false,
      required:['source','title','checkedDate','url'],
      properties:{
        source:{type:'string'},
        title:{type:'string'},
        checkedDate:{anyOf:[{type:'string'},{type:'null'}]},
        url:{anyOf:[{type:'string'},{type:'null'}]}
      }
    }
  };
  const required=Object.keys(properties);
  if(knowledge){
    properties.sourceSupport={
      type:'object',
      additionalProperties:false,
      required:['conceptId','sourceRefs','supportStatement'],
      properties:{
        conceptId:{type:'string'},
        sourceRefs:{type:'array',minItems:1,items:{type:'string'}},
        supportStatement:{type:'string'}
      }
    };
    required.push('sourceSupport');
  }
  return{type:'object',additionalProperties:false,required,properties};
}

function quizSchema(knowledge){
  return{
    type:'object',
    additionalProperties:false,
    required:['schemaVersion','quizId','topic','generatedAt','difficulty','questions'],
    properties:{
      schemaVersion:{type:'string',enum:['ukmla-ai-quiz-v2']},
      quizId:{type:'string'},
      topic:{type:'string'},
      generatedAt:{type:'string'},
      difficulty:{type:'string',enum:['very_difficult']},
      questions:{type:'array',minItems:10,maxItems:10,items:questionSchema(knowledge)}
    }
  };
}

function sourcePayload(conditions){
  return conditions.map(item=>({
    conditionId:item.id||item.conditionId,
    topicId:item.topicId,
    topicName:item.topic||item.topicName,
    name:item.name||item.targetCondition,
    profile:item.profile||'clinical',
    fields:item.fields,
    labels:item.labels,
    sourceRefs:item.sourceRefs||[]
  }));
}

function typeOrder(types){
  return types.map((id,index)=>`${index+1}. ${id} — ${TYPES.find(item=>item[0]===id)?.[1]||id}`).join('\n');
}

function generationPrompt(config){
  const source=config.knowledge?'uploaded study-pack concept map':'UKMLA card atlas';
  const guide=config.knowledge
    ?`Use guideline source "Uploaded study material", title "${config.sourceTitle||config.topic}", and null checkedDate/url.`
    :'Use the supplied card fields as the factual boundary. Do not invent exact doses or thresholds absent from them. Use guideline source "Internal UKMLA card atlas" with null checkedDate/url.';
  return`Create exactly ten very difficult UKMLA-style single-best-answer questions from the ${source}.

The ten supplied targets are fixed. Question 1 must use targets[0], question 2 targets[1], and so on. Preserve every target ID, topic ID, name and topic. Use each exactly once and never substitute a more familiar target.

QUESTION TYPES IN EXACT ORDER:
${typeOrder(config.questionTypes)}

CONCISION IS MANDATORY:
- Difficulty must come from inference and close competitors, not extra history or long wording.
- Use one decisive positive signal. Include at most one explicit negative or exclusion only when essential.
- Do not add an older, previous or normal investigation merely to eliminate a distractor.
- Use one or two short sentences. Maximum 36 words per stem; maximum 28 words for the sparse-diagnosis type.
- Lead-ins must be 14 words or fewer.
- Each option must be a short answer phrase of 10 words or fewer and 80 characters or fewer.
- Options must not contain explanations, semicolons, colons, "because" or "due to" clauses.
- Keep the learning point to 22 words, rationale to 35 words and strongest-distractor explanation to 30 words.

Use sparse authentic stems with one subtle discriminator. Give five homogeneous, plausible options and one unambiguously best answer. Every option must contain accurate topic, condition and scoring-aspect metadata. ${guide}
${config.knowledge?'Each question must include sourceSupport using the exact conceptId and one or more supplied sourceRefs. Do not add unsupported doses, thresholds, diagnoses or management claims.':''}

SOURCE:
${JSON.stringify({mode:config.knowledge?'knowledge_dump':'coverage_scheduler',sourceTitle:config.sourceTitle||config.topic,targets:sourcePayload(config.conditions)})}`;
}

function checkpointPrompt(stage,config){
  const instructions={
    sparse:`Compress every stem to one or two short sentences. Keep one decisive positive signal and at most one essential negative. Remove repeated clues, normal previous tests used only to exclude distractors, and explanatory history. Enforce ${LIMITS.stemMaxWords} words maximum, or ${LIMITS.sparseDiagnosisStemMaxWords} for sparse diagnosis. Keep the lead-in to ${LIMITS.leadInMaxWords} words and decisiveClue to ${LIMITS.decisiveClueMaxWords} words.`,
    options:`Make all five options the same semantic category and grammatically compatible with the lead-in. Each option must be ${LIMITS.optionMaxWords} words and ${LIMITS.optionMaxCharacters} characters or fewer. Use answer phrases only: no explanations, semicolons, colons, "because", "due to" or result clauses.`,
    category:'Check that the lead-in asks for exactly the category supplied by every option. Keep the wording short; do not restore detail removed by the sparse or option checkpoints.',
    distractors:`Make all four wrong options credible close competitors. Difficulty must come from clinical proximity, not long qualifying clauses. Keep the rationale to ${LIMITS.rationaleMaxWords} words and strongest-distractor explanation to ${LIMITS.distractorExplanationMaxWords} words.`,
    source:'Strictly verify every answer, clue, rationale and factual claim against the supplied concept fields and source references. Remove unsupported facts rather than adding explanatory detail. Preserve all concision limits.'
  };
  return`Return the complete ten-question set in the same JSON schema. Preserve fixed target order, target IDs, topic IDs and question-type order.

ROUTINE CHECKPOINT: ${instructions[stage]}

SOURCE TARGETS:
${JSON.stringify(sourcePayload(config.conditions))}

CURRENT SET:
${JSON.stringify(config.currentSet)}`;
}

function requestBody(prompt,knowledge,name){
  return{
    model:'gpt-5-mini',
    input:[
      {role:'system',content:[{type:'input_text',text:'Return only concise, schema-conforming JSON. Never trade brevity for apparent difficulty.'}]},
      {role:'user',content:[{type:'input_text',text:prompt}]}
    ],
    text:{format:{type:'json_schema',name,strict:true,schema:quizSchema(knowledge)}}
  };
}

function outputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  for(const item of data?.output||[]){
    for(const content of item.content||[]){
      if(content?.type==='output_text'&&typeof content.text==='string')return content.text;
    }
  }
  return'';
}

function validate(set,config,stage='final'){
  const errors=[];
  if(!set||!Array.isArray(set.questions)||set.questions.length!==10)errors.push('Exactly ten questions are required.');
  const types=new Set();
  const targets=new Set();

  (set?.questions||[]).forEach((question,index)=>{
    const expected=config.conditions[index];
    const expectedId=expected.id||expected.conditionId;
    types.add(question.questionType);
    targets.add(question.targetConditionId);

    if(question.questionNumber!==index+1)errors.push(`Q${index+1}: number changed.`);
    if(question.questionType!==config.questionTypes[index])errors.push(`Q${index+1}: type changed.`);
    if(question.targetConditionId!==expectedId)errors.push(`Q${index+1}: target changed.`);
    if(question.topicId!==expected.topicId)errors.push(`Q${index+1}: topic changed.`);
    if(!Array.isArray(question.options)||question.options.length!==5)errors.push(`Q${index+1}: five options required.`);
    if((question.options||[]).map(option=>option.id).join('')!=='ABCDE')errors.push(`Q${index+1}: options must be A–E.`);
    if(!(question.options||[]).some(option=>option.id===question.correctOptionId))errors.push(`Q${index+1}: invalid answer key.`);
    if(config.knowledge&&(!question.sourceSupport?.conceptId||!question.sourceSupport?.sourceRefs?.length))errors.push(`Q${index+1}: source support missing.`);

    if(stageAtLeast(stage,'sparse')){
      const maxStemWords=question.questionType==='sparse_most_likely_diagnosis'
        ?LIMITS.sparseDiagnosisStemMaxWords
        :LIMITS.stemMaxWords;
      if(wordCount(question.stem)>maxStemWords)errors.push(`Q${index+1}: stem exceeds ${maxStemWords} words.`);
      if(String(question.stem||'').length>LIMITS.stemMaxCharacters)errors.push(`Q${index+1}: stem exceeds ${LIMITS.stemMaxCharacters} characters.`);
      if(sentenceCount(question.stem)>LIMITS.stemMaxSentences)errors.push(`Q${index+1}: stem exceeds ${LIMITS.stemMaxSentences} sentences.`);
      if(explicitExclusionCount(question.stem)>LIMITS.explicitExclusions)errors.push(`Q${index+1}: stem contains multiple explicit exclusions.`);
      if(wordCount(question.leadIn)>LIMITS.leadInMaxWords)errors.push(`Q${index+1}: lead-in exceeds ${LIMITS.leadInMaxWords} words.`);
      if(wordCount(question.decisiveClue)>LIMITS.decisiveClueMaxWords)errors.push(`Q${index+1}: decisive clue exceeds ${LIMITS.decisiveClueMaxWords} words.`);
    }

    if(stageAtLeast(stage,'options')){
      for(const option of question.options||[]){
        if(wordCount(option.text)>LIMITS.optionMaxWords)errors.push(`Q${index+1}${option.id}: option exceeds ${LIMITS.optionMaxWords} words.`);
        if(String(option.text||'').length>LIMITS.optionMaxCharacters)errors.push(`Q${index+1}${option.id}: option exceeds ${LIMITS.optionMaxCharacters} characters.`);
        if(hasExplanatoryOptionClause(option.text))errors.push(`Q${index+1}${option.id}: option contains an explanatory clause.`);
      }
    }

    if(stageAtLeast(stage,'distractors')){
      if(wordCount(question.learningPoint)>LIMITS.learningPointMaxWords)errors.push(`Q${index+1}: learning point exceeds ${LIMITS.learningPointMaxWords} words.`);
      if(wordCount(question.rationale)>LIMITS.rationaleMaxWords)errors.push(`Q${index+1}: rationale exceeds ${LIMITS.rationaleMaxWords} words.`);
      if(wordCount(question.strongestDistractorExplanation)>LIMITS.distractorExplanationMaxWords)errors.push(`Q${index+1}: distractor explanation exceeds ${LIMITS.distractorExplanationMaxWords} words.`);
    }
  });

  if(types.size!==10)errors.push('Question types are not unique.');
  if(targets.size!==10)errors.push('Targets are not unique.');
  return errors;
}

function balancedShuffle(set){
  const letters=['A','B','C','D','E'];
  const targets=[];
  while(targets.length<set.questions.length)targets.push(...letters);
  targets.length=set.questions.length;
  for(let i=targets.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [targets[i],targets[j]]=[targets[j],targets[i]];
  }
  set.questions.forEach((question,index)=>{
    const oldStrong=question.options.find(option=>option.id===question.strongestDistractorId);
    const correct=question.options.find(option=>option.id===question.correctOptionId);
    const wrong=question.options.filter(option=>option!==correct);
    for(let i=wrong.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [wrong[i],wrong[j]]=[wrong[j],wrong[i]];
    }
    let wrongIndex=0;
    question.options=letters.map(letter=>({...((letter===targets[index])?correct:wrong[wrongIndex++]),id:letter}));
    question.correctOptionId=targets[index];
    question.strongestDistractorId=question.options.find(option=>oldStrong&&option.text===oldStrong.text)?.id
      ||question.options.find(option=>option.id!==question.correctOptionId).id;
  });
  return set;
}

window.UKMLA_V2_AI_SCHEMA={
  TYPES,
  STAGES,
  LIMITS,
  quizSchema,
  requestBody,
  outputText,
  generationPrompt,
  checkpointPrompt,
  validate,
  balancedShuffle,
  wordCount,
  explicitExclusionCount,
  stageAtLeast
};
})();
