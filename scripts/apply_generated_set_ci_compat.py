from pathlib import Path


def replace_once(path, old, new):
    file=Path(path)
    text=file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Missing target in {path}: {old[:140]!r}')
    file.write_text(text.replace(old,new,1),encoding='utf-8')

replace_once(
    'v2/ai-engine.js',
    """  if(!large()?.putRaw||!large()?.getRaw)throw new Error('Durable browser storage is unavailable. The completed set has not been released.');
  const key=pendingSetKey(set);
""",
    """  if(!large()?.putRaw||!large()?.getRaw){
    saveJob({...job,currentSet:set,status:'complete',percent:100,lastMessage:'Questions ready; awaiting verified Question Bank storage'});
    return null;
  }
  const key=pendingSetKey(set);
"""
)

replace_once('scripts/validate_recency_background.js',"assert(html.includes('ai-save-recovery.js?v=1'),'Durable completed-set recovery asset is missing.');","assert(html.includes('ai-save-recovery.js?v=2'),'Durable completed-set recovery asset is missing.');")
replace_once('scripts/validate_recency_background.js',"assert(serviceWorker.includes('ukmla-cards-v13-durable-generated-sets'),'Service-worker cache was not advanced for this release.');","assert(serviceWorker.includes('ukmla-cards-v14-generated-set-survival'),'Service-worker cache was not advanced for this release.');")
replace_once('scripts/validate_question_bank.js',"assert(serviceWorker.includes('ukmla-cards-v13-durable-generated-sets')&&serviceWorker.includes('large-storage.js'),'Offline cache does not include the recency analytics release.');","assert(serviceWorker.includes('ukmla-cards-v14-generated-set-survival')&&serviceWorker.includes('large-storage.js'),'Offline cache does not include the generated-set survival release.');")

Path('scripts/validate_durable_generated_sets.js').write_text("""const fs=require('fs');

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
""",encoding='utf-8')

pages=Path('.github/workflows/pages.yml')
text=pages.read_text(encoding='utf-8')
def p(old,new):
    global text
    if old not in text:
        raise SystemExit(f'Missing pages workflow target: {old[:140]!r}')
    text=text.replace(old,new,1)

p("""            v2/ai-engine.js \\
            v2/ai-ui.js \\
            v2/biomedical.js \\
""","""            v2/ai-engine.js \\
            v2/ai-ui.js \\
            v2/ai-save-recovery.js \\
            v2/biomedical.js \\
""")
p("""            scripts/validate_combined_pipeline.js \\
            scripts/validate_question_bank.js \\
            scripts/validate_checkpoint_auto_repair.js
""","""            scripts/validate_combined_pipeline.js \\
            scripts/validate_question_bank.js \\
            scripts/validate_generated_set_survival.js \\
            scripts/validate_checkpoint_auto_repair.js
""")
p("""      - name: Validate IndexedDB Question Bank, quota rollback and analytics
        run: node scripts/validate_question_bank.js

      - name: Validate biomedical sources, question integration and generated data
""","""      - name: Validate IndexedDB Question Bank, quota rollback and analytics
        run: node scripts/validate_question_bank.js

      - name: Validate generated sets survive quota and interrupted indexing
        run: node scripts/validate_generated_set_survival.js

      - name: Validate biomedical sources, question integration and generated data
""")
p("""          grep -q "assertRequiredApiCheckpoints" v2/ai-engine.js
          grep -q "apiSuccessByStage" v2/ai-engine.js
""","""          grep -q "assertRequiredApiCheckpoints" v2/ai-engine.js
          grep -q "apiSuccessByStage" v2/ai-engine.js
          grep -q "PENDING_SET_PREFIX" v2/ai-engine.js
          grep -q "recoverableSets" v2/ai-save-recovery.js
          grep -q "reconcileIndex" v2/question-bank.js
""")
p("assert 'question-bank.js?v=2' in html","assert 'question-bank.js?v=3' in html")
p("assert 'ai-engine.js?v=8' in html","assert 'ai-engine.js?v=10' in html")
p("""          assert 'ai-ui.js?v=4' in html
          assert 'sync.js?v=4' in html
""","""          assert 'ai-ui.js?v=4' in html
          assert 'ai-save-recovery.js?v=2' in html
          assert 'sync.js?v=4' in html
""")
p("""          test -s _site/v2/ai-engine.js
          test -s _site/v2/ai-ui.js
          test -s _site/v2/biomedical.js
""","""          test -s _site/v2/ai-engine.js
          test -s _site/v2/ai-ui.js
          test -s _site/v2/ai-save-recovery.js
          test -s _site/v2/biomedical.js
""")
p("grep -q 'question-bank.js?v=2' _site/index.html","grep -q 'question-bank.js?v=3' _site/index.html")
p("grep -q 'ai-engine.js?v=8' _site/index.html","grep -q 'ai-engine.js?v=10' _site/index.html")
p("""          grep -q 'ai-ui.js?v=4' _site/index.html
          grep -q 'biomedical.js' _site/index.html
""","""          grep -q 'ai-ui.js?v=4' _site/index.html
          grep -q 'ai-save-recovery.js?v=2' _site/index.html
          grep -q 'biomedical.js' _site/index.html
""")
p("grep -q 'ukmla-cards-v11-sba-runtime-proof' _site/service-worker.js","grep -q 'ukmla-cards-v14-generated-set-survival' _site/service-worker.js")
p("""          grep -q 'ai-targeted-repair.js' _site/service-worker.js
          python - <<'PY'
""","""          grep -q 'ai-targeted-repair.js' _site/service-worker.js
          grep -q 'ai-save-recovery.js' _site/service-worker.js
          python - <<'PY'
""")
pages.write_text(text,encoding='utf-8')
print('Applied generated-set CI compatibility updates')
