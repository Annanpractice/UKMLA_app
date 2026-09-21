(function(){
'use strict';
const KEY='ukmlaQuestionBatchV1';
const core=()=>window.UKMLA_V2;
function count(value){return [10,20,30].includes(Number(value))?Number(value):10;}
function control(disabled=false){return `<div class="field" style="margin-top:12px"><label for="ai-count">Number of questions</label><select class="select" id="ai-count" ${disabled?'disabled':''}><option value="10">10 questions</option><option value="20">20 questions</option><option value="30">30 questions</option></select><small class="question-source-note">Uncovered content is prioritised. Each batch of ten passes the same quality checks.</small></div>`;}
function load(){return core().loadJson(KEY,null);}
function save(batch){if(core().saveJson(KEY,batch)===false)throw new Error('Unable to save batch progress. Free browser storage before continuing.');}
function clear(){localStorage.removeItem(KEY);}
function create(conditions,topic,backend){
  if(![10,20,30].includes(conditions.length)||new Set(conditions.map(c=>c.id||c.conditionId)).size!==conditions.length)throw new Error('Choose enough distinct usable cards for this question count.');
  const batch={id:`question-batch-${Date.now().toString(36)}`,conditions,topic,backend,sets:[],jobs:[],createdAt:new Date().toISOString()};
  save(batch);return batch;
}
function merge(batch,sets=batch.sets){
  if(sets.length!==batch.conditions.length/10||sets.some(s=>s?.questions?.length!==10))throw new Error('Every batch must finish its quality checks before this set can be saved.');
  const questions=sets.flatMap(s=>s.questions).map((q,i)=>({...q,id:`${batch.id}-q${i+1}`,questionNumber:i+1}));
  const targets=questions.map(q=>q.targetConditionId);
  const expected=new Set(batch.conditions.map(c=>c.id||c.conditionId));
  if(new Set(targets).size!==expected.size||targets.some(id=>!expected.has(id)))throw new Error('The completed set does not match the selected content.');
  return {...sets[0],quizId:batch.id,topic:batch.topic,questions,
    buildTelemetry:{batchCount:sets.length,batches:sets.map(s=>s.buildTelemetry),apiCalls:sets.reduce((n,s)=>n+(Number(s.buildTelemetry?.apiCalls)||0),0)},
    schedulerSnapshot:{...sets[0].schedulerSnapshot,selectedConditionIds:[...expected]},
    batchMetadata:sets.map(s=>({quizId:s.quizId,buildTelemetry:s.buildTelemetry,typeAssignment:s.typeAssignment,schedulerSnapshot:s.schedulerSnapshot}))};
}
async function runBrowser(config){
  const batch=config.batch;
  const engine=window.UKMLA_V2_AI_ENGINE;
  while(batch.sets.length<batch.conditions.length/10){
    const index=batch.sets.length;
    const conditions=batch.conditions.slice(index*10,index*10+10);
    const saved=engine.loadJob();
    const job=saved?.id===`${batch.id}-${index}`?saved:null;
    const set=await engine.runPipeline({...config,batch:undefined,conditions,job,jobId:`${batch.id}-${index}`,
      questionTypes:job?.questionTypes||config.questionTypes,
      onProgress:(message,percent,stage,mode)=>config.onProgress?.(`Batch ${index+1}/${batch.conditions.length/10}: ${message}`,(index*100+percent)/(batch.conditions.length/10),stage,mode)});
    batch.sets.push(set);save(batch);
    await engine.clearPendingSet?.(set);
    engine.clearJob();
  }
  return merge(batch);
}
window.UKMLA_QUESTION_BATCHES={count,control,load,save,clear,create,merge,runBrowser};
})();
