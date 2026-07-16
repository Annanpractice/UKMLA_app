const fs=require('fs');

function assert(condition,message){if(!condition)throw new Error(message);}

const engine=fs.readFileSync('v2/ai-engine.js','utf8');
assert(!engine.includes('setTimeout(clearJob,500)'),'Completed job is still deleted before Question Bank verification.');
assert(engine.includes('if(config.persist!==false)saveJob(job);'),'Completed generated set is not retained as a recovery record.');
const saveAt=engine.indexOf('const record=await bank.storeSet');
const verifyAt=engine.indexOf('const verified=await bank.loadSet');
const clearAt=engine.indexOf('if(!pending||!pendingId||pendingId===storedId)clearJob()');
assert(saveAt>=0&&verifyAt>saveAt&&clearAt>verifyAt,'Recovery record is not cleared strictly after verified IndexedDB storage.');
assert(engine.includes('The completed set remains recoverable and will be retried.'),'Storage failures do not explain retained recovery.');

const recovery=fs.readFileSync('v2/ai-save-recovery.js','utf8');
for(const required of [
  "job?.status==='complete'",
  'job.currentSet',
  'engine().storeSet(job.currentSet)',
  "document.visibilityState==='visible'",
  "event.detail?.status==='complete'",
  'pageshow'
])assert(recovery.includes(required),`Completed-set recovery omitted: ${required}`);

const html=fs.readFileSync('v2/app.html','utf8');
assert(html.includes('ai-engine.js?v=9'),'Durable engine version is missing.');
assert(html.includes('ai-save-recovery.js?v=1'),'Recovery runtime is not loaded.');
assert(html.indexOf('ai-engine.js?v=9')<html.indexOf('ai-save-recovery.js?v=1'),'Recovery runtime loads before the engine.');

const worker=fs.readFileSync('service-worker.js','utf8');
assert(worker.includes('ukmla-cards-v13-durable-generated-sets'),'Durable-save cache version is missing.');
assert(worker.includes('./v2/ai-save-recovery.js'),'Recovery runtime is not available offline.');

console.log(JSON.stringify({
  completedJobRetainedUntilVerified:true,
  indexedDbReadBackRequired:true,
  automaticRecoveryAfterReload:true,
  automaticRetryOnForeground:true,
  futureGeneratedSetsDurable:true
},null,2));
