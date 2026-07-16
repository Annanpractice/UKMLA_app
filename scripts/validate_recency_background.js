const fs=require('fs');
const vm=require('vm');

function assert(condition,message){if(!condition)throw new Error(message);}

const events=[];
const attempts=[];
const core={
  events:()=>events,
  escapeHtml:value=>String(value??''),
  analyticsSummary:()=>'',
  App:{topics:[]}
};
const bank={completedAttempts:()=>attempts,sourceLabel:value=>value};
const document={
  readyState:'loading',
  addEventListener(){},
  getElementById(){return null;},
  createElement(){return{style:{},appendChild(){}};},
  head:{appendChild(){}},
  querySelector(){return null;},
  querySelectorAll(){return[];}
};
const context={
  window:{UKMLA_V2:core,UKMLA_QUESTION_BANK:bank,addEventListener(){}},
  document,
  location:{hash:'#/home'},
  requestAnimationFrame:fn=>fn(),
  setTimeout:()=>0,
  MutationObserver:class{observe(){}},
  console,Date,JSON,Math,Map,Set,Array,String,Number,Boolean,RegExp,Error
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('v2/question-analytics.js','utf8'),context,{filename:'v2/question-analytics.js'});
const analytics=context.window.UKMLA_QUESTION_ANALYTICS;
assert(analytics,'Recency analytics module did not initialise.');
assert(analytics.RECENT_QUESTION_WINDOW===30,'Recent-question window is not 30.');
assert(analytics.TREND_BLOCK_SIZE===10,'Improvement milestone is not ten questions.');
assert(analytics.RUN_CHART_SET_GROUP===5,'Run-chart aggregation is not five sets.');

function event(index,correct,topicId='topic-a'){
  return{kind:'answered',source:'ai',topicId,topicName:'Topic A',correct,at:`2026-07-${String(Math.floor(index/24)+1).padStart(2,'0')}T${String(index%24).padStart(2,'0')}:00:00.000Z`};
}
const improved=[...Array.from({length:30},(_,index)=>event(index,false)),...Array.from({length:30},(_,index)=>event(index+30,true))];
const deteriorated=[...Array.from({length:30},(_,index)=>event(index,true)),...Array.from({length:30},(_,index)=>event(index+30,false))];
const improvedScore=analytics.weightedPerformance(improved).percent;
const deterioratedScore=analytics.weightedPerformance(deteriorated).percent;
assert(improvedScore>=80,`Latest 30 correct answers were not weighted heavily enough: ${improvedScore}%`);
assert(deterioratedScore<=20,`Latest 30 wrong answers were not weighted heavily enough: ${deterioratedScore}%`);
assert(improvedScore-deterioratedScore>=60,'Older answers retained too much influence after the 30-question boundary.');

const trendRows=[
  ...Array.from({length:10},(_,index)=>event(index,index<4)),
  ...Array.from({length:10},(_,index)=>event(index+10,index<8))
];
const trend=analytics.completedTenTrend(trendRows);
assert(trend&&trend.milestone===20,'Ten-question topic milestone was not detected.');
assert(trend.latestCorrect===8&&trend.priorCorrect===4,'Trend blocks did not use the latest two complete groups of ten.');
assert(trend.delta>0,'Improvement over the latest ten questions did not produce a positive points badge.');

for(let index=0;index<12;index++)attempts.push({
  attemptId:`attempt-${index+1}`,
  setId:`set-${index+1}`,
  sourceType:'ai',
  title:'Mixed UKMLA',
  questionCount:10,
  correctCount:index<5?30/5:index<10?40/5:9,
  percent:0,
  completedAt:`2026-07-${String(index+1).padStart(2,'0')}T10:00:00.000Z`,
  updatedAt:`2026-07-${String(index+1).padStart(2,'0')}T10:00:00.000Z`
});
const groups=analytics.aggregateAttempts(attempts);
assert(groups.length===2,'Twelve sets should create two complete five-set run-chart blocks.');
assert(groups.every(group=>group.setCount===5&&group.questionCount===50),'Run-chart points are not exact five-set / 50-question aggregates.');
assert(groups[0].correctCount===30&&groups[1].correctCount===40,'Run-chart aggregation changed the block totals.');
assert(analytics.chartSvg(attempts).includes('Median'),'Aggregated run chart omitted its median line.');
assert(analytics.runChartCsv().includes('block_number,first_completed_at,last_completed_at'),'Aggregated CSV schema is missing.');

const ui=fs.readFileSync('v2/ai-ui.js','utf8');
for(const required of [
  'activeBuildPromise',
  'workspaceMounted',
  'Generation continues while you use Home, Cards, Focus or Analytics',
  'completedSet',
  "document.visibilityState==='visible'",
  'Generation running in background',
  'resume the saved checkpoint with the API key'
])assert(ui.includes(required),`Background generation UI omitted: ${required}`);
assert(!ui.includes('AbortController'),'Background generation introduced an abort path.');

const html=fs.readFileSync('v2/app.html','utf8');
assert(html.includes('question-analytics.js?v=2'),'Recency analytics asset version is missing.');
assert(html.includes('ai-ui.js?v=4'),'Stable AI UI asset path changed unexpectedly.');
const serviceWorker=fs.readFileSync('service-worker.js','utf8');
assert(serviceWorker.includes('ukmla-cards-v12-recency-background-generation'),'Service-worker cache was not advanced for this release.');

console.log(JSON.stringify({
  latestThirtyCorrectScore:improvedScore,
  latestThirtyWrongScore:deterioratedScore,
  tenQuestionImprovementPoints:trend.delta,
  runChartBlocks:groups.length,
  questionsPerRunChartBlock:groups[0].questionCount,
  inAppBackgroundGeneration:true,
  mobileResumeCheckpoint:true
},null,2));