# Clinical Pharmacology & Safe Prescribing source framework

Checked: **19 July 2026**

This module adds a first-class **Clinical Pharmacology & Safe Prescribing** topic to the UKMLA card atlas. It contains 108 five-field cards:

1. Indication / recognise
2. Prescribe
3. Check / monitor
4. Interactions / avoid
5. Toxicity / act

The cards are concise revision prompts, not a substitute for checking the current online BNF/BNFc, the relevant product information, local antimicrobial guidance, local resuscitation policy or senior/specialist advice.

## Coverage

- calculations, formulation and prescription review
- adult and paediatric emergencies
- cardiovascular medicines and resuscitation drugs
- anticoagulation, VTE duration and reversal
- CAP, atypical pneumonia, HAP and common day-to-day antimicrobials
- insulin, methotrexate, lithium, opioids and other high-risk medicines
- frailty, renal function, falls and acute-illness medicine review
- topical corticosteroid potency, eczema, psoriasis, acne, fungal infection and topical quantities

## Main authoritative sources

### Prescribing framework

- GMC, *Outcomes for graduates* and the Medical Licensing Assessment content map
- Prescribing Safety Assessment, official assessment domains
- NICE medicines optimisation guidance
- current online BNF and BNF for Children

### Emergency and cardiovascular prescribing

- Resuscitation Council UK, **2025 Adult Advanced Life Support**
- Resuscitation Council UK, **2025 Paediatric Life Support**
- Resuscitation Council UK, emergency treatment of anaphylaxis
- NICE guidance for acute coronary syndromes, atrial fibrillation, hypertension, chronic heart failure and venous thromboembolic disease

### Antimicrobials

- NICE NG250, *Pneumonia: diagnosis and management* (adult and paediatric CAP; HAP)
- NICE antimicrobial-prescribing guidance for COPD exacerbation, lower UTI, pyelonephritis, acute prostatitis, cellulitis, bites, impetigo, infected eczema, C. difficile and neutropenic sepsis
- MHRA restrictions and precautions for fluoroquinolones
- local microbiology policy where national guidance deliberately offers several agents

### High-risk and specialist medicines

- MHRA drug-safety updates
- NICE and SPS monitoring guidance
- current product information and online BNF/BNFc for indication-specific dosing, renal/hepatic adjustment, interactions, monitoring and reversal

### Dermatology and topical prescribing

- NICE guidance for atopic eczema, psoriasis, acne, impetigo and secondary bacterial infection of eczema
- current BNF/BNFc topical corticosteroid potency classification
- NHS fingertip-unit and formulation guidance

## Safety rules built into the module

- Exact doses are taught only with their clinical context, route, frequency, duration and relevant maximum.
- Paediatric calculations distinguish mg/kg **per dose** from mg/kg **per day** and require practical formulation conversion.
- DOAC questions distinguish acute loading, standard treatment, extended prevention and the separate decision about treatment duration.
- Renal questions distinguish Cockcroft–Gault creatinine clearance from eGFR when medicine licensing or patient factors require it.
- Antibiotic questions preserve severity, allergy, site penetration, culture results, IV-to-oral review and local resistance policy.
- Emergency-drug questions preserve concentration and administration speed to reduce tenfold errors.
- Content that is intentionally local or specialist-directed is labelled as such rather than presented as a universal regimen.

## Maintenance

The source check date is stored in the runtime data. Before changing a dose or regimen:

1. confirm the current online BNF/BNFc monograph;
2. check whether NICE, RCUK, MHRA or the relevant product information has changed;
3. retain local-policy caveats;
4. update the card and its source references together;
5. run `node scripts/validate_pharmacology_module.js`.
