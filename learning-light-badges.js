(function(){
  'use strict';
  if(window.__UKMLA_LIGHT_BADGES__)return;
  window.__UKMLA_LIGHT_BADGES__=true;

  const EVENT_KEY='ukmlaLearningEventsV1';
  const REGISTRY_KEY='ukmlaLearningRegistryV1';
  const PROGRESS_KEY='ukmlaQuizProgressV1';

  function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}
  function slug(value){
    const out=clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return out.slice(0,42)||'item';
  }
  function hash(value){
    let result=2166136261;
    const text=String(value||'');
    for(let i=0;i<text.length;i++){result^=text.charCodeAt(i);result=Math.imul(result,16777619);}
    return (result>>>0).toString(36).padStart(7,'0').slice(-7);
  }
  function parse(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}
    catch(_){return fallback;}
  }
  function titleWithoutBadge(node,selector){
    if(!node)return'';
    const badge=node.querySelector(selector);
    if(!badge)return clean(node.textContent);
    const copy=node.cloneNode(true);
    copy.querySelectorAll(selector).forEach(item=>item.remove());
    return clean(copy.textContent);
  }
  function completedTotal(events){
    let baseline=Number(localStorage.getItem('ukmlaLearningLegacyCompletedV1'));
    if(!Number.isFinite(baseline)){
      const progress=parse(PROGRESS_KEY,{});
      baseline=Object.entries(progress).filter(([key,value])=>!key.startsWith('__')&&value&&typeof value==='object').reduce((sum,[,value])=>sum+(Number(value.attempts)||0),0);
    }
    return baseline+events.filter(event=>event.kind==='answered').length;
  }
  function addStyle(){
    if(document.getElementById('ukmla-light-badge-style'))return;
    const style=document.createElement('style');
    style.id='ukmla-light-badge-style';
    style.textContent='.learning-condition-count,.learning-topic-count{display:inline-flex;align-items:center;justify-content:center;min-width:1.18rem;height:1.18rem;margin-left:.28rem;padding:0 .28rem;border:1px solid rgba(20,128,190,.35);border-radius:999px;background:rgba(37,160,230,.12);color:#086fa8;font:900 .65rem/1 Aptos,Calibri,sans-serif;vertical-align:super;box-shadow:0 0 8px rgba(0,153,255,.18)}.learning-condition-count.untested{background:rgba(112,105,95,.08);border-color:rgba(112,105,95,.2);color:#8c857c;box-shadow:none}.learning-condition-count::before,.learning-topic-count::before{content:attr(data-count)}';
    document.head.appendChild(style);
  }

  function run(){
    addStyle();
    const events=parse(EVENT_KEY,[]);
    const conditionCounts={};
    const topicCounts={};
    events.filter(event=>event.kind==='presented').forEach(event=>{
      conditionCounts[event.conditionId]=(conditionCounts[event.conditionId]||0)+1;
      topicCounts[event.topicId]=(topicCounts[event.topicId]||0)+1;
    });
    const registry=parse(REGISTRY_KEY,{version:1,topics:{},conditions:{}});
    const sections=[...document.querySelectorAll('.section')];
    let index=0;

    function next(){
      const end=Math.min(index+1,sections.length);
      for(;index<end;index++){
        const section=sections[index];
        const heading=section.querySelector('h2');
        const topicName=titleWithoutBadge(heading,'.learning-topic-count');
        const topicId=section.dataset.topicId||`topic-${slug(topicName)}-${hash(topicName)}`;
        section.dataset.topicId=topicId;
        registry.topics[topicId]={id:topicId,name:topicName,updatedAt:new Date().toISOString()};
        section.querySelectorAll('.card').forEach(card=>{
          const summary=card.querySelector('summary');
          const conditionName=titleWithoutBadge(summary,'.learning-condition-count');
          if(!conditionName)return;
          const conditionId=card.dataset.conditionId||`${topicId}-${slug(conditionName)}-${hash(`${topicId}|${conditionName}`)}`;
          card.dataset.conditionId=conditionId;
          card.dataset.topicId=topicId;
          registry.conditions[conditionId]={id:conditionId,name:conditionName,topicId,topicName,updatedAt:new Date().toISOString()};
          let badge=summary.querySelector('.learning-condition-count');
          if(!badge){badge=document.createElement('sup');badge.className='learning-condition-count';badge.setAttribute('aria-hidden','true');summary.appendChild(document.createTextNode(' '));summary.appendChild(badge);}
          const count=conditionCounts[conditionId]||0;
          badge.dataset.count=String(count);
          badge.classList.toggle('untested',count===0);
          badge.title=count?`Tested ${count} time${count===1?'':'s'}`:'Not yet tested';
        });
        const navLink=document.querySelector(`.nav a[href="#${CSS.escape(section.id)}"]`);
        if(navLink){
          let badge=navLink.querySelector('.learning-topic-count');
          if(!badge){badge=document.createElement('sup');badge.className='learning-topic-count';badge.setAttribute('aria-hidden','true');const label=[...navLink.children].find(node=>node.tagName==='SPAN'&&!node.classList.contains('topic-bulb')&&!node.classList.contains('topic-score'));(label||navLink).appendChild(badge);}
          badge.dataset.count=String(topicCounts[topicId]||0);
        }
      }
      if(index<sections.length)requestAnimationFrame(next);
      else{
        try{localStorage.setItem(REGISTRY_KEY,JSON.stringify(registry));}catch(_){/* registry is reconstructable */}
        let total=document.getElementById('learning-total-completed-stat');
        if(!total){total=document.createElement('span');total.id='learning-total-completed-stat';total.className='stat';document.querySelector('.stats')?.appendChild(total);}
        if(total)total.textContent=`${completedTotal(events)} questions completed`;
        document.dispatchEvent(new Event('ukmlaLightBadgesReady'));
      }
    }
    requestAnimationFrame(next);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  document.addEventListener('ukmlaLearningEvent',()=>setTimeout(run,0));
  document.addEventListener('ukmlaRemoteDataImported',()=>setTimeout(run,0));
})();
