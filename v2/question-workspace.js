(function(){
  'use strict';

  const TAB_ORDER=['basic','ai','psa','biomedical'];
  const TAB_LABELS={
    basic:'Basic HTML',
    ai:'UKMLA Questions',
    psa:'PSA',
    biomedical:'Anatomy & Physiology'
  };
  let observer=null;
  let scheduled=false;
  let mounting=false;

  function core(){return window.UKMLA_V2;}
  function onQuestionsRoute(){return location.hash.startsWith('#/quiz');}
  function workspace(){return document.getElementById('quiz-workspace');}
  function tabs(){return document.querySelector('#app .tabs');}

  function persistTab(tab){
    const api=core();
    if(!api)return;
    api.App.state.quizTab=tab;
    api.saveJson(api.STORAGE.state,api.App.state);
  }

  function ensureTabButtons(){
    const bar=tabs();
    if(!bar)return;
    for(const tab of TAB_ORDER){
      let button=bar.querySelector(`[data-quiz-tab="${tab}"]`);
      if(!button){
        button=document.createElement('button');
        button.className='tab';
        button.dataset.quizTab=tab;
        bar.appendChild(button);
      }
      if(button.textContent!==TAB_LABELS[tab])button.textContent=TAB_LABELS[tab];
      button.setAttribute('aria-label',TAB_LABELS[tab]);
      button.onclick=event=>{
        event.preventDefault();
        event.stopPropagation();
        openTab(tab);
      };
    }
  }

  function setActiveButton(tab){
    const bar=tabs();
    if(!bar)return;
    bar.querySelectorAll('[data-quiz-tab]').forEach(button=>{
      const active=button.dataset.quizTab===tab;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
  }

  function detectedTab(container){
    if(!container)return'';
    if(container.querySelector('#ai-key,[data-ukmla-question-workspace="ai"]'))return'ai';
    if(container.querySelector('.psa-hero,.psa-exam-shell,[data-ukmla-question-workspace="psa"]'))return'psa';
    if(container.querySelector('.biomedical-hero,[data-ukmla-question-workspace="biomedical"]'))return'biomedical';
    if(container.querySelector('#basic-start,[data-ukmla-question-workspace="basic"]'))return'basic';
    return container.dataset.activeQuestionTab||'';
  }

  function openTab(tab){
    if(mounting)return;
    const api=core();
    const container=workspace();
    if(!api||!container)return;
    persistTab(tab);
    setActiveButton(tab);
    mounting=true;
    try{
      if(tab==='basic'){
        container.dataset.activeQuestionTab='basic';
        api.render();
        return;
      }
      if(tab==='ai'){
        if(!window.UKMLA_V2_AI?.mount)throw new Error('UKMLA question generator did not initialise.');
        window.UKMLA_V2_AI.mount(container);
      }else if(tab==='psa'){
        if(!window.UKMLA_PSA?.mount)throw new Error('PSA workspace did not initialise.');
        window.UKMLA_PSA.mount(container);
      }else if(tab==='biomedical'){
        if(!window.UKMLA_BIOMEDICAL?.mount)throw new Error('Anatomy and physiology workspace did not initialise.');
        window.UKMLA_BIOMEDICAL.mount(container);
      }
      container.dataset.activeQuestionTab=tab;
      setActiveButton(tab);
      applyBranding();
    }catch(error){
      container.innerHTML=`<section class="empty"><h2>Question workspace unavailable</h2><p>${api.escapeHtml(error.message)}</p><button class="btn" id="question-workspace-retry">Retry</button></section>`;
      container.querySelector('#question-workspace-retry')?.addEventListener('click',()=>openTab(tab));
    }finally{
      mounting=false;
    }
  }

  function relabelNavigation(){
    document.querySelectorAll('[data-nav="quiz"]').forEach(button=>{
      const spans=button.querySelectorAll('span');
      if(spans[1]&&spans[1].textContent!=='Questions')spans[1].textContent='Questions';
      button.setAttribute('aria-label','Questions');
    });
    const homeButton=document.getElementById('home-quiz');
    if(homeButton)homeButton.textContent='Start UKMLA questions';
  }

  function brandQuestionPage(){
    if(!onQuestionsRoute())return;
    const pageKicker=document.getElementById('page-kicker');
    const pageTitle=document.getElementById('page-title');
    if(pageKicker)pageKicker.textContent='UKMLA';
    if(pageTitle)pageTitle.textContent='Questions';
    document.title='UKMLA Questions';

    const head=document.querySelector('#app .page-head');
    if(head){
      const eyebrow=head.querySelector('.eyebrow');
      const title=head.querySelector('h1');
      const description=head.querySelector('p');
      if(eyebrow)eyebrow.textContent='GMC content-map practice';
      if(title)title.textContent='UKMLA question centre';
      if(description)description.textContent='Clinical question sets are structured around the GMC MLA content map. PSA work uses live BNF/NICE-grounded source checks; other UKMLA questions use the curated card atlas and clinical quality checkpoints.';
      if(!head.querySelector('.question-brand-disclaimer')){
        const note=document.createElement('small');
        note.className='question-brand-disclaimer';
        note.textContent='Independent revision tool; not affiliated with the GMC, NICE or the BNF.';
        head.querySelector('div')?.appendChild(note);
      }
    }

    const container=workspace();
    if(!container)return;
    const localHeading=container.querySelector('#basic-start')?.closest('.quiz-card')?.querySelector('h2');
    if(localHeading)localHeading.textContent='Local coverage questions';
    const basicStart=container.querySelector('#basic-start');
    if(basicStart)basicStart.textContent='Generate 10 questions';
  }

  function replaceVisibleTerms(root=document){
    const exact=new Map([
      ['AI generated','UKMLA Questions'],
      ['AI-generated UKMLA quiz','UKMLA questions'],
      ['Generate 10-question AI quiz','Build 10 UKMLA questions'],
      ['Quiz complete','Question set complete'],
      ['Another coverage quiz','Another question set'],
      ['Local coverage quiz','Local coverage questions'],
      ['Generate another','Build another set']
    ]);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      if(!node.parentElement||['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION'].includes(node.parentElement.tagName))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const raw=node.nodeValue||'';
      const trimmed=raw.trim();
      if(!trimmed)continue;
      let replacement=exact.get(trimmed);
      if(!replacement&&/\bquiz\b/i.test(trimmed))replacement=trimmed.replace(/\bquizzes\b/gi,'question sets').replace(/\bquiz\b/gi,'question set');
      if(replacement&&replacement!==trimmed){
        const leading=raw.match(/^\s*/)?.[0]||'';
        const trailing=raw.match(/\s*$/)?.[0]||'';
        node.nodeValue=leading+replacement+trailing;
      }
    }
  }

  function ensureCorrectWorkspace(){
    if(!onQuestionsRoute()||mounting)return;
    const api=core();
    const container=workspace();
    if(!api||!container)return;
    const desired=api.App.state.quizTab||'basic';
    const current=detectedTab(container);
    if(desired!==current&&TAB_ORDER.includes(desired))openTab(desired);
    else{
      container.dataset.activeQuestionTab=current||desired;
      setActiveButton(current||desired);
    }
  }

  function applyBranding(){
    relabelNavigation();
    ensureTabButtons();
    brandQuestionPage();
    replaceVisibleTerms(document.getElementById('app')||document);
  }

  function apply(){
    scheduled=false;
    applyBranding();
    ensureCorrectWorkspace();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }

  function init(){
    const app=document.getElementById('app');
    if(!app)return;
    observer=new MutationObserver(schedule);
    observer.observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',()=>setTimeout(schedule,0));
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.UKMLA_QUESTION_WORKSPACE={openTab,applyBranding};
})();
