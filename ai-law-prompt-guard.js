(function(){
  'use strict';

  if(window.__UKMLA_LAW_PROMPT_GUARD__) return;
  window.__UKMLA_LAW_PROMPT_GUARD__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const FORMAT='ukmla_ai_quiz';
  const TOPIC='Ward law, ethics and professional practice';
  const MARKER='WARD LAW, ETHICS AND PROFESSIONAL PRACTICE OVERRIDE';

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

  function findSource(body){
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

  function positionsFor(payload){
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

  function addOverride(found,positions){
    if(!found||!positions.length||found.content.text.includes(MARKER)) return;
    const positionText=positions.map(index=>index+1).join(', ');
    found.content.text+=`\n\n${MARKER}:\nQuestions in positions ${positionText} use ward-law scenario cards, not disease cards. This instruction overrides any clinical-type wording or mismatched HTML skeleton anchor for those positions. Keep the required questionType identifiers for schema compatibility, but use the law/ethics meaning and source field shown below.\n\nPOSITION MAPPING:\n1. Recognise field → identify the legal or professional issue.\n2. Recognise + Legal rule → distinguish the closest legal or ethical alternative.\n3. Legal rule field → first information, document, capacity, authority or framework check; never a diagnostic test.\n4. Avoid + Recognise fields → priority legal, safeguarding or patient-safety risk; never a disease diagnosis.\n5. Act field → next lawful ward action. Ignore an Ix-derived skeleton anchor here.\n6. Act field → immediate necessary, proportionate and least-restrictive protective action.\n7. Act field → standard professional action in a stable ward situation.\n8. Legal rule + Avoid fields → capacity, authority, voluntariness, confidentiality, proportionality or jurisdiction caveat.\n9. Record/escalate field → documentation and senior escalation when risk or disagreement persists.\n10. Record/escalate field → senior, legal, safeguarding, information-governance, statutory or court escalation.\n\nVISIBLE OPTIONS:\nAll five options must be genuine legal/professional competitors for the exact ward scenario. Do not hallucinate disease diagnoses, diagnostic investigations or unrelated medical treatments. Use legal issues, rules, authority checks, lawful actions, documentation steps or escalations at the same level of abstraction. At least three distractors must remain credible until the decisive capacity, authority, voluntariness, confidentiality, best-interests, proportionality, least-restrictive, documentation or jurisdiction clue is applied.\n\nMETADATA:\nSet clinicalDomain to ethics_law in later quality-control metadata. Preserve the true topic and target scenario. The hidden scoring aliases are: Mimics=Recognise, Ix=Legal rule, Tx=Act, Escalate=Record/escalate, Red flags=Avoid.\n\nJURISDICTION:\nDo not present England-and-Wales legislation as universally applicable across Scotland or Northern Ireland. When the nation is not specified, test the broadly transferable professional principle and make local-law verification the caveat.`;
  }

  window.fetch=function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(url!==API||!init||String(init.method||'GET').toUpperCase()!=='POST') return previousFetch(input,init);
    let body;
    try{body=JSON.parse(init.body||'{}');}catch(_){return previousFetch(input,init);}
    if(body?.text?.format?.name!==FORMAT) return previousFetch(input,init);
    const found=findSource(body);
    const positions=positionsFor(found&&found.payload);
    if(!positions.length) return previousFetch(input,init);
    addOverride(found,positions);
    return previousFetch(input,Object.assign({},init,{body:JSON.stringify(body)}));
  };
})();
