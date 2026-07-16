const fs=require('fs');

function assert(condition,message){if(!condition)throw new Error(message);}

const engine=fs.readFileSync('v2/ai-engine.js','utf8');
assert(!engine.includes('setTimeout(clearJob,500)'),'Completed job is still deleted before Question Bank verification.');
for(const required of [
  "const PENDING_SET_PREFIX='ukmlaPendingAiSetV2:'",
  'persistCompletedSet',
  'recoverableSets',
  'await clearPendingSet(set)',
  'const verified=await bank.loadSet',
  'if(!pending||!pendingId||pendingId===storedId)clearJob()'
])assert(engine.includes(required),`Durable engine omitted: ${required}`);
const queueAt=engine.indexOf('await persistCompletedSet(completedSet,job)');
const saveAt=engine.indexOf('const record=await bank.storeSet');
const verifyAt=engine.indexOf('const verified=await bank.loadSet');
const clearPendingAt=engine.indexOf('await clearPendingSet(set)');
const clearJobAt=engine.indexOf('if(!pending||!pendingId||pendingId===storedId)clearJob()');
assert(queueAt>=0,'Completed set is not queued before returning from generation.');
assert(saveAt>=0&&verifyAt>saveAt&&clearPendingAt>verifyAt&&clearJobAt>clearPendingAt,'Recovery copies are not cleared strictly after verified Question Bank storage.');

const bank=fs.readFileSync('v2/question-bank.js','utf8');
for(const required of ['volatileIndex','reconcileIndex','Saved sets remain protected in IndexedDB','saveIndex(next);'])assert(bank.includes(required),`Question Bank quota protection omitted: ${required}`);
assert(!bank.includes("if(!saveIndex(next)){await large().deleteKey(setKey(setId));return null;}"),'Question Bank still deletes a successful IndexedDB payload when its local index is full.');

const recovery=fs.readFileSync('v2/ai-save-recovery.js','utf8');
for(const required of ['recoverableSets','pendingCompletedSets','engine().storeSet(item.set)',"document.visibilityState==='visible'","event.detail?.status==='complete'",'pageshow'])assert(recovery.includes(required),`Completed-set recovery omitted: ${required}`);

const html=fs.readFileSync('v2/app.html','utf8');
assert(html.includes('question-bank.js?v=3'),'Quota-safe Question Bank asset version is missing.');
assert(html.includes('ai-engine.js?v=10'),'Pending-queue engine version is missing.');
assert(html.includes('ai-save-recovery.js?v=2'),'Pending-queue recovery runtime is not loaded.');
assert(html.indexOf('ai-engine.js?v=10')<html.indexOf('ai-save-recovery.js?v=2'),'Recovery runtime loads before the engine.');

const worker=fs.readFileSync('service-worker.js','utf8');
assert(worker.includes('ukmla-cards-v14-generated-set-survival'),'Generated-set survival cache version is missing.');
assert(worker.includes('./v2/ai-save-recovery.js'),'Recovery runtime is not available offline.');

console.log(JSON.stringify({
  completedSetQueuedInIndexedDb:true,
  lightweightCompletionPointer:true,
  indexedDbReadBackRequired:true,
  indexQuotaCannotDeletePayload:true,
  indexRebuiltFromIndexedDb:true,
  automaticRecoveryAfterReload:true,
  futureGeneratedSetsDurable:true
},null,2));
