(function(){
'use strict';

const schema=window.UKMLA_V2_AI_SCHEMA;
if(!schema||schema.__sbaQualityAudit)return;
schema.__sbaQualityAudit=true;

const STAGE_ID='sba_audit';
const STAGE={id:STAGE_ID,label:'Single-best-answer quality audit',percent:90};
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

function auditInstruction(){
  return`Act as an independent examiner-quality gate after distractor review. Review all ten questions and repair every item that fails any rule below.

REJECT OR REPAIR A QUESTION WHEN:
- any option explains itself or adds a consequence, mechanism or justification, including wording such as "risking...", "via..." or "limiting...";
- the correct answer is obvious because it is the only sensible, safe, ethical or professionally acceptable action;
- any distractor is absurd, clearly unsafe, obvious misconduct, unrelated to the lead-in or outside the option category;
- fewer than three of the four distractors are genuine near-misses;
- one option is substantially longer, more detailed, more qualified or more specific than the others;
- a law or ethics question contrasts the correct action with obvious misconduct instead of realistic competing actions a competent but imperfect candidate might consider;
- an anatomy question uses consequences, deficits or functional descriptions as options instead of comparable named structures, spaces, vessels, nerves, muscles or regions.

MANDATORY DISTRACTOR TEST:
For every wrong option, ask silently: "Could a knowledgeable but imperfect candidate reasonably choose this distractor because of a specific misconception?" If the answer is no, replace that distractor with a concise, homogeneous near-miss.

Preserve fixed targets, question numbers, question types, topic metadata and the correct clinical proposition. Keep all options concise, parallel answer labels. Do not make stems longer, add teaching explanations to options or weaken the question into an obvious safety test.`;
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

function checkpointInstruction(stage){
  if(stage===STAGE_ID)return auditInstruction();
  return baseCheckpointInstruction(stage);
}

function checkpointPrompt(stage,config){
  if(stage!==STAGE_ID)return baseCheckpointPrompt(stage,config);
  return`Return the complete ten-question set in the same JSON schema. This is a separate examiner-quality checkpoint after distractor review.

SINGLE-BEST-ANSWER QUALITY AUDIT:
${auditInstruction()}

SOURCE TARGETS:
${JSON.stringify(sourceTargets(config))}

CURRENT SET:
${JSON.stringify(config.currentSet)}`;
}

function repairPrompt(stage,config,errors,attempt,maxAttempts){
  if(stage!==STAGE_ID)return baseRepairPrompt(stage,config,errors,attempt,maxAttempts);
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

function validate(set,config,stage='final'){
  if(stage===STAGE_ID)return baseValidate(set,config,'distractors');
  return baseValidate(set,config,stage);
}

function stageLabel(stage){
  if(stage===STAGE_ID)return STAGE.label;
  return baseStageLabel?baseStageLabel(stage):stage;
}

Object.assign(schema,{
  SBA_AUDIT_STAGE:STAGE,
  isSbaAuditEnabled,
  sbaAuditInstruction:auditInstruction,
  stagesForPipeline,
  checkpointInstruction,
  checkpointPrompt,
  repairPrompt,
  validate,
  stageLabel
});
})();