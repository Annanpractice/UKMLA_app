const fs = require('fs');
const vm = require('vm');

const context = {
  window: {},
  URL,
  setTimeout: () => 0,
  clearTimeout: () => {},
  console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('v2/psa-schema.js', 'utf8'), context, { filename: 'v2/psa-schema.js' });

context.window.UKMLA_V2 = {
  loadJson: (_key, fallback) => fallback,
  saveJson: () => true,
  uid: prefix => `${prefix}-test`
};
context.window.UKMLA_PSA_ENGINE = {
  KEYS: { generationJob: 'generation', papers: 'papers' },
  loadGenerationJob: () => null,
  clearGenerationJob: () => {},
  attempts: () => [],
  paperById: () => null
};
context.window.UKMLA_V2_AI_TRANSPORT = { send: async () => ({}) };
vm.runInContext(fs.readFileSync('v2/psa-grounding.js', 'utf8'), context, { filename: 'v2/psa-grounding.js' });

const psa = context.window.UKMLA_PSA_SCHEMA;
const grounding = context.window.UKMLA_PSA_GROUNDING;
if (!psa) throw new Error('PSA schema did not initialise.');
if (!grounding) throw new Error('PSA grounding layer did not initialise.');

const full = psa.countsForMode('full');
const half = psa.countsForMode('half');
const fullItems = Object.values(full).reduce((sum, value) => sum + value, 0);
const halfItems = Object.values(half).reduce((sum, value) => sum + value, 0);
const fullMarks = psa.SECTIONS.reduce((sum, section) => sum + full[section.id] * section.marks, 0);
const halfMarks = psa.SECTIONS.reduce((sum, section) => sum + half[section.id] * section.marks, 0);

if (psa.SECTIONS.length !== 8) throw new Error(`Expected 8 PSA sections, found ${psa.SECTIONS.length}.`);
if (fullItems !== 60) throw new Error(`Full paper has ${fullItems} items, expected 60.`);
if (fullMarks !== 200) throw new Error(`Full paper has ${fullMarks} marks, expected 200.`);
if (psa.timeForMode('full', full) !== 7200) throw new Error('Full paper duration is not 120 minutes.');
if (halfItems !== 30) throw new Error(`Half paper has ${halfItems} items, expected 30.`);
if (halfMarks !== 100) throw new Error(`Half paper has ${halfMarks} marks, expected 100.`);

const expectedStages = ['research', 'generate', 'clinical_audit', 'source_audit', 'rubric_audit', 'deterministic'];
if (psa.GENERATION_STAGES.map(stage => stage.id).join(',') !== expectedStages.join(',')) {
  throw new Error(`Grounded generation stages are incorrect: ${psa.GENERATION_STAGES.map(stage => stage.id).join(',')}`);
}
if (psa.MARKING_STAGES.length !== 5) throw new Error('The marking pipeline must have five checkpoints.');
if (!grounding.allowedDomains.includes('bnf.nice.org.uk') || !grounding.allowedDomains.includes('nice.org.uk')) {
  throw new Error('BNF/NICE domains are not in the mandatory allowlist.');
}
if (grounding.allowedDomains.some(domain => ['reddit.com', 'wikipedia.org'].includes(domain))) {
  throw new Error('An unapproved source domain is present.');
}

for (const section of psa.SECTIONS) {
  const batch = psa.batchSchema(section.id, 3);
  if (batch.properties.items.minItems !== 3 || batch.properties.items.maxItems !== 3) {
    throw new Error(`${section.id}: batch schema count is not exact.`);
  }
  const item = batch.properties.items.items;
  if (item.properties.responseMode.enum[0] !== section.responseMode) {
    throw new Error(`${section.id}: response mode mismatch.`);
  }
  for (const field of ['evidenceId', 'authoritativeFactsUsed', 'sourceRefs', 'sourceVerifiedAt', 'sourceVerificationStatus', 'calculationSpec']) {
    if (!item.required.includes(field)) throw new Error(`${section.id}: grounded field missing: ${field}.`);
  }
}

const calculation = grounding.evaluateCalculation({
  enabled: true,
  inputs: [
    { id: 'weight', value: 72 },
    { id: 'dosePerKg', value: 7 },
    { id: 'maxDose', value: 500 },
    { id: 'concentration', value: 40 }
  ],
  operations: [
    { id: 'rawDose', operation: 'multiply', operandIds: ['weight', 'dosePerKg'], precision: null, unit: 'mg' },
    { id: 'finalDose', operation: 'min', operandIds: ['rawDose', 'maxDose'], precision: null, unit: 'mg' },
    { id: 'volume', operation: 'divide', operandIds: ['finalDose', 'concentration'], precision: null, unit: 'mL' },
    { id: 'rounded', operation: 'round', operandIds: ['volume'], precision: 1, unit: 'mL' }
  ],
  finalOperationId: 'rounded'
});
if (calculation.errors.length || calculation.value !== 12.5) {
  throw new Error(`Deterministic calculation failed: ${JSON.stringify(calculation)}`);
}

const groundingSource = fs.readFileSync('v2/psa-grounding.js', 'utf8');
for (const safeguard of ["tool_choice:'required'", "include:['web_search_call.action.sources']", 'allowed_domains:ALLOWED_DOMAINS', 'required web search produced no traceable sources', 'expected answer does not match deterministic calculation']) {
  if (!groundingSource.includes(safeguard)) throw new Error(`Grounding safeguard missing: ${safeguard}.`);
}

const html = fs.readFileSync('v2/app.html', 'utf8');
for (const required of ['psa.css', 'psa-grounding.css', 'psa-schema.js', 'psa-engine.js', 'psa-grounding.js', 'psa-runtime.js', 'psa.js']) {
  if (!html.includes(required)) throw new Error(`v2/app.html does not load ${required}.`);
}

const runtime = fs.readFileSync('v2/psa-runtime.js', 'utf8');
for (const safeguard of ['pagehide', 'visibilitychange', '5000', 'itemDescriptors']) {
  if (!runtime.includes(safeguard)) throw new Error(`PSA runtime safeguard missing: ${safeguard}.`);
}

const sync = fs.readFileSync('v2/sync.js', 'utf8');
for (const key of ['ukmlaPsaPapersV1', 'ukmlaPsaActiveSessionsV1', 'ukmlaPsaAttemptsV1']) {
  if (!sync.includes(key)) throw new Error(`Sync does not include ${key}.`);
}

console.log(JSON.stringify({
  sections: psa.SECTIONS.length,
  fullItems,
  fullMarks,
  halfItems,
  halfMarks,
  generationCheckpoints: psa.GENERATION_STAGES.length,
  generationStageIds: expectedStages,
  markingCheckpoints: psa.MARKING_STAGES.length,
  allowedSourceDomains: grounding.allowedDomains,
  deterministicCalculationTest: calculation.value,
  timerWriteIntervalMs: 5000
}, null, 2));
