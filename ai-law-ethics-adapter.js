(function(){
  'use strict';

  if(window.__UKMLA_LAW_ETHICS_ADAPTER__) return;
  window.__UKMLA_LAW_ETHICS_ADAPTER__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const FORMAT='ukmla_ai_quiz';
  const TOPIC='Ward law, ethics and professional practice';
  const LABELS=[
    'Recognise the legal or professional issue',
    'Distinguish the closest legal or ethical alternative',
    'First information or authority check',
    'Priority legal or patient-safety risk',
    'Next lawful ward action',
    'Immediate proportionate protective action',
    'Standard professional action',
    'Capacity, authority or jurisdiction caveat',
    'Record and escalate persistent risk or disagreement',
    'Senior, legal, safeguarding or governance escalation'
  ];

  function outputText(data){
    if(data&&typeof data.output_text==='string') return data.output_text;
    for(const item of (data&&data.output)||[]){
      for(const content of item.content||[]){
        if(content&&content.type==='output_text'&&typeof content.text==='string') return content.text;
      }
    }
    return '';
  }

  function setOutputText(data,text){
    data.output_text=text;
    let replaced=false;
    for(const item of data.output||[]){
      for(const content of item.content||[]){
        if(content&&content.type==='output_text'){
          content.text=text;
          replaced=true;
        }
      }
    }
    if(!replaced) data.output=[{content:[{type:'output_text',text}]}];
  }

  function requestBody(init){
    try{return JSON.parse(init&&init.body||'{}');}
    catch(_){return null;}
  }

  function formatName(body){
    return body&&body.text&&body.text.format&&body.text.format.name||'';
  }

  function extractJsonObject(text,start){
    let depth=0,inString=false,escaped=false,begun=false;
    for(let index=start;index<text.length;index++){
      const char=text[index];
      if(!begun){
        if(char!=='{') continue;
        begun=true;depth=1;start=index;continue;
      }
      if(inString){
        if(escaped) escaped=false;
        else if(char==='\\') escaped=true;
        else if(char==='"') inString=false;
        continue;
      }
      if(char==='"') inString=true;
      else if(char==='{') depth+=1;
      else if(char==='}'){
        depth-=1;
        if(depth===0) return text.slice(start,index+1);
      }
    }
    return null;
  }

  function sourcePayload(body){
    for(const item of body.input||[]){
      if(item.role!=='user') continue;
      for(const content of item.content||[]){
        if(content.type!=='input_text'||typeof content.text!=='string') continue;
        const marker='Source material:\n';
        const at=content.text.lastIndexOf(marker);
        if(at<0) continue;
        const json=extractJsonObject(content.text,at+marker.length);
        if(!json) continue;
        try{return JSON.parse(json);}catch(_){return null;}
      }
    }
    return null;
  }

  function lawPositions(payload){
    if(!payload) return [];
    if(payload.mode==='random_all_conditions'){
      return (payload.conditions||[])
        .map((condition,index)=>String(condition.topic||'')===TOPIC?index:-1)
        .filter(index=>index>=0&&index<10);
    }
    if(String(payload.topic||'')===TOPIC||(payload.conditions||[]).some(condition=>String(condition.topic||'')===TOPIC)){
      return [0,1,2,3,4,5,6,7,8,9];
    }
    return [];
  }

  function relabel(data,positions){
    const raw=outputText(data);
    if(!raw) return data;
    let set;
    try{set=JSON.parse(raw);}catch(_){return data;}
    const questions=Array.isArray(set)?set:(set.questions||[]);
    positions.forEach(index=>{
      const question=questions[index];
      if(!question) return;
      question.questionTypeLabel=LABELS[index]||question.questionTypeLabel;
      question.contentProfile='ward_law_ethics';
    });
    setOutputText(data,JSON.stringify(set));
    return data;
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    const body=requestBody(init);
    if(url!==API||formatName(body)!==FORMAT) return previousFetch(input,init);

    const positions=lawPositions(sourcePayload(body));
    if(!positions.length) return previousFetch(input,init);

    const response=await previousFetch(input,init);
    if(!response.ok) return response;

    let data;
    try{data=await response.clone().json();}catch(_){return response;}
    relabel(data,positions);
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{
      detail:{message:`Applied the ward-law question labels to ${positions.length} question${positions.length===1?'':'s'}.`}
    }));
    return new Response(JSON.stringify(data),{
      status:response.status,
      statusText:response.statusText,
      headers:{'Content-Type':'application/json'}
    });
  };
})();
