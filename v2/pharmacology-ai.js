(function(){
  'use strict';

  const schema=window.UKMLA_V2_AI_SCHEMA;
  if(!schema||schema.__pharmacologyAware)return;
  schema.__pharmacologyAware=true;

  const baseGenerationPrompt=schema.generationPrompt;
  const baseCheckpointPrompt=schema.checkpointPrompt;
  const baseRepairPrompt=schema.repairPrompt;
  const baseValidate=schema.validate;

  function targets(config){
    return(config.conditions||[]).filter(item=>item.profile==='pharmacology');
  }

  function profileRules(config){
    const items=targets(config);
    if(!items.length)return'';
    const rules=items.map(item=>{
      const number=(config.conditions||[]).indexOf(item)+1;
      const section=item.section||'general pharmacology';
      return`Question ${number} targets CLINICAL PHARMACOLOGY (${item.name}; ${section}). Test one prescribing decision: indication, exact regimen, calculation, monitoring, interaction/contraindication, toxicity, withholding, antidote or escalation.`;
    });
    return`\n\nCLINICAL PHARMACOLOGY AND SAFE-PRESCRIBING RULES:
${rules.join('\n')}
- Treat the supplied five fields as the factual boundary. Never invent a dose, route, frequency, duration, threshold, interaction or antidote absent from them.
- The five pharmacology meanings are: mimics = indication/recognise; treatment = prescribe; investigations = check/monitor; redFlags = interactions/avoid; escalation = toxicity/act.
- Preserve adult versus paediatric context. Distinguish mg/kg/dose from mg/kg/day, apply stated maxima and convert to an administrable volume when the data permit.
- For renal dosing, distinguish Cockcroft–Gault creatinine clearance from eGFR whenever the card does.
- For antimicrobials, preserve infection severity, duration, allergy, tissue penetration, culture and local-policy caveats. Do not turn a locally selected regimen into a universal national rule.
- For cardiovascular emergencies, preserve concentration, route, bolus speed, repeat interval, maximum dose and rhythm context.
- Use homogeneous options: complete regimens compete with complete regimens; monitoring plans with monitoring plans; interactions with interactions; calculated values with calculated values.
- A dose-calculation stem must include every numerical value and unit needed. The rationale must show the essential arithmetic without adding a new clinical rule.
- Do not ask the candidate to recall an unspecified live-BNF value. If an exact value is not in the supplied field, test the safe verification or escalation action instead.`;
  }

  function checkpointRule(stage){
    if(stage==='generation')return'Restore the pharmacology target and test one precise prescribing decision without substituting a diagnosis-only question.';
    if(stage==='sparse')return'Keep one decisive prescribing modifier. Retain dose, route, frequency, duration, weight, renal value or concentration only when required to answer.';
    if(stage==='options')return'Use parallel complete regimens, calculations, monitoring plans, interactions or toxicity actions. Never mix drugs, diagnoses and investigations in one option set.';
    if(stage==='category')return'Ensure every option answers the same prescribing lead-in and carries the correct generic scoring param for the tested pharmacology field.';
    if(stage==='distractors')return'Use realistic near-miss errors: wrong interval, omitted maximum, wrong renal estimate, unsafe interaction, wrong duration or failure to escalate. Do not create absurd decimal errors unless calculation safety is the target.';
    if(stage==='source')return'Verify every dose and safety claim against the supplied five fields and source references. Remove unsupported additions.';
    return'Preserve exact units, population, route, duration, monitoring and local-policy caveats; remove unsupported pharmacology claims.';
  }

  schema.generationPrompt=function(config){
    return baseGenerationPrompt(config)+profileRules(config);
  };

  schema.checkpointPrompt=function(stage,config){
    const base=baseCheckpointPrompt(stage,config);
    if(!targets(config).length)return base;
    return`${base}\n\nPHARMACOLOGY CHECKPOINT:\n${checkpointRule(stage)}`;
  };

  schema.repairPrompt=function(stage,config,errors,attempt,maxAttempts){
    const base=baseRepairPrompt(stage,config,errors,attempt,maxAttempts);
    if(!targets(config).length)return base;
    return`${base}\n\nPHARMACOLOGY AUTOMATIC REPAIR:\n${checkpointRule(stage)} Make the smallest correction and do not alter already-correct doses or units.`;
  };

  schema.validate=function(set,config,stage='final'){
    const errors=baseValidate(set,config,stage);
    (set?.questions||[]).forEach((question,index)=>{
      const target=config.conditions[index];
      if(!target||target.profile!=='pharmacology')return;
      const options=question.options||[];
      const texts=options.map(option=>String(option.text||'').trim().toLowerCase());
      if(new Set(texts).size!==texts.length)errors.push(`Q${index+1}: pharmacology options are duplicated.`);
      if(options.some(option=>!['investigations','treatment','escalation','mimics','redFlags'].includes(option.param))){
        errors.push(`Q${index+1}: pharmacology scoring param is invalid.`);
      }
      if(/calculate|calculated|mg\/kg|micrograms\/kg|mL\/hour/i.test(`${question.stem} ${question.leadIn}`)){
        if(!/\d/.test(question.stem||''))errors.push(`Q${index+1}: calculation stem lacks numerical data.`);
        if(!options.every(option=>/\d/.test(option.text||'')))errors.push(`Q${index+1}: calculation options must be numerical values with units.`);
      }
      if(schema.stageAtLeast(stage,'source')){
        const combined=`${question.learningPoint||''} ${question.rationale||''}`;
        if(/\b(?:always|never)\b/i.test(combined)&&!Object.values(target.fields||{}).some(value=>/\b(?:always|never)\b/i.test(value))){
          errors.push(`Q${index+1}: unsupported absolute pharmacology claim.`);
        }
      }
    });
    return errors;
  };
})();
