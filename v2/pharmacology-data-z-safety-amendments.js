(function(){
  'use strict';

  const cards=window.UKMLA_PHARMACOLOGY_DATA.cards;

  function amend(name,fields,sourceRefs){
    const card=cards.find(item=>item.name===name);
    if(!card)throw new Error(`Cannot amend missing pharmacology card: ${name}`);
    Object.assign(card.fields,fields);
    card.sourceRefs=[...new Set([...(card.sourceRefs||[]),...sourceRefs])];
  }

  function add(card){
    if(cards.some(item=>item.name===card.name))return;
    cards.push(card);
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

  add({
    name:'Zopiclone — prescribing and safety',
    section:'Geriatrics & frailty',
    fields:{
      indication:'Short-term treatment of severe or distressing insomnia in adults after addressing reversible causes and non-drug measures; it is a benzodiazepine-like Z-drug rather than a long-term sleep treatment.',
      prescribe:'Use the lowest effective dose for the shortest duration. A common adult dose is 7.5 mg once at night; start at 3.75 mg in older adults and in hepatic, renal or chronic respiratory impairment. Treatment should generally not exceed 4 weeks including tapering.',
      checkMonitor:'Review daytime sedation, cognition, falls, sleep benefit, duration of use, dependence/tolerance, rebound insomnia and requests for early or escalating supply; reassess the cause of persistent insomnia.',
      interactionsAvoid:'Avoid alcohol, opioids and other CNS depressants where possible because sedation and respiratory depression are additive. Use caution in respiratory disease and avoid routine repeat-night dosing or prolonged courses.',
      toxicityAct:'Marked sedation, ataxia, confusion or respiratory depression requires withholding and urgent assessment. After established use, reduce gradually rather than stopping abruptly if withdrawal or rebound insomnia is likely.'
    },
    sourceRefs:['NICE TA77','Zopiclone UK SmPC 2026','NICE NG215','Live BNF'],
    geriatric:true,
    highRiskClass:'Sedatives',
    safetyCritical:true
  });

  add({
    name:'Zolpidem — prescribing and next-day impairment',
    section:'Geriatrics & frailty',
    fields:{
      indication:'Short-term management of severe or distressing insomnia in adults when a hypnotic is appropriate after reversible causes and non-drug measures have been considered.',
      prescribe:'Use a single bedtime dose at the lowest effective strength. Usual adult maximum is 10 mg once nightly; use 5 mg in older or debilitated adults and start at 5 mg in hepatic impairment. Do not repeat the dose during the same night.',
      checkMonitor:'Assess next-day drowsiness, confusion, falls, memory impairment, abnormal night-time behaviour, dependence/tolerance and ongoing need; ensure the patient can allow about 8 hours for uninterrupted sleep before driving or hazardous activity.',
      interactionsAvoid:'Alcohol, opioids and other sedatives increase CNS and respiratory depression. Next-day psychomotor impairment is more likely with higher doses, interacting CNS depressants or less than 8 hours between dosing and activities requiring alertness.',
      toxicityAct:'Stop and urgently review profound sedation, respiratory depression, severe confusion or dangerous complex sleep behaviour. Established regular use may need gradual withdrawal to reduce rebound insomnia and withdrawal symptoms.'
    },
    sourceRefs:['NICE TA77','Zolpidem UK SmPC 2025/26','NICE NG215','Live BNF'],
    geriatric:true,
    highRiskClass:'Sedatives',
    safetyCritical:true
  });

  add({
    name:'Z-drugs — class safety, dependence and deprescribing',
    section:'Geriatrics & frailty',
    fields:{
      indication:'Zopiclone or zolpidem is being started, repeated, reviewed or implicated in falls, confusion, daytime impairment or dependence; zaleplon is a less commonly encountered drug in the same hypnotic class.',
      prescribe:'Reserve Z-drugs for short-term severe insomnia, use the lowest effective dose, agree an exit plan at initiation and avoid automatically switching to another hypnotic solely because one agent was ineffective.',
      checkMonitor:'Duration, benefit, daytime sedation, cognition, falls, driving risk, escalating dose or early requests, alcohol/opioid use and symptoms of tolerance, dependence, rebound insomnia or withdrawal.',
      interactionsAvoid:'Avoid sedative stacking with opioids, alcohol, benzodiazepines and other CNS depressants; use particular caution in older/frail patients and people with respiratory impairment or obstructive sleep apnoea.',
      toxicityAct:'Over-sedation or respiratory compromise requires airway-focused urgent assessment. For prolonged regular use, use an individualised gradual taper rather than abrupt cessation unless an immediate safety reason requires stopping.'
    },
    sourceRefs:['NICE TA77','NICE NG215','MHRA dependency warnings','Live BNF'],
    geriatric:true,
    highRiskClass:'Sedatives'
  });
})();
