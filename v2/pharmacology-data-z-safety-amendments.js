(function(){
  'use strict';

  const cards=window.UKMLA_PHARMACOLOGY_DATA.cards;

  function amend(name,fields,sourceRefs){
    const card=cards.find(item=>item.name===name);
    if(!card)throw new Error(`Cannot amend missing pharmacology card: ${name}`);
    Object.assign(card.fields,fields);
    card.sourceRefs=[...new Set([...(card.sourceRefs||[]),...sourceRefs])];
  }

  amend('Neutropenic sepsis',{
    indication:'Fever, temperature below the local lower threshold or otherwise unexplained illness during SACT or within about 6 weeks of myelosuppressive treatment—patients taking steroids or analgesia may not mount a fever.',
    prescribe:'Give empirical IV piperacillin–tazobactam monotherapy within 1 hour of presentation according to local policy unless allergy, microbiology or patient-specific factors require another regimen; interrupt oral or infusional SACT.',
    checkMonitor:'Do not wait for the neutrophil count: take cultures, FBC, renal/liver function and lactate promptly, assess the source and resistant-organism history, and identify the exact regimen, last dose, tablets or pump and SACT alert information.',
    interactionsAvoid:'Do not delay antibiotics, perform a rectal examination or add an aminoglycoside routinely without a specific indication; ensure the patient does not continue oral SACT and arrange trained disconnection/clamping of an active pump when required.',
    toxicityAct:'Treat as neutropenic sepsis until proven otherwise; shock, pneumonia, line infection, resistant pathogen or deterioration requires immediate acute-oncology/microbiology and critical-care management.'
  },['UKONS Acute Oncology Initial Management Guidelines v4']);

  amend('Anticholinergic burden, falls and polypharmacy',{
    indication:'An older or frail patient develops falls, delirium, dry mouth, blurred vision, urinary retention, constipation or functional decline while taking multiple medicines.',
    prescribe:'Review cumulative anticholinergic and sedative load—including bladder antimuscarinics, TCAs, first-generation antihistamines and antipsychotics—plus orthostatic medicines, hypoglycaemics and opioids; deprescribe according to indication, goals and withdrawal risk.',
    checkMonitor:'Postural BP, cognition, bowel/bladder function, vision, falls, renal function, adherence and the timing of symptoms against medicine changes.',
    interactionsAvoid:'Do not stop benzodiazepines, antidepressants or antipsychotics abruptly, or create a prescribing cascade—for example treating amlodipine oedema with an unnecessary diuretic—without reviewing the causative medicine.',
    toxicityAct:'Acute delirium, injury, retention, ileus/severe constipation or recurrent falls requires urgent assessment for illness, injury and cumulative medicine toxicity.'
  },['Scottish Polypharmacy Guidance 2026–29']);
})();
