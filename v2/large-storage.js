(function(){
'use strict';

const DB_NAME='ukmla-v2-large-storage';
const DB_VERSION=1;
const STORE='records';
const BANK_SET_PREFIX='ukmlaQuestionBankSetV1:';
let dbPromise=null;

function memoryStore(){
  if(!window.__UKMLA_LARGE_STORAGE_MEMORY__)window.__UKMLA_LARGE_STORAGE_MEMORY__=new Map();
  return window.__UKMLA_LARGE_STORAGE_MEMORY__;
}

function useMemory(){return typeof indexedDB==='undefined'&&Boolean(window.__UKMLA_LARGE_STORAGE_TEST__);}

function openDb(){
  if(useMemory())return Promise.resolve(null);
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('IndexedDB could not be opened.'));
    request.onblocked=()=>reject(new Error('IndexedDB upgrade is blocked by another open tab.'));
  });
  return dbPromise;
}

function requestResult(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction){
  return new Promise((resolve,reject)=>{
    transaction.oncomplete=()=>resolve();
    transaction.onabort=()=>reject(transaction.error||new Error('IndexedDB transaction was aborted.'));
    transaction.onerror=()=>reject(transaction.error||new Error('IndexedDB transaction failed.'));
  });
}

async function getRaw(key){
  if(useMemory())return memoryStore().get(String(key))??null;
  const db=await openDb();
  const transaction=db.transaction(STORE,'readonly');
  const record=await requestResult(transaction.objectStore(STORE).get(String(key)));
  await transactionDone(transaction);
  return record?.value??null;
}

async function has(key){return(await getRaw(key))!==null;}

async function putRaw(key,value){
  const text=String(value);
  if(useMemory()){memoryStore().set(String(key),text);return true;}
  const db=await openDb();
  const transaction=db.transaction(STORE,'readwrite');
  transaction.objectStore(STORE).put({key:String(key),value:text,updatedAt:new Date().toISOString()});
  await transactionDone(transaction);
  return true;
}

async function putMany(entries){
  const rows=Array.isArray(entries)?entries:Object.entries(entries||{});
  if(!rows.length)return 0;
  if(useMemory()){
    for(const[key,value]of rows)memoryStore().set(String(key),String(value));
    return rows.length;
  }
  const db=await openDb();
  const transaction=db.transaction(STORE,'readwrite');
  const store=transaction.objectStore(STORE);
  const updatedAt=new Date().toISOString();
  for(const[key,value]of rows)store.put({key:String(key),value:String(value),updatedAt});
  await transactionDone(transaction);
  return rows.length;
}

async function deleteKey(key){
  if(useMemory()){memoryStore().delete(String(key));return true;}
  const db=await openDb();
  const transaction=db.transaction(STORE,'readwrite');
  transaction.objectStore(STORE).delete(String(key));
  await transactionDone(transaction);
  return true;
}

async function deleteMany(keys){
  const list=[...new Set((keys||[]).map(String))];
  if(!list.length)return 0;
  if(useMemory()){for(const key of list)memoryStore().delete(key);return list.length;}
  const db=await openDb();
  const transaction=db.transaction(STORE,'readwrite');
  const store=transaction.objectStore(STORE);
  for(const key of list)store.delete(key);
  await transactionDone(transaction);
  return list.length;
}

async function entries(prefix=''){
  if(useMemory())return[...memoryStore().entries()].filter(([key])=>!prefix||key.startsWith(prefix));
  const db=await openDb();
  const transaction=db.transaction(STORE,'readonly');
  const store=transaction.objectStore(STORE);
  const rows=[];
  await new Promise((resolve,reject)=>{
    const request=store.openCursor();
    request.onsuccess=()=>{
      const cursor=request.result;
      if(!cursor){resolve();return;}
      const record=cursor.value;
      if(!prefix||String(record.key).startsWith(prefix))rows.push([record.key,record.value]);
      cursor.continue();
    };
    request.onerror=()=>reject(request.error||new Error('IndexedDB cursor failed.'));
  });
  await transactionDone(transaction);
  return rows;
}

async function keys(prefix=''){return(await entries(prefix)).map(([key])=>key);}

async function byteSize(prefix=''){
  const rows=await entries(prefix);
  return rows.reduce((total,[key,value])=>total+(String(key).length+String(value).length)*2,0);
}

async function migrateLocalPrefix(prefix=BANK_SET_PREFIX){
  const rows=[];
  for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);
    if(key?.startsWith(prefix))rows.push([key,localStorage.getItem(key)]);
  }
  if(!rows.length)return{migrated:0,bytesFreed:0};
  await putMany(rows);
  for(const[key,value]of rows){
    const stored=await getRaw(key);
    if(stored!==String(value))throw new Error(`IndexedDB verification failed for ${key}.`);
  }
  let bytesFreed=0;
  for(const[key,value]of rows){bytesFreed+=(key.length+String(value).length)*2;localStorage.removeItem(key);}
  return{migrated:rows.length,bytesFreed};
}

function localStorageBytes(){
  let total=0;
  for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);
    total+=(String(key||'').length+String(localStorage.getItem(key)||'').length)*2;
  }
  return total;
}

async function commitLocalStorage(updates){
  const rows=Object.entries(updates||{});
  const before=new Map(rows.map(([key])=>[key,localStorage.getItem(key)]));
  const touched=[];
  try{
    for(const[key,value]of rows){
      if(value===null||value===undefined)localStorage.removeItem(key);
      else localStorage.setItem(key,String(value));
      touched.push(key);
    }
    return true;
  }catch(error){
    for(const key of touched)localStorage.removeItem(key);
    for(const[key,value]of before){
      if(value===null)localStorage.removeItem(key);
      else localStorage.setItem(key,value);
    }
    const quota=/quota|exceed/i.test(String(error?.message||error));
    throw new Error(quota?'Browser local storage is still full after moving large question sets. No partial import was kept.':String(error?.message||error));
  }
}

async function estimate(){
  const result={localStorageBytes:localStorageBytes(),indexedDbBytes:await byteSize(),quota:null,usage:null};
  try{
    const value=await navigator.storage?.estimate?.();
    result.quota=Number(value?.quota)||null;
    result.usage=Number(value?.usage)||null;
  }catch(_){/* optional browser estimate */}
  return result;
}

window.UKMLA_LARGE_STORAGE={
  DB_NAME,STORE,BANK_SET_PREFIX,
  openDb,getRaw,has,putRaw,putMany,deleteKey,deleteMany,entries,keys,byteSize,
  migrateLocalPrefix,commitLocalStorage,localStorageBytes,estimate
};
})();
