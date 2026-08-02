(function(){
  'use strict';

  const MODE_KEY='ukmlaQuestionTypeAssignmentModeV1';
  const MODES={fixed:'fixed-order-v1',balanced:'best-fit-balanced-v1'};
  const LABELS={
    [MODES.fixed]:'Fixed order',
    [MODES.balanced]:'Best-fit balanced (recommended)'
  };
  const MAX_INIT_ATTEMPTS=240;
  const AI_GAP_ABSOLUTE=4;
  const AI_GAP_RATIO=.007;
  const AI_MAX_LOCAL_LOSS=18;
  const MIN_ACCEPTABLE_PAIR=8;
  const IMAGE_TYPES=new Set([
    'sparse_most_likely_diagnosis',
    'close_mimic_discrimination',
    'dangerous_diagnosis_priority_exclusion',
    'immediate_emergency_management',
    'failure_or_deterioration',
    'escalation_referral_disposition'
  ]);
  const TYPE_FIELD={
    sparse_most_likely_diagnosis:'mimics',
    close_mimic_discrimination:'mimics',
    first_line_investigation:'investigations',
    dangerous_diagnosis_priority_exclusion:'redFlags',
    next_step_after_initial_result:'investigations',
    immediate_emergency_management:'escalation',
    stable_first_line_treatment:'treatment',
    contraindication_caveat_switch:'treatment',
    failure_or_deterioration:'escalation',
    escalation_referral_disposition:'escalation'
  };
  const KEYWORDS={
    sparse_most_likely_diagnosis:[/present/i,/clinical/i,/feature/i,/sign/i,/symptom/i,/mimic/i],
    close_mimic_discrimination:[/mimic/i,/versus|\bvs\b/i,/differentiat|distinguish|discriminat/i,/,/],
    first_line_investigation:[/first[- ]line|initial|screen|test|investigat|diagnos/i],
    dangerous_diagnosis_priority_exclusion:[/red flag|exclude|rule out|not miss|danger|urgent|emergen|same[- ]day/i],
    next_step_after_initial_result:[/after|if |then|repeat|confirm|result|staging|follow[- ]up|next/i],
    immediate_emergency_management:[/immediate|urgent|emergen|resusc|\babc\b|stat|intravenous|\biv\b|nbm|same[- ]day|admit/i],
    stable_first_line_treatment:[/first[- ]line|start|treat|manage|lifestyle|oral|topical|conservative/i],
    contraindication_caveat_switch:[/contraindicat|avoid|allerg|pregnan|renal|hepatic|switch|caveat|unless|if |interaction/i],
    failure_or_deterioration:[/fail|refractory|deteriorat|worsen|non[- ]?response|persistent|despite|relapse|unstable/i],
    escalation_referral_disposition:[/refer|specialist|admit|pathway|mdt|surgery|secondary care|discharge|follow[- ]up/i]
  };

  let enginePatched=false;
  let aiMountPatched=false;
  let listenersBound=false;
  let mountScheduled=false;

  function core(){return window.UKMLA_V2;}
  function engine(){return window.UKMLA_V2_AI_ENGINE;}
  function schema(){return window.UKMLA_V2_AI_SCHEMA;}
  function transport(){return window.UKMLA_V2_AI_TRANSPORT;}
  function imageBank(){return window.UKMLA_IMAGE_BANK;}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function clip(value,max=260){const text=clean(value);return text.length>max?`${text.slice(0,max-1)}…`:text;}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function fields(condition){return condition?.fields&&typeof condition.fields==='object'?condition.fields:{};}
  function fieldText(condition,name){return clean(fields(condition)[name]);}
  function allText(condition){return clean([condition?.name,condition?.targetCondition,condition?.profile,condition?.topic,condition?.topicName,...Object.values(fields(condition)||{}),JSON.stringify(condition?.labels||{})].join(' '));}
  function mode(){return localStorage.getItem(MODE_KEY)===MODES.fixed?MODES.fixed:MODES.balanced;}
  function setMode(value){const next=value===MODES.fixed?MODES.fixed:MODES.balanced;if(localStorage.getItem(MODE_KEY)!==next)localStorage.setItem(MODE_KEY,next);updateControl();return next;}
  function typeIds(){return (schema()?.TYPES||[]).map(item=>item[0]);}
  function bitCount(value){let count=0;for(let n=value;n;n&=n-1)count++;return count;}
  function countMatches(text,patterns){return patterns.reduce((sum,pattern)=>sum+(pattern.test(text)?1:0),0);}
  function listRichness(text){if(!text)return 0;return Math.min(8,(text.match(/[,;]|\bor\b/gi)||[]).length*2);}
  function contentRichness(text){if(!text)return 0;const words=text.split(/\s+/).filter(Boolean).length;return Math.min(18,Math.round(Math.log2(words+1)*4));}
  function smoothedWeakness(record){const answered=Number(record?.answered)||0;const correct=Number(record?.correct)||0;const accuracy=(correct+1)/(answered+2);return Math.max(.05,Math.min(.95,1-accuracy));}
  function weaknessFor(condition,type,index){
    const global=smoothedWeakness(index?.type?.[type]);
    const topicId=condition?.topicId;
    const topic=topicId?index?.topicType?.[`${topicId}|${type}`]:null;
    if(!topic||Number(topic.answered)<2)return global;
    return global*.62+smoothedWeakness(topic)*.38;
  }
  function hasApprovedImage(condition){return Boolean(condition?.image||imageBank()?.imagesForCondition?.(condition)?.length);}

  function compatibilityScore(condition,type,index){
    const primary=TYPE_FIELD[type];
    const primaryText=fieldText(condition,primary);
    const text=allText(condition);
    const profile=clean(condition?.profile).toLowerCase();
    let score=primaryText?28:-18;
    score+=contentRichness(primaryText);
    score+=listRichness(primaryText);
    score+=countMatches(`${primaryText} ${text}`,KEYWORDS[type]||[])*5;

    if(type==='close_mimic_discrimination')score+=Math.min(12,listRichness(fieldText(condition,'mimics')));
    if(type==='dangerous_diagnosis_priority_exclusion')score+=Math.min(10,contentRichness(fieldText(condition,'redFlags'))/2);
    if(type==='immediate_emergency_management')score+=Math.min(8,contentRichness(`${fieldText(condition,'escalation')} ${fieldText(condition,'treatment')}`)/3);
    if(type==='stable_first_line_treatment'&&/urgent|emergen|resusc|stat|immediate/i.test(primaryText))score-=13;
    if(type==='first_line_investigation'&&/after|repeat|staging|confirm/i.test(primaryText))score-=3;
    if(type==='next_step_after_initial_result'&&!/after|if |then|repeat|confirm|result|staging|follow[- ]up/i.test(primaryText))score-=5;
    if(type==='contraindication_caveat_switch'&&!/contraindicat|avoid|allerg|pregnan|renal|hepatic|switch|caveat|unless|if |interaction/i.test(text))score-=8;
    if(type==='failure_or_deterioration'&&!/fail|refractory|deteriorat|worsen|non[- ]?response|persistent|despite|relapse|unstable/i.test(text))score-=8;

    if(profile==='pharmacology'){
      if(['stable_first_line_treatment','contraindication_caveat_switch'].includes(type))score+=12;
      if(['first_line_investigation','next_step_after_initial_result'].includes(type))score+=5;
      if(type==='sparse_most_likely_diagnosis')score-=5;
    }
    if(profile==='anatomy'||profile==='physiology'){
      if(['sparse_most_likely_diagnosis','close_mimic_discrimination','dangerous_diagnosis_priority_exclusion'].includes(type))score+=7;
      if(['stable_first_line_treatment','contraindication_caveat_switch','escalation_referral_disposition'].includes(type))score-=6;
    }
    if(hasApprovedImage(condition)&&IMAGE_TYPES.has(type))score+=7;

    const weakness=weaknessFor(condition,type,index||{});
    score+=Math.round(Math.max(0,score)*weakness*.09);
    return Math.round(score);
  }

  function scoreMatrix(conditions,types,index){return conditions.map(condition=>types.map(type=>compatibilityScore(condition,type,index)));}
  function pathKey(path){return path.join('|');}
  function addTopTwo(bucket,candidate){
    if(bucket.some(item=>pathKey(item.path)===pathKey(candidate.path)))return;
    bucket.push(candidate);
    bucket.sort((a,b)=>b.score-a.score||pathKey(a.path).localeCompare(pathKey(b.path)));
    if(bucket.length>2)bucket.length=2;
  }

  function bestAssignments(matrix){
    const count=matrix.length;
    const states=Array.from({length:1<<count},()=>[]);
    states[0]=[{score:0,path:[]}];
    for(let mask=0;mask<states.length;mask++){
      const row=bitCount(mask);
      if(row>=count||!states[mask].length)continue;
      for(const state of states[mask]){
        for(let typeIndex=0;typeIndex<count;typeIndex++){
          if(mask&(1<<typeIndex))continue;
          const nextMask=mask|(1<<typeIndex);
          addTopTwo(states[nextMask],{score:state.score+matrix[row][typeIndex],path:[...state.path,typeIndex]});
        }
      }
    }
    const final=states[(1<<count)-1];
    return{best:final[0],second:final[1]||null};
  }

  function assignmentRows(conditions,types,path,matrix){
    return conditions.map((condition,index)=>({
      questionNumber:index+1,
      conditionId:condition.id||condition.conditionId,
      conditionName:condition.name||condition.targetCondition,
      topicId:condition.topicId,
      questionType:types[path[index]],
      localCompatibility:matrix[index][path[index]]
    }));
  }

  function localPlan(conditions,types,index){
    const matrix=scoreMatrix(conditions,types,index||{});
    const result=bestAssignments(matrix);
    if(!result.best)throw new Error('A complete one-to-one question-type assignment could not be formed.');
    const second=result.second;
    const gap=second?result.best.score-second.score:Number.POSITIVE_INFINITY;
    const differing=second?result.best.path.filter((value,i)=>value!==second.path[i]).length:0;
    const threshold=Math.max(AI_GAP_ABSOLUTE,Math.abs(result.best.score)*AI_GAP_RATIO);
    return{
      matrix,
      best:result.best,
      second,
      gap,
      differing,
      ambiguous:Boolean(second&&differing>=2&&gap<=threshold),
      assignments:assignmentRows(conditions,types,result.best.path,matrix),
      questionTypes:result.best.path.map(index=>types[index])
    };
  }

  function fixedPlan(conditions,types,index){
    const matrix=scoreMatrix(conditions,types,index||{});
    const path=types.map((_,index)=>index);
    const score=path.reduce((sum,typeIndex,row)=>sum+matrix[row][typeIndex],0);
    return{matrix,best:{score,path},second:null,gap:null,differing:0,ambiguous:false,assignments:assignmentRows(conditions,types,path,matrix),questionTypes:[...types]};
  }

  function plannerPayload(conditions,types,index,local){
    return{
      rules:{allConditionsExactlyOnce:true,allQuestionTypesExactlyOnce:true,conditionOrderFixed:true,weaknessOnlyBreaksCloseFits:true},
      types:types.map(type=>({id:type,label:(schema()?.TYPES||[]).find(item=>item[0]===type)?.[1]||type})),
      conditions:conditions.map((condition,row)=>({
        questionNumber:row+1,
        conditionId:condition.id||condition.conditionId,
        name:condition.name||condition.targetCondition,
        topicId:condition.topicId,
        topicName:condition.topic||condition.topicName,
        profile:condition.profile||'clinical',
        fields:Object.fromEntries(Object.entries(fields(condition)).map(([key,value])=>[key,clip(value,220)])),
        localCandidates:types.map((type,column)=>({questionType:type,score:local.matrix[row][column],weakness:Number(weaknessFor(condition,type,index).toFixed(3))})).sort((a,b)=>b.score-a.score).slice(0,4)
      })),
      localBest:local.assignments,
      localSecondBestScore:local.second?.score??null,
      localBestScore:local.best.score
    };
  }

  function plannerSchema(types){
    return{
      type:'object',additionalProperties:false,required:['assignments'],
      properties:{assignments:{type:'array',minItems:10,maxItems:10,items:{type:'object',additionalProperties:false,required:['conditionId','questionType'],properties:{conditionId:{type:'string'},questionType:{type:'string',enum:types}}}}}
    };
  }

  function outputText(data){
    if(typeof data?.output_text==='string')return data.output_text;
    for(const item of data?.output||[])for(const content of item.content||[])if(content?.type==='output_text'&&typeof content.text==='string')return content.text;
    return'';
  }

  function validateAiAssignment(response,conditions,types,local){
    const rows=response?.assignments;
    if(!Array.isArray(rows)||rows.length!==conditions.length)return null;
    const expectedIds=conditions.map(item=>String(item.id||item.conditionId));
    const byId=new Map(rows.map(item=>[String(item.conditionId),item.questionType]));
    if(byId.size!==expectedIds.length||expectedIds.some(id=>!byId.has(id)))return null;
    const questionTypes=expectedIds.map(id=>byId.get(id));
    if(new Set(questionTypes).size!==types.length||questionTypes.some(type=>!types.includes(type)))return null;
    const path=questionTypes.map(type=>types.indexOf(type));
    const pairScores=path.map((typeIndex,row)=>local.matrix[row][typeIndex]);
    if(pairScores.some(score=>score<MIN_ACCEPTABLE_PAIR))return null;
    const score=pairScores.reduce((sum,value)=>sum+value,0);
    if(score<local.best.score-AI_MAX_LOCAL_LOSS)return null;
    return{questionTypes,path,score,assignments:assignmentRows(conditions,types,path,local.matrix)};
  }

  async function aiTieBreak(apiKey,conditions,types,index,local,onStatus){
    const api=transport();
    if(!apiKey||typeof api?.send!=='function')return null;
    onStatus?.('Local best-fit assignment is genuinely tied. Asking the AI planner to resolve the close match…');
    const prompt=`Assign the ten fixed conditions to the ten fixed UKMLA question types. Use every condition and every question type exactly once. Preserve condition order; return the question type for each condition ID. Prefer the most clinically natural testable decision supported by the supplied card fields. Learner weakness may break close fits only. Do not sacrifice clinical fit merely because a type is weak. Return only the strict JSON mapping.\n\n${JSON.stringify(plannerPayload(conditions,types,index,local))}`;
    const body={
      model:'gpt-5-mini',
      input:[
        {role:'system',content:[{type:'input_text',text:'Return only a valid one-to-one question-type assignment in the requested JSON schema.'}]},
        {role:'user',content:[{type:'input_text',text:prompt}]}
      ],
      text:{format:{type:'json_schema',name:'ukmla_best_fit_type_assignment_v1',strict:true,schema:plannerSchema(types)}}
    };
    const data=await api.send(apiKey,body);
    const text=outputText(data);
    if(!text)return null;
    return validateAiAssignment(JSON.parse(text),conditions,types,local);
  }

  async function plan({conditions,questionTypes,index,apiKey,useAi=true,onStatus}={}){
    const safeConditions=(conditions||[]).map(item=>({...item}));
    const types=(questionTypes||typeIds()).slice();
    if(safeConditions.length!==types.length||types.length!==10)throw new Error('Best-fit balanced planning requires ten conditions and ten unique question types.');
    const selectedMode=mode();
    const local=selectedMode===MODES.fixed?fixedPlan(safeConditions,types,index||{}):localPlan(safeConditions,types,index||{});
    let chosen=null;
    let aiAttempted=false;
    let aiAccepted=false;
    if(selectedMode===MODES.balanced&&local.ambiguous&&useAi&&apiKey){
      aiAttempted=true;
      try{chosen=await aiTieBreak(apiKey,safeConditions,types,index||{},local,onStatus);aiAccepted=Boolean(chosen);}
      catch(error){console.warn('Best-fit AI tie-break unavailable; using deterministic local assignment.',error);}
    }
    const final=chosen||local;
    return{
      schemaVersion:'ukmla-question-type-assignment-v1',
      mode:selectedMode,
      source:selectedMode===MODES.fixed?'fixed':aiAccepted?'hybrid-ai-tiebreak':'local-deterministic',
      questionTypes:[...final.questionTypes],
      assignments:clone(final.assignments),
      localBestScore:local.best.score,
      selectedScore:chosen?.score??local.best.score,
      secondBestScore:local.second?.score??null,
      ambiguityGap:Number.isFinite(local.gap)?local.gap:null,
      ambiguous:local.ambiguous,
      aiAttempted,
      aiAccepted,
      plannedAt:new Date().toISOString()
    };
  }

  function resolveWorkspace(root){
    if(root?.matches?.('[data-ukmla-question-workspace="ai"]'))return root;
    return root?.querySelector?.('[data-ukmla-question-workspace="ai"]')||document.querySelector('[data-ukmla-question-workspace="ai"]');
  }
  function helperText(){
    if(mode()===MODES.fixed)return'Uses the original fixed condition-to-format order.';
    return'Keeps the ten analytics-selected conditions and all ten formats, then assigns each format to its strongest card fit. Learner weakness breaks close fits; AI is used only for a genuine tie.';
  }
  function updateControl(root){
    const workspace=resolveWorkspace(root);if(!workspace)return false;
    const select=workspace.querySelector('#ai-type-assignment-mode');
    if(select&&select.value!==mode())select.value=mode();
    const detail=workspace.querySelector('#ai-type-assignment-detail');
    const text=helperText();if(detail&&detail.textContent!==text)detail.textContent=text;
    if(select)select.disabled=Boolean(workspace.querySelector('#ai-start')?.disabled);
    return true;
  }
  function mountControl(root){
    const workspace=resolveWorkspace(root);if(!workspace)return false;
    if(workspace.querySelector('#ai-type-assignment-mode'))return updateControl(workspace);
    const pipeline=workspace.querySelector('#ai-pipeline-mode')?.closest('.field');
    if(!pipeline)return false;
    const field=document.createElement('div');
    field.className='field';
    field.style.marginTop='12px';
    field.innerHTML=`<label for="ai-type-assignment-mode">Question-type assignment</label><select class="select" id="ai-type-assignment-mode"><option value="${MODES.balanced}">${LABELS[MODES.balanced]}</option><option value="${MODES.fixed}">${LABELS[MODES.fixed]}</option></select><small class="question-source-note" id="ai-type-assignment-detail"></small>`;
    pipeline.before(field);
    field.querySelector('select').addEventListener('change',event=>setMode(event.target.value));
    updateControl(workspace);
    return true;
  }
  function scheduleMount(root){if(mountScheduled)return;mountScheduled=true;requestAnimationFrame(()=>{mountScheduled=false;mountControl(root);});}

  function dispatchPlanningStatus(message){
    document.dispatchEvent(new CustomEvent('ukmlaV2AiProgress',{detail:{lastMessage:message,percent:3,currentStage:'type_planning',status:'active'}}));
  }

  function savedPlan(config){
    const conditions=config?.job?.conditions||config?.conditions||[];
    const types=config?.job?.questionTypes||config?.questionTypes||[];
    if(conditions.length!==10||types.length!==10)return null;
    const index=core()?.eventIndex?.()||{};
    const local=fixedPlan(conditions,types,index);
    return{
      schemaVersion:'ukmla-question-type-assignment-v1',mode:config?.job?.typeAssignmentMode||'saved',source:'saved-question-type-order',questionTypes:[...types],assignments:local.assignments,plannedAt:config?.job?.createdAt||null
    };
  }

  function patchEngine(){
    const api=engine();
    if(!api||typeof api.runPipeline!=='function')return false;
    if(api.__bestFitTypePlannerPatched){enginePatched=true;return true;}
    api.__bestFitTypePlannerPatched=true;
    const original=api.runPipeline.bind(api);
    api.runPipeline=async config=>{
      if(config?.knowledge)return original(config);
      if(config?.job){
        const set=await original(config);
        if(set&&!set.typeAssignment)set.typeAssignment=savedPlan(config);
        return set;
      }
      dispatchPlanningStatus(mode()===MODES.fixed?'Using fixed question-type order…':'Planning best-fit balanced question types locally…');
      const assignment=await plan({
        conditions:config.conditions,
        questionTypes:config.questionTypes,
        index:core()?.eventIndex?.()||{},
        apiKey:config.apiKey,
        useAi:true,
        onStatus:dispatchPlanningStatus
      });
      const set=await original({...config,questionTypes:assignment.questionTypes,typeAssignmentMode:assignment.mode});
      if(set)set.typeAssignment=assignment;
      return set;
    };
    enginePatched=true;
    return true;
  }

  function patchAiMount(){
    const api=window.UKMLA_V2_AI;
    if(!api||typeof api.mount!=='function')return false;
    if(api.mount.__bestFitTypePlannerPatched){aiMountPatched=true;return true;}
    const original=api.mount.bind(api);
    const wrapped=function(container,...args){const result=original(container,...args);mountControl(container);return result;};
    wrapped.__bestFitTypePlannerPatched=true;
    api.mount=wrapped;
    aiMountPatched=true;
    return true;
  }
  function bindListeners(){if(listenersBound)return;listenersBound=true;window.addEventListener('hashchange',()=>scheduleMount());document.addEventListener('ukmlaImageModeMounted',event=>scheduleMount(event.detail?.workspace));}
  function initialise(attempt=0){
    const ready=patchEngine()&&patchAiMount();
    if(!ready){if(attempt<MAX_INIT_ATTEMPTS)setTimeout(()=>initialise(attempt+1),50);else console.error('UKMLA best-fit question-type planner could not initialise.');return;}
    bindListeners();mountControl();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initialise(),{once:true});else initialise();

  window.UKMLA_QUESTION_TYPE_PLANNER={MODES,LABELS,mode,setMode,compatibilityScore,scoreMatrix,bestAssignments,localPlan,fixedPlan,plan,mountControl,updateControl};
})();
