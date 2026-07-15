(function(){
'use strict';

const PAD_ID='ukmla-4Jq9QYF2vHc8nLz6WmRpT3xA';
const BANK_INDEX_KEY='ukmlaQuestionBankIndexV1';
const BANK_ATTEMPTS_KEY='ukmlaQuestionBankAttemptsV1';
const BANK_SET_PREFIX='ukmlaQuestionBankSetV1:';
const ARCHIVE_PREFIX='ukmlaArchivedLocalValueV1:';
const LEGACY_GENERATED_KEY='ukmlaAiGeneratedQuizSetsV1';
const LEGACY_ARCHIVE_KEYS=new Set(['ukmlaAiPromptCheckedV1','ukmlaAiDecisionDataV1']);
const KEYS=[
  'ukmlaQuizProgressV1','ukmlaAspectStatusV2','ukmlaLearningEventsV1','ukmlaLearningRegistryV1','ukmlaCoverageStateV1',
  'ukmlaKnowledgePackStatsV1','ukmlaV2StateV1','ukmlaV2ReviewedV1',
  'ukmlaPsaPapersV1','ukmlaPsaActiveSessionsV1','ukmlaPsaAttemptsV1','ukmlaPsaGenerationJobV1',
  'ukmlaPsaMarkingJobV1','ukmlaPsaUiStateV1',BANK_INDEX_KEY,BANK_ATTEMPTS_KEY
];
let root=null,firebasePromise=null,busy=false;

function core(){return window.UKMLA_V2;}
function large(){return window.UKMLA_LARGE_STORAGE;}
function bank(){return window.UKMLA_QUESTION_BANK;}
function parse(value,fallback){try{return JSON.parse(value||'null')??fallback;}catch(_){return fallback;}}
function status(message){const node=root?.querySelector('#sync-status');if(node)node.textContent=message;const indicator=document.getElementById('sync-indicator');if(indicator)indicator.textContent=message;}
function setBusy(value){busy=value;root?.querySelectorAll('button').forEach(button=>button.disabled=value);}
function archiveKey(key){return`${ARCHIVE_PREFIX}${key}`;}
function originalArchiveKey(key){return String(key).slice(ARCHIVE_PREFIX.length);}

function mergeEvents(localValue,remoteValue){const map=new Map();[...parse(localValue,[]),...parse(remoteValue,[])].forEach(event=>{if(event?.id)map.set(event.id,event);});return JSON.stringify([...map.values()].sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))));}
function mergeObjects(localValue,remoteValue){const local=parse(localValue,{}),remote=parse(remoteValue,{}),result={...remote};for(const[key,value]of Object.entries(local)){const existing=result[key],localDate=String(value?.updatedAt||value?.createdAt||''),remoteDate=String(existing?.updatedAt||existing?.createdAt||'');if(!existing||localDate>=remoteDate)result[key]=value;}return JSON.stringify(result);}
function mergeNewest(localValue,remoteValue){const local=parse(localValue,null),remote=parse(remoteValue,null);if(!local)return remoteValue;if(!remote)return localValue;const localDate=String(local.updatedAt||local.verifiedAt||local.generatedAt||local.createdAt||''),remoteDate=String(remote.updatedAt||remote.verifiedAt||remote.generatedAt||remote.createdAt||'');return localDate>=remoteDate?JSON.stringify(local):JSON.stringify(remote);}
function mergeArrayById(localValue,remoteValue,idFields,limit=100){const map=new Map();for(const item of [...parse(remoteValue,[]),...parse(localValue,[])]){const id=idFields.map(field=>item?.[field]).find(Boolean);if(!id)continue;const existing=map.get(id),itemDate=String(item?.updatedAt||item?.completedAt||item?.generatedAt||item?.createdAt||''),existingDate=String(existing?.updatedAt||existing?.completedAt||existing?.generatedAt||existing?.createdAt||'');if(!existing||itemDate>=existingDate)map.set(id,item);}return JSON.stringify([...map.values()].sort((a,b)=>String(b.updatedAt||b.completedAt||b.generatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.completedAt||a.generatedAt||a.createdAt||''))).slice(0,limit));}
function mergeRegistry(localValue,remoteValue){const local=parse(localValue,{version:1,topics:{},conditions:{}}),remote=parse(remoteValue,{version:1,topics:{},conditions:{}});return JSON.stringify({version:Math.max(Number(local.version)||1,Number(remote.version)||1),topics:{...(remote.topics||{}),...(local.topics||{})},conditions:{...(remote.conditions||{}),...(local.conditions||{})}});}
function mergeCoverage(localValue,remoteValue){const local=parse(localValue,{cycle:1,completedCycles:0,covered:[]}),remote=parse(remoteValue,{cycle:1,completedCycles:0,covered:[]}),lc=Number(local.cycle)||1,rc=Number(remote.cycle)||1;if(lc>rc)return JSON.stringify(local);if(rc>lc)return JSON.stringify(remote);return JSON.stringify({...remote,...local,cycle:lc,completedCycles:Math.max(Number(local.completedCycles)||0,Number(remote.completedCycles)||0),covered:[...new Set([...(remote.covered||[]),...(local.covered||[])])],updatedAt:new Date().toISOString()});}
function mergeProgress(localValue,remoteValue){const local=parse(localValue,{}),remote=parse(remoteValue,{}),result={...remote};for(const[key,value]of Object.entries(local)){if(key.startsWith('__')){result[key]=value;continue;}const existing=result[key];if(!existing||Number(value?.attempts||0)>=Number(existing?.attempts||0))result[key]=value;}return JSON.stringify(result);}
function mergeSets(localValue,remoteValue){return mergeArrayById(localValue,remoteValue,['quizId','generatedAt'],50);}
function mergeQuestionBankIndex(localValue,remoteValue){return mergeArrayById(localValue,remoteValue,['setId'],5000);}
function mergeQuestionBankAttempts(localValue,remoteValue){
  const map=new Map();
  for(const item of [...parse(remoteValue,[]),...parse(localValue,[])]){
    if(!item?.attemptId)continue;
    const existing=map.get(item.attemptId);
    if(!existing){map.set(item.attemptId,item);continue;}
    if(existing.status==='completed'&&item.status!=='completed')continue;
    if(item.status==='completed'&&existing.status!=='completed'){map.set(item.attemptId,item);continue;}
    const itemDate=String(item.updatedAt||item.completedAt||item.startedAt||'');
    const existingDate=String(existing.updatedAt||existing.completedAt||existing.startedAt||'');
    if(itemDate>=existingDate)map.set(item.attemptId,item);
  }
  return JSON.stringify([...map.values()].sort((a,b)=>String(b.updatedAt||b.completedAt||b.startedAt||'').localeCompare(String(a.updatedAt||a.completedAt||a.startedAt||''))).slice(0,10000));
}

function mergeValue(key,localValue,remoteValue){
  if(key.startsWith(BANK_SET_PREFIX))return mergeNewest(localValue,remoteValue);
  if(key==='ukmlaLearningEventsV1')return mergeEvents(localValue,remoteValue);
  if(key==='ukmlaLearningRegistryV1')return mergeRegistry(localValue,remoteValue);
  if(key==='ukmlaCoverageStateV1')return mergeCoverage(localValue,remoteValue);
  if(key==='ukmlaQuizProgressV1')return mergeProgress(localValue,remoteValue);
  if(key===LEGACY_GENERATED_KEY)return mergeSets(localValue,remoteValue);
  if(key===BANK_INDEX_KEY)return mergeQuestionBankIndex(localValue,remoteValue);
  if(key===BANK_ATTEMPTS_KEY)return mergeQuestionBankAttempts(localValue,remoteValue);
  if(key==='ukmlaPsaPapersV1')return mergeArrayById(localValue,remoteValue,['paperId'],20);
  if(key==='ukmlaPsaAttemptsV1')return mergeArrayById(localValue,remoteValue,['attemptId'],150);
  if(['ukmlaKnowledgePackStatsV1','ukmlaV2ReviewedV1','ukmlaPsaActiveSessionsV1'].includes(key))return mergeObjects(localValue,remoteValue);
  if(['ukmlaPsaGenerationJobV1','ukmlaPsaMarkingJobV1','ukmlaPsaUiStateV1'].includes(key))return mergeNewest(localValue,remoteValue);
  return localValue??remoteValue;
}

async function prepareLargeStorage(){
  if(!large())throw new Error('IndexedDB support did not load.');
  await large().openDb();
  await large().migrateLocalPrefix(BANK_SET_PREFIX);
  if(bank())await bank().migrateLegacy();
  for(const key of LEGACY_ARCHIVE_KEYS){
    const value=localStorage.getItem(key);
    if(value===null)continue;
    await large().putRaw(archiveKey(key),value);
    if(await large().getRaw(archiveKey(key))===value)localStorage.removeItem(key);
  }
}

async function localValues(){
  await prepareLargeStorage();
  const values={};
  for(const key of KEYS){const value=localStorage.getItem(key);if(value!==null)values[key]=value;}
  for(const[key,value]of await large().entries(BANK_SET_PREFIX))values[key]=value;
  for(const[key,value]of await large().entries(ARCHIVE_PREFIX)){
    const original=originalArchiveKey(key);
    if(values[original]===undefined)values[original]=value;
  }
  return values;
}

async function backupPayload(){return{schemaVersion:'ukmla-v2-backup-4-indexeddb',exportedAt:new Date().toISOString(),deviceId:localStorage.getItem('ukmlaRemoteDeviceIdV1')||'',values:await localValues()};}

async function importLegacyGeneratedSets(value){
  const sets=parse(value,[]);
  if(!Array.isArray(sets)||!sets.length||!bank())return 0;
  let imported=0;
  for(const set of sets){
    const setId=String(set?.quizId||set?.setId||'');
    if(!setId)continue;
    if(await large().has(`${BANK_SET_PREFIX}${setId}`))continue;
    const record=await bank().storeSet(set,{sourceType:set.sourceType||'ai'});
    if(record)imported++;
  }
  return imported;
}

async function mergeRemote(values){
  if(!values||typeof values!=='object')return{largeRecords:0,smallRecords:0,legacySets:0};
  await prepareLargeStorage();

  const bankRows=[];
  for(const[key,remoteValue]of Object.entries(values)){
    if(!key.startsWith(BANK_SET_PREFIX))continue;
    const localValue=await large().getRaw(key);
    bankRows.push([key,mergeValue(key,localValue,remoteValue)]);
  }
  if(bankRows.length)await large().putMany(bankRows);

  const archiveRows=[];
  for(const key of LEGACY_ARCHIVE_KEYS){
    const remoteValue=values[key];
    if(remoteValue===undefined)continue;
    const localValue=await large().getRaw(archiveKey(key));
    archiveRows.push([archiveKey(key),mergeNewest(localValue,remoteValue)]);
  }
  if(archiveRows.length)await large().putMany(archiveRows);

  const updates={};
  for(const key of KEYS){
    const localValue=localStorage.getItem(key),remoteValue=values[key];
    if(remoteValue===undefined&&localValue===null)continue;
    const merged=mergeValue(key,localValue,remoteValue);
    if(merged!==null&&merged!==undefined)updates[key]=String(merged);
  }
  await large().commitLocalStorage(updates);

  const legacySets=await importLegacyGeneratedSets(values[LEGACY_GENERATED_KEY]);
  localStorage.removeItem(LEGACY_GENERATED_KEY);
  document.dispatchEvent(new Event('ukmlaRemoteDataImported'));
  document.dispatchEvent(new Event('ukmlaQuestionBankChanged'));
  return{largeRecords:bankRows.length+archiveRows.length,smallRecords:Object.keys(updates).length,legacySets};
}

async function firebase(){if(firebasePromise)return firebasePromise;firebasePromise=(async()=>{status('Connecting to Firebase…');const appMod=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');const dbMod=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');const config=window.UKMLA_V2_FIREBASE_CONFIG;if(!config)throw new Error('Firebase configuration is unavailable.');const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(config);const db=dbMod.getDatabase(app),ref=dbMod.ref(db,`ukmlaPads/${PAD_ID.replace(/[^A-Za-z0-9_-]/g,'-')}/state`);return{dbMod,ref};})();return firebasePromise;}
async function pull(){if(busy)return;setBusy(true);try{const{dbMod,ref}=await firebase();status('Downloading cloud data into safe large storage…');const snapshot=await dbMod.get(ref),remote=snapshot.val();if(!remote?.values){status('Cloud pad is empty.');return;}const result=await mergeRemote(remote.values);status(`Cloud data restored safely: ${result.largeRecords} large and ${result.smallRecords} compact records. Reloading…`);setTimeout(()=>location.reload(),850);}catch(error){status(`Pull failed: ${error.message}`);}finally{setBusy(false);}}
async function push(){if(busy)return;setBusy(true);try{const{dbMod,ref}=await firebase();status('Merging current cloud data before upload…');const snapshot=await dbMod.get(ref),remote=snapshot.val();if(remote?.values)await mergeRemote(remote.values);const values=await localValues();await dbMod.set(ref,{updatedAt:Date.now(),origin:localStorage.getItem('ukmlaRemoteDeviceIdV1')||'v2',values});status(`Question Bank and progress merged and pushed at ${new Date().toLocaleTimeString()}.`);}catch(error){status(`Push failed: ${error.message}`);}finally{setBusy(false);}}
async function downloadBackup(){if(busy)return;setBusy(true);try{status('Assembling local and IndexedDB records…');const payload=await backupPayload();core().downloadText(JSON.stringify(payload,null,2),`ukmla-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json');status('Complete backup downloaded.');}catch(error){status(`Backup failed: ${error.message}`);}finally{setBusy(false);}}
async function importBackup(file){if(busy)return;setBusy(true);try{status('Reading backup without changing existing data…');const payload=JSON.parse(await file.text());if(!payload?.values||typeof payload.values!=='object')throw new Error('This is not a UKMLA backup.');status('Storing large records in IndexedDB and merging compact progress…');const result=await mergeRemote(payload.values);status(`Backup imported safely: ${result.largeRecords} large and ${result.smallRecords} compact records. Reloading…`);setTimeout(()=>location.reload(),850);}catch(error){status(`Import failed: ${error.message}`);}finally{setBusy(false);}}

function formatBytes(bytes){if(bytes<1024)return`${bytes} B`;if(bytes<1048576)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1048576).toFixed(2)} MB`;}
async function refreshStorageStats(){
  const node=root?.querySelector('#storage-stats');
  if(!node||!large())return;
  try{
    await prepareLargeStorage();
    const estimate=await large().estimate();
    const quota=estimate.quota?` of ${formatBytes(estimate.quota)} browser quota`:'';
    node.innerHTML=`<div class="storage-row"><span>Compact local storage</span><strong>${formatBytes(estimate.localStorageBytes)}</strong></div><div class="storage-row"><span>Large IndexedDB records</span><strong>${formatBytes(estimate.indexedDbBytes)}</strong></div>${estimate.usage?`<div class="storage-row"><span>Total site usage</span><strong>${formatBytes(estimate.usage)}${quota}</strong></div>`:''}`;
  }catch(error){node.innerHTML=`<p style="color:var(--danger)">Storage check failed: ${core().escapeHtml(error.message)}</p>`;}
}
function mount(container){
  root=container;
  const bankSets=parse(localStorage.getItem(BANK_INDEX_KEY),[]).length;
  const bankAttempts=parse(localStorage.getItem(BANK_ATTEMPTS_KEY),[]);
  root.innerHTML=`<div class="page-head"><div><div class="eyebrow">Local-first data control</div><h1>Sync & backup</h1><p>Full question sets now use IndexedDB rather than the small local-storage allowance. Import and Pull merge compact records with rollback protection.</p></div></div><section class="sync-grid"><article class="panel"><h2>Firebase cloud pad</h2><p id="sync-status" style="color:var(--muted)">Disconnected. Local data remains available.</p><div class="card-actions"><button class="btn primary" id="sync-pull">Pull and merge</button><button class="btn" id="sync-push">Merge and push</button></div></article><article class="panel"><h2>Complete backup</h2><p>Export all progress, events, IndexedDB Question Bank payloads and attempts, PSA records and review state.</p><div class="card-actions"><button class="btn" id="sync-export">Download backup</button><button class="btn ghost" id="sync-import">Import backup</button><input id="sync-import-file" type="file" accept="application/json,.json" hidden></div></article><article class="panel"><h2>Browser storage</h2><div id="storage-stats"><p style="color:var(--muted)">Calculating safe storage use…</p></div><div class="storage-row"><span>Question Bank sets</span><strong>${bankSets}</strong></div><div class="storage-row"><span>Completed bank attempts</span><strong>${bankAttempts.filter(item=>item.status==='completed').length}</strong></div><div class="storage-row"><span>In-progress bank attempts</span><strong>${bankAttempts.filter(item=>item.status==='in_progress').length}</strong></div><div class="storage-row"><span>Learning events</span><strong>${core().events().length}</strong></div><div class="storage-row"><span>PSA attempts</span><strong>${parse(localStorage.getItem('ukmlaPsaAttemptsV1'),[]).length}</strong></div><div class="storage-row"><span>PSA papers</span><strong>${parse(localStorage.getItem('ukmlaPsaPapersV1'),[]).length}</strong></div><div class="storage-row"><span>Knowledge packs</span><strong>${Object.keys(core().loadJson(core().STORAGE.knowledge,{})).length}</strong></div></article></section>`;
  root.querySelector('#sync-pull').onclick=pull;
  root.querySelector('#sync-push').onclick=push;
  root.querySelector('#sync-export').onclick=downloadBackup;
  root.querySelector('#sync-import').onclick=()=>root.querySelector('#sync-import-file').click();
  root.querySelector('#sync-import-file').onchange=event=>{const file=event.target.files[0];if(file)void importBackup(file);};
  void refreshStorageStats();
}

window.UKMLA_V2_SYNC={mount,mergeValue,mergeRemote,localValues,backupPayload,prepareLargeStorage};
})();
