(function(){
'use strict';

const schema=window.UKMLA_V2_AI_SCHEMA;
if(!schema||schema.__pipelineModes)return;
schema.__pipelineModes=true;

const STORAGE_KEY='ukmlaAiPipelineModeV1';
const MODES={
  combined:'combined-option-category-v1',
  legacy:'legacy-separate-v1'
};
const LABELS={
  [MODES.combined]:'Faster combined review (trial)',
  [MODES.legacy]:'Legacy separate reviews'
};
const LEGACY_STAGES=schema.STAGES.map(stage=>({...stage}));
const COMBINED_STAGES=[
  {id:'generation',label:'Generate ten questions',percent:25},
  {id:'sparse',label:'Sparse-stem difficulty review',percent:40},
  {id:'options_category',label:'Option and answer-category review',percent:67},
  {id:'distractors',label:'Distractor-validity review',percent:84},
  {id:'source',label:'Uploaded-source fidelity review',percent:91,knowledgeOnly:true},
  {id:'shuffle',label:'Balanced A–E shuffling',percent:96,local:true},
  {id:'final',label:'Final validation and rendering',percent:100,local:true}
];

const baseCheckpointInstruction=schema.checkpointInstruction;
const baseCheckpointPrompt=schema.checkpointPrompt;
const baseRepairPrompt=schema.repairPrompt;
const baseValidate=schema.validate;

function normaliseMode(value){
  const text=String(value||'').trim().toLowerCase();
  if([MODES.legacy,'legacy','separate','old'].includes(text))return MODES.legacy;
  if([MODES.combined,'combined','trial','fast'].includes(text))return MODES.combined;
  return null;
}

function queryMode(){
  try{return normaliseMode(new URLSearchParams(location.search).get('pipeline'));}
  catch(_){return null;}
}

function storedMode(){
  try{return normaliseMode(localStorage.getItem(STORAGE_KEY));}
  catch(_){return null;}
}

function setPipelineMode(value){
  const mode=normaliseMode(value)||MODES.combined;
  try{localStorage.setItem(STORAGE_KEY,mode);}catch(_){/* local preference only */}
  return mode;
}

function resolvePipelineMode(job){
  const saved=normaliseMode(job?.pipelineMode);
  if(saved)return saved;
  if(job&&(job.currentStage||Number.isInteger(job.currentIndex)))return MODES.legacy;
  const requested=queryMode();
  if(requested)return setPipelineMode(requested);
  return storedMode()||MODES.combined;
}

function stagesForPipeline(value){
  const mode=typeof value==='object'?resolvePipelineMode(value):normaliseMode(value)||resolvePipelineMode(null);
  return(mode===MODES.legacy?LEGACY_STAGES:COMBINED_STAGES).map(stage=>({...stage}));
}

function stageLabel(stage){
  return[...COMBINED_STAGES,...LEGACY_STAGES].find(item=>item.id===stage)?.label||stage;
}

function combinedInstruction(){
  return`Perform two mandatory audits in this order:
1. OPTION NORMALISATION: make all five options concise, parallel answer phrases from one semantic category, grammatically compatible with the lead-in, no more than ${schema.LIMITS.optionMaxWords} words and ${schema.LIMITS.optionMaxCharacters} characters, with no explanatory clauses.
2. ANSWER-CATEGORY ALIGNMENT: confirm the lead-in asks for exactly the category supplied by every option. Preserve the correct clinical proposition and answer key. Prefer repairing mismatched distractors; alter the lead-in only when all five valid options clearly belong to another category.
Do not expand the stem, restore clues removed by the sparse review, weaken close distractors, change targets, or convert anatomy structures into deficits or physiology mechanisms into diagnoses.`;
}

schema.checkpointInstruction=function(stage){
  if(stage==='options_category')return combinedInstruction();
  return baseCheckpointInstruction(stage);
};

schema.checkpointPrompt=function(stage,config){
  if(stage!=='options_category')return baseCheckpointPrompt(stage,config);
  const base=baseCheckpointPrompt('options',config);
  return`${base}\n\nCOMBINED TWO-AUDIT REQUIREMENT:\n${combinedInstruction()}\n\nPRESERVATION PRIORITY:\n- Preserve the correct clinical proposition and answer key.\n- Repair category-mismatched distractors before changing a valid lead-in.\n- Do not make stems longer or make distractors more generic.\n- Return the complete ten-question set once, after both audits are complete.`;
};

schema.repairPrompt=function(stage,config,errors,attempt,maxAttempts){
  if(stage!=='options_category')return baseRepairPrompt(stage,config,errors,attempt,maxAttempts);
  return`${baseRepairPrompt('options',config,errors,attempt,maxAttempts)}\n\nCOMBINED CHECKPOINT REQUIREMENT:\n${combinedInstruction()}\nBoth option-format and answer-category requirements remain mandatory.`;
};

schema.validate=function(set,config,stage='final'){
  if(stage!=='options_category')return baseValidate(set,config,stage);
  return[...new Set([
    ...baseValidate(set,config,'options'),
    ...baseValidate(set,config,'category')
  ])];
};

Object.assign(schema,{
  PIPELINE_STORAGE_KEY:STORAGE_KEY,
  PIPELINE_MODES:MODES,
  PIPELINE_LABELS:LABELS,
  LEGACY_STAGES,
  COMBINED_STAGES,
  resolvePipelineMode,
  setPipelineMode,
  stagesForPipeline,
  stageLabel
});
})();
