(function(){
  'use strict';

  if(window.__UKMLA_KNOWLEDGE_DUMP__) return;
  window.__UKMLA_KNOWLEDGE_DUMP__=true;

  const API='https://api.openai.com/v1/responses';
  const PACKS_KEY='ukmlaKnowledgePackStatsV1';
  const SETS_KEY='ukmlaAiGeneratedQuizSetsV1';
  const EXACT_KEY='ukmlaAiGenerationExactRequestV1';
  const TYPES=[
    ['sparse_most_likely_diagnosis','Sparse presentation: most likely diagnosis'],
    ['close_mimic_discrimination','Close-mimic discrimination'],
    ['first_line_investigation','First-line investigation'],
    ['dangerous_diagnosis_priority_exclusion','Dangerous diagnosis: priority exclusion'],
    ['next_step_after_initial_result','Next step after an initial result'],
    ['immediate_emergency_management','Immediate emergency management'],
    ['stable_first_line_treatment','Standard first-line treatment'],
    ['contraindication_caveat_switch','Contraindication or caveat switch'],
    ['failure_or_deterioration','Failure or deterioration'],
    ['escalation_referral_disposition','Escalation, referral or disposition']
  ];

  let sourceText='';
  let sourceInfo=null;
  let running=false;

  function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}
  function load(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}}
  function save(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function outputText(data){if(typeof data?.output_text==='string')return data.output_text;for(const item of data?.output||[])for(const content of item.content||[])if(content?.type==='output_text'&&content.text)return content.text;return '';}
  function emit(message,percent){
    const status=document.getElementById('knowledge-status');if(status)status.textContent=message;
    const fill=document.getElementById('knowledge-progress-fill');if(fill)fill.style.width=`${Math.max(0,Math.min(100,percent))}%`;
    const label=document.getElementById('knowledge-progress-label');if(label)label.textContent=`${Math.round(percent)}%`;
    const stage=document.getElementById('knowledge-progress-stage');if(stage)stage.textContent=message;
    document.dispatchEvent(new CustomEvent('ukmlaKnowledgeProgress',{detail:{message,percent}}));
  }
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function transient(status){return status===408||status===409||status===425||status===429||status>=500;}
  async function resilientRequest(body,headers,stage,percent){
    let attempt=0;
    while(true){
      attempt++;
      try{
        emit(attempt===1?stage:`${stage} — reconnecting attempt ${attempt}`,percent);
        const response=await fetch(API,{method:'POST',headers,body:JSON.stringify(body)});
        const data=await response.json();
        if(!response.ok){const message=data?.error?.message||`OpenAI request failed (${response.status}).`;if(transient(response.status))throw Object.assign(new Error(message),{transient:true});throw new Error(message);}
        return data;
      }catch(error){
        const network=error?.transient||error instanceof TypeError||/network|fetch|connection|offline|load failed/i.test(String(error?.message||error));
        if(!network)throw error;
        emit(`${stage} paused. Progress saved; waiting to reconnect.`,percent);
        if(navigator.onLine===false)await new Promise(resolve=>window.addEventListener('online',resolve,{once:true}));
        await sleep(Math.min(60000,2000*Math.pow(2,Math.min(attempt,5))));
      }
    }
  }

  function findEocd(view){for(let i=view.byteLength-22;i>=Math.max(0,view.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50)return i;return -1;}
  async function inflateRaw(bytes){
    if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot decompress PowerPoint files. Paste the slide text instead.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buffer){
    const view=new DataView(buffer);const eocd=findEocd(view);if(eocd<0)throw new Error('The PowerPoint ZIP directory could not be found.');
    const entries=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true);const decoder=new TextDecoder();const files=new Map();
    for(let i=0;i<entries;i++){
      if(view.getUint32(offset,true)!==0x02014b50)throw new Error('The PowerPoint ZIP directory is damaged.');
      const method=view.getUint16(offset+10,true);const compressed=view.getUint32(offset+20,true);const nameLen=view.getUint16(offset+28,true);const extraLen=view.getUint16(offset+30,true);const commentLen=view.getUint16(offset+32,true);const localOffset=view.getUint32(offset+42,true);
      const name=decoder.decode(new Uint8Array(buffer,offset+46,nameLen));
      if(view.getUint32(localOffset,true)!==0x04034b50)throw new Error('A PowerPoint ZIP entry is invalid.');
      const localName=view.getUint16(localOffset+26,true);const localExtra=view.getUint16(localOffset+28,true);const dataStart=localOffset+30+localName+localExtra;const bytes=new Uint8Array(buffer,dataStart,compressed);
      if(method===0)files.set(name,new Uint8Array(bytes));else if(method===8)files.set(name,await inflateRaw(bytes));
      offset+=46+nameLen+extraLen+commentLen;
    }
    return files;
  }
  function xmlText(bytes){
    const xml=new TextDecoder().decode(bytes);const doc=new DOMParser().parseFromString(xml,'application/xml');
    return [...doc.getElementsByTagName('*')].filter(node=>node.localName==='t').map(node=>clean(node.textContent)).filter(Boolean).join(' · ');
  }
  async function extractPptx(file){
    const files=await unzip(await file.arrayBuffer());
    const slides=[...files.keys()].filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>Number(a.match(/(\d+)/)[1])-Number(b.match(/(\d+)/)[1]));
    const chunks=[];let withText=0;
    slides.forEach((name,index)=>{
      const number=Number(name.match(/(\d+)/)[1]);const text=xmlText(files.get(name));const notesName=`ppt/notesSlides/notesSlide${number}.xml`;const notes=files.has(notesName)?xmlText(files.get(notesName)):'';
      if(text||notes)withText++;
      chunks.push(`[Slide ${index+1}]\n${text||'[No extractable slide text]'}${notes?`\n[Speaker notes] ${notes}`:''}`);
    });
    return {text:chunks.join('\n\n'),info:{kind:'pptx',fileName:file.name,slides:slides.length,slidesWithText:withText,emptySlides:slides.length-withText}};
  }
  async function readFile(file){
    const extension=file.name.split('.').pop().toLowerCase();
    if(extension==='pptx')return extractPptx(file);
    if(['txt','md','csv','json','html','htm','rtf'].includes(extension))return {text:await file.text(),info:{kind:'text',fileName:file.name}};
    throw new Error('Use a .pptx, .txt, .md, .csv, .json, .html or .rtf file.');
  }

  function mapSchema(){
    return {type:'object',additionalProperties:false,required:['packId','title','inferredTopic','concepts'],properties:{packId:{type:'string'},title:{type:'string'},inferredTopic:{type:'string'},concepts:{type:'array',minItems:10,maxItems:80,items:{type:'object',additionalProperties:false,required:['id','label','topicName','summary','importance','clinicalRelevance','sourceRefs','supportedQuestionTypes'],properties:{id:{type:'string'},label:{type:'string'},topicName:{type:'string'},summary:{type:'string'},importance:{type:'integer',minimum:1,maximum:10},clinicalRelevance:{type:'integer',minimum:1,maximum:10},sourceRefs:{type:'array',minItems:1,items:{type:'string'}},supportedQuestionTypes:{type:'array',minItems:1,items:{type:'string',enum:TYPES.map(item=>item[0])}}}}}}};
  }
  function quizSchema(){
    const option={type:'object',additionalProperties:false,required:['id','text','topic','condition','param'],properties:{id:{type:'string',enum:['A','B','C','D','E']},text:{type:'string'},topic:{type:'string'},condition:{type:'string'},param:{type:'string',enum:['Ix','Tx','Escalate','Mimics','Red flags']}}};
    const question={type:'object',additionalProperties:false,required:['id','questionNumber','questionType','questionTypeLabel','topic','targetCondition','learningPoint','stem','leadIn','options','correctOptionId','decisiveClue','rationale','strongestDistractorId','strongestDistractorExplanation','guideline'],properties:{id:{type:'string'},questionNumber:{type:'integer',minimum:1,maximum:10},questionType:{type:'string',enum:TYPES.map(item=>item[0])},questionTypeLabel:{type:'string',enum:TYPES.map(item=>item[1])},topic:{type:'string'},targetCondition:{type:'string'},learningPoint:{type:'string'},stem:{type:'string'},leadIn:{type:'string'},options:{type:'array',minItems:5,maxItems:5,items:option},correctOptionId:{type:'string',enum:['A','B','C','D','E']},decisiveClue:{type:'string'},rationale:{type:'string'},strongestDistractorId:{type:'string',enum:['A','B','C','D','E']},strongestDistractorExplanation:{type:'string'},guideline:{type:'object',additionalProperties:false,required:['source','title','checkedDate','url'],properties:{source:{type:'string'},title:{type:'string'},checkedDate:{anyOf:[{type:'string'},{type:'null'}]},url:{anyOf:[{type:'string'},{type:'null'}]}}}}};
    return {type:'object',additionalProperties:false,required:['schemaVersion','quizId','topic','generatedAt','difficulty','questions'],properties:{schemaVersion:{type:'string',enum:['ukmla-ai-quiz-v1']},quizId:{type:'string'},topic:{type:'string'},generatedAt:{type:'string'},difficulty:{type:'string',enum:['standard','difficult','very_difficult']},questions:{type:'array',minItems:10,maxItems:10,items:question}}};
  }

  async function buildMap(apiKey,packId,title,text){
    const packs=load(PACKS_KEY,{});if(packs[packId]?.map)return packs[packId].map;
    const maxChars=120000;const clipped=text.slice(0,maxChars);
    const prompt=`Convert the supplied study material into a comprehensive examinable knowledge map for UKMLA-style SBA training. Identify the clinically important concepts throughout the whole source, not merely the opening slides. Split broad material into distinct testable concepts so that at least ten and preferably enough concepts for broad coverage are available. Preserve source provenance using slide labels or text-section labels. Do not invent facts absent from the material. For each concept, list only question types the source can genuinely support. Importance reflects prominence and likely educational value within this source; clinicalRelevance reflects usefulness for applied clinical decisions. Pack ID must be ${packId}.\n\nSOURCE TITLE: ${title}\n\nSOURCE MATERIAL:\n${clipped}`;
    const body={model:'gpt-5-mini',input:[{role:'system',content:[{type:'input_text',text:'Return only the requested schema-conforming knowledge map.'}]},{role:'user',content:[{type:'input_text',text:prompt}]}],text:{format:{type:'json_schema',name:'ukmla_knowledge_map',strict:true,schema:mapSchema()}}};
    const data=await resilientRequest(body,{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},'Inferring the most pertinent concepts from the knowledge dump…',10);
    const raw=outputText(data);if(!raw)throw new Error('The knowledge-map stage returned no structured output.');const map=JSON.parse(raw);map.packId=packId;map.title=title;
    packs[packId]={packId,title,map,sourceKind:sourceInfo?.kind||'text',sourceFile:sourceInfo?.fileName||null,sourceLength:text.length,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};save(PACKS_KEY,packs);return map;
  }

  function weakTypeOrder(){
    const stats=window.UKMLA_LEARNING?.stats();const rows=TYPES.map(item=>{const row=stats?.types?.[item[0]];return {id:item[0],label:item[1],answered:row?.answered||0,accuracy:row?.answered?row.correct/row.answered:null};});
    return rows.sort((a,b)=>{if(a.accuracy===null&&b.accuracy!==null)return 1;if(a.accuracy!==null&&b.accuracy===null)return -1;if(a.accuracy!==b.accuracy)return (a.accuracy??1)-(b.accuracy??1);return b.answered-a.answered;}).map(row=>row.id);
  }
  function rankConcepts(map,packId,exclude){
    const stats=window.UKMLA_LEARNING?.stats();const now=Date.now();
    return map.concepts.slice().sort((a,b)=>{
      const aid=`${packId}-${a.id}`,bid=`${packId}-${b.id}`;const sa=stats?.conditions?.[aid]||{presented:0,lastPresentedAt:null},sb=stats?.conditions?.[bid]||{presented:0,lastPresentedAt:null};
      const exA=exclude.has(aid)?1:0,exB=exclude.has(bid)?1:0;const neverA=sa.presented?1:0,neverB=sb.presented?1:0;const timeA=sa.lastPresentedAt?now-new Date(sa.lastPresentedAt).getTime():Number.MAX_SAFE_INTEGER;const timeB=sb.lastPresentedAt?now-new Date(sb.lastPresentedAt).getTime():Number.MAX_SAFE_INTEGER;
      return exA-exB||neverA-neverB||sa.presented-sb.presented||b.importance-a.importance||b.clinicalRelevance-a.clinicalRelevance||timeB-timeA||Math.random()-.5;
    });
  }
  function assignConcepts(map,packId,typeOrder,exclude){
    const ranked=rankConcepts(map,packId,exclude);const selected=[];const used=new Set();
    typeOrder.forEach(type=>{
      let concept=ranked.find(item=>!used.has(item.id)&&(item.supportedQuestionTypes||[]).includes(type));
      if(!concept)concept=ranked.find(item=>!used.has(item.id));
      if(!concept)concept=ranked.find(item=>(item.supportedQuestionTypes||[]).includes(type))||ranked[0];
      if(concept){selected.push({concept,type});used.add(concept.id);}
    });
    return selected;
  }
  function conditionFromConcept(pair,packId,packTitle){
    const c=pair.concept;const core=window.UKMLA_LEARNING;const topicName=c.topicName||packTitle;const topicId=`pack-${core.slug(packId)}-${core.hash(topicName)}`;const conditionId=`${packId}-${c.id}`;
    return {id:conditionId,conditionId,name:c.label,topic:topicName,topicId,fields:{Ix:c.summary,Tx:c.summary,Escalate:c.summary,Mimics:c.summary,'Red flags':c.summary},sourceRefs:c.sourceRefs,importance:c.importance,clinicalRelevance:c.clinicalRelevance,supportedQuestionTypes:c.supportedQuestionTypes,assignedQuestionType:pair.type,decisionData:null};
  }
  function batchPrompt(payload,typeOrder){
    const order=typeOrder.map((type,index)=>`${index+1}. ${type} — ${TYPES.find(item=>item[0]===type)[1]}`).join('\n');
    return `Create exactly ten very difficult UKMLA-style single-best-answer questions grounded in the uploaded study-pack concept map. Use the ten supplied concepts exactly once and in order: question 1 uses conditions[0], question 2 uses conditions[1], and so on. Preserve each conditionId and topicId. Do not substitute, omit, repeat or move concepts.\n\nQUESTION TYPES IN REQUIRED ORDER:\n${order}\n\nUse the concept summary and sourceRefs as the factual boundary. Do not invent doses, thresholds, guideline rules or clinical claims absent from the concept map. Add only minimal generic clinical framing needed to make an authentic SBA. If a concept supports several possible questions, test its most important applied implication. Use sparse stems, five homogeneous short options, one unambiguously best answer, and four credible distractors. Include a concise rationale and strongest-distractor explanation. Every option must carry the nearest scoring aspect. Guideline source should be "Uploaded study material", title "${payload.sourcePack.title}", and null checkedDate/url.\nSource material:\n${JSON.stringify(payload)}`;
  }
  async function generateBatch(apiKey,map,packId,packTitle,typeOrder,exclude,batchNumber,totalBatches){
    const assignments=assignConcepts(map,packId,typeOrder,exclude);if(assignments.length!==10)throw new Error('The knowledge map did not provide ten usable concepts.');
    const conditions=assignments.map(pair=>conditionFromConcept(pair,packId,packTitle));conditions.forEach(item=>exclude.add(item.conditionId));
    const payload={mode:'random_all_conditions',sourceType:'knowledge_dump',topic:packTitle,difficulty:'very_difficult',generatedAt:new Date().toISOString(),conditions,sourcePack:{packId,title:packTitle,inferredTopic:map.inferredTopic,batchNumber,totalBatches},requirements:{questionCount:10,oneQuestionPerType:true,oneQuestionPerSelectedCondition:true,sourceGrounded:true,preserveConditionIds:true}};
    const body={model:'gpt-5-mini',input:[{role:'system',content:[{type:'input_text',text:'Return only the requested schema-conforming UKMLA quiz.'}]},{role:'user',content:[{type:'input_text',text:batchPrompt(payload,typeOrder)}]}],text:{format:{type:'json_schema',name:'ukmla_ai_quiz',strict:true,schema:quizSchema()}}};
    const start=totalBatches===1?22:(batchNumber===1?20:57);const data=await resilientRequest(body,{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},`Generating knowledge-pack batch ${batchNumber} of ${totalBatches} through all routine checkpoints…`,start);
    const raw=outputText(data);if(!raw)throw new Error(`Knowledge batch ${batchNumber} returned no structured quiz.`);const set=JSON.parse(raw);if(!Array.isArray(set.questions)||set.questions.length!==10)throw new Error(`Knowledge batch ${batchNumber} did not return ten questions.`);return set;
  }

  function balance(set){
    const letters=['A','B','C','D','E'];const targets=[];while(targets.length<set.questions.length)targets.push(...letters);targets.length=set.questions.length;
    for(let i=targets.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[targets[i],targets[j]]=[targets[j],targets[i]];}
    set.questions.forEach((q,index)=>{
      const correct=q.options.find(option=>option.id===q.correctOptionId);const distractors=q.options.filter(option=>option!==correct);for(let i=distractors.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[distractors[i],distractors[j]]=[distractors[j],distractors[i]];}
      const target=targets[index];let d=0;q.options=letters.map(letter=>{const option=letter===target?correct:distractors[d++];return Object.assign({},option,{id:letter});});q.correctOptionId=target;q.strongestDistractorId=q.options.some(option=>option.id===q.strongestDistractorId)?q.strongestDistractorId:q.options.find(option=>option.id!==target)?.id||'A';
    });
    return set;
  }
  function combineSets(sets,count,packId,title){
    const questions=[];sets.forEach(set=>set.questions.forEach(q=>questions.push(q)));questions.length=count;questions.forEach((q,index)=>{q.questionNumber=index+1;q.id=`${packId}-q${index+1}`;});
    return balance({schemaVersion:'ukmla-ai-quiz-v1',quizId:`knowledge-${packId}-${Date.now().toString(36)}`,topic:title,generatedAt:new Date().toISOString(),difficulty:'very_difficult',sourceType:'knowledge_dump',packId,questions});
  }
  function storeSet(set){const sets=load(SETS_KEY,[]);sets.unshift(set);save(SETS_KEY,sets.slice(0,30));}
  function renderSet(set){
    const area=document.getElementById('aiq-play');if(!area)throw new Error('The AI quiz play area is unavailable.');let index=0;const answers=[];
    const draw=()=>{const q=set.questions[index],answer=answers[index];area.innerHTML=`<div class="aiq-progress">Question ${index+1} of ${set.questions.length} · ${clean(q.questionTypeLabel||q.questionType)}</div><h3>${clean(q.stem)}</h3><p class="aiq-leadin">${clean(q.leadIn)}</p><div class="aiq-options">${q.options.map(option=>`<button type="button" class="aiq-option ${answer?.selected===option.id?'selected':''}" data-id="${option.id}"><b>${option.id}.</b> ${clean(option.text)}</button>`).join('')}</div><div id="aiq-feedback">${answer?`<div class="aiq-feedback ${answer.correct?'correct':'incorrect'}"><strong>${answer.correct?'Correct':'Incorrect'}.</strong> ${clean(q.rationale)}<br><span>${clean(q.strongestDistractorExplanation)}</span><br><small>Source: ${clean(q.sourceSupport?.sourceRefs?.join(', ')||'Uploaded study material')}</small></div>`:''}</div><div class="aiq-nav"><button id="aiq-prev" type="button" ${index===0?'disabled':''}>Previous</button><button id="aiq-next" type="button" ${index===set.questions.length-1?'disabled':''}>Next</button></div>`;
      area.querySelectorAll('.aiq-option').forEach(button=>button.addEventListener('click',()=>{if(answers[index])return;answers[index]={selected:button.dataset.id,correct:button.dataset.id===q.correctOptionId};draw();}));area.querySelector('#aiq-prev')?.addEventListener('click',()=>{index--;draw();});area.querySelector('#aiq-next')?.addEventListener('click',()=>{index++;draw();});window.UKMLA_LEARNING?.refresh();};draw();area.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function generate(){
    if(running)return;const keyInput=document.getElementById('aiq-key');const apiKey=clean(keyInput?.value);if(!apiKey.startsWith('sk-')){emit('Paste the temporary OpenAI API key above before generating.',0);return;}
    const textarea=document.getElementById('knowledge-text');const text=clean(sourceText||textarea?.value);if(text.length<120){emit('Add a larger text dump or PowerPoint before generating.',0);return;}
    running=true;const button=document.getElementById('knowledge-generate');button.disabled=true;const count=Number(document.getElementById('knowledge-count').value);const title=clean(document.getElementById('knowledge-title').value)||sourceInfo?.fileName||'Uploaded study material';const core=window.UKMLA_LEARNING;const packId=`pack-${core.hash(text)}`;
    try{
      emit('Preparing uploaded material…',3);const map=await buildMap(apiKey,packId,title,text);emit(`Knowledge map ready: ${map.concepts.length} pertinent concepts identified.`,16);
      const batches=Math.ceil(count/10);const exclude=new Set();const sets=[];const standard=TYPES.map(item=>item[0]);const weak=weakTypeOrder();
      sets.push(await generateBatch(apiKey,map,packId,title,standard,exclude,1,batches));
      if(batches>1){localStorage.removeItem(EXACT_KEY);emit('First batch passed all routine checkpoints. Preparing the weak-question-type extension batch…',55);sets.push(await generateBatch(apiKey,map,packId,title,weak,exclude,2,batches));}
      emit('Combining batches and balancing answer positions…',94);const set=combineSets(sets,count,packId,title);storeSet(set);renderSet(set);emit(`${count}-question knowledge-pack quiz ready.`,100);const status=document.getElementById('aiq-status');if(status)status.textContent=`Knowledge-pack set generated: ${count} questions. Passed source fidelity and all routine checkpoints.`;
    }catch(error){emit(`Knowledge-dump generation failed: ${error.message}`,0);}
    finally{running=false;button.disabled=false;if(keyInput){keyInput.value='';}sourceText=text;}
  }

  function injectStyles(){if(document.getElementById('knowledge-dump-style'))return;const style=document.createElement('style');style.id='knowledge-dump-style';style.textContent=`
    #knowledge-dump-quiz{margin:1.4rem max(1.2rem,4vw);padding:1.2rem;background:var(--panel,#fffefa);border:1px solid var(--line,#d8d0c4);border-radius:18px;box-shadow:var(--shadow,0 10px 30px rgba(29,27,24,.08));scroll-margin-top:1rem}
    .knowledge-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.42fr);gap:1rem}.knowledge-drop{display:grid;place-items:center;min-height:145px;padding:1rem;border:2px dashed #55aee8;border-radius:16px;background:linear-gradient(145deg,rgba(5,33,65,.96),rgba(8,75,120,.92));color:#ddf8ff;text-align:center;box-shadow:0 0 18px rgba(0,156,255,.2) inset}.knowledge-drop.drag{border-color:#8bf3ff;box-shadow:0 0 22px rgba(0,191,255,.55)}#knowledge-text{width:100%;min-height:210px;margin-top:.8rem;padding:.85rem;border:1px solid var(--line,#d8d0c4);border-radius:14px;resize:vertical}.knowledge-controls{display:grid;gap:.7rem}.knowledge-controls label{display:grid;gap:.3rem;font-weight:800}.knowledge-controls input,.knowledge-controls select{width:100%;padding:.7rem;border:1px solid var(--line,#d8d0c4);border-radius:10px;background:#fff}.knowledge-progress{margin-top:1rem;padding:.85rem;border-radius:14px;background:#061b35;color:#dff8ff}.knowledge-progress-track{height:12px;border-radius:99px;background:#001025;overflow:hidden;border:1px solid rgba(91,218,255,.38)}#knowledge-progress-fill{height:100%;width:0;background:linear-gradient(90deg,#056fff,#00c8ff,#81f4ff);box-shadow:0 0 16px #00bfff;transition:width .7s ease}.knowledge-progress-head{display:flex;justify-content:space-between;gap:1rem;margin-bottom:.5rem}#knowledge-progress-label{font-weight:950;color:#7feaff;text-shadow:0 0 8px #00aaff}.knowledge-note{color:var(--muted,#70695f);font-size:.88rem}@media(max-width:760px){.knowledge-grid{grid-template-columns:1fr}.knowledge-controls button{width:100%}}
  `;document.head.appendChild(style);}
  function makeUi(){
    if(document.getElementById('knowledge-dump-quiz'))return;injectStyles();const section=document.createElement('section');section.id='knowledge-dump-quiz';section.innerHTML=`<h2>Knowledge-dump SBA generator</h2><p class="knowledge-note">Drop a PowerPoint or text file, or paste course material. PowerPoint text, tables and speaker notes are extracted; image-only diagrams are reported but not interpreted.</p><div class="knowledge-grid"><div><div id="knowledge-drop" class="knowledge-drop"><div><strong>Drop a .pptx or text file here</strong><br><span>or tap to choose a file</span><input id="knowledge-file" type="file" accept=".pptx,.txt,.md,.csv,.json,.html,.htm,.rtf" hidden></div></div><textarea id="knowledge-text" placeholder="Paste lecture notes, course handouts or any study-material text here…"></textarea></div><div class="knowledge-controls"><label>Pack title<input id="knowledge-title" type="text" placeholder="e.g. Renal seminar"></label><label>Questions<select id="knowledge-count"><option value="10">10 questions</option><option value="15">15 questions</option><option value="20">20 questions</option></select></label><button id="knowledge-generate" type="button">Generate source-grounded SBA quiz</button><div id="knowledge-file-info" class="knowledge-note">No file loaded.</div><p class="knowledge-note">The temporary API key from the AI quiz box is used and then cleared. Uploaded source text is not sent to Firebase; only the concept map and learning statistics are retained.</p></div></div><div class="knowledge-progress"><div class="knowledge-progress-head"><span id="knowledge-progress-stage">Ready</span><span id="knowledge-progress-label">0%</span></div><div class="knowledge-progress-track"><div id="knowledge-progress-fill"></div></div><div id="knowledge-status" class="knowledge-note" style="color:#bcecff;margin-top:.55rem">Waiting for study material.</div></div>`;
    const analytics=document.getElementById('learning-analytics');if(analytics?.parentNode)analytics.parentNode.insertBefore(section,analytics.nextSibling);else document.body.appendChild(section);
    const nav=document.querySelector('.nav');if(nav&&!nav.querySelector('a[href="#knowledge-dump-quiz"]')){const li=document.createElement('li');li.innerHTML='<a href="#knowledge-dump-quiz"><span class="topic-bulb" style="--bulb-color:hsl(197 92% 45%)"></span><span>Knowledge dump</span><small>AI</small><span class="topic-score">+</span></a>';nav.prepend(li);}
    const drop=section.querySelector('#knowledge-drop'),fileInput=section.querySelector('#knowledge-file'),text=section.querySelector('#knowledge-text');drop.addEventListener('click',()=>fileInput.click());['dragenter','dragover'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('drag');}));['dragleave','drop'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('drag');}));drop.addEventListener('drop',event=>{const file=event.dataTransfer.files[0];if(file)loadFile(file);});fileInput.addEventListener('change',()=>{const file=fileInput.files[0];if(file)loadFile(file);});text.addEventListener('input',()=>{sourceText=text.value;sourceInfo={kind:'text',fileName:null};document.getElementById('knowledge-file-info').textContent=`${sourceText.length.toLocaleString()} characters pasted.`;});section.querySelector('#knowledge-generate').addEventListener('click',generate);
  }
  async function loadFile(file){try{emit(`Extracting ${file.name}…`,2);const result=await readFile(file);sourceText=result.text;sourceInfo=result.info;document.getElementById('knowledge-text').value=result.text;document.getElementById('knowledge-title').value=file.name.replace(/\.[^.]+$/,'');document.getElementById('knowledge-file-info').textContent=result.info.kind==='pptx'?`${result.info.slides} slides processed; ${result.info.slidesWithText} contained extractable text; ${result.info.emptySlides} contained no extractable text.`:`Loaded ${file.name}: ${result.text.length.toLocaleString()} characters.`;emit('Source text extracted and ready.',5);}catch(error){emit(`File extraction failed: ${error.message}`,0);}}

  function init(){makeUi();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
