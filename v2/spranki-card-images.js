(function(){
  'use strict';

  const DECISIONS_KEY='ukmlaSprankiImageAssignmentsV1';
  const MIN_AUTO_SCORE=.82;
  const STRONG_SCORE=.95;
  const MAX_CARD_IMAGES=6;
  const MAX_FOCUS_IMAGES=12;
  const MAP_READY_EVENT='ukmlaSprankiCardMapReady';
  const STATUS_EVENT='ukmlaSprankiPackChanged';

  let mapData=null;
  let mapPromise=null;
  let mappingIndex=new Map();
  let imageByKey=new Map();
  let scheduled=false;
  let observer=null;
  const objectUrls=new Set();

  function core(){return window.UKMLA_V2;}
  function pack(){return window.UKMLA_SPRANKI_LOCAL_PACK;}
  function escapeHtml(value){return core()?.escapeHtml?.(value)??String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function normalise(value){return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').trim();}
  function words(value){return new Set(normalise(value).split(' ').filter(word=>word.length>2&&!['the','and','with','without','other','disorder','disease','syndrome','condition','conditions'].includes(word)));}
  function overlap(left,right){const a=words(left),b=words(right);if(!a.size||!b.size)return 0;let common=0;for(const word of a)if(b.has(word))common++;return common/Math.max(a.size,b.size);}
  function editSimilarity(left,right){
    const a=normalise(left),b=normalise(right);
    if(!a||!b)return 0;if(a===b)return 1;
    const previous=Array.from({length:b.length+1},(_,index)=>index);
    for(let i=1;i<=a.length;i++){
      let diagonal=previous[0];previous[0]=i;
      for(let j=1;j<=b.length;j++){
        const above=previous[j],cost=a[i-1]===b[j-1]?0:1;
        previous[j]=Math.min(previous[j]+1,previous[j-1]+1,diagonal+cost);
        diagonal=above;
      }
    }
    return 1-previous[b.length]/Math.max(a.length,b.length);
  }
  function topicMatches(image,condition){const topic=normalise(condition?.topic);return(image.t||[]).some(value=>normalise(value)===topic);}
  function filenameLabel(filename){return String(filename||'').replace(/\.[^.]+$/,'').replace(/^\d+px[-_]?/i,'').replace(/[a-f0-9]{24,}/ig,' ').replace(/[_-]+/g,' ');}
  function readDecisions(){try{return JSON.parse(localStorage.getItem(DECISIONS_KEY)||'{}')||{};}catch(_){return{};}}
  function writeDecisions(value){localStorage.setItem(DECISIONS_KEY,JSON.stringify(value));}
  function decisionFor(key){return readDecisions()[String(key)]||{};}
  function resetDecorations(){document.querySelectorAll('[data-spranki-gallery]').forEach(node=>node.remove());document.querySelectorAll('.spranki-image-count').forEach(node=>node.remove());}
  function setDecision(key,patch){const all=readDecisions();const current=all[String(key)]||{confirmed:[],rejected:[]};all[String(key)]={...current,...patch,updatedAt:new Date().toISOString()};writeDecisions(all);buildMappingIndex();resetDecorations();schedule();document.dispatchEvent(new CustomEvent(MAP_READY_EVENT,{detail:{changed:true}}));}

  function aliasesFor(condition){
    const aliases=[condition?.name];
    const fields=condition?.aliases;
    if(Array.isArray(fields))aliases.push(...fields);
    return aliases.filter(Boolean);
  }

  function scoreImageForCondition(image,condition){
    const decision=decisionFor(image.k);
    if((decision.rejected||[]).includes(condition.id))return null;
    if(decision.assignTo===condition.id)return{score:1.1,method:'Manual assignment',manual:true};
    if((decision.confirmed||[]).includes(condition.id))return{score:1.05,method:'Confirmed mapping',manual:true};

    const conditionAliases=aliasesFor(condition);
    let best=null;
    for(const candidate of image.p||[]){
      const candidateNorm=normalise(candidate);
      if(!candidateNorm)continue;
      for(const alias of conditionAliases){
        const aliasNorm=normalise(alias);
        if(!aliasNorm)continue;
        let score=0,method='';
        if(candidateNorm===aliasNorm){score=1;method='Exact Anki note/tag';}
        else if(topicMatches(image,condition)&&(candidateNorm.includes(aliasNorm)||aliasNorm.includes(candidateNorm))&&Math.min(candidateNorm.length,aliasNorm.length)>=5){score=.9;method='Anki label + topic';}
        else{
          const similarity=overlap(candidate,alias);
          const spelling=editSimilarity(candidate,alias);
          if(topicMatches(image,condition)&&spelling>=.88){score=.88+Math.min(.06,(spelling-.88)*.5);method='Near-exact Anki label';}
          else if(topicMatches(image,condition)&&similarity>=.75){score=.84+Math.min(.06,(similarity-.75)*.24);method='Strong label correlation';}
        }
        if(score&&(!best||score>best.score))best={score,method,sourceCandidate:candidate};
      }
    }

    if(!best){
      const fileLabel=filenameLabel(image.f);
      for(const alias of conditionAliases){
        const similarity=overlap(fileLabel,alias);
        if(topicMatches(image,condition)&&similarity>=.84){
          const score=.82+Math.min(.05,(similarity-.84)*.3);
          if(!best||score>best.score)best={score,method:'Filename + topic correlation',sourceCandidate:fileLabel};
        }
      }
    }
    return best;
  }

  function buildMappingIndex(){
    const api=core();
    if(!api?.App?.loaded||!mapData?.images)return false;
    const next=new Map();
    imageByKey=new Map(mapData.images.map(image=>[String(image.k),image]));
    const exact=new Map();
    for(const condition of api.App.conditions){
      for(const alias of aliasesFor(condition)){
        const key=normalise(alias);
        if(key&&!exact.has(key))exact.set(key,[]);
        if(key)exact.get(key).push(condition);
      }
    }

    for(const image of mapData.images){
      const candidates=new Set();
      const decision=decisionFor(image.k);
      if(decision.assignTo)candidates.add(api.App.byId.get(decision.assignTo));
      for(const id of decision.confirmed||[])candidates.add(api.App.byId.get(id));
      for(const label of image.p||[]){
        for(const condition of exact.get(normalise(label))||[])candidates.add(condition);
      }
      if(!candidates.size){
        const topicSet=new Set((image.t||[]).map(normalise));
        for(const condition of api.App.conditions){
          if(topicSet.size&&!topicSet.has(normalise(condition.topic)))continue;
          for(const label of image.p||[]){
            if(overlap(label,condition.name)>=.75){candidates.add(condition);break;}
          }
        }
      }
      for(const condition of candidates){
        if(!condition)continue;
        const match=scoreImageForCondition(image,condition);
        if(!match||match.score<MIN_AUTO_SCORE)continue;
        const row={...image,conditionId:condition.id,conditionName:condition.name,...match};
        if(!next.has(condition.id))next.set(condition.id,[]);
        next.get(condition.id).push(row);
      }
    }
    for(const rows of next.values())rows.sort((a,b)=>b.score-a.score||Number(b.n||0)-Number(a.n||0)||Number(b.w||0)*Number(b.h||0)-Number(a.w||0)*Number(a.h||0));
    mappingIndex=next;
    document.dispatchEvent(new CustomEvent(MAP_READY_EVENT,{detail:{conditions:next.size,images:[...next.values()].reduce((sum,rows)=>sum+rows.length,0)}}));
    return true;
  }

  async function loadMap(){
    if(mapPromise)return mapPromise;
    mapPromise=(async()=>{
      const source=window.UKMLA_SPRANKI_MAP_DATA;
      if(!source?.load)throw new Error('Spranki mapping data did not load.');
      mapData=await source.load();
      buildMappingIndex();
      schedule();
      return mapData;
    })().catch(error=>{console.warn('Spranki card mapping unavailable:',error);return null;});
    return mapPromise;
  }

  function mappingsForCondition(conditionOrId,options={}){
    const condition=typeof conditionOrId==='string'?core()?.App?.byId?.get(conditionOrId):conditionOrId;
    if(!condition)return[];
    const rows=(mappingIndex.get(condition.id)||[]).slice();
    if(options.strongOnly)return rows.filter(row=>row.score>=STRONG_SCORE||row.manual);
    return rows;
  }
  function bestForCondition(conditionOrId,options={}){return mappingsForCondition(conditionOrId,options)[0]||null;}
  function confirmedForCondition(conditionOrId){return mappingsForCondition(conditionOrId).filter(row=>row.manual||row.score>=STRONG_SCORE);}
  function mappedConditionCount(){return mappingIndex.size;}
  function mappedImageCount(){return new Set([...mappingIndex.values()].flat().map(row=>row.k)).size;}

  function clearObjectUrls(){for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls.clear();}
  async function imageUrl(image){const url=await pack().getImageObjectUrl({archiveKey:image.k});objectUrls.add(url);return url;}

  function injectStyles(){
    if(document.getElementById('spranki-card-images-style'))return;
    const style=document.createElement('style');
    style.id='spranki-card-images-style';
    style.textContent=`
      .spranki-image-count{display:inline-flex;align-items:center;gap:4px;margin-left:auto;margin-right:8px;padding:3px 7px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:.68rem;white-space:nowrap}
      .spranki-mapped-section{margin:14px 0 4px;padding:13px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.025)}
      .spranki-mapped-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.spranki-mapped-head h4{margin:0;font-size:.82rem}.spranki-mapped-head span{color:var(--muted);font-size:.7rem}
      .spranki-image-strip{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(156px,210px);gap:10px;overflow-x:auto;padding:2px 0 8px;scroll-snap-type:x proximity}
      .spranki-image-tile{scroll-snap-align:start;display:flex;flex-direction:column;min-width:0;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:var(--panel)}
      .spranki-image-tile button.spranki-image-open{display:block;width:100%;padding:0;border:0;background:#07182b;cursor:zoom-in}.spranki-image-tile img{display:block;width:100%;height:135px;object-fit:contain;background:#07182b}
      .spranki-image-meta{display:grid;gap:3px;padding:8px}.spranki-image-meta strong{font-size:.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.spranki-image-meta span{font-size:.63rem;color:var(--muted);line-height:1.3}
      .spranki-image-actions{display:flex;gap:5px;margin-top:4px}.spranki-image-actions button{flex:1;padding:5px 6px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--muted);font:inherit;font-size:.61rem}
      .spranki-image-actions button.confirmed{color:#67e3a2;border-color:rgba(103,227,162,.45)}
      .spranki-image-placeholder{padding:12px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:.74rem}
      .spranki-lightbox{position:fixed;inset:0;z-index:250;background:rgba(0,5,14,.94);display:grid;grid-template-rows:auto 1fr auto;gap:10px;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom))}.spranki-lightbox img{max-width:100%;max-height:calc(100vh - 150px);margin:auto;object-fit:contain}.spranki-lightbox button{justify-self:end}.spranki-lightbox p{margin:0;text-align:center;color:var(--muted);font-size:.76rem}
      @media(max-width:680px){.spranki-image-strip{grid-auto-columns:72vw}.spranki-image-tile img{height:190px}}
    `;
    document.head.appendChild(style);
  }

  function confidenceLabel(row){
    if(row.manual)return row.method;
    if(row.score>=.99)return'Exact Anki note/tag';
    return`${row.method} · ${Math.round(row.score*100)}%`;
  }

  async function populateTile(tile,row,condition){
    if(tile.dataset.loaded==='1')return;
    tile.dataset.loaded='1';
    try{
      const url=await imageUrl(row);
      const button=tile.querySelector('.spranki-image-open');
      const img=document.createElement('img');
      img.src=url;img.alt=`Mapped image for ${condition.name}`;img.loading='lazy';
      button.appendChild(img);
      button.onclick=()=>openLightbox(url,row,condition);
    }catch(error){tile.querySelector('.spranki-image-open').textContent='Image unavailable';tile.title=error.message;}
  }

  function openLightbox(url,row,condition){
    const overlay=document.createElement('div');
    overlay.className='spranki-lightbox';
    overlay.innerHTML=`<button class="btn ghost" type="button">Close</button><img src="${url}" alt="Mapped image for ${escapeHtml(condition.name)}"><p>${escapeHtml(condition.name)} · ${escapeHtml(confidenceLabel(row))} · ${escapeHtml(row.f)}</p>`;
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();
    overlay.querySelector('button').onclick=close;
    overlay.onclick=event=>{if(event.target===overlay)close();};
  }

  function sectionHtml(condition,rows,mode){
    const cached=pack()?.status?.().cached;
    if(!rows.length)return'';
    if(!cached)return`<section class="spranki-mapped-section" data-spranki-gallery="${condition.id}"><div class="spranki-mapped-head"><h4>Mapped clinical images</h4><span>${rows.length} linked</span></div><div class="spranki-image-placeholder">These images are linked to this presentation through the original Anki note tags or labels. Cache the Spranki APKG in Cards to view them.</div></section>`;
    const visible=rows.slice(0,mode==='focus'?MAX_FOCUS_IMAGES:MAX_CARD_IMAGES);
    return`<section class="spranki-mapped-section" data-spranki-gallery="${condition.id}"><div class="spranki-mapped-head"><h4>Mapped clinical images</h4><span>${visible.length<rows.length?`${visible.length} of ${rows.length}`:`${rows.length}`} linked · local browser file</span></div><div class="spranki-image-strip">${visible.map(row=>{
      const decision=decisionFor(row.k);const confirmed=row.manual||(decision.confirmed||[]).includes(condition.id);
      return`<article class="spranki-image-tile" data-spranki-image="${row.k}"><button class="spranki-image-open" type="button" aria-label="Open mapped image"></button><div class="spranki-image-meta"><strong>${escapeHtml(row.f)}</strong><span>${escapeHtml(confidenceLabel(row))}</span>${mode==='focus'?`<div class="spranki-image-actions"><button type="button" data-spranki-confirm="${row.k}" class="${confirmed?'confirmed':''}">${confirmed?'Confirmed':'Confirm'}</button><button type="button" data-spranki-reject="${row.k}">Not this card</button></div>`:''}</div></article>`;
    }).join('')}</div></section>`;
  }

  function bindSection(section,condition,rows){
    section.querySelectorAll('[data-spranki-image]').forEach(tile=>{
      const row=rows.find(item=>String(item.k)===tile.dataset.sprankiImage);
      if(row)void populateTile(tile,row,condition);
    });
    section.querySelectorAll('[data-spranki-confirm]').forEach(button=>button.onclick=()=>{
      const key=button.dataset.sprankiConfirm;const current=decisionFor(key);const confirmed=[...new Set([...(current.confirmed||[]),condition.id])];setDecision(key,{confirmed,rejected:(current.rejected||[]).filter(id=>id!==condition.id)});core()?.toast?.('Image mapping confirmed');
    });
    section.querySelectorAll('[data-spranki-reject]').forEach(button=>button.onclick=()=>{
      const key=button.dataset.sprankiReject;const current=decisionFor(key);const rejected=[...new Set([...(current.rejected||[]),condition.id])];setDecision(key,{rejected,confirmed:(current.confirmed||[]).filter(id=>id!==condition.id),assignTo:current.assignTo===condition.id?null:current.assignTo});core()?.toast?.('Image removed from this card');
    });
  }

  function decorateCards(){
    const api=core();if(!api?.App?.loaded)return;
    document.querySelectorAll('.condition-card[data-condition-card]').forEach(card=>{
      const condition=api.App.byId.get(card.dataset.conditionCard);if(!condition)return;
      const rows=mappingsForCondition(condition);
      const summary=card.querySelector('.condition-summary');
      let count=summary?.querySelector('.spranki-image-count');
      if(rows.length&&!count){count=document.createElement('span');count.className='spranki-image-count';summary?.insertBefore(count,summary.querySelector('.chevron'));}
      if(count)count.textContent=`${rows.length} image${rows.length===1?'':'s'}`;
      if(!card.classList.contains('open'))return;
      const body=card.querySelector('.condition-body');if(!body||body.querySelector(`[data-spranki-gallery="${condition.id}"]`))return;
      const holder=document.createElement('div');holder.innerHTML=sectionHtml(condition,rows,'card');const section=holder.firstElementChild;if(!section)return;
      const actions=body.querySelector('.card-actions');if(actions)body.insertBefore(section,actions);else body.appendChild(section);bindSection(section,condition,rows);
    });
  }

  function decorateFocus(){
    const api=core();if(!api?.App?.loaded||!location.hash.startsWith('#/focus'))return;
    const condition=api.App.byId.get(api.App.routeParam||api.App.state.focusId);if(!condition)return;
    const card=document.getElementById('focus-card');if(!card||card.querySelector(`[data-spranki-gallery="${condition.id}"]`))return;
    const rows=mappingsForCondition(condition);if(!rows.length)return;
    const holder=document.createElement('div');holder.innerHTML=sectionHtml(condition,rows,'focus');const section=holder.firstElementChild;if(!section)return;
    card.appendChild(section);bindSection(section,condition,rows);
  }

  function decorate(){scheduled=false;injectStyles();decorateCards();decorateFocus();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(decorate);}

  function initialise(){
    const api=core();
    if(!api?.App?.loaded){setTimeout(initialise,80);return;}
    injectStyles();
    void loadMap();
    const shell=document.getElementById('app-shell')||document.body;
    observer=new MutationObserver(schedule);observer.observe(shell,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('hashchange',()=>{clearObjectUrls();schedule();});
    window.addEventListener('pageshow',schedule);
    document.addEventListener(STATUS_EVENT,schedule);
    document.addEventListener(MAP_READY_EVENT,schedule);
    schedule();
  }

  window.UKMLA_SPRANKI_CARD_IMAGES={
    loadMap,mappingsForCondition,bestForCondition,confirmedForCondition,mappedConditionCount,mappedImageCount,
    assignImage:(archiveKey,conditionId)=>setDecision(archiveKey,{assignTo:conditionId}),
    rejectImage:(archiveKey,conditionId)=>{const current=decisionFor(archiveKey);setDecision(archiveKey,{rejected:[...new Set([...(current.rejected||[]),conditionId])]});},
    clearDecision:archiveKey=>{const all=readDecisions();delete all[String(archiveKey)];writeDecisions(all);buildMappingIndex();resetDecorations();schedule();},
    imageByKey:key=>imageByKey.get(String(key))||null
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
