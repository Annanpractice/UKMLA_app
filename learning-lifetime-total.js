(function(){
  'use strict';
  if(window.__UKMLA_LEARNING_LIFETIME_TOTAL__)return;
  window.__UKMLA_LEARNING_LIFETIME_TOTAL__=true;

  const BASELINE_KEY='ukmlaLearningLegacyCompletedV1';
  const PROGRESS_KEY='ukmlaQuizProgressV1';

  function progressAttempts(){
    try{
      const progress=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'{}')||{};
      return Object.entries(progress).filter(([key,value])=>!key.startsWith('__')&&value&&typeof value==='object').reduce((sum,[,value])=>sum+(Number(value.attempts)||0),0);
    }catch(_){return 0;}
  }
  function loggedNonKnowledge(){
    const stats=window.UKMLA_LEARNING?.stats?.();
    return stats?stats.answers.filter(event=>event.source!=='knowledge').length:0;
  }
  function baseline(){
    let value=Number(localStorage.getItem(BASELINE_KEY));
    if(!Number.isFinite(value)){
      value=Math.max(0,progressAttempts()-loggedNonKnowledge());
      localStorage.setItem(BASELINE_KEY,String(value));
    }
    return value;
  }
  function total(){return baseline()+(window.UKMLA_LEARNING?.stats?.().totalCompleted||0);}
  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  function render(){
    const value=total();
    setText(document.querySelector('#learning-analytics .learning-total'),String(value));
    setText(document.getElementById('learning-total-completed-stat'),`${value} questions completed`);
    const label=document.querySelector('#learning-analytics .learning-total-label');
    const title=`Includes ${baseline()} questions from pre-logger topic-attempt history.`;
    if(label&&label.title!==title)label.title=title;
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
    let text=core.summaryText();
    text=text.replace(/Total questions completed:\s*\d+/i,`Total questions completed: ${total()}`);
    if(baseline())text=text.replace('BOASTING RIGHTS',`BOASTING RIGHTS\nLegacy questions included: ${baseline()}`);
    copy(text,button);
  },true);
  function init(){baseline();render();new MutationObserver(render).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('ukmlaLearningEvent',render);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
