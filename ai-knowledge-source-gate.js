(function(){
  'use strict';

  if(window.__UKMLA_KNOWLEDGE_SOURCE_GATE__) return;
  window.__UKMLA_KNOWLEDGE_SOURCE_GATE__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const TARGET='ukmla_ai_quiz';
  let running=false;

  function formatOf(body){return body?.text?.format?.name||'';}
  function outputText(data){
    if(data&&typeof data.output_text==='string')return data.output_text;
    for(const item of data?.output||[])for(const content of item.content||[])if(content?.type==='output_text'&&typeof content.text==='string')return content.text;
    return '';
  }
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function extractJson(text,start){
    let depth=0,inString=false,escaped=false,begun=false;
    for(let i=start;i<text.length;i++){
      const ch=text[i];
      if(!begun){if(ch!=='{')continue;begun=true;start=i;depth=1;continue;}
      if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
      if(ch==='"')inString=true;else if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0)return text.slice(start,i+1);}
    }
    return null;
  }
  function payloadOf(body){
    for(const item of body.input||[])for(const content of item.content||[]){
      if(content.type!=='input_text'||typeof content.text!=='string')continue;
      const marker='Source material:\n';const at=content.text.lastIndexOf(marker);if(at<0)continue;
      const raw=extractJson(content.text,at+marker.length);if(!raw)continue;
      try{return JSON.parse(raw);}catch(_){return null;}
    }
    return null;
  }
  function isKnowledge(payload){return payload?.sourceType==='knowledge_dump'||payload?.mode==='knowledge_dump';}
  function augmentSchema(body){
    const question=body?.text?.format?.schema?.properties?.questions?.items;
    if(!question?.properties)return;
    question.properties.targetConditionId={type:'string'};
    question.properties.topicId={type:'string'};
    question.properties.sourceSupport={type:'object',additionalProperties:false,required:['conceptId','sourceRefs','supportStatement'],properties:{conceptId:{type:'string'},sourceRefs:{type:'array',minItems:1,items:{type:'string'}},supportStatement:{type:'string'}}};
    question.required=Array.isArray(question.required)?question.required:[];
    ['targetConditionId','topicId','sourceSupport'].forEach(field=>{if(!question.required.includes(field))question.required.push(field);});
  }
  function emit(message,percent){
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message}}));
    document.dispatchEvent(new CustomEvent('ukmlaKnowledgeProgress',{detail:{message,percent,stage:'source_fidelity'}}));
  }
  function audit(raw,payload){
    const issues=[];let set;
    try{set=JSON.parse(raw);}catch(_){return ['Source-fidelity output was not valid JSON.'];}
    const valid=new Set((payload.conditions||[]).map(item=>item.conditionId||item.id));
    const questions=set?.questions||[];
    if(questions.length!==10)issues.push(`Expected 10 questions; received ${questions.length}.`);
    questions.forEach((q,index)=>{
      const id=q.targetConditionId||q.sourceSupport?.conceptId;
      if(!id||!valid.has(id))issues.push(`Q${index+1}: source concept ID is missing or changed.`);
      if(!Array.isArray(q.sourceSupport?.sourceRefs)||!q.sourceSupport.sourceRefs.length)issues.push(`Q${index+1}: source references are missing.`);
      if(String(q.sourceSupport?.supportStatement||'').trim().length<8)issues.push(`Q${index+1}: source support statement is too vague.`);
    });
    return issues;
  }
  function checkpointBody(originalBody,raw,payload,issues){
    const text=clone(originalBody.text||{});text.format=clone(originalBody.text?.format||{});text.format.name='ukmla_knowledge_source_checkpoint';
    const concepts=(payload.conditions||[]).map(item=>({conditionId:item.conditionId||item.id,name:item.name,topic:item.topic,fields:item.fields,sourceRefs:item.sourceRefs||item.fields?.sourceRefs||[]}));
    const system=`You are the mandatory source-fidelity checkpoint for an uploaded UKMLA study pack. Return the complete ten-question set in exactly the supplied JSON schema and nothing else. Every correct answer, discriminator and rationale must be supported by the supplied concept map. Do not add unsupported doses, thresholds, diagnoses, management rules or guideline claims. Clinical framing may be added only when it is generic, accurate and does not create a fact absent from the source. Preserve the ten allocated question types, target concept IDs, topic IDs, scoring metadata and answer mapping unless a source error requires repair. Each question must include sourceSupport with the exact conceptId, one or more sourceRefs and a concise supportStatement. Replace any unsupported question rather than weakening this checkpoint.`;
    const user=`UPLOADED SOURCE CONCEPT MAP:\n${JSON.stringify(concepts)}\n\nCURRENT QUESTION SET:\n${raw}\n\nAUDIT ISSUES:\n${issues?.length?issues.join('\n'):'Perform the routine full source-fidelity review.'}`;
    return {model:originalBody.model||'gpt-5-mini',input:[{role:'system',content:[{type:'input_text',text:system}]},{role:'user',content:[{type:'input_text',text:user}]}],text};
  }
  function transient(status){return status===408||status===409||status===425||status===429||status>=500;}
  function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  async function runPass(originalBody,raw,payload,headers,issues){
    let attempt=0;
    while(true){
      attempt++;
      try{
        const response=await previousFetch(API,{method:'POST',headers,body:JSON.stringify(checkpointBody(originalBody,raw,payload,issues))});
        if(!response.ok){const data=await response.clone().json().catch(()=>null);const message=data?.error?.message||`Source-fidelity request failed (${response.status}).`;if(transient(response.status))throw Object.assign(new Error(message),{transient:true});throw new Error(message);}
        const data=await response.json();if(!outputText(data))throw new Error('Source-fidelity checkpoint returned no structured quiz.');return data;
      }catch(error){
        const network=error?.transient||error instanceof TypeError||/network|fetch|connection|offline|load failed/i.test(String(error?.message||error));
        if(!network)throw error;
        emit(`Connection interrupted during source-fidelity review. Progress saved; retrying this checkpoint after reconnect.`,38);
        if(navigator.onLine===false)await new Promise(resolve=>window.addEventListener('online',resolve,{once:true}));
        await delay(Math.min(60000,2000*Math.pow(2,Math.min(attempt,5))));
      }
    }
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(running||url!==API||!init||String(init.method||'GET').toUpperCase()!=='POST')return previousFetch(input,init);
    let body;try{body=JSON.parse(init.body||'{}');}catch(_){return previousFetch(input,init);}
    if(formatOf(body)!==TARGET)return previousFetch(input,init);
    const payload=payloadOf(body);if(!isKnowledge(payload))return previousFetch(input,init);
    augmentSchema(body);
    const response=await previousFetch(input,Object.assign({},init,{body:JSON.stringify(body)}));
    if(!response.ok)return response;
    const initial=await response.clone().json();const raw=outputText(initial);if(!raw)return response;
    emit('Running the mandatory uploaded-source fidelity checkpoint…',36);
    running=true;
    try{
      let best=await runPass(body,raw,payload,init.headers,[]);
      let bestRaw=outputText(best);let issues=audit(bestRaw,payload);
      if(issues.length){emit(`Source-fidelity review found ${issues.length} issue${issues.length===1?'':'s'}; correcting once more…`,42);best=await runPass(body,bestRaw,payload,init.headers,issues);bestRaw=outputText(best);issues=audit(bestRaw,payload);}
      if(issues.length)throw new Error(`Source-fidelity checkpoint retained ${issues.length} unresolved issue${issues.length===1?'':'s'}.`);
      emit('Uploaded-source fidelity checkpoint passed for all ten questions.',47);
      return new Response(JSON.stringify(best),{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/json'}});
    }finally{running=false;}
  };
})();
