(function(){
  'use strict';
  if(window.__UKMLA_ANALYTICS_EXTENSIONS__)return;
  window.__UKMLA_ANALYTICS_EXTENSIONS__=true;

  function pct(row){return row.answered?Math.round(row.correct/row.answered*100):0;}
  function render(){
    const section=document.getElementById('learning-analytics');
    const grid=section?.querySelector('.learning-grid');
    const core=window.UKMLA_LEARNING;
    if(!grid||!core||grid.querySelector('.learning-combination-card'))return;
    const data=core.stats();
    const combos=Object.values(data.topicTypes||{}).filter(row=>row.answered>=2).sort((a,b)=>pct(a)-pct(b)||b.answered-a.answered).slice(0,8);
    const sources={ai:0,basic:0,knowledge:0};
    data.answers.forEach(event=>{sources[event.source]=(sources[event.source]||0)+1;});
    const card=document.createElement('div');
    card.className='learning-card learning-combination-card';
    card.innerHTML=`<h3>Weakest topic × question-type combinations</h3>${combos.length?`<ol>${combos.map(row=>`<li>${row.topicName} × ${row.label} — <strong>${pct(row)}%</strong> (${row.correct}/${row.answered})</li>`).join('')}</ol>`:'<p class="learning-muted">At least two answered questions are required before a combination is ranked.</p>'}<p class="learning-muted">Completed by source: AI encyclopedia ${sources.ai||0} · basic HTML ${sources.basic||0} · knowledge packs ${sources.knowledge||0}</p>`;
    grid.appendChild(card);
  }
  function init(){render();new MutationObserver(render).observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
