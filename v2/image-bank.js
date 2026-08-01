(function(){
  'use strict';

  const MANIFEST_URL='./data/image-bank.json?v=2';
  const PREF_KEY='ukmlaImageQuestionsEnabledV1';
  const MAX_IMAGES_PER_SET=1;
  const MAX_INIT_ATTEMPTS=240;
  const COMPATIBLE_TYPES=new Set([
    'sparse_most_likely_diagnosis',
    'close_mimic_discrimination',
    'dangerous_diagnosis_priority_exclusion',
    'immediate_emergency_management',
    'failure_or_deterioration',
    'escalation_referral_disposition'
  ]);
  const ALLOWED_LICENCES=new Set(['CC0 1.0','CC BY 4.0']);

  let manifest={schemaVersion:'ukmla-image-bank-v1',images:[]};
  let manifestReady=false;
  let patchReady=false;
  let activeBuildImages=[];
  let currentPresentation=null;

  function core(){return window.UKMLA_V2;}
  function schema(){return window.UKMLA_V2_AI_SCHEMA;}
  function engine(){return window.UKMLA_V2_AI_ENGINE;}
  function transport(){return window.UKMLA_V2_AI_TRANSPORT;}
  function bank(){return window.UKMLA_QUESTION_BANK;}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function normalise(value){return clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function enabled(){const value=localStorage.getItem(PREF_KEY);return value===null||value==='1';}
  function setEnabled(value){localStorage.setItem(PREF_KEY,value?'1':'0');}

  function approvedImages(){
    return (manifest.images||[]).filter(image=>
      image?.approved===true&&
      ALLOWED_LICENCES.has(clean(image.licence))&&
      /^https:\/\//i.test(clean(image.imageUrl))&&
      /^https:\/\//i.test(clean(image.sourcePage))
    );
  }

  function imageMatchesCondition(image,condition){
    const name=normalise(condition?.name||condition?.targetCondition||condition?.conditionName);
    if(!name)return false;
    return (image.conditionAliases||[]).some(alias=>{
      const candidate=normalise(alias);
      return candidate&&(name===candidate||name.includes(candidate)||candidate.includes(name));
    });
  }

  function imagesForCondition(condition){return approvedImages().filter(image=>imageMatchesCondition(image,condition));}

  function publicImage(image){
    return{
      imageId:image.imageId,
      url:image.imageUrl,
      alt:image.neutralAlt,
      modality:image.modality,
      sourceName:image.sourceName,
      sourcePage:image.sourcePage,
      licence:image.licence,
      licenceUrl:image.licenceUrl,
      attribution:image.attribution,
      teachingFinding:image.teachingFinding
    };
  }

  function candidateRank(condition){
    const api=core();
    const index=api?.eventIndex?.()||{conditionAnswered:{},conditionPresented:{}};
    const coverage=api?.coverageState?.()||{covered:[]};
    const answered=Number(index.conditionAnswered?.[condition.id]?.answered)||0;
    const presented=Number(index.conditionPresented?.[condition.id])||0;
    const covered=(coverage.covered||[]).includes(condition.id)?1:0;
    return[covered,answered?1:0,answered,presented,Math.random()];
  }

  function compareRank(left,right){
    const a=candidateRank(left),b=candidateRank(right);
    for(let index=0;index<a.length;index++)if(a[index]!==b[index])return a[index]-b[index];
    return 0;
  }

  function prepareConditions(conditions,questionTypes){
    const source=(conditions||[]).map(condition=>({...condition}));
    if(!enabled()||!manifestReady||!source.length)return source;
    const used=new Set(source.map(condition=>condition.id||condition.conditionId));
    let attached=0;

    for(let index=0;index<source.length&&attached<MAX_IMAGES_PER_SET;index++){
      if(!COMPATIBLE_TYPES.has(questionTypes?.[index]))continue;
      const direct=imagesForCondition(source[index])[0];
      if(!direct)continue;
      source[index].image=publicImage(direct);
      source[index].imageQuestionNumber=index+1;
      attached++;
    }

    if(attached>=MAX_IMAGES_PER_SET)return source;
    const all=core()?.App?.conditions||[];
    for(let index=0;index<source.length&&attached<MAX_IMAGES_PER_SET;index++){
      if(!COMPATIBLE_TYPES.has(questionTypes?.[index]))continue;
      const topicId=source[index].topicId;
      const replacements=all.filter(condition=>
        condition.topicId===topicId&&
        !used.has(condition.id)&&
        imagesForCondition(condition).length
      ).sort(compareRank);
      const replacement=replacements[0];
      if(!replacement)continue;
      const image=imagesForCondition(replacement)[0];
      used.delete(source[index].id||source[index].conditionId);
      used.add(replacement.id);
      source[index]={...replacement,image:publicImage(image),imageQuestionNumber:index+1};
      attached++;
    }
    return source;
  }

  function imageRows(config){
    return (config?.conditions||[]).map((condition,index)=>condition?.image?{
      questionNumber:index+1,
      questionType:config.questionTypes?.[index]||null,
      targetConditionId:condition.id||condition.conditionId,
      targetCondition:condition.name||condition.targetCondition,
      image:condition.image
    }:null).filter(Boolean);
  }

  function imageInstruction(config){
    const rows=imageRows(config);
    if(!rows.length)return'';
    return`\n\nMEDICAL IMAGE REQUIREMENT:\n${JSON.stringify(rows)}\nThe corresponding image inputs are attached in the same order. Each listed question must depend materially on visual interpretation of its image while retaining its assigned question type. Refer briefly to the image or modality in the stem. Do not state the target diagnosis or hidden teaching finding in the stem or lead-in. Do not invent findings absent from the image. The application restores immutable source and licence metadata after generation.`;
  }

  function findConfig(args){return args.find(value=>value&&typeof value==='object'&&Array.isArray(value.conditions))||null;}

  function patchPrompts(api){
    const names=['generationPrompt','checkpointPrompt','repairPrompt','targetedRepairPrompt','sbaAuditPrompt','combinedCheckpointPrompt'];
    for(const name of names){
      const original=api[name];
      if(typeof original!=='function'||original.__imagePatched)continue;
      const wrapped=function(...args){
        const output=original.apply(api,args);
        return typeof output==='string'?output+imageInstruction(findConfig(args)):output;
      };
      wrapped.__imagePatched=true;
      api[name]=wrapped;
    }
  }

  function lockQuestionImages(set,config){
    if(!set||!Array.isArray(set.questions))return;
    set.questions.forEach((question,index)=>{
      const expected=config?.conditions?.[index]?.image;
      if(expected)question.image=clone(expected);
      else if(question&&Object.prototype.hasOwnProperty.call(question,'image'))delete question.image;
    });
  }

  function patchSchema(){
    const api=schema();
    if(!api)return false;
    if(api.__medicalImagePatched)return true;
    api.__medicalImagePatched=true;
    patchPrompts(api);
    const originalValidate=api.validate.bind(api);
    api.validate=(set,config,stage)=>{
      lockQuestionImages(set,config);
      const errors=originalValidate(set,config,stage);
      (set?.questions||[]).forEach((question,index)=>{
        const expected=config?.conditions?.[index]?.image;
        if(!expected)return;
        const text=normalise(`${question.stem||''} ${question.leadIn||''}`);
        const target=normalise(config.conditions[index].name||config.conditions[index].targetCondition);
        if(!/(image|radiograph|x ray|ct|scan|photograph|shown|appearance|film)/.test(text))errors.push(`Q${index+1}: image question must explicitly refer to the image or modality.`);
        if(target&&text.includes(target))errors.push(`Q${index+1}: image question gives away the target diagnosis.`);
        if(question.image?.imageId!==expected.imageId)errors.push(`Q${index+1}: image identity changed.`);
      });
      return errors;
    };
    return true;
  }

  function appendImageInputs(body){
    if(!activeBuildImages.length||!body?.input)return body;
    const copy=clone(body);
    const messages=Array.isArray(copy.input)?copy.input:[];
    const user=[...messages].reverse().find(message=>message?.role==='user');
    if(!user||!Array.isArray(user.content))return body;
    if(user.content.some(part=>part?.type==='input_image'))return copy;
    user.content.push({type:'input_text',text:`Attached approved medical image inputs: ${activeBuildImages.map(item=>`Q${item.questionNumber} ${item.image.imageId}`).join('; ')}.`});
    activeBuildImages.forEach(item=>user.content.push({type:'input_image',image_url:item.image.url,detail:'high'}));
    return copy;
  }

  function patchTransport(){
    const api=transport();
    if(!api)return false;
    if(api.__medicalImagePatched)return true;
    if(typeof api.send!=='function')return false;
    api.__medicalImagePatched=true;
    const original=api.send.bind(api);
    api.send=(token,body)=>original(token,appendImageInputs(body));
    return true;
  }

  function patchEngine(){
    const api=engine();
    if(!api)return false;
    if(api.__medicalImagePatched)return true;
    if(typeof api.runPipeline!=='function')return false;
    api.__medicalImagePatched=true;
    const original=api.runPipeline.bind(api);
    api.runPipeline=async config=>{
      if(config?.knowledge)return original(config);
      await manifestPromise;
      const conditions=prepareConditions(config.conditions,config.questionTypes);
      activeBuildImages=imageRows({...config,conditions});
      try{
        const set=await original({...config,conditions});
        set.imageBank={schemaVersion:manifest.schemaVersion,imageCount:activeBuildImages.length,licencePolicy:'approved-cc-only'};
        return set;
      }finally{activeBuildImages=[];}
    };
    return true;
  }

  function findingHtml(image){
    if(!image?.teachingFinding)return'';
    return`<div class="medical-image-finding"><strong>Image finding</strong><span>${core()?.escapeHtml?.(image.teachingFinding)||image.teachingFinding}</span></div>`;
  }

  function figureHtml(image,answered){
    return`<figure class="medical-question-image" data-medical-image-id="${image.imageId}"><a href="${image.url}" target="_blank" rel="noopener noreferrer"><img src="${image.url}" alt="${core()?.escapeHtml?.(image.alt)||image.alt}" loading="eager" referrerpolicy="no-referrer"></a><figcaption><span>${core()?.escapeHtml?.(image.modality)||image.modality}</span><a href="${image.sourcePage}" target="_blank" rel="noopener noreferrer">${core()?.escapeHtml?.(image.attribution)||image.attribution}</a><a href="${image.licenceUrl}" target="_blank" rel="noopener noreferrer">${image.licence}</a></figcaption>${answered?findingHtml(image):''}</figure>`;
  }

  function decorateCurrentQuestion(){
    if(!currentPresentation?.question?.image)return;
    const card=[...document.querySelectorAll('.quiz-card')].find(node=>node.querySelector('.quiz-stem'));
    if(!card)return;
    const image=currentPresentation.question.image;
    const existing=card.querySelector(`[data-medical-image-id="${image.imageId}"]`);
    if(existing){
      if(currentPresentation.answered&&!existing.querySelector('.medical-image-finding'))existing.insertAdjacentHTML('beforeend',findingHtml(image));
      return;
    }
    const stem=card.querySelector('.quiz-stem');
    if(!stem)return;
    stem.insertAdjacentHTML('beforebegin',figureHtml(image,currentPresentation.answered));
    const img=card.querySelector('.medical-question-image img');
    if(img)img.onerror=()=>{
      const figure=img.closest('figure');
      figure?.classList.add('image-load-failed');
      img.replaceWith(Object.assign(document.createElement('p'),{textContent:'The image could not be loaded. Open the source link below.'}));
    };
  }

  function scheduleDecoration(){
    requestAnimationFrame(decorateCurrentQuestion);
    setTimeout(decorateCurrentQuestion,80);
    setTimeout(decorateCurrentQuestion,220);
  }

  async function questionForEvent(event){
    const active=core()?.App?.quiz;
    if(active&&active.id===event.quizId&&Array.isArray(active.questions)){
      return active.questions.find((question,index)=>String(question.id||index+1)===String(event.questionId))||null;
    }
    if(bank()?.loadSet){
      const attempt=bank()?.attemptById?.(event.quizId);
      const setId=attempt?.setId||event.quizId;
      const set=await bank().loadSet(setId);
      return set?.questions?.find((question,index)=>String(question.id||index+1)===String(event.questionId))||null;
    }
    return null;
  }

  async function handleLearningEvent(event){
    if(!event||!event.quizId)return;
    if(event.kind==='presented'){
      currentPresentation=null;
      document.querySelectorAll('.medical-question-image').forEach(node=>node.remove());
      const question=await questionForEvent(event);
      if(!question?.image)return;
      currentPresentation={quizId:event.quizId,questionId:String(event.questionId),question,answered:false};
    }else if(event.kind==='answered'&&currentPresentation&&currentPresentation.quizId===event.quizId&&currentPresentation.questionId===String(event.questionId)){
      currentPresentation.answered=true;
    }else return;
    scheduleDecoration();
  }

  function initialisePatches(attempt=0){
    if(patchReady)return;
    const ready=patchSchema()&&patchTransport()&&patchEngine();
    if(!ready){
      if(attempt<MAX_INIT_ATTEMPTS)setTimeout(()=>initialisePatches(attempt+1),50);
      else console.error('UKMLA medical-image extension could not initialise its generation hooks.');
      return;
    }
    patchReady=true;
    document.addEventListener('ukmlaLearningEvent',event=>void handleLearningEvent(event.detail));
    document.dispatchEvent(new CustomEvent('ukmlaImageGenerationHooksReady'));
  }

  const manifestPromise=fetch(MANIFEST_URL,{cache:'no-cache'})
    .then(response=>{if(!response.ok)throw new Error(`Image manifest ${response.status}`);return response.json();})
    .then(value=>{
      manifest=value&&Array.isArray(value.images)?value:manifest;
      manifestReady=true;
      document.dispatchEvent(new CustomEvent('ukmlaImageBankReady',{detail:{count:approvedImages().length}}));
      return manifest;
    })
    .catch(error=>{
      manifestReady=true;
      console.warn('UKMLA image bank unavailable:',error);
      document.dispatchEvent(new CustomEvent('ukmlaImageBankReady',{detail:{count:0,error:true}}));
      return manifest;
    });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initialisePatches(),{once:true});
  else initialisePatches();

  window.UKMLA_IMAGE_BANK={manifest:()=>manifest,approvedImages,imagesForCondition,prepareConditions,enabled,setEnabled};
})();
