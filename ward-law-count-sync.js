(function(){
  'use strict';

  function syncCounts(){
    const section=document.getElementById('ward-law-ethics-professional-practice');
    if(!section) return;
    const scenarioCount=section.querySelectorAll('.ward-law-card').length;
    const sectionCount=section.querySelector('.section-count');
    if(sectionCount) sectionCount.textContent=`${scenarioCount} scenarios`;
    const navCount=document.querySelector('.nav a[href="#ward-law-ethics-professional-practice"] small');
    if(navCount) navCount.textContent=String(scenarioCount);
    document.querySelectorAll('.stats .stat').forEach(function(stat){
      if(/conditions$/i.test(stat.textContent.trim())) stat.textContent=`${415+scenarioCount} conditions`;
    });
    document.dispatchEvent(new CustomEvent('ukmlaAdditionalTopicReady',{
      detail:{topic:'Ward law, ethics and professional practice',profile:'ward_law_ethics',scenarioCount}
    }));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',syncCounts,{once:true});
  else syncCounts();
})();
