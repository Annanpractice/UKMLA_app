(function(){
  'use strict';

  if(window.__UKMLA_RESUME_EXACT_REQUEST__) return;
  window.__UKMLA_RESUME_EXACT_REQUEST__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const JOB_KEY='ukmlaAiGenerationJobV1';
  const BODY_KEY='ukmlaAiGenerationExactRequestV1';

  function readJob(){
    try{return JSON.parse(localStorage.getItem(JOB_KEY)||'null');}
    catch(_){return null;}
  }

  function bodyFormat(body){return body?.text?.format?.name||'';}

  function cleanBody(body){
    const copy=JSON.parse(JSON.stringify(body||{}));
    delete copy.stream;
    return copy;
  }

  function storedBody(){
    try{return JSON.parse(localStorage.getItem(BODY_KEY)||'null');}
    catch(_){return null;}
  }

  function saveBody(body){
    try{localStorage.setItem(BODY_KEY,JSON.stringify(cleanBody(body)));}
    catch(_){/* the main manager will display its storage warning */}
  }

  function markRecoveredJob(){
    const job=readJob();
    if(!job||job.status!=='active') return;
    job.status='paused';
    job.lastMessage='Generation progress was recovered after the app closed or reloaded. Paste the API key again and resume from the first unfinished checkpoint.';
    job.updatedAt=new Date().toISOString();
    try{localStorage.setItem(JOB_KEY,JSON.stringify(job));}catch(_){/* no-op */}
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message:job.lastMessage}}));
  }

  function cleanupCompleted(){
    const job=readJob();
    if(!job||job.status==='complete'||job.status==='discarded') localStorage.removeItem(BODY_KEY);
  }

  window.fetch=function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(url!==API||!init||String(init.method||'GET').toUpperCase()!=='POST') return previousFetch(input,init);
    let body;
    try{body=JSON.parse(init.body||'{}');}catch(_){return previousFetch(input,init);}
    if(bodyFormat(body)!=='ukmla_ai_quiz') return previousFetch(input,init);

    const job=readJob();
    const exact=storedBody();
    if(job&&job.status!=='complete'&&job.status!=='discarded'&&job.status!=='error'&&exact){
      const replacement=JSON.parse(JSON.stringify(exact));
      replacement.stream=body.stream===true;
      return previousFetch(input,Object.assign({},init,{body:JSON.stringify(replacement)}));
    }

    saveBody(body);
    return previousFetch(input,init);
  };

  markRecoveredJob();
  cleanupCompleted();
  document.addEventListener('ukmlaAiGenerationCheckpoint',cleanupCompleted);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',cleanupCompleted,{once:true});
})();
