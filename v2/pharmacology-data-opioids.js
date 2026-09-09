(function(){
  'use strict';

  window.UKMLA_PHARMACOLOGY_DATA.cards.push(...[
    {
      "name":"Morphine and oxycodone formulations",
      "section":"High-risk medicines",
      "fields":{
        "indication":"A morphine or oxycodone prescription is started, reconciled, converted or administered: identify the exact opioid, immediate-release (IR) versus modified-release (MR) formulation, route and strength before doing any dose calculation.",
        "prescribe":"Useful UK examples: morphine IR—Oramorph oral solution or Sevredol tablets; morphine MR—Zomorph or MST Continus. Oxycodone IR—OxyNorm oral solution/capsules or Shortec capsules; oxycodone MR—Longtec, Oxypro or OxyContin. Common 12-hour MR products are prescribed 12-hourly, not as PRN rescue doses. Parenteral oxycodone is prescribed as oxycodone injection with route and concentration explicit.",
        "checkMonitor":"Confirm the product, strength, route, last dose, dosing interval, total opioid in the previous 24 hours, pain response, sedation and ability to swallow. Oral IR opioid is used for relatively rapid titration or breakthrough; MR treatment is assessed over its intended dosing interval.",
        "interactionsAvoid":"Never assume that the same number of milligrams of IR and MR product is interchangeable in timing or purpose, and do not crush or chew MR preparations. Recurrent end-of-dose pain before a 12-hour MR dose is due should trigger review rather than routine shortening to an 8–10-hour schedule.",
        "toxicityAct":"Duplicate IR/MR prescriptions, an incorrect release formulation or an unintended route can produce overdose. New marked drowsiness, slow breathing, myoclonus or delirium requires opioid withholding/reduction and urgent clinical review."
      },
      "sourceRefs":["Live BNF/SmPC","Zomorph SmPC","Longtec SmPC","Scottish Palliative Care Guidelines"],
      "highRiskClass":"Opioids",
      "safetyCritical":true
    },
    {
      "name":"Opioid oral liquids: milligrams before millilitres",
      "section":"High-risk medicines",
      "fields":{
        "indication":"Morphine or oxycodone oral solution is prescribed, administered or converted and the dose must be translated from milligrams into a measurable volume.",
        "prescribe":"Define the opioid dose in mg first, verify the exact liquid concentration, then calculate volume = required dose ÷ concentration. Example: Oramorph 10 mg/5 mL is 2 mg/mL, so a 7 mg dose is 3.5 mL.",
        "checkMonitor":"Check the actual bottle or BNF strength, formulation, dose interval, maximum intended 24-hour exposure and whether the supplied oral syringe can measure the calculated volume accurately.",
        "interactionsAvoid":"Do not prescribe or hand over an opioid simply as ‘5 mL’ without the drug strength, and do not assume different liquids or brands have the same concentration. Avoid rounding until the final measurable volume is known.",
        "toxicityAct":"An implausibly small or large volume, a tenfold discrepancy or disagreement between mg and mL is a stop-and-recalculate event before administration; obtain pharmacy or senior help if uncertainty remains."
      },
      "sourceRefs":["Scottish Palliative Care Guidelines—Calculations in palliative care","Live BNF"],
      "highRiskClass":"Opioids",
      "calculationRequired":true,
      "safetyCritical":true
    },
    {
      "name":"Breakthrough opioid dosing in palliative pain",
      "section":"High-risk medicines",
      "fields":{
        "indication":"A patient established on a regular strong opioid has episodic breakthrough cancer or palliative pain requiring an immediate-release rescue dose.",
        "prescribe":"Calculate the regular opioid total over 24 hours first. Scottish palliative guidance commonly uses an IR breakthrough dose of about 1/6 to 1/10 of that 24-hour dose, individualised to response. Example: oxycodone MR 15 mg twice daily = 30 mg/24 h; using 1/6 gives oxycodone IR 5 mg PRN. State the route, minimum interval and locally appropriate maximum use.",
        "checkMonitor":"Review pain mechanism, response and duration after each rescue dose, number of effective PRNs used in the previous 24 hours, sedation, respiratory rate, bowel function and renal/hepatic function; recalculate after any background-opioid change.",
        "interactionsAvoid":"Prefer the same parent opioid for regular and breakthrough treatment where practical—Scottish JIC guidance specifically advises oxycodone breakthrough for a patient taking regular oxycodone. Do not use a palliative breakthrough ratio to justify automatic escalation of chronic non-malignant opioid therapy; specialist advice is needed for fentanyl, methadone or complex high-dose switching.",
        "toxicityAct":"Repeated or increasing rescue use should trigger reassessment of the pain cause and background regimen rather than indefinite PRN escalation. Excess sedation, confusion, myoclonus or respiratory depression requires dose withholding/reduction and urgent review."
      },
      "sourceRefs":["Scottish Palliative Care Guidelines—Calculations in palliative care","NHS Scotland Just in Case opioid guidance","Live BNF"],
      "highRiskClass":"Opioids",
      "calculationRequired":true,
      "safetyCritical":true
    },
    {
      "name":"Oral-to-subcutaneous morphine and oxycodone conversion",
      "section":"High-risk medicines",
      "fields":{
        "indication":"A patient taking oral morphine or oxycodone can no longer swallow, needs continuous subcutaneous infusion, or requires conversion to a subcutaneous breakthrough regimen.",
        "prescribe":"Work from the total opioid requirement over 24 hours. Scottish palliative calculation guidance uses oral:SC ≈2:1 for both morphine and oxycodone, so divide the oral 24-hour dose by 2 to estimate the SC 24-hour dose, then recalculate the SC breakthrough dose. Example: Zomorph 40 mg twice daily plus four effective Oramorph 10 mg doses = 120 mg oral morphine/24 h ≈ 60 mg SC morphine/24 h before further clinical adjustment.",
        "checkMonitor":"Confirm all regular and actually used breakthrough doses, formulation, route, renal/hepatic function, sedation, pain control and the reason for conversion; check syringe-driver compatibility and local palliative policy before prescribing.",
        "interactionsAvoid":"Do not apply the 2:1 shortcut to every opioid: diamorphine, fentanyl, alfentanil, buprenorphine and methadone require their own conversion guidance. Avoid automatic conversion during rapidly changing pain or toxicity without specialist review.",
        "toxicityAct":"If toxicity is already present, do not simply reproduce the calculated equianalgesic exposure. Withhold or reduce as clinically indicated and seek palliative/pharmacy advice, especially with high doses, AKI or severe hepatic impairment."
      },
      "sourceRefs":["Scottish Palliative Care Guidelines—Calculations in palliative care","NHS GGC Safer Use of Opioids","Live BNF"],
      "highRiskClass":"Opioids",
      "calculationRequired":true,
      "safetyCritical":true
    },
    {
      "name":"Changing between morphine and oxycodone",
      "section":"High-risk medicines",
      "fields":{
        "indication":"Morphine is being changed to oxycodone, or vice versa, because of adverse effects, organ dysfunction, route limitations or inadequate response despite an appropriate trial.",
        "prescribe":"Calculate the complete 24-hour dose of the current opioid, then use the current BNF/local palliative conversion table. A common Scottish teaching approximation is oral morphine:oral oxycodone about 2:1; because equianalgesic conversion is imprecise, Scottish teaching advises reducing the calculated new-opioid dose by about 30% (roughly one third) when switching, then titrating to effect when clinically appropriate.",
        "checkMonitor":"Reassess pain, sedation, respiratory rate, bowel function, age/frailty, renal/hepatic function and breakthrough use soon after the switch; document both the calculation and the planned review point.",
        "interactionsAvoid":"Do not treat any morphine–oxycodone ratio as an exact universal equivalence or convert from a single dose without first establishing the 24-hour exposure. Very high doses, methadone, transdermal opioids, severe organ failure or rapidly escalating pain need specialist input.",
        "toxicityAct":"Unexpected sedation, hallucinations, myoclonus, delirium or respiratory depression after a switch suggests excessive exposure or accumulation: withhold/reduce the opioid, reassess the conversion and escalate urgently when ventilatory toxicity is present."
      },
      "sourceRefs":["Scottish Palliative Care Guidelines—Calculations in palliative care","Live BNF—Prescribing in palliative care"],
      "highRiskClass":"Opioids",
      "calculationRequired":true,
      "safetyCritical":true
    },
    {
      "name":"Opioids in renal impairment and frailty",
      "section":"High-risk medicines",
      "fields":{
        "indication":"An older, frail or renally impaired patient is starting, escalating or developing toxicity from morphine, oxycodone or another strong opioid.",
        "prescribe":"Start lower and titrate more cautiously when frailty or organ impairment increases opioid exposure. Morphine has active metabolites that accumulate in renal failure; oxycodone clearance is also reduced. In severe renal impairment, use the local palliative pathway and specialist advice rather than routine dose conversion; Scottish JIC guidance commonly prefers alfentanil when eGFR is below 30 mL/min.",
        "checkMonitor":"Trend renal and hepatic function, hydration, cognition, sedation, respiratory rate, falls, constipation, pain benefit and recent dose changes; low muscle mass may make apparently reassuring creatinine misleading.",
        "interactionsAvoid":"Avoid sedative stacking with benzodiazepines, Z-drugs, gabapentinoids or alcohol and avoid repeatedly escalating morphine when renal function is deteriorating. Oxycodone also needs caution in hepatic impairment; local Scottish guidance advises avoiding it in moderate-to-severe hepatic failure.",
        "toxicityAct":"New drowsiness, hallucinations, delirium, myoclonus or slow breathing in renal decline should be treated as possible opioid accumulation: withhold/reduce, correct reversible factors and obtain senior/palliative advice; manage respiratory depression urgently."
      },
      "sourceRefs":["NHS Scotland Just in Case opioid guidance","NHS GGC Safer Use of Opioids","Live BNF"],
      "highRiskClass":"Opioids",
      "geriatric":true,
      "safetyCritical":true
    }
  ]);
})();
