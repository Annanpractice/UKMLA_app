(function(){
  'use strict';

  window.UKMLA_PHARMACOLOGY_DATA.cards.push(...[
    {
      "name":"Antidepressant adverse effects and withdrawal",
      "section":"Geriatrics & frailty",
      "fields":{
        "indication":"An SSRI, SNRI or TCA is started, reviewed, or implicated in falls, confusion, bleeding, arrhythmia or hyponatraemia—especially in an older adult.",
        "prescribe":"Choose according to comorbidity and interaction burden, document the indication and review point, and reduce in stages rather than stopping abruptly after established treatment.",
        "checkMonitor":"Review mood, suicidality or emerging mania, falls, bleeding and adverse effects; check sodium when older, frail, taking a diuretic or symptomatic, and ECG when drug- or patient-specific QT risk warrants it.",
        "interactionsAvoid":"Avoid unsafe serotonergic combinations such as an MAOI with another antidepressant; tramadol or linezolid can add serotonin toxicity, while NSAIDs, antiplatelets and anticoagulants increase GI-bleeding risk.",
        "toxicityAct":"Confusion or seizure with hyponatraemia, serotonin toxicity, major bleeding, arrhythmia or severe suicidality requires immediate medicine withholding where appropriate and urgent assessment."
      },
      "sourceRefs":["NICE NG222","NICE NG215","Live BNF"],
      "geriatric":true
    },
    {
      "name":"Benzodiazepine, Z-drug and gabapentinoid safety",
      "section":"Geriatrics & frailty",
      "fields":{
        "indication":"A benzodiazepine, Z-drug, gabapentin or pregabalin is considered or an older patient develops sedation, ataxia, falls, confusion or respiratory compromise.",
        "prescribe":"Use a clear indication, lowest effective dose and planned review or exit strategy; adjust gabapentinoids for renal function and explain dependence, tolerance and withdrawal before starting.",
        "checkMonitor":"Sedation, cognition, gait, respiratory rate, renal function, duration, early requests, loss of control and concurrent alcohol, opioid or other sedative exposure.",
        "interactionsAvoid":"Avoid sedative stacking—particularly with opioids or alcohol—and do not stop established treatment abruptly; withdrawal may require an individualised taper over weeks or months.",
        "toxicityAct":"Reduced consciousness or respiratory depression requires immediate airway assessment and drug withholding; delirium, severe autonomic symptoms or seizure during withdrawal requires urgent treatment."
      },
      "sourceRefs":["MHRA January 2026 dependency warning","NICE NG215","Live BNF"],
      "geriatric":true,
      "highRiskClass":"Sedatives"
    },
    {
      "name":"Antipsychotics in dementia",
      "section":"Geriatrics & frailty",
      "fields":{
        "indication":"Consider only when a person with dementia risks harming themselves or others, or has agitation, hallucinations or delusions causing severe distress, after reversible causes and non-drug measures are addressed.",
        "prescribe":"Discuss benefits and harms, define target symptoms, use the lowest effective dose for the shortest possible time and reassess at least every 6 weeks with an explicit stop plan.",
        "checkMonitor":"Delirium triggers, pain, infection, constipation or retention; then sedation, postural BP, falls, swallowing, extrapyramidal effects, ECG/QT and metabolic effects as appropriate.",
        "interactionsAvoid":"Avoid routine use for wandering or sedation and avoid dopamine-blocking drugs in Parkinson's disease or dementia with Lewy bodies unless specialist benefit clearly outweighs marked sensitivity risk.",
        "toxicityAct":"New focal neurology, profound sedation, aspiration, severe rigidity, fever, dysphagia, syncope or arrhythmia requires immediate cessation or withholding and urgent assessment."
      },
      "sourceRefs":["NICE NG97","MHRA antipsychotic dementia warning","Live BNF"],
      "geriatric":true
    },
    {
      "name":"Cholinesterase inhibitor and memantine safety",
      "section":"Geriatrics & frailty",
      "fields":{
        "indication":"Donepezil, rivastigmine, galantamine or memantine is initiated or reviewed in a person with an established dementia diagnosis and a documented treatment plan.",
        "prescribe":"Titrate according to the specialist or shared-care plan and continue only while benefit and tolerability remain reasonable; ensure a reliable administration plan and avoid unintended interruption.",
        "checkMonitor":"Pulse, syncope and falls, weight and appetite, nausea/diarrhoea, adherence and renal function—particularly for memantine; obtain an ECG when bradycardia or conduction risk is present.",
        "interactionsAvoid":"Beta-blockers, digoxin and other rate-limiting drugs can add bradycardia; anticholinergics oppose cholinesterase inhibitors, while NSAIDs can add peptic-ulcer risk.",
        "toxicityAct":"Symptomatic bradycardia, heart block, syncope, persistent vomiting, dehydration or clinically important weight loss requires withholding and prompt medication and cardiac review."
      },
      "sourceRefs":["NICE TA217","Live BNF/SmPC"],
      "geriatric":true
    },
    {
      "name":"Clozapine emergencies",
      "section":"High-risk medicines",
      "fields":{
        "indication":"A patient taking clozapine develops fever or sore throat, chest pain or persistent tachycardia, severe constipation or abdominal symptoms, seizure, sedation or unexplained deterioration.",
        "prescribe":"Use only through the clozapine monitoring service; if more than 48 hours of treatment are missed, do not resume the previous dose—contact the specialist service for re-titration.",
        "checkMonitor":"Mandatory blood monitoring, bowel function, infection symptoms, pulse and early myocarditis features; review smoking changes, interacting medicines and a clozapine concentration when toxicity is suspected.",
        "interactionsAvoid":"Avoid avoidable anticholinergic, constipating and sedative combinations; smoking cessation can raise clozapine exposure, while fluvoxamine and ciprofloxacin may markedly increase concentrations.",
        "toxicityAct":"Arrange an urgent FBC for fever or sore throat; suspected myocarditis, ileus/obstruction, agranulocytosis, seizure or severe toxicity requires immediate clozapine-service and emergency assessment."
      },
      "sourceRefs":["MHRA clozapine gastrointestinal warning","SPS clozapine monitoring","Live BNF/SmPC"],
      "highRiskClass":"Clozapine",
      "safetyCritical":true
    },
    {
      "name":"Antithyroid-drug toxicity",
      "section":"High-risk medicines",
      "fields":{
        "indication":"Carbimazole or propylthiouracil is used for hyperthyroidism and the patient develops fever, sore throat, mouth ulcers, bruising, jaundice, pruritus or abdominal pain.",
        "prescribe":"Start and adjust under the thyroid plan, counsel explicitly about agranulocytosis and hepatic symptoms, and use the pregnancy-specific specialist pathway when relevant.",
        "checkMonitor":"Baseline FBC and liver tests, thyroid function at treatment intervals, and an urgent differential white count or liver tests when corresponding symptoms occur; routine FBC cannot reliably predict abrupt agranulocytosis.",
        "interactionsAvoid":"Do not continue the drug while awaiting results after fever, sore throat or mouth ulcers; carbimazole and propylthiouracil have different pregnancy and hepatic risk profiles requiring specialist selection.",
        "toxicityAct":"Stop treatment and obtain an urgent FBC for suspected agranulocytosis; jaundice or significant liver injury, pancreatitis or sepsis requires immediate specialist or emergency assessment."
      },
      "sourceRefs":["NICE NG145","Live BNF/SmPC"],
      "highRiskClass":"Other",
      "safetyCritical":true
    },
    {
      "name":"Nitrofurantoin pulmonary and hepatic toxicity",
      "section":"Antimicrobials",
      "fields":{
        "indication":"Nitrofurantoin is prescribed for a susceptible lower UTI and the patient develops new cough, dyspnoea, fever, chest discomfort, jaundice, dark urine, pruritus or right-upper-quadrant pain.",
        "prescribe":"Use only when renal function, infection site and pregnancy stage permit; record and regularly review the indication for long-term prophylaxis, particularly in an older person.",
        "checkMonitor":"Renal function before treatment and respiratory or hepatic symptoms throughout; periodically monitor liver function and pulmonary features during prolonged treatment.",
        "interactionsAvoid":"Do not use for pyelonephritis, systemic infection or suspected prostatitis, and avoid re-exposure after previous nitrofurantoin-related pulmonary or hepatic injury.",
        "toxicityAct":"Stop nitrofurantoin immediately if pulmonary injury is suspected and investigate promptly; discontinue and urgently assess biochemical or clinical evidence of hepatitis or liver injury."
      },
      "sourceRefs":["MHRA nitrofurantoin pulmonary/hepatic warning","NICE NG109","Live BNF"],
      "antimicrobial":true,
      "geriatric":true
    },
    {
      "name":"Long-term proton-pump inhibitor review and toxicity",
      "section":"Geriatrics & frailty",
      "fields":{
        "indication":"A PPI remains on repeat medication without a current indication or an older patient develops diarrhoea, electrolyte disturbance, anaemia or renal dysfunction during prolonged treatment.",
        "prescribe":"Retain full-dose therapy for a continuing high-risk indication; otherwise use the lowest effective dose, step down or stop with advice that rebound acid symptoms can follow withdrawal.",
        "checkMonitor":"Review the original indication, ongoing ulcer/bleeding risk and interacting medicines; consider magnesium, B12, iron and renal assessment when prolonged exposure, symptoms or additional risks justify it.",
        "interactionsAvoid":"Avoid omeprazole or esomeprazole with clopidogrel when an alternative PPI is suitable; do not remove gastroprotection while a substantial NSAID, antiplatelet or anticoagulant GI risk persists.",
        "toxicityAct":"Tetany, seizure or arrhythmia with hypomagnesaemia, persistent diarrhoea suggesting C. difficile, or suspected acute interstitial nephritis requires prompt cessation review and treatment."
      },
      "sourceRefs":["NICE CG184","MHRA PPI hypomagnesaemia warning","Live BNF"],
      "geriatric":true
    },
    {
      "name":"Inhaled corticosteroid and montelukast safety",
      "section":"High-risk medicines",
      "fields":{
        "indication":"Preventer or add-on asthma/COPD treatment is initiated or reviewed, or the patient develops oral symptoms, recurrent pneumonia, adrenal features or new mood, sleep or behavioural change.",
        "prescribe":"Use an inhaled corticosteroid-containing regimen according to the current asthma/COPD pathway, teach technique and mouth rinsing or spacer use, and explain neuropsychiatric warnings before montelukast.",
        "checkMonitor":"Inhaler technique, adherence, reliever use, oral candidiasis/dysphonia, growth in children and pneumonia risk in COPD; ask directly about sleep, mood and behaviour after montelukast starts.",
        "interactionsAvoid":"Do not use montelukast as a substitute for essential inhaled corticosteroid treatment; strong CYP3A4 inhibitors can increase systemic exposure to susceptible high-dose inhaled corticosteroids.",
        "toxicityAct":"Treat local steroid effects and review dose/technique; suspected adrenal suppression or pneumonia needs prompt assessment, and new or worsening neuropsychiatric symptoms require montelukast discontinuation and medical review."
      },
      "sourceRefs":["NICE NG245","MHRA montelukast neuropsychiatric warning","Live BNF"],
      "highRiskClass":"Steroids"
    }
  ]);
})();
