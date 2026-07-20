(function(){
'use strict';

const engine=window.UKMLA_V2_AI_ENGINE;
if(!engine||engine.__unlimitedRepairContinuation)return;
engine.__unlimitedRepairContinuation=true;

const originalRunPipeline=engine.runPipeline;

function isExhaustedValidationRepair(error,job){
  const message=String(error?.message||error||'');
  return Boolean(job?.repair?.exhausted)&&/targeted field, affected-question and full-set repair were exhausted/i.test(message);
}

function continuationMessage(job,continuation){
  const label=job?.repair?.stageLabel||window.UKMLA_V2_AI_SCHEMA?.stageLabel?.(job?.currentStage)||'Validation checkpoint';
  return`${label} still has validation issues. Starting another API repair cycle (${continuation}); retries remain unlimited.`;
}

engine.runPipeline=async function runPipelineWithUnlimitedValidationRepair(config={}){
  let resumeJob=config.job||null;
  let continuation=Number(resumeJob?.repairContinuationCount||0);

  while(true){
    try{
      return await originalRunPipeline({...config,job:resumeJob});
    }catch(error){
      const saved=engine.loadJob?.();
      if(config.persist===false||!isExhaustedValidationRepair(error,saved))throw error;

      continuation=Math.max(continuation,Number(saved.repairContinuationCount||0))+1;
      const message=continuationMessage(saved,continuation);
      saved.status='active';
      saved.lastMessage=message;
      saved.repairContinuationCount=continuation;
      saved.repair={
        ...(saved.repair||{}),
        exhausted:false,
        continuation,
        continuedAt:new Date().toISOString()
      };

      document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:saved}));
      config.onProgress?.(message,saved.percent,saved.currentStage,saved.pipelineMode);
      resumeJob=saved;
    }
  }
};
})();
