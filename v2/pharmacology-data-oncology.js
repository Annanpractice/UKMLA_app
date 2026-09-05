(function(){
  'use strict';

  window.UKMLA_PHARMACOLOGY_DATA.cards.push(...[
    {
      "name":"Patient receiving SACT: first assessment and immediate actions",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Any acute illness in a patient receiving or recently exposed to systemic anticancer therapy (SACT); cytotoxic toxicity may occur for 6–8 weeks and immunotherapy or targeted-treatment toxicity for up to 2 years after treatment.",
        "prescribe":"Interrupt oral or infusional SACT until the acute oncology/haematology team advises; treat sepsis, shock, adrenal crisis and other time-critical emergencies without waiting for a complete treatment history.",
        "checkMonitor":"Ask cancer type, exact drug/regimen, route, last dose, oral tablets or pump, alert card and 24-hour advice line; assess NEWS, performance change and concurrent toxicities, with FBC, renal, liver, glucose and targeted tests.",
        "interactionsAvoid":"Do not assume SACT means conventional chemotherapy, continue the patient's own oral SACT by default, or attribute new symptoms solely to cancer progression or infection.",
        "toxicityAct":"An unwell SACT patient needs same-day acute-oncology/haematology discussion; haemodynamic compromise, hypoxia, altered consciousness or another life-threatening feature requires emergency and critical-care escalation."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"SACT-associated cytopenias and bleeding",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Recent SACT with pallor, dyspnoea, infection, petechiae, bruising or bleeding may reflect anaemia, neutropenia, thrombocytopenia or pancytopenia.",
        "prescribe":"Withhold further SACT and give blood products, growth factor or haemostatic treatment only through the local oncology/haematology and transfusion pathway; treat suspected neutropenic sepsis immediately.",
        "checkMonitor":"Urgent FBC and film, observations, bleeding site and volume, coagulation screen, renal/liver function and group-and-save or crossmatch; assess sepsis, DIC and marrow infiltration when relevant.",
        "interactionsAvoid":"Review anticoagulants, antiplatelets and NSAIDs; avoid IM injections, rectal procedures and unnecessary invasive intervention when significant thrombocytopenia or neutropenia is possible.",
        "toxicityAct":"Active major bleeding, haemodynamic compromise, suspected neutropenic sepsis or symptomatic severe anaemia requires urgent admission, senior oncology/haematology review and resuscitation."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"SACT diarrhoea, mucositis and dehydration",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Diarrhoea above baseline, high stoma output, oral ulceration or inability to drink during SACT—especially fluoropyrimidines, irinotecan or targeted therapy—can deteriorate rapidly.",
        "prescribe":"Interrupt oral/infusional SACT, replace fluid and electrolytes and use regimen-specific antidiarrhoeal or mucositis treatment only after severity, infection, obstruction and immune colitis are considered.",
        "checkMonitor":"Stool frequency relative to baseline, blood/mucus, abdominal signs, intake and urine output; FBC, renal function, magnesium, phosphate, liver tests and stool studies according to severity.",
        "interactionsAvoid":"Do not assume diarrhoea is infective or give antimotility treatment in ileus, severe colitis or another contraindicated setting; severe early fluoropyrimidine toxicity should trigger concern for DPD deficiency.",
        "toxicityAct":"Fever, neutropenia, peritonism, bloody diarrhoea, dehydration, AKI, uncontrolled pain or inability to drink requires urgent admission and acute-oncology review."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","MHRA fluoropyrimidine DPD warning","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"Tumour lysis syndrome and time-critical rasburicase",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"A patient with a bulky, rapidly proliferating or treatment-sensitive malignancy develops rising potassium, phosphate, urate or LDH, falling calcium, AKI, arrhythmia or seizure around treatment.",
        "prescribe":"Start the local tumour-lysis pathway with urgent specialist-directed IV hydration and urate-lowering treatment; once rasburicase is prescribed it is time critical and should be available for administration within 1 hour.",
        "checkMonitor":"Frequent potassium, phosphate, adjusted calcium, urate, creatinine and LDH, plus ECG and strict fluid balance; establish G6PD status whenever time and clinical urgency permit.",
        "interactionsAvoid":"Avoid potassium- or phosphate-containing replacement unless specifically indicated and do not delay escalation for complete laboratory criteria; rasburicase can cause haemolysis or methaemoglobinaemia in G6PD deficiency.",
        "toxicityAct":"Suspected clinical TLS, arrhythmia, seizure or worsening AKI requires immediate haematology/oncology, renal and critical-care input; stop rasburicase and treat urgently if haemolysis or methaemoglobinaemia occurs."
      },
      "sourceRefs":["SPS time-critical rasburicase guidance","British Society for Haematology TLS guidance","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"Immune-checkpoint inhibitor toxicity: overview",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"A patient exposed to an immune-checkpoint inhibitor develops a new inflammatory or unexplained symptom in any organ, even months after treatment has finished.",
        "prescribe":"Withhold further immunotherapy and contact acute oncology early; give corticosteroids or other immunosuppression according to organ, severity and the treatment-specific pathway, without delaying life-saving therapy in severe toxicity.",
        "checkMonitor":"Identify the checkpoint inhibitor and last dose, then assess all organ systems; baseline tests commonly include FBC, renal and liver tests, glucose, thyroid function and cortisol, followed by symptom-directed tests.",
        "interactionsAvoid":"Do not dismiss nonspecific fatigue, diarrhoea, cough or biochemical abnormalities, and do not anchor on infection or cancer progression—exclude dangerous alternatives in parallel.",
        "toxicityAct":"Moderate symptoms or laboratory injury need same-day oncology advice; hypoxia, shock, severe colitis, hepatitis, myocarditis, neurological weakness or multi-organ toxicity requires admission and urgent specialist management."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"Immune-checkpoint inhibitor colitis and hepatitis",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Checkpoint-inhibitor exposure with diarrhoea above baseline, blood or mucus, abdominal pain, or otherwise unexplained ALT/AST, bilirubin or INR abnormality.",
        "prescribe":"Withhold immunotherapy, replace fluid/electrolyte losses and start corticosteroid or additional immunosuppression only through the severity-based acute-oncology pathway while infection is assessed.",
        "checkMonitor":"Stool frequency and abdominal examination; FBC, renal function, CRP, stool infection testing and imaging/endoscopy when indicated; repeat liver tests, bilirubin, clotting and aetiology screen for hepatitis.",
        "interactionsAvoid":"Avoid routine antimotility treatment in severe or inflammatory colitis and avoid restarting immunotherapy without specialist clearance; infliximab is unsuitable for immune-mediated hepatitis.",
        "toxicityAct":"Peritonism, ileus, haemorrhage, fever, severe dehydration, rising bilirubin or INR, encephalopathy or rapidly worsening tests requires urgent admission and gastroenterology/hepatology plus oncology input."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"Immune-checkpoint inhibitor pneumonitis",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Checkpoint-inhibitor exposure with new cough, dyspnoea, chest pain, fever, hypoxia or new ground-glass or infiltrative change—even after a single dose or long after treatment.",
        "prescribe":"Withhold immunotherapy, give oxygen when needed and seek urgent acute-oncology/respiratory advice for grade-based corticosteroids; cover infection when clinically indicated while diagnostic work continues.",
        "checkMonitor":"Respiratory rate, oxygen saturation and ABG when unwell; CT imaging or CTPA as appropriate, cultures/viral testing and assessment for PE, infection, oedema, tumour progression and radiation injury.",
        "interactionsAvoid":"Do not assume every infiltrate is infection or every breathless cancer patient has progression; do not re-challenge immunotherapy without specialist risk assessment.",
        "toxicityAct":"New oxygen requirement, extensive radiographic change, rapidly increasing breathlessness or ARDS requires admission, high-dose specialist treatment and early critical-care involvement."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"Immune-checkpoint inhibitor endocrinopathy",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Checkpoint-inhibitor exposure with fatigue, headache, visual symptoms, postural hypotension, nausea, weight change, hyponatraemia, hypo/hyperglycaemia or thyroid symptoms suggests hypophysitis, adrenal, thyroid or pancreatic toxicity.",
        "prescribe":"Treat suspected adrenal crisis immediately with emergency hydrocortisone and IV fluid according to protocol; when combined pituitary deficits are possible, replace cortisol before starting thyroid hormone.",
        "checkMonitor":"Glucose, U&E, paired cortisol/ACTH before steroids when safe, TSH and free T4, and additional pituitary hormones or MRI according to presentation; exogenous steroids can suppress cortisol interpretation.",
        "interactionsAvoid":"Do not delay steroid treatment in shock to obtain a perfect endocrine panel and do not start levothyroxine first when untreated cortisol deficiency or hypophysitis is plausible.",
        "toxicityAct":"Shock, severe postural hypotension, hypoglycaemia, major electrolyte disturbance, severe headache, visual change or focal neurology requires emergency endocrine and acute-oncology management."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Society for Endocrinology adrenal-crisis guidance","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"Immune-checkpoint inhibitor myocarditis and neurological toxicity",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Checkpoint-inhibitor exposure with chest pain, dyspnoea, palpitations, syncope, weakness, ptosis, diplopia, dysphagia, neuropathy or reduced respiratory power; myocarditis may be minimally symptomatic and overlap with myositis.",
        "prescribe":"Withhold immunotherapy, commence continuous cardiac monitoring and obtain immediate oncology/cardiology or neurology advice for high-dose IV corticosteroid and further immunosuppression according to the emergency pathway.",
        "checkMonitor":"Serial ECG and troponin, CK, BNP, electrolytes, echocardiography and rhythm monitoring; perform a full neurological examination and measure respiratory function when neuromuscular weakness is possible.",
        "interactionsAvoid":"Do not reassure on mild symptoms or wait for overt heart failure; a raised troponin, new ECG change or bulbar/respiratory weakness is significant even when the patient initially looks well.",
        "toxicityAct":"Suspected myocarditis, arrhythmia, heart block, myasthenic presentation, bulbar dysfunction or declining respiratory function requires urgent monitored admission and early critical-care involvement."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"Fluoropyrimidines and DPD deficiency",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"5-fluorouracil, capecitabine or tegafur exposure followed—often in cycle 1 or after a dose increase—by disproportionate mucositis, diarrhoea, neutropenia, neurotoxicity or cardiac chest pain.",
        "prescribe":"Test for DPD deficiency before systemic treatment; do not give systemic fluoropyrimidines in complete deficiency and use a specialist-reduced starting dose in partial deficiency. Stop/clamp infusional 5-FU or withhold oral capecitabine during suspected severe toxicity.",
        "checkMonitor":"Confirm pretreatment DPD result, exact drug/dose and timing; check FBC, renal/liver function, hydration and electrolytes, with ECG and troponin for chest pain.",
        "interactionsAvoid":"A negative pretreatment test does not exclude severe toxicity; do not restart treatment after serious toxicity without oncology review. Routine DPD testing is not required before topical 5-FU.",
        "toxicityAct":"Severe early toxicity, dehydration, neutropenic sepsis, encephalopathy or chest pain requires immediate acute-oncology assessment and emergency management; disconnect a pump through the trained SACT pathway."
      },
      "sourceRefs":["MHRA fluoropyrimidine DPD warning","UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"Anticancer cardiac and pulmonary signature toxicities",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Recognise anthracycline or trastuzumab cardiomyopathy, fluoropyrimidine-associated coronary vasospasm/ischaemia, and bleomycin or other SACT-associated pneumonitis in a patient with new cardiac or respiratory symptoms.",
        "prescribe":"These medicines and any re-challenge are specialist-directed; withhold the suspected SACT during acute toxicity and treat heart failure, acute coronary syndrome, hypoxia or pneumonitis through the relevant emergency and oncology pathway.",
        "checkMonitor":"Treatment and cumulative-dose history, ECG/troponin, BNP and echocardiography for cardiac toxicity; oxygen saturation, imaging and pulmonary assessment for respiratory toxicity while excluding infection and PE.",
        "interactionsAvoid":"Avoid additional cardiotoxic or QT-prolonging burden where possible. Prior bleomycin exposure should be flagged to oncology and anaesthesia, but emergency oxygen must not be withheld from a hypoxic patient.",
        "toxicityAct":"Chest pain during 5-FU/capecitabine, acute heart failure, arrhythmia or new hypoxia/infiltrates requires immediate treatment interruption and urgent cardiology/respiratory plus oncology review."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true
    },
    {
      "name":"Anticancer renal, neurological and gastrointestinal signature toxicities",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Recognise platinum-associated AKI, magnesium loss and ototoxicity; taxane/oxaliplatin neuropathy; and vincristine neuropathy, weakness, constipation or paralytic ileus.",
        "prescribe":"Use only within a specialist protocol with treatment-specific hydration, antiemesis and dose modification; institute an active bowel plan when a vinca alkaloid and other constipating medicines are used.",
        "checkMonitor":"Renal function, magnesium/potassium, fluid balance and hearing with platinum therapy; serial neuropathy, gait, function and bowel assessment with neurotoxic treatments.",
        "interactionsAvoid":"Avoid avoidable nephrotoxic combinations and dehydration. Vincristine must never be administered intrathecally—this error is usually fatal—and must remain separated from intrathecal medicines.",
        "toxicityAct":"AKI, severe electrolyte disturbance, hearing loss, progressive motor neuropathy, autonomic dysfunction, ileus or respiratory weakness requires treatment withholding and urgent oncology/specialist assessment."
      },
      "sourceRefs":["NHS England vinca-alkaloid safety guidance","UKONS Acute Oncology Initial Management Guidelines v4","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    },
    {
      "name":"SACT extravasation and infusion reactions",
      "section":"Oncology & SACT",
      "fields":{
        "indication":"Pain, burning, swelling, induration, leakage, resistance or loss of flow at a SACT line suggests extravasation; flushing, urticaria, wheeze, hypotension or airway symptoms during infusion suggests a systemic reaction.",
        "prescribe":"Stop the infusion immediately. For extravasation leave the access device in place, aspirate without flushing and follow the drug-specific local kit/pathway; treat anaphylaxis immediately with IM adrenaline through the RCUK pathway.",
        "checkMonitor":"Record the drug, vesicant/irritant status, concentration, estimated volume and site; assess observations/NEWS and airway, mark and document the affected area and examine the vascular device.",
        "interactionsAvoid":"Do not flush an extravasation, remove a peripheral cannula before attempted aspiration, or apply heat/cold or an antidote without the drug-specific protocol; do not restart the infusion elsewhere without senior approval.",
        "toxicityAct":"Any vesicant or CVAD extravasation, large-volume injury, blistering/necrosis or severe infusion reaction requires immediate acute-oncology/IV-access advice and plastics or critical-care escalation according to local policy."
      },
      "sourceRefs":["UKONS Acute Oncology Initial Management Guidelines v4","Resuscitation Council UK anaphylaxis guidance","Live BNF/SmPC"],
      "oncology":true,
      "safetyCritical":true
    }
  ]);
})();
