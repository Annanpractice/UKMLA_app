(function(){
'use strict';

const RECOMMENDATIONS_KEY='ukmlaQuestionMappingRecommendationsV1';

function core(){return window.UKMLA_V2;}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function parse(value,fallback){try{return JSON.parse(value||'null')??fallback;}catch(_){return fallback;}}
function recommendations(){return parse(localStorage.getItem(RECOMMENDATIONS_KEY),[]).filter(item=>item&&item.id&&item.setId);}
function cardFor(conditionId){return core()?.App?.byId?.get(String(conditionId))||null;}

function flattenText(value,out=[]){
  if(value==null)return out;
  if(Array.isArray(value)){
    value.forEach(item=>flattenText(item,out));
    return out;
  }
  if(typeof value==='object'){
    Object.values(value).forEach(item=>flattenText(item,out));
    return out;
  }
  const text=clean(value);
  if(text)out.push(text);
  return out;
}

function learningPoints(card){
  const fields=card?.fields&&typeof card.fields==='object'?card.fields:{};
  const preferred=['mechanism','clinicalPattern','discriminator','examUse','investigations','treatment','redFlags','escalation','mimics','subsystem'];
  const points=[];
  const seen=new Set();
  function add(value){
    for(const text of flattenText(value)){
      const key=text.toLowerCase();
      if(!key||seen.has(key))continue;
      seen.add(key);
      points.push(text);
      if(points.length>=4)return true;
    }
    return false;
  }
  for(const key of preferred){if(add(fields[key]))break;}
  if(points.length<4){
    for(const [key,value] of Object.entries(fields)){
      if(preferred.includes(key))continue;
      if(add(value))break;
    }
  }
  return points.slice(0,4);
}

function buildSummary(rec){
  const byTopic=new Map();
  for(const result of rec?.results||[]){
    let topic='';
    let points=[];
    if(result?.status==='matched'&&result.selectedConditionId){
      const card=cardFor(result.selectedConditionId);
      topic=clean(card?.name||result.selectedConditionName||result.topicName);
      points=learningPoints(card);
    }else{
      topic=clean(result?.suggestedCardTitle);
    }
    if(!topic)continue;
    const key=topic.toLowerCase();
    if(!byTopic.has(key))byTopic.set(key,{topic,learningPoints:[]});
    const entry=byTopic.get(key);
    const existing=new Set(entry.learningPoints.map(point=>point.toLowerCase()));
    for(const point of points){
      if(entry.learningPoints.length>=4)break;
      if(!existing.has(point.toLowerCase())){
        entry.learningPoints.push(point);
        existing.add(point.toLowerCase());
      }
    }
  }
  return Array.from(byTopic.values());
}

function exportLearningRecommendations(id){
  const rec=recommendations().find(item=>String(item.id)===String(id));
  if(!rec)return false;
  const payload={
    source:clean(rec.title)||'Imported questions',
    recommendations:buildSummary(rec)
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const safe=String(rec.title||rec.setId||'questions').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||'questions';
  const a=document.createElement('a');
  a.href=url;
  a.download=`ukmla-learning-recommendations-${safe}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return true;
}

function relabel(){
  document.querySelectorAll('[data-luna-export]').forEach(button=>{
    if(button.textContent!=='Export learning recommendations')button.textContent='Export learning recommendations';
  });
}

function intercept(event){
  const button=event.target?.closest?.('[data-luna-export]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  exportLearningRecommendations(button.dataset.lunaExport);
}

function patchPublicApi(){
  if(window.UKMLA_QUESTION_MAPPING)window.UKMLA_QUESTION_MAPPING.exportRecommendation=exportLearningRecommendations;
}

function init(){
  patchPublicApi();
  relabel();
  document.addEventListener('click',intercept,true);
  const observer=new MutationObserver(relabel);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('ukmlaQuestionMappingRecommendationsChanged',()=>setTimeout(relabel,0));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.UKMLA_QUESTION_LEARNING_EXPORT={exportLearningRecommendations,buildSummary,learningPoints};
})();
