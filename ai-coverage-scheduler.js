(function(){
  'use strict';

  if(window.__UKMLA_AI_COVERAGE_SCHEDULER__) return;
  window.__UKMLA_AI_COVERAGE_SCHEDULER__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const FORMAT='ukmla_ai_quiz';
  const LOCK='COVERAGE SCHEDULER LOCK';

  function formatOf(body){return body?.text?.format?.name||'';}
  function extractJson(text,start){
    let depth=0,inString=false,escaped=false,begun=false;
    for(let i=start;i<text.length;i++){
      const ch=text[i];
      if(!begun){if(ch!=='{')continue;begun=true;start=i;depth=1;continue;}
      if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
      if(ch==='"')inString=true;else if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0)return {raw:text.slice(start,i+1),start,end:i+1};}
    }
    return null;
  }
  function sourceBlock(body){
    for(const item of body.input||[]){
      if(item.role!=='user')continue;
      for(const content of item.content||[]){
        if(content.type!=='input_text'||typeof content.text!=='string')continue;
        const marker='Source material:\n';
        const at=content.text.lastIndexOf(marker);
        if(at<0)continue;
        const found=extractJson(content.text,at+marker.length);
        if(!found)continue;
        try{return {content,found,payload:JSON.parse(found.raw)};}catch(_){return null;}
      }
    }
    return null;
  }
  function replacePayload(block,payload){
    block.content.text=block.content.text.slice(0,block.found.start)+JSON.stringify(payload)+block.content.text.slice(block.found.end);
  }
  function mapCondition(item,existing){
    return {
      id:item.conditionId,
      conditionId:item.conditionId,
      name:item.name,
      topic:item.topicName||item.topic,
      topicId:item.topicId,
      fields:item.fields,
      decisionData:existing?.decisionData||null
    };
  }
  function appendLock(body,payload){
    for(const item of body.input||[]){
      if(item.role!=='user')continue;
      for(const content of item.content||[]){
        if(content.type!=='input_text'||typeof content.text!=='string'||content.text.includes(LOCK))continue;
        content.text+=`\n\n${LOCK}:\nThe ten conditions in Source material.conditions were selected by the persistent coverage scheduler. Question 1 must use conditions[0], question 2 conditions[1], and so on. Use every selected condition exactly once. Preserve each conditionId, topicId, condition name and topic name in the output metadata. Do not substitute a more familiar condition. The scheduler priority is: balance topic coverage first; select never-tested and current-cycle-unseen conditions second; then consider low health, lifetime frequency and recency. The selected list is fixed for this generation.`;
      }
    }
    payload.requirements=Object.assign({},payload.requirements,{oneQuestionPerSelectedCondition:true,noDuplicateTargetConditions:true,preserveConditionIds:true,coverageFirst:true});
  }

  window.fetch=function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(url!==API||!init||String(init.method||'GET').toUpperCase()!=='POST')return previousFetch(input,init);
    let body;
    try{body=JSON.parse(init.body||'{}');}catch(_){return previousFetch(input,init);}
    if(formatOf(body)!==FORMAT)return previousFetch(input,init);
    const block=sourceBlock(body);
    const learning=window.UKMLA_LEARNING;
    if(!block||!learning)return previousFetch(input,init);
    const payload=block.payload;
    if(payload.sourceType==='knowledge_dump'||payload.mode==='knowledge_dump')return previousFetch(input,init);

    const catalogue=learning.catalogue();
    let candidates=[];
    let selected=[];
    if(payload.mode==='random_all_conditions'){
      candidates=catalogue;
      selected=learning.selectCoverageCandidates(candidates,10,{uniqueTopics:true});
    }else{
      if((payload.conditions||[]).length<=1) return previousFetch(input,init);
      const topic=String(payload.topic||'');
      candidates=catalogue.filter(item=>item.topic===topic);
      if(candidates.length>10)selected=learning.selectCoverageCandidates(candidates,10,{uniqueTopics:false});
      else selected=candidates;
      if(selected.length===10){payload.originalMode=payload.mode;payload.mode='random_all_conditions';}
    }
    if(!selected.length)return previousFetch(input,init);
    const oldByName=new Map((payload.conditions||[]).map(item=>[String(item.name||'').toLowerCase(),item]));
    payload.conditions=selected.map(item=>mapCondition(item,oldByName.get(item.name.toLowerCase())));
    payload.schedulerSnapshot={
      selectedAt:new Date().toISOString(),
      coverageCycle:learning.coverageState().cycle,
      selectedConditionIds:selected.map(item=>item.conditionId),
      priorityOrder:['topic_coverage','unseen_condition','weak_question_type_when_available','low_health','recency']
    };
    appendLock(body,payload);
    replacePayload(block,payload);
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message:`Coverage scheduler selected ${selected.length} conditions, prioritising under-covered topics and unseen conditions.`}}));
    return previousFetch(input,Object.assign({},init,{body:JSON.stringify(body)}));
  };
})();
