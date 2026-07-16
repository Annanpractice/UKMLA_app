(function(){
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
