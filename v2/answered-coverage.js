(function(){
  'use strict';

  const COVERAGE_KEY='ukmlaCoverageStateV1';
  const EVENTS_KEY='ukmlaLearningEventsV1';
  const CANONICAL_KEY='ukmlaAnsweredCoverageStateV2';
  const RECOVERY_KEY='ukmlaAnsweredCoverageRecoveryV3';
  const NOTICE_KEY='ukmlaAnsweredCoverageRecoveryNoticeV3';
  const COVERAGE_VERSION=3;
  const PRIORITY_ORDER=[
    'current_cycle_answered_topic_coverage',
    'lifetime_unanswered_condition',
    'fewer_answers',
    'low_condition_accuracy',
    'answer_recency',
    'presentation_count_tiebreak'
  ];

  let scheduled=false;
  let observer=null;

  function core(){return window.UKMLA_V2;}
  function read(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}
  }
  function write(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}
  }
  function cleanDate(value,fallback){
    const time=new Date(value||'').getTime();
    return Number.isFinite(time)?new Date(time).toISOString():fallback;
  }
  function eventTime(event){
    const value=new Date(event?.at||'').getTime();
    return Number.isFinite(value)?value:null;
  }
  function validIds(rows,allowed){
    return[...new Set((Array.isArray(rows)?rows:[]).filter(id=>allowed.has(id)))].sort();
  }
  function sameIds(left,right){
    if(left.length!==right.length)return false;
    return left.every((value,index)=>value===right[index]);
  }
  function learningEvents(){
    const rows=read(EVENTS_KEY,[]);
    return Array.isArray(rows)?rows:[];
  }
  function answeredEventsAfter(startMs,allowed){
    return learningEvents()
      .filter(event=>event?.kind==='answered'&&event.source!=='knowledge'&&allowed.has(event.conditionId))
      .map(event=>({...event,time:eventTime(event)}))
      .filter(event=>event.time!==null&&event.time>=startMs)
      .sort((a,b)=>a.time-b.time||String(a.id||'').localeCompare(String(b.id||'')));
  }
  function historicalPresentedIds(startMs,endMs,cycle,allowed){
    return validIds(learningEvents()
      .filter(event=>{
        if(event?.kind!=='presented'||event.source==='knowledge'||!allowed.has(event.conditionId))return false;
        const time=eventTime(event);
        if(time===null||time<startMs||time>endMs)return false;
        const recordedCycle=Number(event.coverageCycle);
        return!Number.isFinite(recordedCycle)||recordedCycle===cycle;
      })
      .map(event=>event.conditionId),allowed);
  }
  function coverageRecovery(seed,legacy,canonical,allowed,startedAt,migrationAt,migrationCycle){
    const existing=read(RECOVERY_KEY,null);
    const recovered=new Set(validIds(existing?.historicalCovered,allowed));
    const currentCycle=Number(seed.cycle)||1;
    if(currentCycle===migrationCycle){
      validIds(seed.legacyBaselineCovered,allowed).forEach(id=>recovered.add(id));
      validIds(canonical?.legacyBaselineCovered,allowed).forEach(id=>recovered.add(id));
      if((Number(legacy?.cycle)||1)===currentCycle){
        validIds(legacy?.covered,allowed).forEach(id=>recovered.add(id));
      }
      historicalPresentedIds(
        new Date(startedAt).getTime(),
        new Date(migrationAt).getTime(),
        currentCycle,
        allowed
      ).forEach(id=>recovered.add(id));
    }
    const historicalCovered=[...recovered].sort();
    const next={
      version:3,
      migrationCycle,
      exactAnsweredFrom:migrationAt,
      historicalCovered,
      recoveredAt:existing?.recoveredAt||new Date().toISOString(),
      source:'pre-v2 coverage plus presentation history'
    };
    if(!existing||!sameIds(validIds(existing.historicalCovered,allowed),historicalCovered))write(RECOVERY_KEY,next);
    return next;
  }

  function rebuildCoverage(){
    const api=core();
    if(!api?.App?.loaded||!api.App.conditions?.length)return null;

    const now=new Date().toISOString();
    const fallback={version:1,cycle:1,completedCycles:0,covered:[],startedAt:now};
    const legacy=read(COVERAGE_KEY,fallback);
    const canonical=read(CANONICAL_KEY,null);
    const seed=canonical&&Number(canonical.version)>=2&&canonical.basis==='answered'?canonical:legacy;
    const allowed=new Set(api.App.conditions.map(condition=>condition.id));
    let cycle=Math.max(1,Number(seed.cycle)||1);
    let completedCycles=Math.max(0,Number(seed.completedCycles)||0);
    let startedAt=cleanDate(seed.startedAt,now);
    const migrationAt=cleanDate(
      canonical?.exactAnsweredFrom||canonical?.migratedToAnsweredAt||seed.migratedToAnsweredAt,
      now
    );
    const migrationCycle=Math.max(1,Number(canonical?.migrationCycle||seed.migrationCycle||cycle)||cycle);
    const recovery=coverageRecovery(seed,legacy,canonical,allowed,startedAt,migrationAt,migrationCycle);
    const historical=new Set(validIds(recovery.historicalCovered,allowed));
    let covered=new Set();
    let replayStartMs=new Date(startedAt).getTime();

    if(cycle===migrationCycle){
      historical.forEach(id=>covered.add(id));
      replayStartMs=Math.max(replayStartMs,new Date(migrationAt).getTime()+1);
    }

    if(totalReached())advanceCycle(new Date(migrationAt).getTime()+1);

    for(const event of answeredEventsAfter(replayStartMs,allowed)){
      covered.add(event.conditionId);
      if(totalReached())advanceCycle(event.time+1);
    }

    if(canonical&&Number(canonical.cycle)===cycle){
      validIds(canonical.covered,allowed).forEach(id=>covered.add(id));
      if(totalReached())advanceCycle(Date.now()+1);
    }

    function totalReached(){return allowed.size>0&&covered.size>=allowed.size;}
    function advanceCycle(nextStartMs){
      completedCycles++;
      cycle++;
      covered=new Set();
      startedAt=new Date(Math.max(0,nextStartMs)).toISOString();
      replayStartMs=Math.max(replayStartMs,nextStartMs);
    }

    const coveredIds=[...covered].sort();
    const historicalIds=[...historical].sort();
    const next={
      ...seed,
      version:COVERAGE_VERSION,
      basis:'answered',
      cycle,
      completedCycles,
      covered:coveredIds,
      historicalCovered:historicalIds,
      legacyBaselineCovered:historicalIds,
      legacyBaselineCount:historicalIds.length,
      migrationCycle,
      exactAnsweredFrom:migrationAt,
      migratedToAnsweredAt:canonical?.migratedToAnsweredAt||migrationAt,
      startedAt,
      updatedAt:new Date().toISOString()
    };

    const canonicalIds=validIds(canonical?.covered,allowed);
    const canonicalHistorical=validIds(canonical?.historicalCovered||canonical?.legacyBaselineCovered,allowed);
    const canonicalChanged=!canonical||
      Number(canonical.version)!==COVERAGE_VERSION||
      cycle!==Number(canonical.cycle)||
      completedCycles!==Number(canonical.completedCycles)||
      startedAt!==cleanDate(canonical.startedAt,startedAt)||
      !sameIds(coveredIds,canonicalIds)||
      !sameIds(historicalIds,canonicalHistorical);
    const legacyIds=validIds(legacy?.covered,allowed);
    const legacyChanged=Number(legacy.version)!==COVERAGE_VERSION||legacy.basis!=='answered'||
      cycle!==Number(legacy.cycle)||completedCycles!==Number(legacy.completedCycles)||
      startedAt!==cleanDate(legacy.startedAt,startedAt)||!sameIds(coveredIds,legacyIds);
    if(canonicalChanged)write(CANONICAL_KEY,next);
    if(legacyChanged)write(COVERAGE_KEY,next);
    maybeNotifyRecovery(canonical,next);
    return next;
  }

  function maybeNotifyRecovery(previous,next){
    const before=validIds(previous?.covered,new Set(core().App.conditions.map(condition=>condition.id))).length;
    const after=next.covered.length;
    if(after<=before||after<2||localStorage.getItem(NOTICE_KEY)==='1')return;
    localStorage.setItem(NOTICE_KEY,'1');
    setTimeout(()=>core()?.toast?.(`Restored ${after-before} pre-update condition records. New coverage now requires an answer.`),250);
  }

  function historicalSet(coverage){
    return new Set(Array.isArray(coverage?.historicalCovered)?coverage.historicalCovered:[]);
  }
  function answeredFirstCandidates(items,count,options={}){
    const api=core();
    const source=Array.isArray(items)?items.filter(Boolean):[];
    const limit=Math.max(0,Math.min(Number(count)||0,source.length));
    if(!api||!limit)return[];

    const index=api.eventIndex();
    const coverage=rebuildCoverage()||read(COVERAGE_KEY,{covered:[],historicalCovered:[]});
    const covered=new Set(coverage.covered||[]);
    const historical=historicalSet(coverage);
    const now=Date.now();
    const groups=new Map();
    for(const item of source){
      if(!groups.has(item.topicId))groups.set(item.topicId,[]);
      groups.get(item.topicId).push(item);
    }

    const topicRanks=[...groups.entries()].map(([topicId,group])=>{
      const coveredInTopic=group.filter(item=>covered.has(item.id)).length;
      const lifetimeAnswered=group.filter(item=>historical.has(item.id)||(Number(index.conditionAnswered[item.id]?.answered)||0)>0).length;
      const answerVolume=group.reduce((sum,item)=>sum+effectiveAnswers(item.id,index,historical),0);
      const presentations=group.reduce((sum,item)=>sum+(Number(index.conditionPresented[item.id])||0),0);
      return{
        topicId,group,
        coverageRatio:group.length?coveredInTopic/group.length:1,
        lifetimeAnsweredRatio:group.length?lifetimeAnswered/group.length:1,
        answerRate:group.length?answerVolume/group.length:0,
        health:api.topicProgress(group[0].topic).health,
        presentationRate:group.length?presentations/group.length:0,
        jitter:Math.random()
      };
    }).sort((a,b)=>
      a.coverageRatio-b.coverageRatio||
      a.lifetimeAnsweredRatio-b.lifetimeAnsweredRatio||
      a.answerRate-b.answerRate||
      a.health-b.health||
      a.presentationRate-b.presentationRate||
      a.jitter-b.jitter
    );

    function effectiveAnswers(id,eventIndex,known){
      const answered=Number(eventIndex.conditionAnswered[id]?.answered)||0;
      return answered||(known.has(id)?1:0);
    }
    function rank(group){
      return group.slice().sort((a,b)=>{
        const aa=index.conditionAnswered[a.id]||{};
        const ba=index.conditionAnswered[b.id]||{};
        const aAnswers=effectiveAnswers(a.id,index,historical);
        const bAnswers=effectiveAnswers(b.id,index,historical);
        const aHealth=Number(aa.answered)?Math.round((Number(aa.correct||0)+1)/(Number(aa.answered)+2)*100):50;
        const bHealth=Number(ba.answered)?Math.round((Number(ba.correct||0)+1)/(Number(ba.answered)+2)*100):50;
        const aCovered=covered.has(a.id)?1:0;
        const bCovered=covered.has(b.id)?1:0;
        const aEver=historical.has(a.id)||Number(aa.answered)>0?1:0;
        const bEver=historical.has(b.id)||Number(ba.answered)>0?1:0;
        const aAge=aa.last?now-new Date(aa.last).getTime():Number.MAX_SAFE_INTEGER;
        const bAge=ba.last?now-new Date(ba.last).getTime():Number.MAX_SAFE_INTEGER;
        const aPresented=Number(index.conditionPresented[a.id])||0;
        const bPresented=Number(index.conditionPresented[b.id])||0;
        return aCovered-bCovered||
          aEver-bEver||
          aAnswers-bAnswers||
          aHealth-bHealth||
          bAge-aAge||
          aPresented-bPresented||
          Math.random()-.5;
      });
    }

    const selected=[];
    const used=new Set();
    if(options.uniqueTopics!==false){
      for(const topic of topicRanks){
        const choice=rank(topic.group).find(item=>!used.has(item.id));
        if(choice){selected.push(choice);used.add(choice.id);}
        if(selected.length>=limit)break;
      }
    }
    if(selected.length<limit){
      for(const item of rank(source)){
        if(used.has(item.id))continue;
        selected.push(item);used.add(item.id);
        if(selected.length>=limit)break;
      }
    }
    return selected.slice(0,limit);
  }

  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  function isMigrationCycle(coverage){return Number(coverage?.cycle)===Number(coverage?.migrationCycle)&&Number(coverage?.legacyBaselineCount)>0;}
  function decorate(){
    scheduled=false;
    const api=core();
    if(!api?.App?.loaded)return;
    const coverage=rebuildCoverage();
    if(!coverage)return;
    const restored=isMigrationCycle(coverage);

    if(location.hash===''||location.hash.startsWith('#/home')){
      const stat=document.querySelector('#app .hero-stats .stat:nth-child(2)');
      if(stat){
        setText(stat.querySelector('strong'),`${coverage.covered.length}/${api.App.conditions.length}`);
        setText(stat.querySelector('span'),restored?'restored/answered this cycle':'answered this cycle');
        stat.title=restored?'Pre-update condition coverage was restored once. Every new condition now requires a submitted answer.':'';
      }
    }
    if(location.hash.startsWith('#/quiz')){
      const card=[...document.querySelectorAll('#app .quiz-card')].find(node=>node.querySelector('h2')?.textContent==='Current coverage');
      if(card){
        setText(card.querySelector('.metric-big'),`${coverage.covered.length}/${api.App.conditions.length}`);
        const paragraphs=card.querySelectorAll('p');
        if(paragraphs[0])setText(paragraphs[0],restored
          ?`conditions restored or answered in cycle ${coverage.cycle}; new entries require an answer`
          :`conditions answered in cycle ${coverage.cycle}`);
      }
    }
    if(location.hash.startsWith('#/analytics')){
      const card=[...document.querySelectorAll('#app .metric-card')].find(node=>node.querySelector('h3')?.textContent==='Condition coverage');
      if(card){
        setText(card.querySelector('.metric-big'),`${coverage.covered.length}/${api.App.conditions.length}`);
        setText(card.querySelector('p'),restored
          ?`restored/answered in cycle ${coverage.cycle} · future additions are answer-only`
          :`answered in cycle ${coverage.cycle} · ${coverage.completedCycles||0} complete cycles`);
      }
    }
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(decorate);}

  function patchApi(){
    const api=core();
    if(!api?.App?.loaded)return false;
    if(!api.__answeredCoveragePatched){
      api.__answeredCoveragePatched=true;
      api.coverageState=()=>rebuildCoverage()||{version:COVERAGE_VERSION,basis:'answered',cycle:1,completedCycles:0,covered:[],historicalCovered:[]};
      api.selectCoverageCandidates=answeredFirstCandidates;
      const originalSummary=api.analyticsSummary?.bind(api);
      if(originalSummary){
        api.analyticsSummary=()=>{
          const coverage=rebuildCoverage();
          const index=api.eventIndex();
          const answered=new Set(index.answers.filter(event=>event.source!=='knowledge').map(event=>event.conditionId));
          const historical=historicalSet(coverage);
          return originalSummary()
            .replace(/Conditions tested:.*(?:\n|$)/,`Conditions answered or historically restored: ${new Set([...answered,...historical]).size}/${api.App.conditions.length}\n`)
            .replace(/Current cycle covered:/g,'Current cycle answered/restored:')
            .replace(/SCHEDULER PRIORITIES[\s\S]*$/,[
              'SCHEDULER PRIORITIES',
              '1. Lowest proportion of conditions answered in the current cycle.',
              '2. Lowest lifetime proportion of conditions ever answered or restored.',
              '3. Conditions never answered, then those answered least often.',
              '4. Lower condition accuracy and older last answers.',
              '5. Presentation count only breaks otherwise close ties.'
            ].join('\n'));
        };
      }
    }
    const ai=window.UKMLA_V2_AI_ENGINE;
    if(ai&&!ai.__answeredCoveragePatched){
      ai.__answeredCoveragePatched=true;
      const originalRun=ai.runPipeline.bind(ai);
      ai.runPipeline=async config=>{
        const set=await originalRun(config);
        if(!config?.knowledge&&set?.schedulerSnapshot){
          set.schedulerSnapshot.coverageBasis='answered_with_restored_legacy_baseline';
          set.schedulerSnapshot.priorityOrder=[...PRIORITY_ORDER];
        }
        return set;
      };
    }
    return true;
  }

  function initialise(){
    if(!patchApi()){setTimeout(initialise,100);return;}
    rebuildCoverage();
    const app=document.getElementById('app');
    if(app){observer=new MutationObserver(schedule);observer.observe(app,{childList:true,subtree:true});}
    document.addEventListener('ukmlaLearningEvent',()=>{rebuildCoverage();schedule();});
    document.addEventListener('ukmlaRemoteDataImported',()=>{rebuildCoverage();schedule();});
    window.addEventListener('hashchange',schedule);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();

  window.UKMLA_ANSWERED_COVERAGE={
    rebuildCoverage,
    selectCoverageCandidates:answeredFirstCandidates,
    historicalSet:()=>historicalSet(rebuildCoverage()),
    PRIORITY_ORDER
  };
})();
