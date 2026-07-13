(function(){
  'use strict';

  const schema=window.UKMLA_V2_AI_SCHEMA;
  if(!schema||schema.__biomedicalAware)return;
  schema.__biomedicalAware=true;

  const baseGenerationPrompt=schema.generationPrompt;
  const baseCheckpointPrompt=schema.checkpointPrompt;
  const baseValidate=schema.validate;

  function biomedicalTargets(config){
    return (config.conditions||[]).filter(item=>item.profile==='anatomy'||item.profile==='physiology');
  }

  function profileRules(config){
    const targets=biomedicalTargets(config);
    if(!targets.length)return'';
    const lines=targets.map((item,index)=>{
      const number=(config.conditions||[]).indexOf(item)+1;
      if(item.profile==='anatomy'){
        return `Question ${number} targets CLINICAL ANATOMY (${item.name}). Use lesion-pattern recognition, relations, boundaries, surface anatomy, vascular/nerve localisation or procedural anatomy. Require at least two linked reasoning steps. The candidate should infer the structure or consequence from a clinical scenario; do not ask a bare one-line recall question.`;
      }
      return `Question ${number} targets CLINICAL PHYSIOLOGY (${item.name}). Require mechanism-to-finding, data-to-mechanism, compensation, localisation or treatment-effect reasoning. Use the supplied mechanism, clinical pattern and discriminator as the complete factual boundary. Do not reduce it to a definition question.`;
    });
    return `\n\nBIOMEDICAL TARGET RULES:\n${lines.join('\n')}\nFor a biomedical target, reinterpret the fixed question-type label as an applied reasoning angle rather than forcing an irrelevant management task. The correct answer and all distractors must remain the same semantic category: structures/relations for anatomy; mechanisms, physiological changes or interpretations for physiology. Do not introduce exact thresholds, vascular variants or disputed anatomy absent from the card.`;
  }

  schema.generationPrompt=function(config){
    return baseGenerationPrompt(config)+profileRules(config);
  };

  schema.checkpointPrompt=function(stage,config){
    const base=baseCheckpointPrompt(stage,config);
    const targets=biomedicalTargets(config);
    if(!targets.length)return base;
    const audit=stage==='sparse'
      ?'For biomedical targets, retain enough clinical information for two-step localisation or mechanism reasoning while removing direct giveaway labels.'
      :stage==='options'
        ?'For biomedical targets, keep every option in one category: comparable nerves, arteries, relations, territories, mechanisms or physiological responses.'
        :stage==='category'
          ?'Reject any anatomy item whose lead-in asks for management when the answer is a structure, and reject any physiology item whose lead-in asks for a diagnosis when the options are mechanisms.'
          :stage==='distractors'
            ?'Use neighbouring anatomical lesions or genuinely competing physiological explanations as distractors; avoid random body systems and trivial opposites.'
            :'Verify biomedical claims strictly against the five supplied fields and remove unsupported anatomy, numerical thresholds or mechanisms.';
    return `${base}\n\nBIOMEDICAL CHECKPOINT:\n${audit}${profileRules(config)}`;
  };

  schema.validate=function(set,config){
    const errors=baseValidate(set,config);
    (set?.questions||[]).forEach((question,index)=>{
      const target=config.conditions[index];
      if(!target||!['anatomy','physiology'].includes(target.profile))return;
      if(String(question.stem||'').length<55)errors.push(`Q${index+1}: biomedical stem is too short for applied reasoning.`);
      if(!String(question.decisiveClue||'').trim())errors.push(`Q${index+1}: biomedical decisive clue is missing.`);
      const texts=(question.options||[]).map(option=>String(option.text||'').trim().toLowerCase());
      if(new Set(texts).size!==texts.length)errors.push(`Q${index+1}: biomedical options are duplicated.`);
    });
    return errors;
  };
})();
