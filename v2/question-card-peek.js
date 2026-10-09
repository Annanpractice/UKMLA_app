(function(){
  'use strict';

  const HOLD_MS=260;
  const cache=new Map();
  let observer=null;
  let holdTimer=null;
  let activeOverlay=null;

  function core(){return window.UKMLA_V2;}
  function bank(){return window.UKMLA_QUESTION_BANK;}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

  function flattenText(value){
    if(value==null)return'';
    if(Array.isArray(value))return value.map(flattenText).filter(Boolean).join(' • ');
    if(typeof value==='object')return Object.entries(value).map(([key,nested])=>{
      const text=flattenText(nested);
      return text?`${clean(key)}: ${text}`:'';
    }).filter(Boolean).join(' · ');
    return clean(value);
  }

  function labelFor(key){
    return clean(String(key||'').replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2')).replace(/^./,char=>char.toUpperCase());
  }

  function questionIndex(article){
    const label=clean(article.querySelector('[data-shared-status-label]')?.textContent||'');
    const match=label.match(/Question\s+(\d+)\s+of\s+(\d+)/i);
    return match?Math.max(0,Number(match[1])-1):null;
  }

  function signature(article){
    const stem=clean(article.querySelector('.quiz-stem')?.textContent||'');
    const leadIn=clean(article.querySelector('.quiz-stem + p')?.textContent||'');
    const index=questionIndex(article);
    return{stem,leadIn,index,key:`${index??'x'}|${stem}|${leadIn}`};
  }

  async function resolveQuestion(article){
    const directSetId=article.dataset.bankSetId;
    const directQuestionId=article.dataset.bankQuestionId;
    if(directSetId&&directQuestionId){
      const set=await bank()?.loadSet?.(directSetId);
      const question=set?.questions?.find(item=>String(item.id)===String(directQuestionId));
      return question?{question,setId:directSetId}:null;
    }
    const sig=signature(article);
    if(!sig.stem)return null;
    if(cache.has(sig.key))return cache.get(sig.key);
    const api=bank();
    if(!api?.bankIndex||!api?.loadSet)return null;
    const records=api.bankIndex()||[];

    for(const record of records){
      let set=null;
      try{set=await api.loadSet(record.setId);}catch(_){continue;}
      if(!set||!Array.isArray(set.questions))continue;
      if(sig.index!=null&&set.questions[sig.index]){
        const candidate=set.questions[sig.index];
        if(clean(candidate.stem)===sig.stem&&(!sig.leadIn||clean(candidate.leadIn||'')===sig.leadIn)){
          const resolved={question:candidate,setId:record.setId};
          cache.set(sig.key,resolved);
          return resolved;
        }
      }
      const candidate=set.questions.find(question=>clean(question?.stem)===sig.stem&&(!sig.leadIn||clean(question?.leadIn||'')===sig.leadIn));
      if(candidate){
        const resolved={question:candidate,setId:record.setId};
        cache.set(sig.key,resolved);
        return resolved;
      }
    }
    cache.set(sig.key,null);
    return null;
  }

  function cardForQuestion(question){
    const api=core();
    if(!api)return null;
    const id=clean(question?.targetConditionId||'');
    if(id&&api.App?.byId?.get){
      const card=api.App.byId.get(id);
      if(card)return card;
    }
    const name=clean(question?.targetCondition||'').toLowerCase();
    if(name&&Array.isArray(api.App?.conditions))return api.App.conditions.find(card=>clean(card?.name).toLowerCase()===name)||null;
    return null;
  }

  function fieldRows(card){
    const fields=card?.fields&&typeof card.fields==='object'&&!Array.isArray(card.fields)?card.fields:{};
    const rows=Object.entries(fields).map(([key,value])=>[key,flattenText(value)]).filter(([,value])=>value);
    if(card?.profile&&clean(card.profile))rows.unshift(['Profile',flattenText(card.profile)]);
    return rows;
  }

  function hideOverlay(){
    clearTimeout(holdTimer);
    holdTimer=null;
    if(activeOverlay){activeOverlay.remove();activeOverlay=null;}
    document.documentElement.classList.remove('bank-card-peek-open');
  }

  function showOverlay(card,question){
    hideOverlay();
    const overlay=document.createElement('div');
    overlay.className='bank-card-peek-overlay';
    overlay.setAttribute('role','presentation');
    if(card){
      const rows=fieldRows(card);
      overlay.innerHTML=`<article class="bank-card-peek-sheet" role="dialog" aria-label="Mapped card: ${escapeHtml(card.name||question?.targetCondition||'Card')}"><div class="bank-card-peek-kicker">Mapped card${card.topic?` · ${escapeHtml(card.topic)}`:''}</div><h2>${escapeHtml(card.name||question?.targetCondition||'Mapped card')}</h2>${rows.length?`<div class="bank-card-peek-fields">${rows.map(([key,value])=>`<section><h3>${escapeHtml(labelFor(key))}</h3><p>${escapeHtml(value)}</p></section>`).join('')}</div>`:'<p class="bank-card-peek-empty">This card has no additional text fields.</p>'}<small>Release ? to return to the question.</small></article>`;
    }else if(question?.questionType==='imported_textbook_sba'&&question.importedMappingStatus==='unmapped'&&question.mappingModel==='Luna'){
      const titles=[...new Set((Array.isArray(question.suggestedCardTitles)?question.suggestedCardTitles:[])
        .concat(question.suggestedCardTitle||[]).map(clean).filter(Boolean))].slice(0,4);
      const list=titles.length
        ?'<h3>Cards Luna recommends adding</h3><ol class="bank-card-gap-list">'+titles.map(title=>'<li>'+escapeHtml(title)+'</li>').join('')+'</ol>'
        :'<p>Luna did not identify a sufficiently specific replacement card.</p>';
      const explanation=clean(question.missingCardExplanation||'');
      overlay.innerHTML='<article class="bank-card-peek-sheet bank-card-peek-empty-sheet" role="dialog" aria-label="Luna learning material gap"><div class="bank-card-peek-kicker">Luna · Learning material gap</div><h2>No appropriate card in this atlas</h2><p>Luna could not confidently match the learning topic covered by this question to an existing card.</p>'+list+(explanation?'<p class="bank-card-gap-explanation">'+escapeHtml(explanation)+'</p>':'')+'<small>These are suggested additions, not installed cards. Release ? to return to the question.</small></article>';
    }else{
      const awaiting=question?.questionType==='imported_textbook_sba'&&question?.importedMappingStatus==='pending';
      overlay.innerHTML='<article class="bank-card-peek-sheet bank-card-peek-empty-sheet" role="dialog" aria-label="No mapped card"><div class="bank-card-peek-kicker">Card mapping</div><h2>No mapped card</h2><p>'+(awaiting?'Luna has not mapped this imported question yet. Use Map Questions in the Question Bank.':'This question is not currently linked to a card in the atlas.')+'</p><small>Release ? to return to the question.</small></article>';
    }
    document.body.appendChild(overlay);
    activeOverlay=overlay;
    document.documentElement.classList.add('bank-card-peek-open');
  }

  function bindHold(button,getCard,getQuestion){
    const start=event=>{
      if(event.pointerType==='mouse'&&event.button!==0)return;
      event.preventDefault();
      clearTimeout(holdTimer);
      try{button.setPointerCapture?.(event.pointerId);}catch(_){}
      button.classList.add('is-holding');
      holdTimer=setTimeout(()=>showOverlay(getCard(),getQuestion()),HOLD_MS);
    };
    const stop=()=>{
      button.classList.remove('is-holding');
      hideOverlay();
    };
    button.addEventListener('pointerdown',start);
    button.addEventListener('pointerup',stop);
    button.addEventListener('pointercancel',stop);
    button.addEventListener('lostpointercapture',stop);
    button.addEventListener('contextmenu',event=>event.preventDefault());
    button.addEventListener('keydown',event=>{
      if(event.key!==' '&&event.key!=='Enter')return;
      event.preventDefault();
      button.classList.add('is-holding');
      showOverlay(getCard(),getQuestion());
    });
    button.addEventListener('keyup',event=>{
      if(event.key===' '||event.key==='Enter')stop();
    });
    button.addEventListener('blur',stop);
  }

  async function enhance(article){
    if(!article?.isConnected||article.dataset.cardPeekEnhanced==='1')return;
    article.dataset.cardPeekEnhanced='1';
    const top=article.querySelector('.bank-player-top');
    if(!top)return;

    const button=document.createElement('button');
    button.type='button';
    button.className='bank-card-peek-button';
    button.textContent='?';
    button.setAttribute('aria-label','Hold to reveal the card mapped to this question');
    button.setAttribute('title','Hold to reveal mapped card');
    button.disabled=true;
    top.classList.add('has-card-peek');
    const status=top.querySelector('[data-shared-status-label]');
    if(status)top.insertBefore(button,status);else top.appendChild(button);

    const resolved=await resolveQuestion(article).catch(()=>null);
    if(!article.isConnected)return;
    const question=resolved?.question||null;
    const card=cardForQuestion(question);
    button.disabled=false;
    button.dataset.mapped=card?'1':'0';
    button.setAttribute('aria-label',card?`Hold to reveal ${card.name}`:'Hold to check this question’s card mapping');
    bindHold(button,()=>card,()=>question);
  }

  function scan(){
    const article=document.querySelector('#quiz-workspace .bank-player[data-shared-quiz-status], #app .bank-player[data-shared-quiz-status]');
    if(article)void enhance(article);
    else hideOverlay();
  }

  function init(){
    const app=document.getElementById('app');
    if(!app)return;
    observer=new MutationObserver(()=>scan());
    observer.observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',hideOverlay);
    document.addEventListener('ukmlaQuestionMappingUpdated',()=>{
      cache.clear();hideOverlay();
      document.querySelectorAll('.bank-player[data-card-peek-enhanced="1"]').forEach(article=>{
        article.querySelector('.bank-card-peek-button')?.remove();
        article.querySelector('.bank-player-top')?.classList.remove('has-card-peek');
        delete article.dataset.cardPeekEnhanced;
      });
      scan();
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden)hideOverlay();});
    scan();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
