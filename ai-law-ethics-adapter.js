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
        try{return {payload:JSON.parse(json),content};}catch(_){return null;}
      }
    }
    return null;
  }

  function lawPositions(payload){
    return (payload&&payload.conditions||[])
      .map((condition,index)=>String(condition.topic||'')===TOPIC?index:-1)
      .filter(index=>index>=0);
  }

  function addInstructions(body,positions){
    const found=sourcePayload(body);
    if(!found||!positions.length) return;
    const positionText=positions.map(index=>index+1).join(', ');
    found.content.text+=`\n\nWARD LAW, ETHICS AND PROFESSIONAL PRACTICE OVERRIDE:\nQuestions in positions ${positionText} use ward-law scenario cards rather than disease cards. Keep the required questionType identifiers and schema, but reinterpret each affected position using the law/ethics meaning below.\n1. Recognise the legal or professional issue.\n2. Distinguish the closest legal or ethical alternative.\n3. Identify the first information, document, capacity, authority or legal-framework check—not a diagnostic investigation.\n4. Identify the priority legal, safeguarding or patient-safety risk—not a medical diagnosis.\n5. Select the next lawful ward action after the available information is clarified.\n6. Select the immediate necessary, proportionate and least restrictive protective action.\n7. Select the standard professional action in a stable ward situation—not a medical treatment unless the scenario itself requires one.\n8. Identify the capacity, authority, voluntariness, confidentiality, jurisdiction or proportionality caveat that changes the standard route.\n9. Select the correct documentation and senior-escalation response when risk, disagreement or uncertainty persists.\n10. Select the correct senior, legal, safeguarding, information-governance, court or statutory escalation.\n\nUse the supplied headings directly: Recognise, Legal rule, Act, Record/escalate and Avoid. For law questions, all five options must be legal/professional issues, checks, actions, rules, documentation steps or escalations appropriate to that exact ward scenario. Do not hallucinate disease diagnoses, diagnostic tests or unrelated medical treatments as distractors. The decisive difficulty should come from capacity, lawful authority, voluntariness, confidentiality, best interests, proportionality, least-restrictive action, statutory route, documentation or escalation. Set clinicalDomain to ethics_law in later quality-control metadata. Respect the nation-specific warning: do not present England-and-Wales legislation as universally applicable across Scotland or Northern Ireland. When the nation is not specified, state the broadly transferable professional principle and use local-law verification as the caveat.`;
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

    const found=sourcePayload(body);
    const positions=lawPositions(found&&found.payload);
    if(!positions.length) return previousFetch(input,init);

    addInstructions(body,positions);
    const response=await previousFetch(input,Object.assign({},init,{body:JSON.stringify(body)}));
    if(!response.ok) return response;

    let data;
    try{data=await response.clone().json();}catch(_){return response;}
    relabel(data,positions);
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{
      detail:{message:`Applied the ward-law question profile to ${positions.length} question${positions.length===1?'':'s'}.`}
    }));
    return new Response(JSON.stringify(data),{
      status:response.status,
      statusText:response.statusText,
      headers:{'Content-Type':'application/json'}
    });
  };
})();
