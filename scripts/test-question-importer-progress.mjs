import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const events=[];
let legacyScoreCalls=0;
const core={
  scoreAnswer(question,option){legacyScoreCalls++;return option.id===question.correctOptionId;},
  logPresented(meta){const row={id:`p${events.length}`,kind:'presented',...meta};events.push(row);return row;},
  logAnswered(meta){const row={id:`a${events.length}`,kind:'answered',...meta};events.push(row);return row;},
  events(){return events;}
};
const stored=[];
const bank={
  storeSet(set,meta){stored.push({set,meta});return Promise.resolve({setId:'stored'});}
};
const analytics={
  answerEvents(){return[{id:'basic-1',kind:'answered',source:'basic',conditionId:'basic-card',at:'2026-10-01T10:00:00Z'}];}
};
const window={UKMLA_V2:core,UKMLA_QUESTION_BANK:bank,UKMLA_QUESTION_ANALYTICS:analytics};
const document={readyState:'complete',addEventListener(){}};
const context=vm.createContext({window,document,setTimeout(){},console});
vm.runInContext(fs.readFileSync('v2/question-importer-progress.js','utf8'),context);

assert.equal(core.scoreAnswer({questionType:'imported_textbook_sba',correctOptionId:'B'},{id:'B'}),true);
assert.equal(core.scoreAnswer({questionType:'imported_textbook_sba',correctOptionId:'B'},{id:'A'}),false);
assert.equal(legacyScoreCalls,0,'Imported SBA scoring must not mutate legacy topic health');
assert.equal(core.scoreAnswer({questionType:'stable_first_line_treatment',correctOptionId:'A'},{id:'A'}),true);
assert.equal(legacyScoreCalls,1,'Non-imported questions must retain the original scoring path');

assert.equal(core.logPresented({source:'imported',conditionId:''}),null);
assert.equal(core.logAnswered({source:'imported',conditionId:''}),null);
assert.equal(events.length,0,'Unmapped imported questions must not create card-learning events');
core.logPresented({source:'imported',conditionId:'mapped-card',at:'2026-10-02T10:00:00Z'});
core.logAnswered({source:'imported',conditionId:'mapped-card',correct:false,at:'2026-10-02T10:01:00Z'});
assert.equal(events.length,2,'Mapped imported questions should create normal card-learning events');

await bank.storeSet({schemaVersion:'ukmla-imported-textbook-v1',sourceType:'knowledge',questions:[{}]},{sourceType:'knowledge'});
assert.equal(stored[0].set.sourceType,'imported');
assert.equal(stored[0].meta.sourceType,'imported');

const rows=analytics.answerEvents();
assert.deepEqual(Array.from(rows,r=>r.id),['basic-1','a1']);
assert.equal(rows.at(-1).conditionId,'mapped-card');
console.log('Textbook importer progress integration passed: immutable scoring, unmapped isolation, mapped card progress, imported source and condition analytics.');
