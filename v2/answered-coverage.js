(function(){
  'use strict';

  const COVERAGE_KEY='ukmlaCoverageStateV1';
  const EVENTS_KEY='ukmlaLearningEventsV1';
  const CANONICAL_KEY='ukmlaAnsweredCoverageStateV2';
  const COVERAGE_VERSION=2;
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
  function sameIds(left,right){
    if(left.length!==right.length)return false;
    return left.every((value,index)=>value===right[index]);
  }
  function answeredEventsAfter(startMs,validIds){
    return read(EVENTS_KEY,[])
      .filter(event=>event?.kind==='answered'&&event.source!=='knowledge'&&validIds.has(event.conditionId))
      .map(event=>({...event,time:new Date(event.at||'').getTime()}))
      .filter(event=>Number.isFinite(event.time)&&event.time>=startMs)
      .sort((a,b)=>a.time-b.time||String(a.id||'').localeCompare(String(b.id||'')));
  }

  function rebuildCoverage(){
    const api=core();
    if(!api?.App?.loaded||!api.App.conditions?.length)return null;

    const now=new Date().toISOString();
    const fallback={version:COVERAGE_VERSION,basis:'answered',cycle:1,completedCycles:0,covered:[],startedAt:now};
    const legacy=read(COVERAGE_KEY,fallback);
    const canonical=read(CANONICAL_KEY,null);
    const seed=canonical&&Number(canonical.version)===COVERAGE_VERSION&&canonical.basis==='answered'
      ?canonical
      :legacy;
    let cycle=Math.max(1,Number(seed.cycle)||1);
    let completedCycles=Math.max(0,Number(seed.completedCycles)||0);
    let startedAt=cleanDate(seed.startedAt,now);
    let startMs=new Date(startedAt).getTime();
    const validIds=new Set(api.App.conditions.map(condition=>condition.id));
    const covered=new Set();
    const total=validIds.size;
    let lastAnswerAt=null;

    for(const event of answeredEventsAfter(startMs,validIds)){
      covered.add(event.conditionId);
      lastAnswerAt=event.at||new Date(event.time).toISOString();
      if(total&&covered.size>=total){
        completedCycles++;
        cycle++;
        covered.clear();
        startMs=Math.max(Date.now(),event.time+1);
        startedAt=new Date(startMs).toISOString();
        lastAnswerAt=null;
      }
    }

    const coveredIds=[...covered].sort();
    const next={
      ...seed,
      version:COVERAGE_VERSION,
      basis:'answered',
      cycle,
      completedCycles,
      covered:coveredIds,
      startedAt,
      updatedAt:lastAnswerAt||seed.updatedAt||startedAt
    };
    if(!canonical&&!next.migratedToAnsweredAt)next.migratedToAnsweredAt=now;

    const canonicalIds=(Array.isArray(canonical?.covered)?canonical.covered:[]).filter(id=>validIds.has(id)).sort();
    const canonicalChanged=!canonical||cycle!==Number(canonical.cycle)||completedCycles!==Number(canonical.completedCycles)||startedAt!==cleanDate(canonical.startedAt,startedAt)||!sameIds(coveredIds,canonicalIds);
    const legacyIds=(Array.isArray(legacy.covered)?legacy.covered:[]).filter(id=>validIds.has(id)).sort();
    const legacyChanged=Number(legacy.version)!==COVERAGE_VERSION||legacy.basis!=='answered'||cycle!==Number(legacy.cycle)||completedCycles!==Number(legacy.completedCycles)||startedAt!==cleanDate(legacy.startedAt,startedAt)||!sameIds(coveredIds,legacyIds);
    if(canonicalChanged)write(CANONICAL_KEY,next);
    if(legacyChanged)write(COVERAGE_KEY,next);
    return next;
  }

  function answeredFirstCandidates(items,count,options={}){
    const api=core();
    const source=Array.isArray(items)?items.filter(Boolean):[];
    const limit=Math.max(0,Math.min(Number(count)||0,source.length));
    if(!api||!limit)return[];

    const index=api.eventIndex();
    const coverage=rebuildCoverage()||read(COVERAGE_KEY,{covered:[]});
    const covered=new Set(coverage.covered||[]);
    const now=Date.now();
    const groups=new Map();

    for(const item of source){
      if(!groups.has(item.topicId))groups.set(item.topicId,[]);
      groups.get(item.topicId).push(item);
    }

    const topicRanks=[...groups.entries()].map(([topicId,group])=>{
      const coveredInTopic=group.filter(item=>covered.has(item.id)).length;
      const lifetimeAnswered=group.filter(item=>Number(index.conditionAnswered[item.id]?.answered)||0).length;
      const answerVolume=group.reduce((sum,item)=>sum+(Number(index.conditionAnswered[item.id]?.answered)||0),0);
      const presentations=group.reduce((sum,item)=>sum+(Number(index.conditionPresented[item.id])||0),0);
      return{
        topicId,
        group,
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

    function rank(group){
      return group.slice().sort((a,b)=>{
        const aa=index.conditionAnswered[a.id]||{};
        const ba=index.conditionAnswered[b.id]||{};
        const aAnswers=Number(aa.answered)||0;
        const bAnswers=Number(ba.answered)||0;
        const aHealth=aAnswers?Math.round((Number(aa.correct||0)+1)/(aAnswers+2)*100):50;
        const bHealth=bAnswers?Math.round((Number(ba.correct||0)+1)/(bAnswers+2)*100):50;
        const aCovered=covered.has(a.id)?1:0;
        const bCovered=covered.has(b.id)?1:0;
        const aAge=aa.last?now-new Date(aa.last).getTime():Number.MAX_SAFE_INTEGER;
        const bAge=ba.last?now-new Date(ba.last).getTime():Number.MAX_SAFE_INTEGER;
        const aPresented=Number(index.conditionPresented[a.id])||0;
        const bPresented=Number(index.conditionPresented[b.id])||0;
        return aCovered-bCovered||
          (aAnswers?1:0)-(bAnswers?1:0)||
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
        selected.push(item);
        used.add(item.id);
        if(selected.length>=limit)break;
      }
    }
    return selected.slice(0,limit);
  }

  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  function decorate(){
    scheduled=false;
    const api=core();
    if(!api?.App?.loaded)return;
    const coverage=rebuildCoverage();
    if(!coverage)return;

    if(location.hash===''||location.hash.startsWith('#/home')){
      const stat=document.querySelector('#app .hero-stats .stat:nth-child(2)');
      if(stat){
        setText(stat.querySelector('strong'),`${coverage.covered.length}/${api.App.conditions.length}`);
        setText(stat.querySelector('span'),'answered this cycle');
      }
    }

    if(location.hash.startsWith('#/quiz')){
      const card=[...document.querySelectorAll('#app .quiz-card')].find(node=>node.querySelector('h2')?.textContent==='Current coverage');
      if(card){
        setText(card.querySelector('.metric-big'),`${coverage.covered.length}/${api.App.conditions.length}`);
        const paragraphs=card.querySelectorAll('p');
        if(paragraphs[0])setText(paragraphs[0],`conditions answered in cycle ${coverage.cycle}`);
      }
    }

    if(location.hash.startsWith('#/analytics')){
      const card=[...document.querySelectorAll('#app .metric-card')].find(node=>node.querySelector('h3')?.textContent==='Condition coverage');
      if(card){
        setText(card.querySelector('.metric-big'),`${coverage.covered.length}/${api.App.conditions.length}`);
        setText(card.querySelector('p'),`answered in cycle ${coverage.cycle} · ${coverage.completedCycles||0} complete cycles`);
      }
    }
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(decorate);}

  function patchApi(){
    const api=core();
    if(!api?.App?.loaded)return false;
    if(!api.__answeredCoveragePatched){
      api.__answeredCoveragePatched=true;
      api.coverageState=()=>rebuildCoverage()||{version:COVERAGE_VERSION,basis:'answered',cycle:1,completedCycles:0,covered:[]};
      api.selectCoverageCandidates=answeredFirstCandidates;
      const originalSummary=api.analyticsSummary?.bind(api);
      if(originalSummary){
        api.analyticsSummary=()=>{
          const index=api.eventIndex();
          const answered=new Set(index.answers.filter(event=>event.source!=='knowledge').map(event=>event.conditionId));
          return originalSummary()
            .replace(/Conditions tested:.*(?:\n|$)/,`Conditions answered: ${answered.size}/${api.App.conditions.length}\n`)
            .replace(/Current cycle covered:/g,'Current cycle answered:')
            .replace(/SCHEDULER PRIORITIES[\s\S]*$/,[
              'SCHEDULER PRIORITIES',
              '1. Lowest proportion of conditions answered in the current cycle.',
              '2. Lowest lifetime proportion of conditions ever answered.',
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
          set.schedulerSnapshot.coverageBasis='answered';
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
    if(app){
      observer=new MutationObserver(schedule);
      observer.observe(app,{childList:true,subtree:true});
    }
    document.addEventListener('ukmlaLearningEvent',()=>{rebuildCoverage();schedule();});
    window.addEventListener('hashchange',schedule);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();

  window.UKMLA_ANSWERED_COVERAGE={rebuildCoverage,selectCoverageCandidates:answeredFirstCandidates,PRIORITY_ORDER};
})();