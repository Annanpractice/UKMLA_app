(function(){
'use strict';

const schema=window.UKMLA_V2_AI_SCHEMA;
if(!schema||schema.__targetedRepair)return;
schema.__targetedRepair=true;

const TIERS={fields:'fields',questions:'questions',set:'set'};
const TIER_ORDER=[TIERS.fields,TIERS.questions,TIERS.set];
const TIER_LABELS={
  fields:'Targeted field repair',
  questions:'Affected-question repair',
  set:'Full-set fallback repair'
};
const FIELD_PATHS=['stem','leadIn','decisiveClue','learningPoint','rationale','strongestDistractorExplanation','optionText'];

function clone(value){return JSON.parse(JSON.stringify(value));}
function unique(values){return[...new Set(values)];}
function errorList(errors){return unique((errors||[]).map(value=>String(value).trim()).filter(Boolean)).slice(0,schema.AUTO_REPAIR?.maxErrors||20);}
function questionNumberFromError(error){const match=String(error).match(/^Q(\d+)([A-E])?:/i);return match?Number(match[1]):null;}
function optionIdFromError(error){const match=String(error).match(/^Q\d+([A-E]):/i);return match?match[1].toUpperCase():null;}
function atomicPath(error){
  const text=String(error).toLowerCase();
  if(/^q\d+[a-e]:/.test(text)&&/option (?:exceeds|contains)/.test(text))return'optionText';
  if(/biomedical target name appears in the stem|biomedical stem|stem exceeds|stem contains multiple explicit exclusions|stem is too short/.test(text))return'stem';
  if(/lead-in/.test(text))return'leadIn';
  if(/decisive clue/.test(text))return'decisiveClue';
  if(/learning point/.test(text))return'learningPoint';
  if(/distractor explanation/.test(text))return'strongestDistractorExplanation';
  if(/rationale/.test(text))return'rationale';
  return null;
}
function isSetError(error){return !/^Q\d+/i.test(String(error));}

function classifyErrors(errors){
  const list=errorList(errors);
  if(list.some(isSetError))return TIERS.set;
  if(list.every(error=>atomicPath(error)))return TIERS.fields;
  return TIERS.questions;
}

function fieldTargets(errors){
  const map=new Map();
  for(const error of errorList(errors)){
    const questionNumber=questionNumberFromError(error);
    const path=atomicPath(error);
    if(!questionNumber||!path)continue;
    const optionId=path==='optionText'?optionIdFromError(error):null;
    const key=`${questionNumber}:${path}:${optionId||''}`;
    map.set(key,{questionNumber,path,optionId,error});
  }
  return[...map.values()];
}

function questionNumbers(errors,candidate){
  const numbers=unique(errorList(errors).map(questionNumberFromError).filter(Boolean));
  if(numbers.length)return numbers.sort((a,b)=>a-b);
  return(candidate?.questions||[]).map((_,index)=>index+1);
}

function repairPlan(errors,candidate,forcedTier){
  const natural=classifyErrors(errors);
  let tier=forcedTier||natural;
  if(tier===TIERS.fields&&!fieldTargets(errors).length)tier=TIERS.questions;
  if(tier===TIERS.questions&&!questionNumbers(errors,candidate).length)tier=TIERS.set;
  const numbers=tier===TIERS.fields
    ?unique(fieldTargets(errors).map(item=>item.questionNumber)).sort((a,b)=>a-b)
    :tier===TIERS.questions?questionNumbers(errors,candidate):[];
  return{
    tier,
    label:TIER_LABELS[tier],
    errors:errorList(errors),
    questionNumbers:numbers,
    fields:tier===TIERS.fields?fieldTargets(errors):[]
  };
}

function nextRepairTier(currentTier,errors,candidate){
  const nextIndex=TIER_ORDER.indexOf(currentTier)+1;
  if(nextIndex>=TIER_ORDER.length)return null;
  const natural=classifyErrors(errors);
  if(natural===TIERS.set)return TIERS.set;
  if(currentTier===TIERS.fields)return TIERS.questions;
  return TIERS.set;
}

function sourceTargets(config,numbers){
  const wanted=new Set(numbers||[]);
  return(config.conditions||[]).map((item,index)=>({
    questionNumber:index+1,
    conditionId:item.id||item.conditionId,
    topicId:item.topicId,
    topicName:item.topic||item.topicName,
    name:item.name||item.targetCondition,
    profile:item.profile||'clinical',
    fields:item.fields,
    labels:item.labels,
    sourceRefs:item.sourceRefs||[]
  })).filter(item=>!wanted.size||wanted.has(item.questionNumber));
}

function affectedQuestions(candidate,numbers){
  const wanted=new Set(numbers||[]);
  return(candidate?.questions||[]).filter(question=>wanted.has(Number(question.questionNumber)));
}

function biomedicalRepairRule(config,numbers){
  const wanted=new Set(numbers||[]);
  const targets=(config.conditions||[]).map((item,index)=>({...item,questionNumber:index+1}))
    .filter(item=>wanted.has(item.questionNumber)&&['anatomy','physiology'].includes(item.profile));
  if(!targets.length)return'';
  return`\n\nBIOMEDICAL REPAIR RULES:\n- Keep applied stems between 10 and 34 words.\n- Use one decisive lesion, relation, ECG, laboratory or physiological signal.\n- Do not add normal historical tests or explanatory clues.\n- Keep anatomical structures comparable with structures and physiological mechanisms comparable with mechanisms.\n- Do not make unaffected biomedical wording longer.`;
}

function fieldRepairSchema(){
  return{
    type:'object',
    additionalProperties:false,
    required:['patches'],
    properties:{
      patches:{
        type:'array',minItems:1,maxItems:30,
        items:{
          type:'object',additionalProperties:false,
          required:['questionNumber','path','optionId','value'],
          properties:{
            questionNumber:{type:'integer',minimum:1,maximum:10},
            path:{type:'string',enum:FIELD_PATHS},
            optionId:{anyOf:[{type:'string',enum:['A','B','C','D','E']},{type:'null'}]},
            value:{type:'string',minLength:1,maxLength:300}
          }
        }
      }
    }
  };
}

function questionRepairSchema(knowledge){
  return{
    type:'object',additionalProperties:false,required:['questions'],
    properties:{
      questions:{type:'array',minItems:1,maxItems:10,items:schema.quizSchema(knowledge).properties.questions.items}
    }
  };
}

function repairRequestBody(prompt,knowledge,name,tier){
  if(tier===TIERS.set)return schema.requestBody(prompt,knowledge,name);
  const formatSchema=tier===TIERS.fields?fieldRepairSchema():questionRepairSchema(knowledge);
  return{
    model:'gpt-5-mini',
    input:[
      {role:'system',content:[{type:'input_text',text:'Return only the requested compact repair JSON. Do not regenerate unaffected questions.'}]},
      {role:'user',content:[{type:'input_text',text:prompt}]}
    ],
    text:{format:{type:'json_schema',name,strict:true,schema:formatSchema}}
  };
}

function fieldPrompt(stage,config,plan,candidate,step,total){
  return`The ${schema.STAGES.find(item=>item.id===stage)?.label||stage} output failed deterministic validation.

TARGETED FIELD REPAIR ${step} OF ${total}
Return only atomic text patches for the listed failed fields. Do not return complete questions or the full set. Do not alter IDs, answer keys, metadata, unaffected fields or unaffected questions.

FAILED FIELDS:
${plan.fields.map(item=>`- Q${item.questionNumber}${item.optionId||''} ${item.path}: ${item.error}`).join('\n')}

CHECKPOINT REQUIREMENT:
${schema.checkpointInstruction(stage)}

AFFECTED QUESTION CONTEXT:
${JSON.stringify(affectedQuestions(candidate,plan.questionNumbers))}

SOURCE TARGETS:
${JSON.stringify(sourceTargets(config,plan.questionNumbers))}${biomedicalRepairRule(config,plan.questionNumbers)}`;
}

function questionPrompt(stage,config,plan,candidate,step,total){
  return`The ${schema.STAGES.find(item=>item.id===stage)?.label||stage} output still fails deterministic validation.

AFFECTED-QUESTION REPAIR ${step} OF ${total}
Return complete corrected question objects only for question numbers ${plan.questionNumbers.join(', ')}. Do not return the other questions or the full set. Preserve each fixed target, topic, question type and factual answer unless a listed validation error requires correction.

FAILED VALIDATION:
${plan.errors.map(error=>`- ${error}`).join('\n')}

CHECKPOINT REQUIREMENT:
${schema.checkpointInstruction(stage)}

AFFECTED QUESTIONS:
${JSON.stringify(affectedQuestions(candidate,plan.questionNumbers))}

SOURCE TARGETS:
${JSON.stringify(sourceTargets(config,plan.questionNumbers))}${biomedicalRepairRule(config,plan.questionNumbers)}`;
}

function targetedRepairPrompt(stage,config,plan,candidate,step,total,lastValidSet){
  if(plan.tier===TIERS.fields)return fieldPrompt(stage,config,plan,candidate,step,total);
  if(plan.tier===TIERS.questions)return questionPrompt(stage,config,plan,candidate,step,total);
  return schema.repairPrompt(stage,{...config,currentSet:lastValidSet,failedSet:candidate},plan.errors,step,total);
}

function applyFieldPatches(candidate,response,plan){
  const next=clone(candidate);
  const allowed=new Set(plan.fields.map(item=>`${item.questionNumber}:${item.path}:${item.optionId||''}`));
  for(const patch of response?.patches||[]){
    const key=`${patch.questionNumber}:${patch.path}:${patch.optionId||''}`;
    if(!allowed.has(key))continue;
    const question=next.questions?.[Number(patch.questionNumber)-1];
    if(!question)continue;
    if(patch.path==='optionText'){
      const option=question.options?.find(item=>item.id===patch.optionId);
      if(option)option.text=patch.value;
    }else if(FIELD_PATHS.includes(patch.path)){
      question[patch.path]=patch.value;
    }
  }
  return next;
}

function applyQuestionRepairs(candidate,response,plan){
  const next=clone(candidate);
  const allowed=new Set(plan.questionNumbers);
  for(const question of response?.questions||[]){
    const number=Number(question.questionNumber);
    if(!allowed.has(number)||number<1||number>10)continue;
    next.questions[number-1]=question;
  }
  return next;
}

function applyRepair(candidate,response,plan){
  if(plan.tier===TIERS.fields)return applyFieldPatches(candidate,response,plan);
  if(plan.tier===TIERS.questions)return applyQuestionRepairs(candidate,response,plan);
  return response;
}

Object.assign(schema,{
  REPAIR_TIERS:TIERS,
  REPAIR_TIER_LABELS:TIER_LABELS,
  repairPlan,
  nextRepairTier,
  targetedRepairPrompt,
  repairRequestBody,
  applyRepair,
  fieldRepairSchema,
  questionRepairSchema
});
})();
