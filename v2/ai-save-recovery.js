(function(){
'use strict';

let recoveryPromise=null;
let lastFailure='';

function core(){return window.UKMLA_V2;}
function engine(){return window.UKMLA_V2_AI_ENGINE;}
function isRecovering(){return Boolean(recoveryPromise);}
async function pendingCompletedSets(){return await engine()?.recoverableSets?.()||[];}
async function pendingCompletedSet(){return(await pendingCompletedSets())[0]||null;}

async function recover(){
  if(recoveryPromise)return recoveryPromise;
  recoveryPromise=(async()=>{
    const pending=await pendingCompletedSets();
    if(!pending.length)return[];
    const stored=[];
    for(const item of pending){
      try{
        const record=await engine().storeSet(item.set);
        if(record)stored.push(record);
      }catch(error){
        lastFailure=String(error?.message||error);
        document.dispatchEvent(new CustomEvent('ukmlaAiCompletedSetStorageFailed',{detail:{message:lastFailure,setId:item.set?.quizId||item.set?.setId||null}}));
      }
    }
    if(stored.length){
      lastFailure='';
      core()?.toast(stored.length===1?'Recovered completed question set to the Question Bank.':`Recovered ${stored.length} completed question sets to the Question Bank.`);
      await window.UKMLA_QUESTION_BANK?.reconcileIndex?.();
    }
    return stored;
  })().finally(()=>{recoveryPromise=null;});
  return recoveryPromise;
}

function schedule(delay=0){setTimeout(()=>void recover(),delay);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(0),{once:true});else schedule(0);
window.addEventListener('pageshow',()=>schedule(0));
window.addEventListener('online',()=>schedule(0));
window.addEventListener('hashchange',()=>schedule(0));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(0);});
document.addEventListener('ukmlaV2AiProgress',event=>{if(event.detail?.status==='complete')schedule(250);});

window.UKMLA_AI_SAVE_RECOVERY={recover,pendingCompletedSet,pendingCompletedSets,isRecovering,lastFailure:()=>lastFailure};
})();