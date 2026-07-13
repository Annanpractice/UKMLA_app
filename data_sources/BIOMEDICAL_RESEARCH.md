# Clinical anatomy and physiology data scope

## Purpose

These are original revision cards for clinically applied biomedical-science testing. They are stored in the same card registry as the existing clinical conditions so they participate in topic health, condition coverage, focus mode, local quizzes, AI-generated quizzes and analytics.

The allocation is a revision design choice, not a claim that the UKMLA publishes a fixed anatomy or physiology percentage.

## UKMLA scope

The updated GMC MLA content map includes **clinical anatomy** and **clinical physiology** within biomedical sciences and describes biomedical knowledge as integrated with clinical presentations, diagnosis and management.

Primary scope references:

- GMC, MLA content map — Domain 2, areas of professional knowledge: https://www.gmc-uk.org/education/medical-licensing-assessment/mla-content-map/domain-2-areas-of-professional-knowledge
- GMC, About the MLA content map: https://www.gmc-uk.org/education/medical-licensing-assessment/mla-content-map/about-the-mla-content-map

## Clinical Anatomy source policy

`biomedical-anatomy.tsv` preserves every distinct concept supplied in the Complete High-Yield Anatomy OSPE Checklist and its additional exam-recall section. Entries were normalised into one concept per row and clinically ambiguous wording was clarified without removing the original concept.

Examples of clarification:

- `Dural sac` ends at S2, rather than implying all dura mater ends there.
- Bronchopulmonary segments are classically 10 on the right and commonly 8–10 on the left.
- The young-child airway card describes the functionally narrow subglottic/cricoid region without presenting the historical cricoid-only claim as an absolute.
- Cavernous-sinus contents distinguish nerves in the lateral wall from CN VI beside the internal carotid artery.

The five card fields are:

1. Exact high-yield answer
2. Clinical association / deficit
3. Localisation logic
4. Discriminator / trap
5. Applied exam use

## Clinical Physiology research policy

`biomedical-physiology.tsv` is an original curated bank organised around mechanisms commonly needed to interpret clinical vignettes, observations, laboratory results, ECGs and lesion patterns. It does not reproduce question-bank material.

Major source frameworks used to define the scope include:

- GMC MLA biomedical-sciences domain, above.
- European Society of Cardiology acute coronary syndrome guideline framework: https://www.escardio.org/Guidelines/Clinical-Practice-Guidelines/Acute-Coronary-Syndromes-ACS-Guidelines
- Fourth Universal Definition of Myocardial Infarction: https://academic.oup.com/eurheartj/article/40/3/237/5079081
- Bamford J, Sandercock P, Dennis M, Warlow C, Burn J. *Classification and natural history of clinically identifiable subtypes of cerebral infarction*. Lancet. 1991;337:1521–1526. DOI: 10.1016/0140-6736(91)93206-O.

The physiology bank deliberately includes:

- Cardiac output, pressure–volume loops, shock and autonomic compensation
- Cardiac action potentials, electrolytes and ECG intervals
- Coronary territories, contiguous leads, reciprocal changes and high-risk occlusion patterns
- V/Q mismatch, shunt, dead space, respiratory failure and oxygen transport
- Renal haemodynamics, nephron segments, osmolality and electrolyte shifts
- Acid–base compensation and mixed-disorder recognition
- Endocrine feedback axes and dynamic-test principles
- Reproductive and fetal physiology
- Oxygen content, coagulation and iron physiology
- Gastrointestinal and hepatic physiology
- Cerebral perfusion, neural pathways and stroke localisation
- Oxford/Bamford TACS, PACS, LACS and POCS clinical syndromes
- MCA, ACA, PCA, perforator, PICA, AICA and basilar patterns

The five card fields are:

1. System / subdomain
2. Core mechanism
3. Clinical pattern
4. Discriminator / trap
5. Applied exam use

## Testing design

Local biomedical drills use profile-specific question types rather than forcing anatomy and physiology through treatment-oriented clinical-card wording.

Clinical Anatomy tests:

- lesion or structure localisation
- predicted deficit or complication
- close anatomical discriminator
- applied OSPE/spotter sequence

Clinical Physiology tests:

- mechanism explaining a presentation or result
- predicted clinical/laboratory pattern
- competing-mechanism discrimination
- applied interpretation or treatment-effect reasoning

The AI generator retains its existing ten-question pipeline but receives additional rules for biomedical cards: at least two linked reasoning steps, homogeneous distractors, no bare-definition questions and no unsupported numerical thresholds or anatomical variants.
