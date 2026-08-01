(function(){
  'use strict';

  const MODE_KEY='ukmlaImageQuestionModeV1';
  const LEGACY_KEY='ukmlaImageQuestionsEnabledV1';
  const MODES=new Set(['off','prefer','require']);
  const MAX_INIT_ATTEMPTS=240;
  const COMPATIBLE_TYPES=new Set([
    'sparse_most_likely_diagnosis',
    'close_mimic_discrimination',
    'dangerous_diagnosis_priority_exclusion',
    'immediate_emergency_management',
    'failure_or_deterioration',
    'escalation_referral_disposition'
  ]);

  let enginePatched=false;
  let aiMountPatched=false;
  let listenersBound=false;
  let mountScheduled=false;

  function core(){return window.UKMLA_V2;}
  function engine(){return window.UKMLA_V2_AI_ENGINE;}
  function imageBank(){return window.UKMLA_IMAGE_BANK;}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function setText(node,value){if(node&&node.textContent!==value){node.textContent=value;return true;}return false;}
  function setValue(node,value){if(node&&node.value!==value){node.value=value;return true;}return false;}
  function setHidden(node,value){if(node&&node.hidden!==value){node.hidden=value;return true;}return false;}
  function setDisabled(node,value){if(node&&node.disabled!==value){node.disabled=value;return true;}return false;}

  function mode(){
    const stored=clean(localStorage.getItem(MODE_KEY)).toLowerCase();
    if(MODES.has(stored))return stored;
    return localStorage.getItem(LEGACY_KEY)==='0'?'off':'prefer';
  }

  function syncLegacyPreference(value){
    imageBank()?.setEnabled?.(value!=='off');
    const legacy=value==='off'?'0':'1';
    if(localStorage.getItem(LEGACY_KEY)!==legacy)localStorage.setItem(LEGACY_KEY,legacy);
  }

  function setMode(value){
    const next=MODES.has(value)?value:'prefer';
    if(localStorage.getItem(MODE_KEY)!==next)localStorage.setItem(MODE_KEY,next);
    syncLegacyPreference(next);
    updateControl();
    document.dispatchEvent(new CustomEvent('ukmlaImageQuestionModeChanged',{detail:{mode:next}}));
    return next;
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

  function hasImage(conditions){return (conditions||[]).some(condition=>Boolean(condition?.image));}
  function preparedConditions(conditions,questionTypes){return imageBank()?.prepareConditions?.(conditions,questionTypes)||(conditions||[]).map(condition=>({...condition}));}

  function stripImages(conditions){
    return (conditions||[]).map(condition=>{
      const copy={...condition};
      delete copy.image;
      delete copy.imageQuestionNumber;
      return copy;
    });
  }

  function requireImageConditions(conditions,questionTypes){
    const source=stripImages(conditions);
    let prepared=preparedConditions(source,questionTypes);
    if(hasImage(prepared))return prepared;

    const selectedImageIndex=source.findIndex(condition=>imageBank()?.imagesForCondition?.(condition)?.length);
    const compatibleSwapIndex=source.findIndex((_,index)=>index!==selectedImageIndex&&COMPATIBLE_TYPES.has(questionTypes?.[index]));
    if(selectedImageIndex>=0&&compatibleSwapIndex>=0){
      const swapped=source.map(condition=>({...condition}));
      [swapped[selectedImageIndex],swapped[compatibleSwapIndex]]=[swapped[compatibleSwapIndex],swapped[selectedImageIndex]];
      prepared=preparedConditions(swapped,questionTypes);
      if(hasImage(prepared))return prepared;
    }

    const topicIds=new Set(source.map(condition=>condition.topicId).filter(Boolean));
    if(topicIds.size<=1){
      const topic=source[0]?.topic||source[0]?.topicName||'this topic';
      throw new Error(`No approved image-backed condition is available in ${topic}. Choose another topic or change Medical images to Prefer one.`);
    }

    const all=core()?.App?.conditions||[];
    const usedConditions=new Set(source.map(condition=>condition.id||condition.conditionId));
    const compatibleSlots=source.map((condition,index)=>({condition,index})).filter(item=>COMPATIBLE_TYPES.has(questionTypes?.[item.index]));

    for(const slot of compatibleSlots){
      const occupiedTopics=new Set(source.filter((_,index)=>index!==slot.index).map(condition=>condition.topicId).filter(Boolean));
      const replacements=all.filter(condition=>
        !usedConditions.has(condition.id)&&
        !occupiedTopics.has(condition.topicId)&&
        imageBank()?.imagesForCondition?.(condition)?.length
      ).sort(compareRank);
      const replacement=replacements[0];
      if(!replacement)continue;
      const attempt=source.map(condition=>({...condition}));
      attempt[slot.index]={...replacement};
      prepared=preparedConditions(attempt,questionTypes);
      if(hasImage(prepared))return prepared;
    }

    throw new Error('No approved medical image could be placed in this ten-question build. Change Medical images to Prefer one or add another reviewed image to the bank.');
  }

  function waitForManifest(timeoutMs=5000){
    if(imageBank()?.approvedImages?.().length)return Promise.resolve();
    return new Promise(resolve=>{
      let settled=false;
      const finish=()=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        document.removeEventListener('ukmlaImageBankReady',finish);
        resolve();
      };
      const timer=setTimeout(finish,timeoutMs);
      document.addEventListener('ukmlaImageBankReady',finish,{once:true});
    });
  }

  function patchEngine(){
    const api=engine();
    if(!api||!api.__medicalImagePatched||!imageBank()||typeof api.runPipeline!=='function')return false;
    if(api.__medicalImageModePatched){enginePatched=true;return true;}
    api.__medicalImageModePatched=true;
    const original=api.runPipeline.bind(api);
    api.runPipeline=async config=>{
      if(config?.knowledge)return original(config);
      const selectedMode=mode();
      syncLegacyPreference(selectedMode);
      if(selectedMode==='off')return original({...config,conditions:stripImages(config.conditions)});

      await waitForManifest();
      if(!imageBank()?.approvedImages?.().length){
        if(selectedMode==='require')throw new Error('The approved medical-image manifest is unavailable. No OpenAI request was sent.');
        return original(config);
      }

      const conditions=selectedMode==='require'?requireImageConditions(config.conditions,config.questionTypes):config.conditions;
      const set=await original({...config,conditions});
      const count=Number(set?.imageBank?.imageCount)||0;
      if(selectedMode==='require'&&count!==1)throw new Error('The build did not preserve exactly one approved image question, so it was not saved.');
      set.imageBank={...(set.imageBank||{}),mode:selectedMode,required:selectedMode==='require'};
      return set;
    };
    enginePatched=true;
    return true;
  }

  function resolveWorkspace(root){
    if(root?.matches?.('[data-ukmla-question-workspace="ai"]'))return root;
    return root?.querySelector?.('[data-ukmla-question-workspace="ai"]')||document.querySelector('[data-ukmla-question-workspace="ai"]');
  }

  function scopePool(workspace){
    const app=core()?.App;
    if(!app)return[];
    const scope=workspace.querySelector('#ai-mode')?.value||'random';
    if(scope!=='topic')return app.conditions||[];
    const topicId=workspace.querySelector('#ai-topic')?.value;
    return app.byTopic?.get?.(topicId)||[];
  }

  function availability(workspace){
    const bank=imageBank();
    if(!bank||!workspace)return 0;
    return scopePool(workspace).filter(condition=>bank.imagesForCondition?.(condition)?.length).length;
  }

  function helperText(workspace){
    const selected=mode();
    const count=availability(workspace);
    if(selected==='off')return'Image questions are disabled for new builds.';
    if(selected==='prefer')return`${count} approved image-backed condition${count===1?'':'s'} in this scope. The build uses one when a compatible slot is available.`;
    if(count)return`${count} approved image-backed condition${count===1?'':'s'} in this scope. Exactly one image question is required.`;
    return'No approved image-backed condition is available in this scope. The build will stop before contacting OpenAI.';
  }

  function updateControl(root){
    const workspace=resolveWorkspace(root);
    if(!workspace)return false;
    const select=workspace.querySelector('#ai-image-mode');
    setValue(select,mode());
    setText(workspace.querySelector('#ai-image-mode-detail'),helperText(workspace));
    setHidden(workspace.querySelector('.image-question-toggle'),true);
    const scopeSelect=workspace.querySelector('#ai-mode');
    setDisabled(select,Boolean(scopeSelect?.disabled||workspace.querySelector('#ai-start')?.disabled));
    return true;
  }

  function mountControl(root){
    const workspace=resolveWorkspace(root);
    if(!workspace)return false;
    setHidden(workspace.querySelector('.image-question-toggle'),true);

    const existing=workspace.querySelector('#ai-image-mode');
    if(existing){updateControl(workspace);return true;}

    const scopeSelect=workspace.querySelector('#ai-mode');
    const scopeField=scopeSelect?.closest('.field');
    if(!scopeSelect||!scopeField)return false;

    let row=workspace.querySelector('.image-scope-row');
    if(!row){
      row=document.createElement('div');
      row.className='image-scope-row';
      scopeField.before(row);
      if(scopeField.style.marginTop!=='0px'&&scopeField.style.marginTop!=='0')scopeField.style.marginTop='0';
      row.appendChild(scopeField);
    }else if(scopeField.parentElement!==row)row.insertBefore(scopeField,row.firstChild||null);

    const field=document.createElement('div');
    field.className='field image-mode-field';
    field.innerHTML='<label for="ai-image-mode">Medical images</label><select class="select" id="ai-image-mode"><option value="off">Off</option><option value="prefer">Prefer one</option><option value="require">Require exactly one</option></select><small class="question-source-note" id="ai-image-mode-detail"></small>';
    row.appendChild(field);

    const select=field.querySelector('#ai-image-mode');
    select.addEventListener('change',event=>setMode(event.target.value));
    if(scopeSelect.dataset.ukmlaImageModeBound!=='1'){
      scopeSelect.dataset.ukmlaImageModeBound='1';
      scopeSelect.addEventListener('change',()=>scheduleMount(workspace));
    }
    const topic=workspace.querySelector('#ai-topic');
    if(topic&&topic.dataset.ukmlaImageModeBound!=='1'){
      topic.dataset.ukmlaImageModeBound='1';
      topic.addEventListener('change',()=>scheduleMount(workspace));
    }
    workspace.dataset.ukmlaImageModeMounted='1';
    updateControl(workspace);
    document.dispatchEvent(new CustomEvent('ukmlaImageModeMounted',{detail:{workspace}}));
    return true;
  }

  function scheduleMount(root){
    if(mountScheduled)return;
    mountScheduled=true;
    requestAnimationFrame(()=>{
      mountScheduled=false;
      mountControl(root);
    });
  }

  function patchAiMount(){
    const api=window.UKMLA_V2_AI;
    if(!api||typeof api.mount!=='function')return false;
    if(api.mount.__medicalImageModePatched){aiMountPatched=true;return true;}
    const original=api.mount.bind(api);
    const wrapped=function(container,...args){
      const result=original(container,...args);
      mountControl(container);
      return result;
    };
    wrapped.__medicalImageModePatched=true;
    api.mount=wrapped;
    aiMountPatched=true;
    return true;
  }

  function bindLifecycleListeners(){
    if(listenersBound)return;
    listenersBound=true;
    document.addEventListener('ukmlaImageBankReady',()=>scheduleMount());
    window.addEventListener('hashchange',()=>scheduleMount());
  }

  function initialise(attempt=0){
    const ready=patchEngine()&&patchAiMount();
    if(!ready){
      if(attempt<MAX_INIT_ATTEMPTS)setTimeout(()=>initialise(attempt+1),50);
      else console.error('UKMLA medical-image mode control could not initialise.');
      return;
    }
    syncLegacyPreference(mode());
    bindLifecycleListeners();
    mountControl();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initialise(),{once:true});
  else initialise();

  window.UKMLA_IMAGE_MODE={mode,setMode,requireImageConditions,availability,mountControl,updateControl};
})();
