(function(){
  'use strict';
  if(window.__UKMLA_APP_BOOT__)return;
  window.__UKMLA_APP_BOOT__=true;

  const SHELL=[
    'ward-law-topic.js?v=2',
    'ward-law-extra-scenarios.js?v=1',
    'ward-law-count-sync.js?v=1',
    'ui-shell.js?v=14',
    'quiz-export.js?v=12',
    'ui-polish.js?v=9',
    'ai-law-prompt-guard.js?v=1',
    'ai-resumable-job.js?v=1',
    'ai-resume-exact-request.js?v=1',
    'ai-api-stream.js?v=5',
    'ai-hard-sparse-checkpoint.js?v=1',
    'ai-option-normalizer.js?v=7',
    'ai-clinical-category-gate.js?v=2',
    'ai-distractor-validity-gate.js?v=2',
    'ai-law-ethics-adapter.js?v=2',
    'ai-knowledge-source-gate.js?v=2',
    'ai-answer-shuffler.js?v=1',
    'ai-generation-status.js?v=4',
    'ai-score-summary.js?v=3'
  ];
  const LEARNING=[
    'learning-core.js?v=4',
    'learning-type-normalizer.js?v=1',
    'learning-badge-safety.js?v=3',
    'learning-analytics-extensions.js?v=3',
    'learning-lifetime-total.js?v=5',
    'basic-coverage-quiz.js?v=3',
    'learning-sync-envelope.js?v=1',
    'learning-sync-guard.js?v=1',
    'learning-generation-guard.js?v=2',
    'ai-coverage-launcher.js?v=1',
    'knowledge-dump-quiz.js?v=1',
    'knowledge-dump-fixes.js?v=2'
  ];

  let learningPromise=null;
  let replaying=false;

  function scriptExists(src){
    const file=src.split('?')[0];
    return [...document.scripts].some(script=>String(script.getAttribute('src')||'').split('?')[0].endsWith(file));
  }
  function loadOne(src){
    if(scriptExists(src))return Promise.resolve();
    return new Promise(resolve=>{
      const script=document.createElement('script');
      script.async=false;
      script.src=src;
      script.onload=resolve;
      script.onerror=()=>{console.error('UKMLA enhancement failed to load:',src);resolve();};
      document.head.appendChild(script);
    });
  }
  async function loadList(list){for(const src of list)await loadOne(src);}

  function classic(){
    document.body.classList.remove('dashboard-mode');
    const dashboard=document.querySelector('.home-dashboard');
    if(dashboard)dashboard.hidden=true;
    document.querySelector('.layout')?.removeAttribute('aria-hidden');
  }
  function dashboard(){
    const home=document.querySelector('.home-dashboard');
    if(home)home.hidden=false;
    document.body.classList.add('dashboard-mode');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function showStatus(text){
    const node=document.getElementById('ukmla-safe-status');
    if(node)node.textContent=text;
  }

  function makeTopbar(){
    if(document.getElementById('ukmla-safe-topbar'))return;
    const style=document.createElement('style');
    style.textContent='#ukmla-safe-topbar{position:sticky;top:0;z-index:999;display:flex;align-items:center;gap:.45rem;padding:.58rem max(.7rem,env(safe-area-inset-left));background:linear-gradient(90deg,#071b34,#0b4777);color:#eaf9ff;box-shadow:0 5px 18px rgba(3,24,48,.28);font:700 .88rem/1.2 Inter,system-ui,sans-serif}#ukmla-safe-topbar strong{margin-right:auto;white-space:nowrap}#ukmla-safe-topbar button{min-height:38px;padding:.45rem .65rem;border:1px solid rgba(255,255,255,.2);border-radius:11px;background:rgba(255,255,255,.09);color:#fff;font:700 .78rem Inter,system-ui,sans-serif}#ukmla-safe-status{display:none}@media(max-width:620px){#ukmla-safe-topbar{overflow-x:auto}#ukmla-safe-topbar strong{font-size:.8rem}#ukmla-safe-topbar button{white-space:nowrap}}';
    document.head.appendChild(style);
    const bar=document.createElement('nav');
    bar.id='ukmla-safe-topbar';
    bar.innerHTML='<strong>UKMLA</strong><button type="button" data-safe="notes">All notes</button><button type="button" data-safe="dashboard">Dashboard</button><button type="button" data-safe="analytics">Analytics</button><button type="button" data-safe="knowledge">Knowledge dump</button><span id="ukmla-safe-status" aria-live="polite"></span>';
    document.body.prepend(bar);
    bar.addEventListener('click',event=>{
      const action=event.target.closest('[data-safe]')?.dataset.safe;
      if(action==='notes'){classic();document.querySelector('.layout')?.scrollIntoView({behavior:'smooth',block:'start'});}
      if(action==='dashboard')dashboard();
      if(action==='analytics')openLearning('analytics');
      if(action==='knowledge')openLearning('knowledge');
    });
  }

  function makePlaceholders(){
    if(!document.getElementById('learning-analytics-placeholder')){
      const analytics=document.createElement('section');
      analytics.id='learning-analytics-placeholder';
      analytics.hidden=true;
      analytics.innerHTML='<h2>Learning analytics</h2><p>Analytics are loaded only when opened, so the 480-card notes remain responsive.</p><button type="button" data-load-learning="analytics">Open analytics</button>';
      const ai=document.getElementById('ai-generated-quiz');
      (ai?.parentNode||document.body).insertBefore(analytics,ai||null);
    }
    if(!document.getElementById('knowledge-dump-placeholder')){
      const knowledge=document.createElement('section');
      knowledge.id='knowledge-dump-placeholder';
      knowledge.hidden=true;
      knowledge.innerHTML='<h2>Knowledge-dump SBA generator</h2><p>Load the PowerPoint and text quiz workspace when needed.</p><button type="button" data-load-learning="knowledge">Open knowledge dump</button>';
      document.body.appendChild(knowledge);
    }
  }

  function loadLearning(){
    if(learningPromise)return learningPromise;
    showStatus('Loading analytics…');
    learningPromise=loadList(LEARNING).then(()=>{
      document.getElementById('learning-analytics-placeholder')?.remove();
      document.getElementById('knowledge-dump-placeholder')?.remove();
      showStatus('');
      document.dispatchEvent(new Event('ukmlaLearningSuiteReady'));
    });
    return learningPromise;
  }

  async function openLearning(kind){
    classic();
    const placeholder=document.getElementById(kind==='knowledge'?'knowledge-dump-placeholder':'learning-analytics-placeholder');
    if(placeholder){placeholder.hidden=false;placeholder.scrollIntoView({behavior:'smooth',block:'start'});}
    await loadLearning();
    const target=document.getElementById(kind==='knowledge'?'knowledge-dump-quiz':'learning-analytics');
    target?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function needsLearning(target){
    if(target.closest('[data-load-learning]'))return true;
    if(target.closest('#quiz-all-areas,#quiz-all-areas-side,#quiz-visible,#quiz-visible-side,.quiz-section-button'))return true;
    if(target.closest('#aiq-random'))return true;
    const generate=target.closest('#aiq-generate');
    if(generate&&document.getElementById('aiq-condition')?.value==='__all__')return true;
    return false;
  }

  function installLazyGuard(){
    document.addEventListener('click',event=>{
      if(replaying||window.UKMLA_LEARNING)return;
      const action=event.target.closest('[data-load-learning]')?.dataset.loadLearning;
      if(action){event.preventDefault();event.stopImmediatePropagation();openLearning(action);return;}
      if(!needsLearning(event.target)){
        if(event.target.closest('#aiq-generate'))loadLearning();
        return;
      }
      const target=event.target.closest('button,a');
      if(!target)return;
      event.preventDefault();event.stopImmediatePropagation();
      const label=target.textContent;
      target.disabled=true;
      target.textContent='Preparing coverage…';
      loadLearning().then(()=>{
        target.disabled=false;
        target.textContent=label;
        replaying=true;
        target.click();
        replaying=false;
      });
    },true);
  }

  async function init(){
    makeTopbar();
    makePlaceholders();
    installLazyGuard();
    await loadList(SHELL);
    classic();
    await loadOne('learning-light-badges.js?v=1');
    window.addEventListener('error',()=>classic());
    window.addEventListener('unhandledrejection',()=>classic());
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
