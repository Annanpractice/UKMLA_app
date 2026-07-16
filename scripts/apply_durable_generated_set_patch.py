from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'Expected patch target not found in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')
    return True


def replace_all(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        return False
    file.write_text(text.replace(old, new), encoding='utf-8')
    return True


replace_once(
    'v2/ai-engine.js',
    """  if(config.persist!==false){
    saveJob(job);
    setTimeout(clearJob,500);
  }
  return job.currentSet;
}""",
    """  if(config.persist!==false)saveJob(job);
  return job.currentSet;
}"""
)

replace_once(
    'v2/ai-engine.js',
    """async function storeSet(set){
  const type=set.sourceType==='knowledge_dump'?'knowledge':'ai';
  const record=await window.UKMLA_QUESTION_BANK?.storeSet(set,{
    sourceType:type,
    title:set.topic&&set.topic!=='All UKMLA topics'?set.topic:undefined,
    verificationLabel:type==='knowledge'?'Source-fidelity checkpoint passed':'All clinical checkpoints passed'
  });
  if(!record)throw new Error('The completed question set could not be saved in IndexedDB.');
  localStorage.removeItem(core().STORAGE.sets);
  return record;
}""",
    """async function storeSet(set){
  const type=set.sourceType==='knowledge_dump'?'knowledge':'ai';
  const bank=window.UKMLA_QUESTION_BANK;
  if(!bank?.storeSet||!bank?.loadSet)throw new Error('Question Bank storage is not ready. The completed set remains recoverable and will be retried.');
  const record=await bank.storeSet(set,{
    sourceType:type,
    title:set.topic&&set.topic!=='All UKMLA topics'?set.topic:undefined,
    verificationLabel:type==='knowledge'?'Source-fidelity checkpoint passed':'All clinical checkpoints passed'
  });
  if(!record)throw new Error('The completed question set could not be saved in IndexedDB. It remains recoverable and will be retried.');
  const verified=await bank.loadSet(record.setId);
  const expectedCount=Array.isArray(set?.questions)?set.questions.length:0;
  if(!verified||!Array.isArray(verified.questions)||verified.questions.length!==expectedCount){
    throw new Error('Question Bank verification failed after saving. The completed set remains recoverable and will be retried.');
  }
  const pending=loadJob();
  const pendingId=String(pending?.currentSet?.quizId||pending?.currentSet?.setId||'');
  const storedId=String(set?.quizId||set?.setId||record.setId||'');
  if(!pending||!pendingId||pendingId===storedId)clearJob();
  localStorage.removeItem(core().STORAGE.sets);
  document.dispatchEvent(new CustomEvent('ukmlaAiCompletedSetStored',{detail:{setId:record.setId,recovered:Boolean(pending?.status==='complete')}}));
  return record;
}"""
)

recovery = """(function(){
'use strict';

let recoveryPromise=null;
let lastFailure='';

function core(){return window.UKMLA_V2;}
function engine(){return window.UKMLA_V2_AI_ENGINE;}
function pendingCompletedSet(){
  const job=engine()?.loadJob?.();
  return job?.status==='complete'&&job.currentSet&&Array.isArray(job.currentSet.questions)?job:null;
}
function isRecovering(){return Boolean(recoveryPromise);}

async function recover(){
  if(recoveryPromise)return recoveryPromise;
  const job=pendingCompletedSet();
  if(!job)return null;
  recoveryPromise=(async()=>{
    try{
      const record=await engine().storeSet(job.currentSet);
      lastFailure='';
      core()?.toast('Recovered completed question set to the Question Bank.');
      return record;
    }catch(error){
      lastFailure=String(error?.message||error);
      document.dispatchEvent(new CustomEvent('ukmlaAiCompletedSetStorageFailed',{detail:{message:lastFailure,jobId:job.id||null}}));
      return null;
    }finally{
      recoveryPromise=null;
    }
  })();
  return recoveryPromise;
}

function schedule(delay=0){setTimeout(()=>void recover(),delay);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(0),{once:true});else schedule(0);
window.addEventListener('pageshow',()=>schedule(0));
window.addEventListener('online',()=>schedule(0));
window.addEventListener('hashchange',()=>schedule(0));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(0);});
document.addEventListener('ukmlaV2AiProgress',event=>{if(event.detail?.status==='complete')schedule(1500);});

window.UKMLA_AI_SAVE_RECOVERY={recover,pendingCompletedSet,isRecovering,lastFailure:()=>lastFailure};
})();
"""
Path('v2/ai-save-recovery.js').write_text(recovery, encoding='utf-8')

replace_once(
    'v2/app.html',
    '  <script src="./v2/ai-engine.js?v=8"></script>\n  <script src="./v2/ai-ui.js?v=4"></script>',
    '  <script src="./v2/ai-engine.js?v=9"></script>\n  <script src="./v2/ai-ui.js?v=4"></script>\n  <script src="./v2/ai-save-recovery.js?v=1"></script>'
)

replace_all('service-worker.js', "ukmla-cards-v12-recency-background-generation", "ukmla-cards-v13-durable-generated-sets")
replace_once(
    'service-worker.js',
    "'./v2/ai-sba-audit.js','./v2/ai-targeted-repair.js','./v2/ai-engine.js','./v2/ai-ui.js',",
    "'./v2/ai-sba-audit.js','./v2/ai-targeted-repair.js','./v2/ai-engine.js','./v2/ai-ui.js','./v2/ai-save-recovery.js',"
)

replace_all('scripts/validate_question_bank.js', 'ukmla-cards-v12-recency-background-generation', 'ukmla-cards-v13-durable-generated-sets')
replace_all('scripts/validate_recency_background.js', 'ukmla-cards-v12-recency-background-generation', 'ukmla-cards-v13-durable-generated-sets')
replace_once(
    'scripts/validate_recency_background.js',
    "assert(html.includes('ai-ui.js?v=4'),'Stable AI UI asset path changed unexpectedly.');",
    "assert(html.includes('ai-ui.js?v=4'),'Stable AI UI asset path changed unexpectedly.');\nassert(html.includes('ai-save-recovery.js?v=1'),'Durable completed-set recovery asset is missing.');"
)

pages = Path('.github/workflows/pages.yml')
text = pages.read_text(encoding='utf-8')
text = text.replace('ai-engine.js?v=8', 'ai-engine.js?v=9')
text = text.replace('ukmla-cards-v12-recency-background-generation', 'ukmla-cards-v13-durable-generated-sets')
if 'node --check v2/ai-save-recovery.js' not in text:
    text = text.replace('node --check v2/ai-ui.js', 'node --check v2/ai-ui.js\n          node --check v2/ai-save-recovery.js')
if 'grep -q "ai-save-recovery.js?v=1" v2/app.html' not in text:
    text = text.replace('grep -q "question-analytics.js" v2/app.html', 'grep -q "question-analytics.js" v2/app.html\n          grep -q "ai-save-recovery.js?v=1" v2/app.html')
if "assert 'ai-save-recovery.js?v=1' in html" not in text:
    text = text.replace("assert 'ai-ui.js?v=4' in html", "assert 'ai-ui.js?v=4' in html\n          assert 'ai-save-recovery.js?v=1' in html")
if "grep -q 'ai-save-recovery.js?v=1' _site/index.html" not in text:
    text = text.replace("grep -q 'ai-ui.js?v=4' _site/index.html", "grep -q 'ai-ui.js?v=4' _site/index.html\n          grep -q 'ai-save-recovery.js?v=1' _site/index.html")
if "grep -q 'ai-save-recovery.js' _site/service-worker.js" not in text:
    text = text.replace("grep -q 'ai-targeted-repair.js' _site/service-worker.js", "grep -q 'ai-targeted-repair.js' _site/service-worker.js\n          grep -q 'ai-save-recovery.js' _site/service-worker.js")
pages.write_text(text, encoding='utf-8')

validation = """const fs=require('fs');

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
"""
Path('scripts/validate_durable_generated_sets.js').write_text(validation, encoding='utf-8')

workflow = """name: Durable generated question storage

on:
  pull_request:
    branches: [\"main\"]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  durable-generated-sets:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Validate JavaScript syntax
        run: |
          node --check v2/ai-engine.js
          node --check v2/ai-save-recovery.js
          node --check scripts/validate_durable_generated_sets.js
      - name: Validate completed-set persistence and recovery
        run: node scripts/validate_durable_generated_sets.js
"""
Path('.github/workflows/durable-generated-set.yml').write_text(workflow, encoding='utf-8')
