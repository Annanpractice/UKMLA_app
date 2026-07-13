const fs = require('fs');
const vm = require('vm');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('v2/psa-schema.js', 'utf8'), context, { filename: 'v2/psa-schema.js' });

const psa = context.window.UKMLA_PSA_SCHEMA;
if (!psa) throw new Error('PSA schema did not initialise.');

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
if (psa.GENERATION_STAGES.length !== 3) throw new Error('Every section must have three generation checkpoints.');
if (psa.MARKING_STAGES.length !== 5) throw new Error('The marking pipeline must have five checkpoints.');

for (const section of psa.SECTIONS) {
  const schema = psa.batchSchema(section.id, 3);
  if (schema.properties.items.minItems !== 3 || schema.properties.items.maxItems !== 3) {
    throw new Error(`${section.id}: batch schema count is not exact.`);
  }
  if (schema.properties.items.items.properties.responseMode.enum[0] !== section.responseMode) {
    throw new Error(`${section.id}: response mode mismatch.`);
  }
}

const html = fs.readFileSync('v2/app.html', 'utf8');
for (const required of ['psa.css', 'psa-schema.js', 'psa-engine.js', 'psa.js']) {
  if (!html.includes(required)) throw new Error(`v2/app.html does not load ${required}.`);
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
  markingCheckpoints: psa.MARKING_STAGES.length
}, null, 2));
