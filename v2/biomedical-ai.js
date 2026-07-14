(function(){
  'use strict';

  const schema=window.UKMLA_V2_AI_SCHEMA;
  if(!schema||schema.__biomedicalAware)return;
  schema.__biomedicalAware=true;

  const baseGenerationPrompt=schema.generationPrompt;
  const baseCheckpointPrompt=schema.checkpointPrompt;
  const baseRepairPrompt=schema.repairPrompt;
  const baseValidate=schema.validate;
  const BIOMEDICAL_MIN_WORDS=10;
  const BIOMEDICAL_MAX_WORDS=34;

  function biomedicalTargets(config){
    return (config.conditions||[]).filter(item=>item.profile==='anatomy'||item.profile==='physiology');
  }

  function profileRules(config){
    const targets=biomedicalTargets(config);
    if(!targets.length)return'';
    const lines=targets.map(item=>{
      const number=(config.conditions||[]).indexOf(item)+1;
      if(item.profile==='anatomy'){
        return `Question ${number} targets CLINICAL ANATOMY (${item.name}). Use one clinical lesion, relation, landmark or procedural signal. The candidate should localise the structure and infer the consequence; do not state both steps in the stem.`;
      }
      return `Question ${number} targets CLINICAL PHYSIOLOGY (${item.name}). Use one clinical, ECG or laboratory signal. The candidate should infer the mechanism and apply it; do not narrate the full mechanism in the stem.`;
    });
    return`\n\nBIOMEDICAL TARGET RULES:\n${lines.join('\n')}
Applied reasoning must remain terse. Two-step reasoning means the candidate performs two mental steps; it does not mean the stem supplies two sets of clues. Use ${BIOMEDICAL_MIN_WORDS}–${BIOMEDICAL_MAX_WORDS}, one or two short sentences, one decisive positive signal and no more than one essential negative. Do not add an older normal investigation solely to eliminate a distractor. Keep options to 10 words or fewer. Structures/relations must compete with structures/relations; mechanisms or interpretations must compete with mechanisms or interpretations. Do not introduce unsupported thresholds, vascular variants or disputed anatomy.`;
  }

  function checkpointAudit(stage){
    return stage==='sparse'
      ?`For biomedical targets, compress to ${BIOMEDICAL_MIN_WORDS}–${BIOMEDICAL_MAX_WORDS}. Retain one decisive positive signal. Remove repeated exclusions, previous normal tests and any sentence that explains the reasoning the candidate should perform.`
      :stage==='options'
        ?'For biomedical targets, use short parallel noun phrases: comparable nerves, arteries, territories, relations, mechanisms or physiological responses. Maximum 10 words each; no explanatory clauses.'
        :stage==='category'
          ?'Reject anatomy lead-ins that ask for management when answers are structures. Reject physiology lead-ins that ask for diagnoses when answers are mechanisms. Do not add wording to repair a category mismatch; rewrite the lead-in tersely.'
          :stage==='distractors'
            ?'Use neighbouring lesions or genuinely competing mechanisms as distractors. Keep them close and short; difficulty must not come from long qualifiers.'
            :stage==='generation'
              ?'Restore the fixed biomedical target and question type without changing it to a more familiar condition. Keep the stem and options terse.'
              :'Verify every biomedical claim strictly against the five supplied fields. Remove unsupported facts and preserve all stem, option and explanation limits.';
  }

  schema.generationPrompt=function(config){
    return baseGenerationPrompt(config)+profileRules(config);
  };

  schema.checkpointPrompt=function(stage,config){
    const base=baseCheckpointPrompt(stage,config);
    if(!biomedicalTargets(config).length)return base;
    return`${base}\n\nBIOMEDICAL CHECKPOINT:\n${checkpointAudit(stage)}`;
  };

  schema.repairPrompt=function(stage,config,errors,attempt,maxAttempts){
    const base=baseRepairPrompt(stage,config,errors,attempt,maxAttempts);
    if(!biomedicalTargets(config).length)return base;
    return`${base}\n\nBIOMEDICAL AUTOMATIC REPAIR:\n${checkpointAudit(stage)} Do not make unaffected biomedical questions longer while fixing another question.`;
  };

  schema.validate=function(set,config,stage='final'){
    const errors=baseValidate(set,config,stage);
    (set?.questions||[]).forEach((question,index)=>{
      const target=config.conditions[index];
      if(!target||!['anatomy','physiology'].includes(target.profile))return;

      if(schema.stageAtLeast(stage,'sparse')){
        const words=schema.wordCount(question.stem);
        if(words<BIOMEDICAL_MIN_WORDS)errors.push(`Q${index+1}: biomedical stem is too short for applied reasoning.`);
        if(words>BIOMEDICAL_MAX_WORDS)errors.push(`Q${index+1}: biomedical stem exceeds ${BIOMEDICAL_MAX_WORDS} words.`);
        const targetName=String(question.targetCondition||target.name||'').trim().toLowerCase();
        if(targetName.length>4&&String(question.stem||'').toLowerCase().includes(targetName))errors.push(`Q${index+1}: biomedical target name appears in the stem.`);
        if(!String(question.decisiveClue||'').trim())errors.push(`Q${index+1}: biomedical decisive clue is missing.`);
      }

      const texts=(question.options||[]).map(option=>String(option.text||'').trim().toLowerCase());
      if(new Set(texts).size!==texts.length)errors.push(`Q${index+1}: biomedical options are duplicated.`);
    });
    return errors;
  };
})();
