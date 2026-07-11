(function(){
  'use strict';

  if(window.__UKMLA_HARD_SPARSE_CHECKPOINT__) return;
  window.__UKMLA_HARD_SPARSE_CHECKPOINT__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const TARGET_FORMAT='ukmla_ai_quiz';
  let runningCheckpoint=false;

  const VERY_HARD_RULES=`\n\nVERY DIFFICULT / ULTRA-SPARSE OVERRIDE — THIS OVERRIDES ANY EARLIER DIFFICULTY SETTING:\nEvery one of the ten questions must be genuinely very difficult for a highly educated, high-performing final-year UK medical student who already knows the common guideline facts and has extensive question-bank experience. Do not generate easy, medium, moderate, standard or merely hard questions. Difficulty must come from clinical discrimination, pathway sequencing, prioritisation, a subtle contraindication/caveat, or a close mimic — never from obscure trivia.\n\nMANDATORY PER-QUESTION CHECKPOINT:\n1. SPARSE STEM: Remove every word and fact that is not essential to choosing the single best answer. Prefer 8–35 words; 45 words is a hard ceiling unless a safety-critical dose/result genuinely requires more. Include age, sex, setting, observations, normal findings or background only when they change probability or management. Use one subtle decisive discriminator, not a cluster of classic clues. Never name the diagnosis, copy the answer into the stem, announce a classic/pathognomonic finding, explain the reasoning, or teach within the vignette. Sparse must remain sufficient, not cryptic.\n2. VERY DIFFICULT: Ask whether a high-performing final-year medical student would find the answer obvious before using the discriminator. If yes, rebuild the question. Avoid textbook triads, buzzword giveaways, implausible distractors and one conspicuously correct option. At least three distractors must remain credible until the decisive clue, timing, caveat or pathway stage is applied.\n3. SHORT OPTIONS: Options must be the shortest clinically unambiguous noun phrases. Aim for 1–5 words; hard maximum 8 words, except an unavoidable standard drug-and-dose expression may use up to 10. No explanations, rationales, teaching, source labels, topic labels, section labels, parentheses, semicolons, “because”, “due to”, or clause-like wording.\n4. NORMALISED OPTIONS: All five options must use the same clinical category, grammatical form, specificity and approximately the same length. The correct option must not be longer, more qualified or more detailed than the distractors.\n5. SINGLE BEST ANSWER: Preserve one guideline-defensible answer. Keep the clinical anchor, target condition, question type, hidden scoring metadata, option order and correct-answer mapping unless a repair is clinically necessary.\n6. DIFFICULTY FIELD: If the schema contains a difficulty field, set every question to the strongest available very-difficult/very-hard value. Do not retain or output lower difficulty levels.\nBefore returning JSON, silently apply all six checks to each individual question and rewrite any item that fails.`;

  const CHECKPOINT_SYSTEM=`You are the final UKMLA question checkpoint. Review through the lens of a high-performing final-year UK medical student, not a novice. Return the complete ten-question set in exactly the supplied JSON schema and nothing else. Preserve IDs, hidden metadata, target topics/conditions, question-type allocation, answer order and correct-answer mapping unless the source material proves a clinical repair is required.\n\nFor EACH question, silently ask:\n- Is it genuinely very difficult, or can a well-prepared student answer from an obvious buzzword, a classic clue cluster, an implausible distractor or the unusually detailed option? If obvious, rebuild it.\n- Can any stem word, normal finding, preamble or contextual detail be deleted without losing the decisive discrimination? Delete it.\n- Can each option be shortened without losing clinical meaning? Shorten it.\n- Are all five options concise, parallel and equally specific? Normalise them.\n\nStem target: 8–35 words, maximum 45. Give only the bare minimum needed plus one subtle discriminator/caveat/pathway-stage clue. Do not name or paraphrase the answer.\nOption target: 1–5 words, maximum 8; up to 10 only for an unavoidable drug-and-dose expression. No explanations, clauses, parentheses, semicolons, source labels or teaching.\nDifficulty: very difficult only. Use close mimics, sequencing, prioritisation, negative/redirecting results, contraindications or escalation thresholds. Do not use obscure trivia. At least three distractors must be credible to a knowledgeable student.\nDo not output audit comments; output only the corrected schema-conforming quiz.`;

  function emit(message,detail){
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message,detail:detail||null}}));
  }

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function outputText(data){
    if(data&&typeof data.output_text==='string') return data.output_text;
    for(const item of (data&&data.output)||[]){
      for(const content of item.content||[]){
        if(content.type==='output_text'&&content.text) return content.text;
      }
    }
    return '';
  }

  function formatName(body){
    return body&&body.text&&body.text.format&&body.text.format.name||'';
  }

  function collectInputText(body){
    const chunks=[];
    for(const item of body.input||[]){
      for(const content of item.content||[]){
        if(content&&content.type==='input_text'&&typeof content.text==='string') chunks.push(content.text);
      }
    }
    return chunks.join('\n\n').slice(-180000);
  }

  function addRules(body){
    let added=false;
    for(const item of body.input||[]){
      if(item.role!=='user') continue;
      for(const content of item.content||[]){
        if(content.type!=='input_text'||typeof content.text!=='string') continue;
        if(!content.text.includes('VERY DIFFICULT / ULTRA-SPARSE OVERRIDE')) content.text+=VERY_HARD_RULES;
        added=true;
      }
    }
    if(!added){
      body.input=Array.isArray(body.input)?body.input:[];
      body.input.push({role:'user',content:[{type:'input_text',text:VERY_HARD_RULES.trim()}]});
    }
    return body;
  }

  function questionList(set){
    if(Array.isArray(set)) return set;
    if(set&&Array.isArray(set.questions)) return set.questions;
    return [];
  }

  function stemOf(question){
    return String(question&&(
      question.stem||question.questionStem||question.vignette||question.question||question.prompt||''
    )||'').replace(/\s+/g,' ').trim();
  }

  function optionText(option){
    if(typeof option==='string') return option;
    if(option&&typeof option==='object') return option.text||option.label||option.answer||option.content||'';
    return '';
  }

  function optionsOf(question){
    let options=question&&(question.options||question.answers||question.choices)||[];
    if(options&&!Array.isArray(options)&&typeof options==='object') options=Object.values(options);
    return (options||[]).map(optionText).map(text=>String(text||'').replace(/\s+/g,' ').trim());
  }

  function wordCount(text){
    const value=String(text||'').trim();
    return value?value.split(/\s+/).length:0;
  }

  function mechanicalAudit(raw){
    let set;
    try{set=JSON.parse(raw)}catch{return {score:999,issues:['The checkpoint output was not valid JSON.']};}
    const questions=questionList(set);
    const issues=[];
    if(questions.length!==10) issues.push(`Expected 10 questions; received ${questions.length}.`);
    questions.forEach((question,index)=>{
      const number=question.questionNumber||question.id||index+1;
      const stem=stemOf(question);
      const stemWords=wordCount(stem);
      if(!stem) issues.push(`Q${number}: no stem detected.`);
      else if(stemWords>45) issues.push(`Q${number}: stem is ${stemWords} words; maximum 45.`);
      const options=optionsOf(question);
      if(options.length!==5) issues.push(`Q${number}: ${options.length} options detected; exactly 5 required.`);
      const lengths=options.map(wordCount);
      options.forEach((text,optionIndex)=>{
        const count=lengths[optionIndex];
        if(count>10) issues.push(`Q${number}${String.fromCharCode(65+optionIndex)}: option is ${count} words; maximum 10.`);
        if(/\b(because|due to|therefore|which|in order to|so that)\b/i.test(text)||/[;:]/.test(text)){
          issues.push(`Q${number}${String.fromCharCode(65+optionIndex)}: explanatory or clause-like option.`);
        }
      });
      const positive=lengths.filter(Boolean);
      if(positive.length===5){
        const min=Math.min(...positive),max=Math.max(...positive);
        if(max>6&&max>min*3) issues.push(`Q${number}: options are not length-normalised (${min}–${max} words).`);
      }
    });
    return {score:issues.length,issues};
  }

  function checkpointBody(originalBody,raw,extra){
    const text=clone(originalBody.text||{});
    text.format=clone((originalBody.text&&originalBody.text.format)||{});
    text.format.name='ukmla_hard_sparse_checkpoint';
    const source=collectInputText(originalBody);
    const userText=`Original generation brief and source material:\n${source}\n\nGenerated ten-question set to checkpoint:\n${raw}${extra?`\n\nMechanical audit failures from the previous pass:\n${extra}`:''}`;
    return {
      model:originalBody.model||'gpt-5-mini',
      input:[
        {role:'system',content:[{type:'input_text',text:CHECKPOINT_SYSTEM}]},
        {role:'user',content:[{type:'input_text',text:userText}]}
      ],
      text
    };
  }

  async function runPass(originalBody,raw,headers,extra){
    const body=checkpointBody(originalBody,raw,extra);
    runningCheckpoint=true;
    try{
      const response=await previousFetch(API,{method:'POST',headers,body:JSON.stringify(body)});
      if(!response.ok) return null;
      const data=await response.json();
      return outputText(data)?data:null;
    }finally{
      runningCheckpoint=false;
    }
  }

  async function applyCheckpoint(originalResponse,body,headers){
    let originalData;
    try{originalData=await originalResponse.clone().json();}catch{return originalResponse;}
    const raw=outputText(originalData);
    if(!raw) return originalResponse;

    emit('Running the very-difficult sparse-stem checkpoint on all ten questions…');
    let bestData=await runPass(body,raw,headers,'');
    if(!bestData){
      emit('The sparse checkpoint could not complete; preserving the generated set unchanged.');
      return originalResponse;
    }

    let bestRaw=outputText(bestData);
    let bestAudit=mechanicalAudit(bestRaw);
    if(bestAudit.score){
      emit(`Sparse checkpoint found ${bestAudit.score} mechanical brevity issue${bestAudit.score===1?'':'s'}; correcting once more…`,bestAudit.issues);
      const retry=await runPass(body,bestRaw,headers,bestAudit.issues.slice(0,30).join('\n'));
      if(retry){
        const retryRaw=outputText(retry);
        const retryAudit=mechanicalAudit(retryRaw);
        if(retryAudit.score<=bestAudit.score){
          bestData=retry;
          bestRaw=retryRaw;
          bestAudit=retryAudit;
        }
      }
    }

    if(bestAudit.score===0) emit('Very-difficult sparse checkpoint passed for all ten questions.');
    else emit(`Very-difficult checkpoint completed with ${bestAudit.score} residual mechanical warning${bestAudit.score===1?'':'s'}.`,bestAudit.issues);

    window.__ukmlaLastHardSparseAudit={issues:bestAudit.issues,passed:bestAudit.score===0};
    return new Response(JSON.stringify(bestData),{
      status:originalResponse.status,
      statusText:originalResponse.statusText,
      headers:{'Content-Type':'application/json'}
    });
  }

  function difficultyText(element){
    const own=[element.id,element.name,element.className,element.getAttribute&&element.getAttribute('aria-label')].filter(Boolean).join(' ');
    const parent=element.closest&&element.closest('label,.aiq-control,.aiq-field,.form-row,.field,.control');
    return `${own} ${parent?parent.textContent:''}`;
  }

  function forceSelect(select){
    if(select.dataset.ukmlaVeryHardOnly==='1'||!/difficulty|challenge\s*level|question\s*level/i.test(difficultyText(select))) return;
    const options=[...select.options];
    let keep=options.find(option=>/very\s*(difficult|hard)|hardest|expert|extreme/i.test(`${option.value} ${option.textContent}`));
    if(!keep) keep=options[options.length-1];
    if(!keep){
      keep=document.createElement('option');
      keep.value='very_difficult';
      select.appendChild(keep);
    }
    options.forEach(option=>{if(option!==keep) option.remove();});
    keep.textContent='Very difficult only';
    keep.selected=true;
    select.value=keep.value;
    select.dataset.ukmlaVeryHardOnly='1';
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function forceRadio(radio){
    if(radio.dataset.ukmlaVeryHardChecked==='1'||!/difficulty|challenge\s*level|question\s*level/i.test(difficultyText(radio))) return;
    const scope=radio.closest('fieldset,.aiq-control,.aiq-field,.form-row,.field,.control')||radio.parentElement;
    if(!scope) return;
    const radios=[...scope.querySelectorAll('input[type="radio"]')];
    let keep=radios.find(item=>/very\s*(difficult|hard)|hardest|expert|extreme/i.test(difficultyText(item)));
    if(!keep) keep=radios[radios.length-1];
    radios.forEach(item=>{
      const wrapper=item.closest('label')||item.parentElement;
      if(item!==keep&&wrapper) wrapper.remove();
    });
    if(keep){
      keep.checked=true;
      keep.dataset.ukmlaVeryHardChecked='1';
      keep.dispatchEvent(new Event('change',{bubbles:true}));
      const wrapper=keep.closest('label');
      if(wrapper) wrapper.childNodes.forEach(node=>{if(node.nodeType===3&&/hard|difficulty|level/i.test(node.textContent)) node.textContent=' Very difficult only';});
    }
  }

  function addBadge(panel){
    if(!panel||panel.querySelector('.ukmla-very-hard-pill')) return;
    const pill=document.createElement('div');
    pill.className='ukmla-very-hard-pill';
    pill.textContent='Very difficult only · ultra-sparse stems · short normalised options';
    pill.style.cssText='display:inline-flex;margin:.55rem 0 .8rem;padding:.38rem .68rem;border:1px solid rgba(130,144,255,.45);border-radius:999px;background:rgba(130,144,255,.12);color:inherit;font:800 .78rem/1.25 system-ui,sans-serif;letter-spacing:.01em';
    const heading=panel.querySelector('h1,h2,h3');
    if(heading) heading.insertAdjacentElement('afterend',pill); else panel.prepend(pill);
  }

  function enforceUi(root){
    const scope=root&&root.querySelectorAll?root:document;
    scope.querySelectorAll('select').forEach(forceSelect);
    scope.querySelectorAll('input[type="radio"]').forEach(forceRadio);
    const panel=document.querySelector('#ai-generated-quiz,#ai-quiz-panel,.aiq-panel,[data-ai-quiz]');
    if(panel) addBadge(panel);
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(runningCheckpoint||url!==API||!init||String(init.method||'GET').toUpperCase()!=='POST') return previousFetch(input,init);
    let body;
    try{body=JSON.parse(init.body||'{}');}catch{return previousFetch(input,init);}
    if(formatName(body)!==TARGET_FORMAT) return previousFetch(input,init);

    body=addRules(body);
    emit('Enforcing very-difficult-only generation with ultra-sparse stems and short options…');
    const response=await previousFetch(input,Object.assign({},init,{body:JSON.stringify(body)}));
    if(!response.ok) return response;
    return applyCheckpoint(response,body,init.headers);
  };

  function init(){
    enforceUi(document);
    new MutationObserver(mutations=>{
      for(const mutation of mutations){
        for(const node of mutation.addedNodes){
          if(node.nodeType===1) enforceUi(node);
        }
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
