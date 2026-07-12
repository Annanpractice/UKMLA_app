(function(){
  'use strict';
  if(window.__UKMLA_LEARNING_LIFETIME_TOTAL__)return;
  window.__UKMLA_LEARNING_LIFETIME_TOTAL__=true;

  const BASELINE_KEY='ukmlaLearningLegacyCompletedV1';
  const BASELINE_CORRECT_KEY='ukmlaLearningLegacyCorrectV1';
  const PROGRESS_KEY='ukmlaQuizProgressV1';
  let queued=false;

  function progressTotals(){
    try{
      const progress=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'{}')||{};
      return Object.entries(progress).filter(([key,value])=>!key.startsWith('__')&&value&&typeof value==='object').reduce((total,[,value])=>({attempts:total.attempts+(Number(value.attempts)||0),correct:total.correct+(Number(value.correct)||0)}),{attempts:0,correct:0});
    }catch(_){return {attempts:0,correct:0};}
  }
  function loggedNonKnowledge(){
    const stats=window.UKMLA_LEARNING?.stats?.();
    const answers=stats?stats.answers.filter(event=>event.source!=='knowledge'):[];
    return {attempts:answers.length,correct:answers.filter(event=>event.correct).length};
  }
  function baselines(){
    let attempts=Number(localStorage.getItem(BASELINE_KEY));
    let correct=Number(localStorage.getItem(BASELINE_CORRECT_KEY));
    if(!Number.isFinite(attempts)||!Number.isFinite(correct)){
      const progress=progressTotals();const logged=loggedNonKnowledge();
      attempts=Math.max(0,progress.attempts-logged.attempts);
      correct=Math.max(0,progress.correct-logged.correct);
      localStorage.setItem(BASELINE_KEY,String(attempts));
      localStorage.setItem(BASELINE_CORRECT_KEY,String(correct));
    }
    return {attempts,correct};
  }
  function lifetime(){
    const base=baselines();const stats=window.UKMLA_LEARNING?.stats?.();const answers=stats?.answers||[];
    const attempts=base.attempts+answers.length;const correct=base.correct+answers.filter(event=>event.correct).length;
    return {attempts,correct,accuracy:attempts?Math.round(correct/attempts*1000)/10:0,base};
  }
  function topicCoverageLines(core){
    const data=core.stats();const groups=new Map();
    core.catalogue().forEach(item=>{if(!groups.has(item.topicId))groups.set(item.topicId,{topicId:item.topicId,topicName:item.topicName||item.topic,total:0});groups.get(item.topicId).total+=1;});
    const presented={},tested={};
    data.presentations.filter(event=>event.source!=='knowledge').forEach(event=>{presented[event.topicId]=(presented[event.topicId]||0)+1;(tested[event.topicId]||(tested[event.topicId]=new Set())).add(event.conditionId);});
    return [...groups.values()].map(row=>({...row,presented:presented[row.topicId]||0,tested:tested[row.topicId]?.size||0})).sort((a,b)=>(a.tested/a.total)-(b.tested/b.total)||a.presented-b.presented||a.topicName.localeCompare(b.topicName)).slice(0,10).map((row,index)=>`${index+1}. ${row.topicName} — ${row.tested}/${row.total} conditions — ${row.presented} target questions`);
  }
  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  function render(){
    queued=false;
    const all=lifetime();
    setText(document.querySelector('#learning-analytics .learning-total'),String(all.attempts));
    setText(document.getElementById('learning-total-completed-stat'),`${all.attempts} questions completed`);
    const label=document.querySelector('#learning-analytics .learning-total-label');
    const title=`Includes ${all.base.attempts} questions from pre-logger topic-attempt history.`;
    if(label&&label.title!==title)label.title=title;
    const core=window.UKMLA_LEARNING;const ring=document.querySelector('#learning-analytics .learning-coverage-ring');
    if(core&&ring){const stats=core.stats();const catalogue=core.catalogue();const tested=new Set(stats.presentations.filter(event=>event.source!=='knowledge').map(event=>event.conditionId));const text=`${tested.size}/${catalogue.length} conditions tested<br>${all.accuracy}% lifetime accuracy<br>Coverage cycle ${core.coverageState().cycle}`;if(ring.innerHTML!==text)ring.innerHTML=text;}
  }
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(render);
  }
  async function copy(text,button){
    try{await navigator.clipboard.writeText(text);}catch(_){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}
    const old=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=old,1400);
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('#learning-copy-summary');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    const core=window.UKMLA_LEARNING;if(!core)return;
    const all=lifetime();let text=core.summaryText();
    text=text.replace(/Total questions completed:\s*\d+/i,`Total questions completed: ${all.attempts}`);
    text=text.replace(/Overall accuracy:\s*[\d.]+%/i,`Overall accuracy: ${all.accuracy}%`);
    text=text.replace(/UNDERTESTED TOPICS\n[\s\S]*?\n\nRECENT PERFORMANCE/,`UNDERTESTED TOPICS\n${topicCoverageLines(core).join('\n')}\n\nRECENT PERFORMANCE`);
    if(all.base.attempts)text=text.replace('BOASTING RIGHTS',`BOASTING RIGHTS\nLegacy questions included: ${all.base.attempts}`);
    copy(text,button);
  },true);
  function init(){baselines();schedule();['ukmlaLearningEvent','ukmlaRemoteDataImported','ukmlaAdditionalTopicReady'].forEach(name=>document.addEventListener(name,schedule));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
