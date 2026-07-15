const fs = require('fs');
const vm = require('vm');

class MemoryStorage {
  constructor(){ this.map=new Map(); }
  getItem(key){ return this.map.has(key)?this.map.get(key):null; }
  setItem(key,value){ this.map.set(String(key),String(value)); }
  removeItem(key){ this.map.delete(String(key)); }
}

const context = {
  window: {},
  console,
  localStorage: new MemoryStorage(),
  location: { search: '' },
  URLSearchParams
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('v2/ai-schema.js', 'utf8'), context, { filename: 'v2/ai-schema.js' });
vm.runInContext(fs.readFileSync('v2/biomedical-ai.js', 'utf8'), context, { filename: 'v2/biomedical-ai.js' });
vm.runInContext(fs.readFileSync('v2/ai-pipeline-mode.js', 'utf8'), context, { filename: 'v2/ai-pipeline-mode.js' });

const schema = context.window.UKMLA_V2_AI_SCHEMA;
if (!schema) throw new Error('Question schema did not initialise.');

const conditions = schema.TYPES.map((type, index) => ({
  id: `condition-${index + 1}`,
  topicId: index === 0 ? 'topic-physiology' : `topic-${index + 1}`,
  topic: index === 0 ? 'Clinical Physiology' : `Topic ${index + 1}`,
  name: index === 0 ? 'LAD: anterior ECG territory' : `Condition ${index + 1}`,
  profile: index === 0 ? 'physiology' : 'clinical',
  fields: {},
  labels: {}
}));
const questionTypes = schema.TYPES.map(type => type[0]);
const config = { conditions, questionTypes, knowledge: false, topic: 'All UKMLA topics' };

function optionsFor(index) {
  const texts = [
    'Anterior transmural injury vector',
    'Posterior transmural injury vector',
    'Diffuse epicardial inflammation',
    'Global subendocardial ischaemia',
    'Secondary repolarisation abnormality'
  ];
  return texts.map((text, optionIndex) => ({
    id: 'ABCDE'[optionIndex],
    text: index === 0 ? text : `${['Urgent','Routine','Delayed','Conservative','Specialist'][optionIndex]} action`,
    topicId: conditions[index].topicId,
    topicName: conditions[index].topic,
    conditionId: conditions[index].id,
    conditionName: conditions[index].name,
    param: 'investigations'
  }));
}

function question(index) {
  const type = schema.TYPES[index];
  return {
    id: `q-${index + 1}`,
    questionNumber: index + 1,
    questionType: type[0],
    questionTypeLabel: type[1],
    topicId: conditions[index].topicId,
    topicName: conditions[index].topic,
    targetConditionId: conditions[index].id,
    targetCondition: conditions[index].name,
    learningPoint: 'Use one decisive signal to distinguish close clinical alternatives.',
    stem: index === 0
      ? 'A 56-year-old man develops acute chest pain with ST elevation in V3–V4. Which injury vector best explains this finding?'
      : 'A stable adult has one decisive clinical finding. Which option is the most appropriate next step?',
    leadIn: 'Select the single best answer.',
    options: optionsFor(index),
    correctOptionId: 'A',
    decisiveClue: index === 0 ? 'ST elevation in V3–V4' : 'Single decisive clinical finding',
    rationale: 'The decisive signal identifies the correct same-category answer without extra exclusions.',
    strongestDistractorId: 'B',
    strongestDistractorExplanation: 'It is plausible but represents a different anatomical or physiological pattern.',
    guideline: { source: 'Internal UKMLA card atlas', title: conditions[index].name, checkedDate: null, url: null }
  };
}

function makeSet() {
  return {
    schemaVersion: 'ukmla-ai-quiz-v2',
    quizId: 'concision-test',
    topic: 'All UKMLA topics',
    generatedAt: '2026-07-14T00:00:00.000Z',
    difficulty: 'very_difficult',
    questions: schema.TYPES.map((_type, index) => question(index))
  };
}

const concise = makeSet();
const conciseErrors = schema.validate(concise, config, 'final');
if (conciseErrors.length) {
  throw new Error(`Concise reference set failed: ${conciseErrors.join(' ')}`);
}

const verboseStem = makeSet();
verboseStem.questions[0].stem = 'A 56-year-old man has sudden central chest pain. ECG shows ST elevation confined to V3–V4 with no reciprocal inferior changes; an older ECG shows no left ventricular hypertrophy.';
const draftErrors = schema.validate(verboseStem, config, 'generation');
if (draftErrors.some(error => error.includes('multiple explicit exclusions'))) {
  throw new Error('Generation-stage structural validation blocked the sparse checkpoint from repairing the stem.');
}
const sparseErrors = schema.validate(verboseStem, config, 'sparse');
if (!sparseErrors.some(error => error.includes('multiple explicit exclusions'))) {
  throw new Error(`Sparse checkpoint did not reject repeated exclusions: ${sparseErrors.join(' ')}`);
}

const overlongStem = makeSet();
overlongStem.questions[0].stem = 'A middle-aged patient develops sudden central chest pain during exertion and has isolated anterior electrocardiographic changes that remain present on repeated recordings while several additional historical details are supplied despite not changing the required physiological inference.';
const overlongErrors = schema.validate(overlongStem, config, 'sparse');
if (!overlongErrors.some(error => error.includes('stem exceeds'))) {
  throw new Error(`Sparse checkpoint did not reject an overlong biomedical stem: ${overlongErrors.join(' ')}`);
}

const explanatoryOption = makeSet();
explanatoryOption.questions[1].options[0].text = 'Immediate treatment because the mechanism requires rapid correction';
const optionErrors = schema.validate(explanatoryOption, config, 'options');
if (!optionErrors.some(error => error.includes('explanatory clause'))) {
  throw new Error(`Option checkpoint did not reject an explanatory option: ${optionErrors.join(' ')}`);
}
const combinedErrors = schema.validate(explanatoryOption, config, 'options_category');
if (!combinedErrors.some(error => error.includes('explanatory clause'))) {
  throw new Error(`Combined checkpoint did not retain option validation: ${combinedErrors.join(' ')}`);
}

const longExplanation = makeSet();
longExplanation.questions[2].strongestDistractorExplanation = 'This answer remains superficially plausible because it belongs to the same pathway and shares several clinical features, but the decisive signal points elsewhere and the added explanation is intentionally much too long for rapid review.';
const explanationErrors = schema.validate(longExplanation, config, 'distractors');
if (!explanationErrors.some(error => error.includes('distractor explanation exceeds'))) {
  throw new Error(`Distractor checkpoint did not reject a long explanation: ${explanationErrors.join(' ')}`);
}

const generationPrompt = schema.generationPrompt(config);
for (const required of [
  'Difficulty must come from inference and close competitors, not extra history or long wording.',
  'at most one explicit negative or exclusion',
  'Maximum 36 words per stem',
  '10 words or fewer',
  'Two-step reasoning means the candidate performs two mental steps',
  'Do not state the complete classic diagnostic pattern',
  'Do not repeat or paraphrase stem clues inside any option',
  'Options must be short answer labels only'
]) {
  if (!generationPrompt.includes(required)) throw new Error(`Generation prompt is missing: ${required}`);
}

const antiGiveawayPrompts = {
  sparse: 'Reject any stem that supplies the full classic triad or complete diagnostic pattern.',
  options: 'The correct option must name the answer only, not restate why it is correct.',
  category: 'Reject any question where the correct option merely restates or paraphrases the stem',
  distractors: 'Do not make the correct option uniquely detailed or explanatory.'
};
for (const [stage, required] of Object.entries(antiGiveawayPrompts)) {
  const prompt = schema.checkpointPrompt(stage, { ...config, currentSet: concise });
  if (!prompt.includes('BIOMEDICAL CHECKPOINT')) throw new Error(`${stage}: biomedical checkpoint was removed.`);
  if (!prompt.includes(required)) throw new Error(`${stage}: anti-giveaway wording is missing: ${required}`);
}

const combinedPrompt = schema.checkpointPrompt('options_category', { ...config, currentSet: concise });
for (const required of [
  'OPTION NORMALISATION',
  'ANSWER-CATEGORY ALIGNMENT',
  'Preserve the correct clinical proposition and answer key',
  'Do not make stems longer or make distractors more generic',
  'Do not repeat or paraphrase stem clues inside any option.',
  'The correct option must name the answer only, not restate why it is correct.',
  'Reject any question where the correct option merely restates the stem.',
  'BIOMEDICAL CHECKPOINT'
]) {
  if (!combinedPrompt.includes(required)) throw new Error(`Combined checkpoint prompt is missing: ${required}`);
}
const currentSetOccurrences = combinedPrompt.split('"quizId":"concision-test"').length - 1;
if (currentSetOccurrences !== 1) throw new Error(`Combined checkpoint transmitted the full set ${currentSetOccurrences} times.`);

const combinedRepair = schema.repairPrompt(
  'options_category',
  { ...config, currentSet: concise, failedSet: explanatoryOption },
  ['Q2A: option contains an explanatory clause.'],
  1,
  3
);
if (!combinedRepair.includes('Both option-format and answer-category requirements remain mandatory.')) {
  throw new Error('Combined repair could drop one half of the review.');
}
if (!combinedRepair.includes('correct option merely restates the stem')) {
  throw new Error('Combined repair lost the anti-giveaway rule.');
}

const combinedMode = schema.PIPELINE_MODES.combined;
const legacyMode = schema.PIPELINE_MODES.legacy;
const combinedStages = schema.stagesForPipeline(combinedMode).map(stage => stage.id);
const legacyStages = schema.stagesForPipeline(legacyMode).map(stage => stage.id);
if (combinedStages.join(',') !== 'generation,sparse,options_category,distractors,source,shuffle,final') {
  throw new Error(`Combined stage order changed: ${combinedStages.join(',')}`);
}
if (legacyStages.join(',') !== 'generation,sparse,options,category,distractors,source,shuffle,final') {
  throw new Error(`Legacy stage order changed: ${legacyStages.join(',')}`);
}
if (schema.resolvePipelineMode({ currentIndex: 2, currentStage: 'options' }) !== legacyMode) {
  throw new Error('A pre-trial saved build would not resume on the legacy pipeline.');
}

console.log(JSON.stringify({
  defaultPipeline: schema.resolvePipelineMode(null),
  combinedCheckpoints: combinedStages,
  legacyCheckpoints: legacyStages,
  combinedFullSetOccurrences: currentSetOccurrences,
  stemMaximumWords: schema.LIMITS.stemMaxWords,
  sparseDiagnosisMaximumWords: schema.LIMITS.sparseDiagnosisStemMaxWords,
  biomedicalMaximumWords: 34,
  optionMaximumWords: schema.LIMITS.optionMaxWords,
  repeatedExclusionRegression: 'passed',
  explanatoryOptionRegression: 'passed',
  antiGiveawayPromptRegression: 'passed',
  combinedRepairRegression: 'passed',
  conciseReferenceSet: 'passed'
}, null, 2));
