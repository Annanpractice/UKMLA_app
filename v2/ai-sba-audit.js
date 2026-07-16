(function(){
'use strict';

const schema=window.UKMLA_V2_AI_SCHEMA;
if(!schema||schema.__sbaQualityAudit)return;
schema.__sbaQualityAudit=true;

const STAGE_ID='sba_audit';
const STAGE={id:STAGE_ID,label:'Single-best-answer quality audit',percent:90};
const STRICT_STAGES=new Set(['options_category','distractors',STAGE_ID]);
const QUALITY_VALIDATION_STAGES=new Set(['options_category','distractors',STAGE_ID,'source','final']);
const baseStagesForPipeline=schema.stagesForPipeline;
const baseCheckpointInstruction=schema.checkpointInstruction;
const baseCheckpointPrompt=schema.checkpointPrompt;
const baseRepairPrompt=schema.repairPrompt;
const baseValidate=schema.validate;
const baseStageLabel=schema.stageLabel;

function isSbaAuditEnabled(){
  try{
    const value=String(new URLSearchParams(location.search).get('sbaAudit')||'').trim().toLowerCase();
    return !['off','0','false','no'].includes(value);
  }catch(_){
    return true;
  }
}

function sourceTargets(config){
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
  }));
}

function optionQualityInstruction(){
  return`OPTIONS MUST BE ANSWER LABELS, NOT COMPRESSED EXPLANATIONS OR KEYWORD DUMPS.
- For diagnosis, reflex, nerve, structure, space, vessel, muscle or named-response questions, use only the concise name, usually one to five words.
- Never append the answer's signs, mechanism, consequence, urgency or treatment. For example, use "Cushing response", not "Cushing response acute raised ICP bradycardia high blood pressure triad".
- Reject wording built around "risking", "via", "limiting", "causing", "leading to", "resulting in", "thereby" or similar explanatory constructions.
- Do not place treatments such as an antidote or "urgent treatment now" inside diagnostic options.
- All five options must be parallel in category, grammar, specificity and detail. The correct answer must not be identifiable by length, completeness, safety or professionalism.`;
}

function distractorQualityInstruction(){
  return`DISTRACTORS MUST BE EXAMINER-QUALITY NEAR-MISSES.
- At least three of the four wrong options must be genuine close competitors.
- For every distractor, identify silently one specific misconception that would make it attractive to a knowledgeable but imperfect candidate.
- If no realistic misconception exists, replace the distractor; do not retain absurd, unrelated, self-evidently unsafe or obviously unethical conduct.
- Law and ethics options must be realistic competing professional actions, not one lawful action against four examples of blatant misconduct.
- Anatomy options must name comparable structures or spaces, not mix structures with deficits, consequences or functional descriptions.`;
}

function auditInstruction(){
  return`Act as an independent examiner-quality gate after distractor review. Re-audit all ten questions from first principles and rewrite every failing item rather than merely describing the defect.

PASS 1 — OPTION FORM:
${optionQualityInstruction()}

PASS 2 — DISTRACTOR PLAUSIBILITY:
${distractorQualityInstruction()}

PASS 3 — SINGLE-BEST-ANSWER INTEGRITY:
- Reject a question when the correct answer is obvious because it is the only sensible, safe, ethical or professionally acceptable option.
- Reject a question when fewer than three distractors survive the knowledgeable-but-imperfect-candidate test.
- Reject a question when the correct option repeats the stem, completes a classic pattern supplied in the stem, or contains more explanation than its competitors.
- Preserve the fixed target, question number, question type, topic metadata and correct clinical proposition.
- Keep the stem sparse. Do not repair weak options by adding clues or teaching text to the stem.

MANDATORY INTERNAL TEST FOR EACH WRONG OPTION:
"Could a knowledgeable but imperfect candidate reasonably choose this distractor because of a specific misconception?"
If the answer is no, replace it with a concise, homogeneous near-miss. Return the fully repaired ten-question set only.`;
}

function stagesForPipeline(value){
  const stages=baseStagesForPipeline(value).map(stage=>({...stage}));
  if(!isSbaAuditEnabled())return stages;
  if(!stages.some(stage=>stage.id==='options_category'))return stages;
  if(stages.some(stage=>stage.id===STAGE_ID))return stages;
  const distractorIndex=stages.findIndex(stage=>stage.id==='distractors');
  if(distractorIndex<0)return stages;
  stages.splice(distractorIndex+1,0,{...STAGE});
  return stages;
}

function reinforcementFor(stage){
  if(stage==='options_category')return optionQualityInstruction();
  if(stage==='distractors')return`${optionQualityInstruction()}\n\n${distractorQualityInstruction()}`;
  return'';
}

function checkpointInstruction(stage){
  if(stage===STAGE_ID)return auditInstruction();
  const base=baseCheckpointInstruction(stage);
  const extra=reinforcementFor(stage);
  return extra?`${base}\n\nMANDATORY SBA QUALITY REINFORCEMENT:\n${extra}`:base;
}

function checkpointPrompt(stage,config){
  if(stage===STAGE_ID){
    return`Return the complete ten-question set in the same JSON schema. This is a separate model API checkpoint after distractor review. Do not skip any question and do not merely report findings.

SINGLE-BEST-ANSWER QUALITY AUDIT:
${auditInstruction()}

SOURCE TARGETS:
${JSON.stringify(sourceTargets(config))}

CURRENT SET:
${JSON.stringify(config.currentSet)}`;
  }
  const base=baseCheckpointPrompt(stage,config);
  const extra=reinforcementFor(stage);
  return extra?`${base}\n\nMANDATORY SBA QUALITY REINFORCEMENT:\n${extra}`:base;
}

function repairPrompt(stage,config,errors,attempt,maxAttempts){
  if(stage!==STAGE_ID){
    const base=baseRepairPrompt(stage,config,errors,attempt,maxAttempts);
    const extra=reinforcementFor(stage);
    return extra?`${base}\n\nMANDATORY SBA QUALITY REINFORCEMENT:\n${extra}`:base;
  }
  const failures=[...new Set((errors||[]).map(error=>String(error).trim()).filter(Boolean))]
    .slice(0,schema.AUTO_REPAIR?.maxErrors||20);
  return`The single-best-answer quality audit output failed deterministic validation.

AUTOMATIC SBA AUDIT REPAIR ${attempt} OF ${maxAttempts}
Return the complete ten-question set in the same JSON schema. Correct every listed failure while preserving all valid questions, fixed targets, question numbers, question types, answer keys and source metadata.

FAILED VALIDATION:
${failures.map(error=>`- ${error}`).join('\n')}

SINGLE-BEST-ANSWER QUALITY REQUIREMENT:
${auditInstruction()}

SOURCE TARGETS:
${JSON.stringify(sourceTargets(config))}

LAST VALID SET ENTERING THIS CHECKPOINT:
${JSON.stringify(config.currentSet||null)}

FAILED CHECKPOINT OUTPUT TO REPAIR:
${JSON.stringify(config.failedSet||null)}`;
}

function words(value){
  return String(value||'').trim().split(/\s+/).filter(Boolean);
}

function asksForConciseLabel(question){
  const text=`${question?.leadIn||''} ${question?.questionTypeLabel||''}`.toLowerCase();
  return /\b(?:diagnosis|diagnostic|nerve|structure|space|vessel|artery|vein|muscle|region|reflex|response|syndrome|condition|organism|drug|antidote)\b/.test(text);
}

function localQuestionErrors(question,index){
  const errors=[];
  const number=Number(question?.questionNumber)||index+1;
  const options=Array.isArray(question?.options)?question.options:[];
  if(options.length!==5)return errors;
  const lengths=options.map(option=>words(option.text).length);
  const min=Math.min(...lengths);
  const max=Math.max(...lengths);
  const correctIndex=options.findIndex(option=>option.id===question.correctOptionId);
  const explanatory=/\b(?:risking|via|limiting|causing|leading to|resulting in|thereby|so that|in order to|which causes?|urgent treatment now)\b/i;

  for(const option of options){
    if(explanatory.test(String(option.text||''))){
      errors.push(`Q${number}: option ${option.id} uses explanatory wording instead of a concise answer label.`);
    }
  }

  if(asksForConciseLabel(question)){
    const stacked=options.filter(option=>words(option.text).length>6);
    if(stacked.length){
      errors.push(`Q${number}: diagnosis or named-entity options are clue-stacked keyword strings rather than concise answer labels (${stacked.map(option=>option.id).join(', ')}).`);
    }
  }

  if(max-min>=6||max>Math.max(8,min*2+3)){
    errors.push(`Q${number}: option lengths are not parallel and create an answer-key giveaway.`);
  }
  if(correctIndex>=0&&lengths[correctIndex]===max&&max-min>=4){
    errors.push(`Q${number}: the correct option is substantially more detailed than its competitors.`);
  }

  const diagnosisLead=/\b(?:most likely diagnosis|diagnosis\?|which diagnosis|most likely condition)\b/i.test(String(question?.leadIn||''));
  if(diagnosisLead){
    const managementTerms=options.filter(option=>/\b(?:naloxone|antidote|treat(?:ment)?|manage(?:ment)?|refer|admit|observe|discharge|urgent|immediate)\b/i.test(String(option.text||'')));
    if(managementTerms.length){
      errors.push(`Q${number}: diagnostic options contain management or treatment wording (${managementTerms.map(option=>option.id).join(', ')}).`);
    }
  }
  return errors;
}

function localSbaErrors(set){
  return(set?.questions||[]).flatMap((question,index)=>localQuestionErrors(question,index));
}

function validate(set,config,stage='final'){
  const baseStage=stage===STAGE_ID?'distractors':stage;
  const errors=baseValidate(set,config,baseStage);
  if(QUALITY_VALIDATION_STAGES.has(stage))errors.push(...localSbaErrors(set));
  return[...new Set(errors)];
}

function stageLabel(stage){
  if(stage===STAGE_ID)return STAGE.label;
  return baseStageLabel?baseStageLabel(stage):stage;
}

Object.assign(schema,{
  SBA_AUDIT_STAGE:STAGE,
  SBA_AUDIT_STRICT_STAGES:STRICT_STAGES,
  isSbaAuditEnabled,
  sbaAuditInstruction:auditInstruction,
  sbaAuditLocalErrors:localSbaErrors,
  stagesForPipeline,
  checkpointInstruction,
  checkpointPrompt,
  repairPrompt,
  validate,
  stageLabel
});
})();