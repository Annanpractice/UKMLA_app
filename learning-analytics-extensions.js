(function(){
  'use strict';
  if(window.__UKMLA_ANALYTICS_EXTENSIONS__)return;
  window.__UKMLA_ANALYTICS_EXTENSIONS__=true;

  let queued=false;
  function pct(row){return row.answered?Math.round(row.correct/row.answered*100):0;}
  function render(){
    queued=false;
    const section=document.getElementById('learning-analytics');
    const grid=section?.querySelector('.learning-grid');
    const core=window.UKMLA_LEARNING;
    if(!grid||!core||grid.querySelector('.learning-combination-card'))return;
    const data=core.stats();
    const combos=Object.values(data.topicTypes||{}).filter(row=>row.answered>=2).sort((a,b)=>pct(a)-pct(b)||b.answered-a.answered).slice(0,8);
    const sources={ai:0,basic:0,knowledge:0};
    data.answers.forEach(event=>{sources[event.source]=(sources[event.source]||0)+1;});
    const combination=document.createElement('div');
    combination.className='learning-card learning-combination-card';
    combination.innerHTML=`<h3>Weakest topic × question-type combinations</h3>${combos.length?`<ol>${combos.map(row=>`<li>${row.topicName} × ${row.label} — <strong>${pct(row)}%</strong> (${row.correct}/${row.answered})</li>`).join('')}</ol>`:'<p class="learning-muted">At least two answered questions are required before a combination is ranked.</p>'}<p class="learning-muted">Completed by source: AI encyclopedia ${sources.ai||0} · basic HTML ${sources.basic||0} · knowledge packs ${sources.knowledge||0}</p>`;
    grid.appendChild(combination);

    const topicMap=new Map();
    core.catalogue().forEach(item=>{if(!topicMap.has(item.topicId))topicMap.set(item.topicId,{topicId:item.topicId,topicName:item.topicName||item.topic,total:0});topicMap.get(item.topicId).total+=1;});
    const presentedByTopic={};const testedByTopic={};
    data.presentations.filter(event=>event.source!=='knowledge').forEach(event=>{presentedByTopic[event.topicId]=(presentedByTopic[event.topicId]||0)+1;(testedByTopic[event.topicId]||(testedByTopic[event.topicId]=new Set())).add(event.conditionId);});
    const coverage=[...topicMap.values()].map(row=>({...row,presented:presentedByTopic[row.topicId]||0,tested:testedByTopic[row.topicId]?.size||0})).sort((a,b)=>(a.tested/a.total)-(b.tested/b.total)||a.presented-b.presented||a.topicName.localeCompare(b.topicName)).slice(0,10);
    const topicCard=document.createElement('div');
    topicCard.className='learning-card learning-topic-coverage-card';
    topicCard.innerHTML=`<h3>Most under-covered topics</h3><ol>${coverage.map(row=>`<li>${row.topicName} — <strong>${row.tested}/${row.total}</strong> conditions · ${row.presented} questions</li>`).join('')}</ol>`;
    grid.appendChild(topicCard);
  }
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>requestAnimationFrame(render));
  }
  function init(){schedule();['ukmlaLearningEvent','ukmlaRemoteDataImported','ukmlaAdditionalTopicReady'].forEach(name=>document.addEventListener(name,schedule));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
