(function(){
'use strict';
if(!window.__UKMLA_AI_BEFORE_JARVIS__)window.__UKMLA_AI_BEFORE_JARVIS__=window.UKMLA_V2_AI||null;
if(!document.querySelector('script[data-ukmla-question-importer]')){
  const script=document.createElement('script');
  script.src='./v2/question-importer.js';
  script.defer=true;
  script.dataset.ukmlaQuestionImporter='1';
  document.head.appendChild(script);
}
})();