(function(){
  'use strict';
  if(window.__UKMLA_LEARNING_TYPE_NORMALIZER__)return;
  window.__UKMLA_LEARNING_TYPE_NORMALIZER__=true;

  const KEY='ukmlaLearningEventsV1';
  const LABELS={
    sparse_most_likely_diagnosis:'Sparse presentation: most likely diagnosis',
    close_mimic_discrimination:'Close-mimic discrimination',
    first_line_investigation:'First-line investigation',
    dangerous_diagnosis_priority_exclusion:'Dangerous diagnosis: priority exclusion',
    next_step_after_initial_result:'Next step after an initial result',
    immediate_emergency_management:'Immediate emergency management',
    stable_first_line_treatment:'Standard first-line treatment',
    contraindication_caveat_switch:'Contraindication or caveat switch',
    failure_or_deterioration:'Failure or deterioration',
    escalation_referral_disposition:'Escalation, referral or disposition'
  };
  function normalise(){
    let events;try{events=JSON.parse(localStorage.getItem(KEY)||'[]')||[];}catch(_){return;}
    let changed=false;
    events.forEach(event=>{const label=LABELS[event.questionType];if(label&&event.questionTypeLabel!==label){event.questionTypeLabel=label;changed=true;}});
    if(changed){localStorage.setItem(KEY,JSON.stringify(events));setTimeout(()=>window.UKMLA_LEARNING?.refresh(),0);}
  }
  document.addEventListener('ukmlaLearningEvent',normalise);
  document.addEventListener('ukmlaRemoteDataImported',normalise);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',normalise,{once:true});else normalise();
})();
