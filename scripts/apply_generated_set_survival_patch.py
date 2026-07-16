from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected patch target missing in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


engine = 'v2/ai-engine.js'
replace_once(
    engine,
    "const JOB_KEY='ukmlaV2AiJobV1';\n",
    """const JOB_KEY='ukmlaV2AiJobV1';
const PENDING_SET_PREFIX='ukmlaPendingAiSetV2:';

function large(){return window.UKMLA_LARGE_STORAGE;}
function generatedSetId(set){return String(set?.quizId||set?.setId||`generated-${Date.now().toString(36)}`);}
function pendingSetKey(set){return`${PENDING_SET_PREFIX}${generatedSetId(set)}`;}
async function persistCompletedSet(set,job){
  if(!set||!Array.isArray(set.questions)||!set.questions.length)throw new Error('Completed question set is missing.');
  if(!large()?.putRaw||!large()?.getRaw)throw new Error('Durable browser storage is unavailable. The completed set has not been released.');
  const key=pendingSetKey(set);
  const payload=JSON.stringify(set);
  await large().putRaw(key,payload);
  if(await large().getRaw(key)!==payload)throw new Error('Completed-set recovery verification failed.');
  const lightweight={...job,currentSet:null,pendingSetKey:key,pendingSetId:generatedSetId(set),status:'complete',percent:100,lastMessage:'Questions ready; awaiting verified Question Bank storage'};
  saveJob(lightweight);
  return key;
}
async function recoverableSets(){
  const rows=[];
  const job=loadJob();
  if(job?.status==='complete'&&job.currentSet&&Array.isArray(job.currentSet.questions))rows.push({set:job.currentSet,key:null,legacy:true});
  if(large()?.entries){
    for(const[key,value]of await large().entries(PENDING_SET_PREFIX)){
      try{
        const set=JSON.parse(value);
        if(set&&Array.isArray(set.questions)&&set.questions.length)rows.push({set,key,legacy:false});
      }catch(_){/* preserve unreadable payload for manual inspection */}
    }
  }
  const unique=new Map();
  for(const row of rows)unique.set(generatedSetId(row.set),row);
  return[...unique.values()];
}
async function clearPendingSet(set){
  if(!large()?.deleteKey)return;
  await large().deleteKey(pendingSetKey(set));
}
"""
)
replace_once(
    engine,
    """  assertRequiredApiCheckpoints(job,stages);
  job.status='complete';
  job.percent=100;
  job.lastMessage='Questions ready';
  if(config.persist!==false)saveJob(job);
  return job.currentSet;
}""",
    """  assertRequiredApiCheckpoints(job,stages);
  const completedSet=job.currentSet;
  job.status='complete';
  job.percent=100;
  job.lastMessage='Questions ready';
  if(config.persist!==false)await persistCompletedSet(completedSet,job);
  return completedSet;
}"""
)
replace_once(
    engine,
    """  if(!verified||!Array.isArray(verified.questions)||verified.questions.length!==expectedCount){
    throw new Error('Question Bank verification failed after saving. The completed set remains recoverable and will be retried.');
  }
  const pending=loadJob();""",
    """  if(!verified||!Array.isArray(verified.questions)||verified.questions.length!==expectedCount){
    throw new Error('Question Bank verification failed after saving. The completed set remains recoverable and will be retried.');
  }
  await clearPendingSet(set);
  const pending=loadJob();"""
)
replace_once(
    engine,
    "window.UKMLA_V2_AI_ENGINE={runPipeline,loadJob,clearJob,storeSet};",
    "window.UKMLA_V2_AI_ENGINE={runPipeline,loadJob,clearJob,storeSet,PENDING_SET_PREFIX,persistCompletedSet,recoverableSets,clearPendingSet};"
)

bank = 'v2/question-bank.js'
replace_once(
    bank,
    """  let initialised=false;
  let migrationPromise=null;
""",
    """  let initialised=false;
  let migrationPromise=null;
  let reconciliationPromise=null;
  let volatileIndex=[];
"""
)
replace_once(
    bank,
    """  function bankIndex(){return parse(localStorage.getItem(INDEX_KEY),[]);}
  function saveIndex(records){
    try{localStorage.setItem(INDEX_KEY,JSON.stringify(records));return true;}
    catch(error){core()?.toast('Question Bank index could not be stored. Your full sets remain in IndexedDB.');return false;}
  }
""",
    """  function storedIndex(){return parse(localStorage.getItem(INDEX_KEY),[]);}
  function mergeIndex(records){
    const map=new Map();
    for(const record of records||[]){if(record?.setId)map.set(String(record.setId),record);}
    return[...map.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
  function bankIndex(){return mergeIndex([...storedIndex(),...volatileIndex]);}
  function saveIndex(records){
    volatileIndex=mergeIndex(records);
    try{localStorage.setItem(INDEX_KEY,JSON.stringify(volatileIndex));volatileIndex=[];return true;}
    catch(error){core()?.toast('Question Bank index is full. Saved sets remain protected in IndexedDB and will be rebuilt automatically.');return false;}
  }
"""
)
replace_once(
    bank,
    """    if(!saveIndex(next)){await large().deleteKey(setKey(setId));return null;}
    localStorage.removeItem(setKey(setId));
""",
    """    saveIndex(next);
    localStorage.removeItem(setKey(setId));
"""
)
load_end = """    return parse(raw,null);
  }

  async function removeSet(setId){"""
reconcile = """    return parse(raw,null);
  }

  async function reconcileIndex(){
    if(reconciliationPromise)return reconciliationPromise;
    reconciliationPromise=(async()=>{
      if(!large()?.entries)return bankIndex();
      const map=new Map(bankIndex().map(record=>[String(record.setId),record]));
      for(const[key,payload]of await large().entries(SET_PREFIX)){
        const stored=parse(payload,null);
        if(!stored||!Array.isArray(stored.questions)||!stored.questions.length)continue;
        const setId=String(stored.setId||stored.quizId||String(key).slice(SET_PREFIX.length));
        const existing=map.get(setId);
        const type=sourceType(stored);
        map.set(setId,{
          schemaVersion:SCHEMA,
          setId,
          payloadKey:setKey(setId),
          contentHash:hashText(String(payload)),
          title:titleFor(stored,type),
          topic:String(stored.topic||'All UKMLA topics'),
          sourceType:type,
          sourceLabel:sourceLabel(type),
          questionCount:stored.questions.length,
          createdAt:existing?.createdAt||stored.generatedAt||now(),
          verifiedAt:existing?.verifiedAt||stored.generatedAt||now(),
          verificationLabel:existing?.verificationLabel||verificationLabel(stored,type),
          promptVersion:stored.schemaVersion||'',
          availableOffline:true,
          storageBackend:'indexeddb',
          updatedAt:existing?.updatedAt||now()
        });
      }
      const next=mergeIndex([...map.values()]);
      saveIndex(next);
      notify();
      return next;
    })().finally(()=>{reconciliationPromise=null;});
    return reconciliationPromise;
  }

  async function removeSet(setId){"""
replace_once(bank, load_end, reconcile)
replace_once(
    bank,
    """    try{await migrateLegacy();drawBank();}
    catch(error){root.innerHTML=`<section class=\"empty\"><h2>Question Bank storage could not initialise</h2><p>${escapeHtml(error.message)}</p></section>`;}
""",
    """    try{await migrateLegacy();await reconcileIndex();drawBank();}
    catch(error){root.innerHTML=`<section class=\"empty\"><h2>Question Bank storage could not initialise</h2><p>${escapeHtml(error.message)}</p></section>`;}
"""
)
replace_once(
    bank,
    """    mount,storeSet,loadSet,removeSet,bankIndex,attempts,beginAttempt,attemptById,
    recordPresented,recordAnswer,completeAttempt,completedAttempts,rollingStats,sourceLabel,
    migrateLegacy,compactLegacyGeneratedSets
""",
    """    mount,storeSet,loadSet,removeSet,bankIndex,reconcileIndex,attempts,beginAttempt,attemptById,
    recordPresented,recordAnswer,completeAttempt,completedAttempts,rollingStats,sourceLabel,
    migrateLegacy,compactLegacyGeneratedSets
"""
)

print('Applied generated-set survival patch')
