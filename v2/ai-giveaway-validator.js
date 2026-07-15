(function(){
'use strict';

const schema=window.UKMLA_V2_AI_SCHEMA;
if(!schema||schema.__giveawayValidator)return;
schema.__giveawayValidator=true;

const CHECK_STAGES=new Set(['options','category','options_category','distractors','source','final']);
const STOP_WORDS=new Set([
  'a','an','the','and','or','of','to','in','on','at','for','from','by','is','are','was','were','be','been','being',
  'this','that','these','those','his','her','their','its','as','into','over','under','after','before','following',
  'patient','adult','man','woman','child','year','years','old','presents','presenting','develops','developed','shows',
  'which','what','most','likely','best','single','select','answer','option','appropriate','clinical','finding','findings'
]);
const LOW_INFORMATION=new Set([
  'injury','condition','disease','syndrome','diagnosis','nerve','artery','vein','muscle','fracture','lesion','deficit',
  'treatment','management','investigation','test','response','mechanism','weakness','sensoryloss','pain','loss','abnormality'
]);
const TOKEN_ALIASES={
  numb:'sensoryloss',numbness:'sensoryloss',paraesthesia:'sensoryloss',paresthesia:'sensoryloss',
  hypoaesthesia:'sensoryloss',hypoesthesia:'sensoryloss',anaesthesia:'sensoryloss',anesthesia:'sensoryloss',
  weak:'weakness',weakened:'weakness',paresis:'weakness',paralysis:'weakness',power:'weakness',
  dyspnoea:'breathlessness',dyspnea:'breathlessness',breathless:'breathlessness',
  pyrexia:'fever',febrile:'fever',hypotensive:'hypotension',tachycardic:'tachycardia',
  haematuria:'hematuria',haemoptysis:'hemoptysis',haematemesis:'hematemesis',
  fractured:'fracture',fractures:'fracture',affects:'affect',affected:'affect',affecting:'affect',
  causes:'cause',caused:'cause',causing:'cause',produces:'produce',produced:'produce',producing:'produce'
};
const CONCEPT_LABELS={
  concept_shoulder_abduction:'shoulder abduction',
  concept_lateral_shoulder_sensation:'lateral-shoulder sensation',
  concept_wrist_extension:'wrist extension',
  concept_dorsal_first_web_hand:'dorsal first-web-space sensation',
  concept_elbow_flexion:'elbow flexion',
  concept_lateral_forearm_sensation:'lateral-forearm sensation',
  concept_finger_abduction:'finger abduction',
  concept_ulnar_hand_sensation:'ulnar-hand sensation',
  concept_thumb_opposition:'thumb opposition',
  concept_median_hand_sensation:'median-hand sensation',
  concept_foot_dorsiflexion:'foot dorsiflexion',
  concept_first_web_foot:'first-web-space foot sensation',
  concept_plantarflexion:'plantarflexion',
  concept_sole_sensation:'sole sensation',
  concept_surgical_neck_humerus:'surgical-neck humerus',
  concept_humeral_shaft:'humeral shaft',
  concept_fibular_neck:'fibular neck'
};
const PHRASE_RULES=[
  ['concept_lateral_shoulder_sensation',[
    /\bregimental[- ]patch\b/g,/\bbadge[- ]patch\b/g,/\blateral shoulder(?: sensation| sensory loss| numbness)?\b/g,
    /\bupper lateral arm(?: sensation| sensory loss| numbness)?\b/g,/\bsuperolateral arm(?: sensation| sensory loss| numbness)?\b/g
  ]],
  ['concept_shoulder_abduction',[
    /\bdeltoid(?: muscle)?(?: weakness| paralysis| wasting| dysfunction)?\b/g,
    /\b(?:weakness|weak|loss) (?:of )?(?:shoulder |arm )?abduction\b/g,/\bunable to abduct(?: the)? arm\b/g,
    /\b(?:shoulder|arm) abduction(?: weakness| loss)?\b/g
  ]],
  ['concept_wrist_extension',[
    /\bwrist drop\b/g,/\b(?:weakness|weak|loss) (?:of )?wrist extension\b/g,/\bunable to extend(?: the)? wrist\b/g
  ]],
  ['concept_dorsal_first_web_hand',[
    /\b(?:dorsal )?first web[- ]space(?: of the hand)?(?: sensation| sensory loss| numbness)?\b/g
  ]],
  ['concept_elbow_flexion',[
    /\bbiceps(?: weakness| paralysis| wasting)?\b/g,/\b(?:weakness|weak|loss) (?:of )?elbow flexion\b/g,/\belbow flexion(?: weakness| loss)?\b/g
  ]],
  ['concept_lateral_forearm_sensation',[
    /\blateral forearm(?: sensation| sensory loss| numbness)?\b/g,/\blateral antebrachial(?: sensation| sensory loss)?\b/g
  ]],
  ['concept_finger_abduction',[
    /\bfinger abduction(?: weakness| loss)?\b/g,/\binterossei?(?: weakness| wasting| paralysis)?\b/g,/\bcard test\b/g
  ]],
  ['concept_ulnar_hand_sensation',[
    /\blittle finger(?: sensation| sensory loss| numbness)?\b/g,/\bulnar one and a half (?:digits|fingers)\b/g,
    /\bmedial one and a half (?:digits|fingers)\b/g
  ]],
  ['concept_thumb_opposition',[
    /\bthumb opposition(?: weakness| loss)?\b/g,/\bthenar(?: weakness| wasting| paralysis)?\b/g
  ]],
  ['concept_median_hand_sensation',[
    /\blateral three and a half (?:digits|fingers)\b/g,/\bradial three and a half (?:digits|fingers)\b/g
  ]],
  ['concept_foot_dorsiflexion',[
    /\bfoot drop\b/g,/\b(?:weakness|weak|loss) (?:of )?(?:ankle |foot )?dorsiflexion\b/g,/\bunable to dorsiflex(?: the)? foot\b/g
  ]],
  ['concept_first_web_foot',[
    /\bfirst (?:dorsal )?web[- ]space(?: of the foot)?(?: sensation| sensory loss| numbness)?\b/g
  ]],
  ['concept_plantarflexion',[
    /\b(?:weakness|weak|loss) (?:of )?(?:ankle |foot )?plantarflexion\b/g,/\bunable to stand on tiptoes\b/g,/\bplantarflexion(?: weakness| loss)?\b/g
  ]],
  ['concept_sole_sensation',[
    /\bsole(?: of the foot)?(?: sensation| sensory loss| numbness)?\b/g,/\bplantar surface(?: sensation| sensory loss| numbness)?\b/g
  ]],
  ['concept_surgical_neck_humerus',[
    /\bsurgical neck(?: of the humerus)?(?: fracture)?\b/g,/\bproximal humer(?:us|al)(?: fracture)?\b/g
  ]],
  ['concept_humeral_shaft',[
    /\b(?:mid[- ]?)?shaft of the humerus\b/g,/\b(?:mid[- ]?)?humeral shaft(?: fracture)?\b/g
  ]],
  ['concept_fibular_neck',[
    /\bneck of (?:the )?fibula\b/g,/\bfibular neck(?: fracture)?\b/g
  ]]
];
const EXPLANATORY_PATTERN=/\b(?:caus(?:e|es|ed|ing)|affect(?:s|ed|ing)?|characteri[sz](?:e|es|ed|ing) by|associated with|leading to|resulting in|producing|manifesting as|presenting with|which (?:causes?|affects?|produces?|results?))\b/i;

const baseValidate=schema.validate;

function plain(value){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[–—]/g,'-');
}

function canonicalText(value){
  let text=` ${plain(value)} `;
  for(const [concept,patterns] of PHRASE_RULES){
    for(const pattern of patterns)text=text.replace(pattern,` ${concept} `);
  }
  return text;
}

function stemToken(token){
  if(!token||token.startsWith('concept_'))return token;
  if(TOKEN_ALIASES[token])return TOKEN_ALIASES[token];
  if(token.length>5&&token.endsWith('ies'))return`${token.slice(0,-3)}y`;
  if(token.length>5&&token.endsWith('ing'))return token.slice(0,-3);
  if(token.length>4&&token.endsWith('ed'))return token.slice(0,-2);
  if(token.length>4&&token.endsWith('es'))return token.slice(0,-2);
  if(token.length>3&&token.endsWith('s'))return token.slice(0,-1);
  return token;
}

function tokens(value){
  return canonicalText(value)
    .replace(/[^a-z0-9_]+/g,' ')
    .trim()
    .split(/\s+/)
    .map(stemToken)
    .filter(token=>token&&!STOP_WORDS.has(token));
}

function unique(values){return[...new Set(values)];}
function tokenWeight(token){return token.startsWith('concept_')?3:(LOW_INFORMATION.has(token)?0.25:1);}
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  if(!sorted.length)return 0;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}
function longestCommonRun(left,right){
  let best=0;
  const row=new Array(right.length+1).fill(0);
  for(let i=1;i<=left.length;i++){
    for(let j=right.length;j>=1;j--){
      row[j]=left[i-1]===right[j-1]?row[j-1]+1:0;
      if(row[j]>best)best=row[j];
    }
  }
  return best;
}
function readableShared(shared){
  const concepts=shared.filter(token=>token.startsWith('concept_')).map(token=>CONCEPT_LABELS[token]||token.replace(/^concept_/,'').replaceAll('_',' '));
  if(concepts.length)return concepts.slice(0,3);
  return shared.filter(token=>!LOW_INFORMATION.has(token)).slice(0,4);
}

function analyseOption(question,option,allOptions){
  const stemTokens=tokens(question?.stem);
  const optionTokens=tokens(option?.text);
  const stemSet=new Set(stemTokens);
  const optionSet=new Set(optionTokens);
  const shared=unique(optionTokens.filter(token=>stemSet.has(token)));
  const specificShared=shared.filter(token=>token.startsWith('concept_'));
  const meaningfulShared=shared.filter(token=>token.startsWith('concept_')||!LOW_INFORMATION.has(token));
  const optionWeight=[...optionSet].reduce((sum,token)=>sum+tokenWeight(token),0)||1;
  const sharedWeight=shared.reduce((sum,token)=>sum+tokenWeight(token),0);
  const coverage=sharedWeight/optionWeight;
  const commonRun=longestCommonRun(stemTokens,optionTokens);
  const correct=option?.id===question?.correctOptionId;
  const optionWords=schema.wordCount?schema.wordCount(option?.text):String(option?.text||'').trim().split(/\s+/).filter(Boolean).length;
  const otherWords=(allOptions||[]).filter(item=>item!==option).map(item=>schema.wordCount?schema.wordCount(item?.text):String(item?.text||'').trim().split(/\s+/).filter(Boolean).length);
  const otherMedian=median(otherWords);
  const uniquelyDetailed=correct&&optionWords>=6&&optionWords>=otherMedian+3&&optionWords>=otherMedian*1.6;
  const explanatory=EXPLANATORY_PATTERN.test(String(option?.text||''));

  const semanticBundle=specificShared.length>=2;
  const strongDirect=optionSet.size>=4&&meaningfulShared.length>=3&&coverage>=0.58;
  const repeatedPhrase=commonRun>=3&&meaningfulShared.length>=3;
  const correctParaphrase=correct&&meaningfulShared.length>=3&&coverage>=0.46;
  const explanatoryBundle=explanatory&&(specificShared.length>=1||meaningfulShared.length>=2||uniquelyDetailed);
  const uniquelyExplanatory=correct&&explanatory&&optionWords>=5&&uniquelyDetailed;
  const flagged=semanticBundle||strongDirect||repeatedPhrase||correctParaphrase||explanatoryBundle||uniquelyExplanatory;

  return{
    optionId:option?.id||'?',correct,flagged,coverage,commonRun,shared,specificShared,meaningfulShared,
    explanatory,uniquelyDetailed,optionWords,otherMedian,labels:readableShared(shared)
  };
}

function analyseQuestion(question){
  const options=Array.isArray(question?.options)?question.options:[];
  const analyses=options.map(option=>analyseOption(question,option,options));
  const flagged=analyses.filter(item=>item.flagged).sort((a,b)=>Number(b.correct)-Number(a.correct)||b.coverage-a.coverage);
  return{flagged,analyses};
}

function giveawayErrors(set,stage='final'){
  if(!CHECK_STAGES.has(stage))return[];
  const errors=[];
  (set?.questions||[]).forEach((question,index)=>{
    const result=analyseQuestion(question);
    if(!result.flagged.length)return;
    const primary=result.flagged[0];
    const subject=primary.correct?'correct option':'option';
    const shared=primary.labels.length?` Shared clues: ${primary.labels.join(', ')}.`:'';
    const detail=primary.explanatory||primary.uniquelyDetailed?' It is an explanatory clue bundle rather than a short answer label.':'';
    errors.push(`Q${index+1}: ${subject} ${primary.optionId} repeats or paraphrases stem clues.${shared}${detail}`);
  });
  return errors;
}

schema.validate=function(set,config,stage='final'){
  const errors=baseValidate(set,config,stage);
  return[...new Set([...errors,...giveawayErrors(set,stage)])];
};

Object.assign(schema,{
  GIVEAWAY_CHECK_STAGES:CHECK_STAGES,
  analyseGiveawayQuestion:analyseQuestion,
  giveawayErrors,
  giveawayTokens:tokens
});
})();
