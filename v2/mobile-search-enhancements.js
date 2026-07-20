(function(){
  'use strict';

  const ALL_TOPICS='__all_topics__';
  const QUESTION_TAB_ORDER=['bank','ai','psa','basic','biomedical'];
  const questionSetCache=new Map();
  let allTopicsMode=false;
  let cardQuery='';
  let cardsExpanded=false;
  let bankQuery='';
  let bankTimer=null;
  let bankSearchVersion=0;
  let scheduled=false;

  function core(){return window.UKMLA_V2;}
  function bank(){return window.UKMLA_QUESTION_BANK;}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function normalise(value){return clean(value).normalize('NFKC').toLowerCase();}
  function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'');}

  function deepText(value,output=[]){
    if(value===null||value===undefined)return output;
    if(['string','number','boolean'].includes(typeof value)){output.push(String(value));return output;}
    if(Array.isArray(value)){value.forEach(item=>deepText(item,output));return output;}
    if(typeof value==='object')Object.values(value).forEach(item=>deepText(item,output));
    return output;
  }

  function parseTerms(query){
    const included=[];
    const excluded=[];
    const parts=String(query||'').match(/-?"[^"]+"|\S+/g)||[];
    for(let token of parts){
      let negative=false;
      if(token.startsWith('-')&&token.length>1){negative=true;token=token.slice(1);}
      if(token.startsWith('"')&&token.endsWith('"'))token=token.slice(1,-1);
      token=normalise(token);
      if(!token)continue;
      (negative?excluded:included).push(token);
    }
    return{included,excluded};
  }

  function matchesTerms(text,terms){
    const haystack=normalise(text);
    return terms.included.every(term=>haystack.includes(term))&&terms.excluded.every(term=>!haystack.includes(term));
  }

  function conditionSearchText(condition){return deepText(condition,[]).join(' ');}

  function reviewedState(){
    const api=core();
    return api?api.loadJson(api.STORAGE.reviewed,{}):{};
  }

  function saveReviewed(state){const api=core();if(api)api.saveJson(api.STORAGE.reviewed,state);}

  function conditionFactsHtml(condition){
    return Object.entries(condition.fields||{}).map(([key,value])=>{
      const label=condition.labels?.[key]||core()?.PARAM_LABELS?.[key]||key;
      return`<section class="fact"><h4>${escapeHtml(label)}</h4><p>${escapeHtml(value)}</p></section>`;
    }).join('');
  }

  function conditionCardHtml(condition){
    const reviewed=Boolean(reviewedState()[condition.id]);
    return`<article class="condition-card ${cardsExpanded?'open':''}" data-condition-card="${escapeHtml(condition.id)}"><button class="condition-summary" type="button"><div><h3>${escapeHtml(condition.name)}</h3><small>${escapeHtml(condition.topic)}</small></div><sup class="condition-sup" title="Target questions presented">${core()?.conditionCount(condition.id)||0}</sup><span class="chevron">⌄</span></button><div class="condition-body">${conditionFactsHtml(condition)}<div class="card-actions"><button class="btn primary" type="button" data-enhanced-focus="${escapeHtml(condition.id)}">Focus mode</button><button class="btn ghost" type="button" data-enhanced-reviewed="${escapeHtml(condition.id)}">${reviewed?'Reviewed ✓':'Mark reviewed'}</button></div></div></article>`;
  }

  function bindEnhancedConditionCards(list){
    list.querySelectorAll('.condition-summary').forEach(button=>button.addEventListener('click',()=>button.closest('.condition-card')?.classList.toggle('open')));
    list.querySelectorAll('[data-enhanced-focus]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      core()?.go('focus',button.dataset.enhancedFocus);
    }));
    list.querySelectorAll('[data-enhanced-reviewed]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      const state=reviewedState();
      const id=button.dataset.enhancedReviewed;
      if(state[id])delete state[id];else state[id]={at:new Date().toISOString()};
      saveReviewed(state);
      button.textContent=state[id]?'Reviewed ✓':'Mark reviewed';
    }));
  }

  function currentConditionSource(select){
    const api=core();
    if(!api)return[];
    if(allTopicsMode||select?.value===ALL_TOPICS)return api.App.conditions||[];
    return api.App.byTopic.get(select?.value)||[];
  }

  function updateAllTopicsHeading(active){
    if(!active)return;
    const title=document.getElementById('page-title');
    const head=document.querySelector('#app .page-head');
    if(title)title.textContent='All Topics';
    if(head){
      const h1=head.querySelector('h1');
      const paragraph=head.querySelector('p');
      if(h1)h1.textContent='All Topics';
      if(paragraph)paragraph.textContent='Search every condition and every card field across the complete atlas.';
    }
  }

  function drawConditions(){
    const input=document.getElementById('condition-search');
    const select=document.getElementById('topic-select');
    const list=document.getElementById('condition-list');
    const result=document.getElementById('condition-result');
    if(!input||!select||!list||!result)return;
    const source=currentConditionSource(select);
    const terms=parseTerms(input.value);
    const filtered=source.filter(condition=>matchesTerms(conditionSearchText(condition),terms));
    result.textContent=`${filtered.length} of ${source.length} cards`;
    list.innerHTML=filtered.length?filtered.map(conditionCardHtml).join(''):'<section class="empty"><h2>No matching cards</h2></section>';
    bindEnhancedConditionCards(list);
    const expand=document.getElementById('expand-toggle');
    if(expand)expand.textContent=cardsExpanded?'Collapse all':'Expand all';
    updateAllTopicsHeading(allTopicsMode||select.value===ALL_TOPICS);
  }

  function enhanceCardSearch(){
    if(!location.hash.startsWith('#/conditions'))return;
    const api=core();
    const select=document.getElementById('topic-select');
    const input=document.getElementById('condition-search');
    const expand=document.getElementById('expand-toggle');
    const focus=document.getElementById('focus-topic');
    if(!api||!select||!input||!expand||!focus||select.dataset.exhaustiveSearch==='1')return;

    const allOption=document.createElement('option');
    allOption.value=ALL_TOPICS;
    allOption.textContent=`All Topics (${api.App.conditions.length})`;
    select.prepend(allOption);
    select.dataset.exhaustiveSearch='1';
    input.value=cardQuery;
    input.placeholder='Search all card text';

    input.addEventListener('input',event=>{
      event.stopImmediatePropagation();
      cardQuery=event.target.value;
      drawConditions();
    },true);

    select.addEventListener('change',event=>{
      if(event.target.value===ALL_TOPICS){
        event.preventDefault();
        event.stopImmediatePropagation();
        allTopicsMode=true;
        drawConditions();
      }else{
        allTopicsMode=false;
      }
    },true);

    expand.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      cardsExpanded=!cardsExpanded;
      document.querySelectorAll('#condition-list .condition-card').forEach(card=>card.classList.toggle('open',cardsExpanded));
      expand.textContent=cardsExpanded?'Collapse all':'Expand all';
    },true);

    focus.addEventListener('click',event=>{
      if(!allTopicsMode&&select.value!==ALL_TOPICS)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const choice=api.selectCoverageCandidates(api.App.conditions,1,{uniqueTopics:false})[0]||api.App.conditions[0];
      if(choice)api.go('focus',choice.id);
    },true);

    drawConditions();
  }

  function reorderQuestionTabs(){
    if(!location.hash.startsWith('#/quiz'))return;
    const bar=document.querySelector('#app .tabs');
    if(!bar)return;
    const buttons=[...bar.querySelectorAll('[data-quiz-tab]')];
    if(buttons.length<2)return;
    const rank=new Map(QUESTION_TAB_ORDER.map((id,index)=>[id,index]));
    const sorted=buttons.slice().sort((a,b)=>(rank.get(a.dataset.quizTab)??99)-(rank.get(b.dataset.quizTab)??99));
    if(buttons.every((button,index)=>button===sorted[index]))return;
    const fragment=document.createDocumentFragment();
    sorted.forEach(button=>fragment.appendChild(button));
    bar.appendChild(fragment);
    bar.dataset.mobileOrdered='1';
  }

  function questionTexts(set){
    return(Array.isArray(set?.questions)?set.questions:[]).map(question=>normalise(deepText(question,[]).join(' ')));
  }

  async function cachedQuestionTexts(record){
    const key=String(record.setId);
    const cached=questionSetCache.get(key);
    if(cached&&cached.hash===record.contentHash)return cached.texts;
    const set=await bank()?.loadSet(key);
    const texts=questionTexts(set);
    questionSetCache.set(key,{hash:record.contentHash,texts});
    return texts;
  }

  function ensureBankSearchStatus(field){
    let node=field.querySelector('.bank-search-count');
    if(!node){
      node=document.createElement('small');
      node.className='bank-search-count';
      field.appendChild(node);
    }
    return node;
  }

  async function applyBankSearch(){
    const bankApi=bank();
    const root=document.getElementById('quiz-workspace');
    const input=root?.querySelector('#bank-search');
    const list=root?.querySelector('#bank-list');
    if(!bankApi||!input||!list)return;
    const version=++bankSearchVersion;
    const terms=parseTerms(bankQuery);
    const cards=[...list.querySelectorAll('.bank-card[data-bank-card]')];
    const status=ensureBankSearchStatus(input.closest('.field'));
    list.querySelector('.bank-search-empty')?.remove();

    if(!terms.included.length&&!terms.excluded.length){
      cards.forEach(card=>card.hidden=false);
      status.textContent='';
      return;
    }

    status.textContent='Searching…';
    const recordMap=new Map(bankApi.bankIndex().map(record=>[String(record.setId),record]));
    let matchingSets=0;
    let matchingQuestions=0;

    await Promise.all(cards.map(async card=>{
      const record=recordMap.get(String(card.dataset.bankCard));
      let count=0;
      if(record){
        try{
          const texts=await cachedQuestionTexts(record);
          count=texts.filter(text=>matchesTerms(text,terms)).length;
        }catch(_){count=0;}
      }
      if(version!==bankSearchVersion)return;
      card.hidden=count===0;
      if(count){matchingSets++;matchingQuestions+=count;}
    }));

    if(version!==bankSearchVersion)return;
    status.textContent=`${matchingQuestions} matching question${matchingQuestions===1?'':'s'} in ${matchingSets} set${matchingSets===1?'':'s'}`;
    if(!matchingSets){
      const empty=document.createElement('section');
      empty.className='empty bank-search-empty';
      empty.innerHTML='<h2>No matching questions</h2>';
      list.appendChild(empty);
    }
  }

  function scheduleBankSearch(){
    clearTimeout(bankTimer);
    bankTimer=setTimeout(()=>void applyBankSearch(),120);
  }

  function enhanceQuestionBankSearch(){
    if(!location.hash.startsWith('#/quiz'))return;
    const root=document.getElementById('quiz-workspace');
    const input=root?.querySelector('#bank-search');
    if(!input||input.dataset.questionTextSearch==='1')return;
    input.dataset.questionTextSearch='1';
    input.value=bankQuery;
    input.placeholder='Search question text';
    const label=input.closest('.field')?.querySelector('label');
    if(label)label.textContent='Search questions';
    ensureBankSearchStatus(input.closest('.field'));
    input.addEventListener('input',event=>{
      event.stopImmediatePropagation();
      bankQuery=event.target.value;
      scheduleBankSearch();
    },true);
    scheduleBankSearch();
  }

  function apply(){
    scheduled=false;
    reorderQuestionTabs();
    enhanceCardSearch();
    enhanceQuestionBankSearch();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }

  function initialise(){
    const app=document.getElementById('app');
    if(!app||!core()){setTimeout(initialise,80);return;}
    const observer=new MutationObserver(schedule);
    observer.observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',()=>{
      if(!location.hash.startsWith('#/conditions'))allTopicsMode=false;
      schedule();
    });
    document.addEventListener('ukmlaQuestionBankChanged',()=>{
      questionSetCache.clear();
      schedule();
    });
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
