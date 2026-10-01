(function(){
  'use strict';

  // Retain the existing entry point: all atlas builders use this selector.
  // Source cards are returned unchanged; question construction remains downstream.
  const POLICY='adaptive-card-priority-v1';
  const DAY=86400000;
  const REVIEW_DAYS=[1,3,7,14,30,60];
  const PRIORITY_ORDER=['unresolved_errors','protected_unanswered_coverage','due_spaced_review','not_due_only_if_pool_exhausted'];
  let patched=false;
  function core(){return window.UKMLA_V2;}

  function profiles(items,now=Date.now()){
    const api=core();
    const index=api.eventIndex();
    const allowed=new Set(items.map(item=>item.id));
    const byId=new Map();
    const seenEvents=new Set();
    for(const event of api.events?.()||index.answers||[]){
      if(event?.kind!=='answered'||event.source==='knowledge'||!allowed.has(event.conditionId))continue;
      if(event.id&&seenEvents.has(event.id))continue;
      if(event.id)seenEvents.add(event.id);
      if(!byId.has(event.conditionId))byId.set(event.conditionId,[]);
      byId.get(event.conditionId).push(event);
    }
    return items.map(item=>{
      const rows=(byId.get(item.id)||[]).slice().sort((a,b)=>(Date.parse(a.at)||0)-(Date.parse(b.at)||0));
      const aggregate=index.conditionAnswered[item.id]||{};
      const answered=rows.length||Number(aggregate.answered)||0;
      const correct=rows.length?rows.filter(row=>row.correct===true).length:Number(aggregate.correct)||0;
      const last=Date.parse(rows.at(-1)?.at||aggregate.last)||0;
      let streak=0;
      for(let i=rows.length-1;i>=0&&rows[i].correct===true;i--)streak++;
      const hasError=rows.some(row=>row.correct===false)||(!rows.length&&correct<answered);
      const latestWrong=rows.length?rows.at(-1).correct===false:hasError;
      // A single correct response after an error is provisional recovery.
      // Two consecutive correct responses move the card to spaced review.
      const weak=answered>0&&(latestWrong||(hasError&&streak<2));
      const interval=REVIEW_DAYS[Math.min(Math.max(streak||1,1)-1,REVIEW_DAYS.length-1)]*DAY;
      const dueAt=last?last+interval:0;
      const recent=rows.slice(-5);
      const recentAccuracy=recent.length?recent.filter(row=>row.correct===true).length/recent.length:answered?correct/answered:0;
      return{item,answered,last,streak,latestWrong,weak,dueAt,recentAccuracy,
        presented:Number(index.conditionPresented[item.id])||0,
        bucket:!answered?'unanswered':weak?'weak':now>=dueAt?'due':'not_due'};
    });
  }

  function select(items,count,options={},coverageSelector){
    const source=[...new Map((Array.isArray(items)?items:[]).filter(item=>item?.id).map(item=>[item.id,item])).values()];
    const limit=Math.max(0,Math.min(Math.floor(Number(count)||0),source.length));
    if(!limit)return[];
    const api=core();
    const now=Date.now();
    const rows=profiles(source,now);
    const pools={weak:[],unanswered:[],due:[],not_due:[]};
    rows.forEach(row=>pools[row.bucket].push(row));
    // Oldest unresolved mistakes rotate ahead of recently retested mistakes.
    // A previous wrong answer remains weak across coverage-cycle resets.
    pools.weak.sort((a,b)=>Number(b.latestWrong)-Number(a.latestWrong)||a.last-b.last||a.recentAccuracy-b.recentAccuracy||a.presented-b.presented||a.item.id.localeCompare(b.item.id));
    pools.due.sort((a,b)=>a.dueAt-b.dueAt||a.recentAccuracy-b.recentAccuracy||a.item.id.localeCompare(b.item.id));
    pools.not_due.sort((a,b)=>a.dueAt-b.dueAt||a.item.id.localeCompare(b.item.id));
    const unseenOrder=coverageSelector(pools.unanswered.map(row=>row.item),pools.unanswered.length,options);
    const unseenRank=new Map(unseenOrder.map((item,i)=>[item.id,i]));
    pools.unanswered.sort((a,b)=>(unseenRank.get(a.item.id)??Infinity)-(unseenRank.get(b.item.id)??Infinity));

    const selected=[];
    const chosen=new Set();
    const topicCounts=new Map();
    const reasons=[];
    function take(bucket,amount){
      const pool=pools[bucket];
      for(let i=0;i<amount&&pool.length&&selected.length<limit;i++){
        // Topic diversity only breaks equivalent clinical-priority ties.
        let pick=0;
        if(options.uniqueTopics!==false&&bucket==='weak'){
          const first=pool[0];
          const day=Math.floor(first.last/DAY);
          for(let j=1;j<pool.length;j++){
            const other=pool[j];
            if(other.latestWrong!==first.latestWrong||Math.floor(other.last/DAY)!==day)break;
            if((topicCounts.get(other.item.topicId)||0)<(topicCounts.get(pool[pick].item.topicId)||0))pick=j;
          }
        }
        const row=pool.splice(pick,1)[0];
        if(chosen.has(row.item.id)){i--;continue;}
        chosen.add(row.item.id);selected.push(row.item);
        topicCounts.set(row.item.topicId,(topicCounts.get(row.item.topicId)||0)+1);
        reasons.push({conditionId:row.item.id,reason:bucket,lastAnsweredAt:row.last?new Date(row.last).toISOString():null});
      }
    }
    // 6 weak + 3 unanswered + 1 due per ten when all categories exist.
    // Missing categories backfill weak/unanswered before any not-due cards.
    const weakTarget=Math.ceil(limit*.6);
    const newTarget=Math.floor(limit*.3);
    take('weak',weakTarget);
    take('unanswered',newTarget);
    take('due',limit-weakTarget-newTarget);
    for(const bucket of ['weak','unanswered','due','not_due'])take(bucket,limit-selected.length);

    // Spread categories through 20/30 builds (each ten is a separate pipeline).
    // This changes order only; target objects, fields and IDs remain intact.
    const ordered=[];
    const queues={weak:[],unanswered:[],due:[],not_due:[]};
    const byReason=new Map(reasons.map(row=>[row.conditionId,row.reason]));
    selected.forEach(item=>queues[byReason.get(item.id)].push(item));
    const pattern=['weak','unanswered','weak','weak','unanswered','weak','due','weak','unanswered','weak'];
    while(ordered.length<selected.length){
      for(const preferred of pattern){
        const bucket=queues[preferred].length?preferred:['weak','unanswered','due','not_due'].find(key=>queues[key].length);
        if(!bucket)break;
        ordered.push(queues[bucket].shift());
      }
    }
    api.adaptiveSelectionSnapshot={policy:POLICY,selectedAt:new Date(now).toISOString(),priorityOrder:[...PRIORITY_ORDER],
      counts:Object.fromEntries(Object.keys(pools).map(key=>[key,reasons.filter(row=>row.reason===key).length])),
      targets:ordered.map(item=>reasons.find(row=>row.conditionId===item.id))};
    return ordered;
  }

  function install(){
    const api=core();
    if(!api?.App?.loaded||!window.UKMLA_ANSWERED_COVERAGE||patched){if(!patched)setTimeout(install,100);return;}
    const original=api.selectCoverageCandidates?.bind(api);
    if(typeof original!=='function'){setTimeout(install,100);return;}
    api.selectCoverageCandidates=(items,count,options={})=>select(items,count,options,original);
    const summary=api.analyticsSummary?.bind(api);
    if(summary)api.analyticsSummary=()=>summary().replace(/SCHEDULER PRIORITIES[\s\S]*$/,
      'SCHEDULER PRIORITIES\n1. Unresolved wrong answers (two consecutive correct answers graduate to spaced review).\n2. Protected coverage of cards with no recorded answers.\n3. Due reviews at 1, 3, 7, 14, 30 and 60 days as correct streaks grow.\n4. Not-due correct cards only when the eligible pool cannot fill the set.\nTypical mix: 60% weak, 30% unanswered, 10% due; unused slots prioritise weak and unanswered cards.');
    patched=true;
    window.UKMLA_COVERAGE_SOFT_DIVERSITY={policy:POLICY};
  }
  window.UKMLA_ADAPTIVE_SELECTION={policy:POLICY,priorityOrder:PRIORITY_ORDER,profiles,reviewDays:REVIEW_DAYS};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
