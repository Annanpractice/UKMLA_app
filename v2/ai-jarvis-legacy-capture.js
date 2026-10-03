(function(){
'use strict';
if(!window.__UKMLA_AI_BEFORE_JARVIS__)window.__UKMLA_AI_BEFORE_JARVIS__=window.UKMLA_V2_AI||null;
function load(src,marker){
  if(document.querySelector(`script[${marker}]`))return;
  const script=document.createElement('script');
  script.src=src;
  script.defer=true;
  script.setAttribute(marker,'1');
  document.head.appendChild(script);
}
load('./v2/question-importer.js','data-ukmla-question-importer');
load('./v2/question-importer-progress.js','data-ukmla-question-import-progress');
})();