(function(){
  'use strict';

  let scheduled=false;
  let observer=null;

  function core(){return window.UKMLA_V2;}
  function coverage(){return core()?.coverageState?.()||null;}
  function historical(){return new Set(coverage()?.historicalCovered||[]);}
  function detailedIds(){
    return new Set((core()?.eventIndex?.().answers||[])
      .filter(event=>event?.source!=='knowledge'&&event?.conditionId)
      .map(event=>event.conditionId));
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(decorate);}

  function decorateConditionCards(history,detailed){
    if(!location.hash.startsWith('#/conditions'))return;
    document.querySelectorAll('#app .condition-card[data-condition-card]').forEach(card=>{
      const id=card.dataset.conditionCard;
      if(!history.has(id)||detailed.has(id))return;
      const label=card.querySelector('.condition-mini-label');
      if(label&&label.textContent!=='Historical completion · score unavailable')label.textContent='Historical completion · score unavailable';
      const mini=card.querySelector('.condition-performance-mini');
      if(mini)mini.title='This condition was completed before detailed answer-level analytics were retained. It still counts for coverage and question scheduling.';
    });
  }

  function decorateFocus(history,detailed){
    if(!location.hash.startsWith('#/focus'))return;
    const id=decodeURIComponent(location.hash.split('/').slice(2).join('/'))||core()?.App?.state?.focusId;
    if(!history.has(id)||detailed.has(id))return;
    const index=document.querySelector('#app .focus-index');
    if(!index)return;
    const next=String(index.textContent||'').replace(/not yet answered/i,'historical completion · score unavailable');
    if(index.textContent!==next)index.textContent=next;
    index.title='This condition remains in historical coverage. Detailed correctness was not retained by the older storage format.';
  }

  function decorateAnalytics(history,detailed){
    if(!location.hash.startsWith('#/analytics'))return;
    const explorer=document.getElementById('condition-performance-explorer');
    if(!explorer)return;
    const head=explorer.querySelector('.condition-explorer-head');
    let note=explorer.querySelector('.coverage-recovery-note');
    if(!note){
      note=document.createElement('p');
      note.className='coverage-recovery-note';
      note.style.cssText='margin:.75rem 0 1rem;padding:.8rem 1rem;border:1px solid rgba(103,227,162,.35);border-radius:14px;background:rgba(103,227,162,.08);color:var(--muted)';
      head?.insertAdjacentElement('afterend',note);
    }
    const text=`${history.size} historical condition completions are retained for coverage and scheduling. Detailed answer-level analytics are available for ${detailed.size} conditions; older completions have neutral, unscored history.`;
    if(note.textContent!==text)note.textContent=text;

    const filter=explorer.querySelector('#condition-performance-filter');
    if(filter){
      const answered=filter.querySelector('option[value="answered"]');
      const untested=filter.querySelector('option[value="untested"]');
      if(answered)answered.textContent='Detailed answer records';
      if(untested)untested.textContent='No detailed answer record';
    }

    const result=explorer.querySelector('#condition-performance-result');
    if(result&&!result.textContent.includes('historical retained')){
      result.textContent=`${result.textContent} · ${history.size} historical retained`;
    }

    explorer.querySelectorAll('.condition-performance-row').forEach(row=>{
      const id=row.querySelector('[data-condition-performance-focus]')?.dataset.conditionPerformanceFocus;
      if(!id||!history.has(id)||detailed.has(id))return;
      const detail=row.querySelector('.condition-performance-health small');
      if(detail&&/no answers/i.test(detail.textContent||''))detail.textContent='historical completion · detailed score unavailable';
      const scoreLabel=row.querySelector('.condition-performance-score small');
      if(scoreLabel)scoreLabel.textContent='history';
      row.title='Historical completion retained for scheduling; no condition-level correctness score was stored by the older format.';
    });
  }

  function decorate(){
    scheduled=false;
    if(!core()?.App?.loaded)return;
    const history=historical();
    if(!history.size)return;
    const detailed=detailedIds();
    decorateConditionCards(history,detailed);
    decorateFocus(history,detailed);
    decorateAnalytics(history,detailed);
  }

  function initialise(){
    if(!core()?.App?.loaded){setTimeout(initialise,100);return;}
    const app=document.getElementById('app');
    if(app){observer=new MutationObserver(schedule);observer.observe(app,{childList:true,subtree:true});}
    document.addEventListener('ukmlaLearningEvent',schedule);
    document.addEventListener('ukmlaRemoteDataImported',schedule);
    window.addEventListener('hashchange',schedule);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();
})();
