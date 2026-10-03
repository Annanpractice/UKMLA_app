(function(){
'use strict';

const IMPORT_SCHEMA='ukmla-imported-textbook-v1';
const IMPORT_SOURCE='imported';
let retries=0;

function core(){return window.UKMLA_V2;}

function installCoreHooks(){
  const api=core();
  if(!api)return false;
  if(api.__ukmlaImportedQuestionHooks)return true;

  const originalScore=api.scoreAnswer?.bind(api);
  const originalPresented=api.logPresented?.bind(api);
  const originalAnswered=api.logAnswered?.bind(api);
  if(!originalScore||!originalPresented||!originalAnswered)return false;

  api.scoreAnswer=(question,option)=>{
    if(question?.questionType==='imported_textbook_sba')return option?.id===question?.correctOptionId;
    return originalScore(question,option);
  };
  api.logPresented=meta=>{
    if(meta?.source===IMPORT_SOURCE&&!meta?.conditionId)return null;
    return originalPresented(meta);
  };
  api.logAnswered=meta=>{
    if(meta?.source===IMPORT_SOURCE&&!meta?.conditionId)return null;
    return originalAnswered(meta);
  };
  api.__ukmlaImportedQuestionHooks=true;
  return true;
}

function installBankHook(){
  const api=window.UKMLA_QUESTION_BANK;
  if(!api?.storeSet)return false;
  if(api.__ukmlaImportedQuestionHook)return true;
  const original=api.storeSet.bind(api);
  api.storeSet=(set,meta={})=>{
    if(set?.schemaVersion===IMPORT_SCHEMA){
      set={...set,sourceType:IMPORT_SOURCE};
      meta={...meta,sourceType:IMPORT_SOURCE};
    }
    return original(set,meta);
  };
  api.__ukmlaImportedQuestionHook=true;
  return true;
}

function installConditionAnalyticsHook(){
  const analytics=window.UKMLA_QUESTION_ANALYTICS;
  if(!analytics?.answerEvents)return false;
  if(analytics.__ukmlaImportedQuestionHook)return true;
  const original=analytics.answerEvents.bind(analytics);
  analytics.answerEvents=()=>{
    const rows=original()||[];
    const ids=new Set(rows.map(row=>row?.id).filter(Boolean));
    const imported=(core()?.events?.()||[])
      .filter(row=>row?.kind==='answered'&&row.source===IMPORT_SOURCE&&row.conditionId&&!ids.has(row.id));
    return[...rows,...imported].sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
  };
  analytics.__ukmlaImportedQuestionHook=true;
  return true;
}

function install(){
  const ready=installCoreHooks()&&installBankHook()&&installConditionAnalyticsHook();
  if(!ready&&retries++<100)setTimeout(install,100);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.UKMLA_QUESTION_IMPORT_PROGRESS={install,source:IMPORT_SOURCE,schema:IMPORT_SCHEMA};
})();
