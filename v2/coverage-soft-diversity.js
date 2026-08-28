(function(){
  'use strict';

  const REPEAT_FRACTION=0.10;
  const MIN_SET_FOR_REPEAT=5;
  let patched=false;

  function core(){return window.UKMLA_V2;}

  function install(){
    const api=core();
    if(!api?.App?.loaded||!window.UKMLA_ANSWERED_COVERAGE||patched){
      if(!patched)setTimeout(install,100);
      return;
    }

    const original=api.selectCoverageCandidates?.bind(api);
    if(typeof original!=='function'){
      setTimeout(install,100);
      return;
    }

    api.selectCoverageCandidates=function coverageFirstSoftDiversity(items,count,options={}){
      const source=Array.isArray(items)?items.filter(Boolean):[];
      const limit=Math.max(0,Math.min(Number(count)||0,source.length));
      if(!limit)return[];

      // Dedicated/single-topic modes already explicitly disable topic uniqueness.
      // Preserve their existing behaviour exactly.
      if(options.uniqueTopics===false)return original(source,limit,options);

      const coverage=api.coverageState?.()||{covered:[]};
      const covered=new Set(Array.isArray(coverage.covered)?coverage.covered:[]);
      const unseen=source.filter(item=>!covered.has(item.id));
      const seen=source.filter(item=>covered.has(item.id));

      if(!unseen.length||!seen.length)return original(source,limit,options);

      // In mixed ten-question sets, reserve roughly one slot for a weak repeat.
      // Coverage remains dominant: the other slots are drawn only from unseen cards.
      const repeatTarget=limit>=MIN_SET_FOR_REPEAT
        ?Math.max(1,Math.round(limit*REPEAT_FRACTION))
        :0;
      const unseenTarget=Math.min(unseen.length,Math.max(0,limit-repeatTarget));
      const repeatCount=Math.min(seen.length,limit-unseenTarget);
      const extraUnseenCount=Math.min(unseen.length-unseenTarget,limit-unseenTarget-repeatCount);

      const selectedUnseen=original(unseen,unseenTarget+extraUnseenCount,{...options,uniqueTopics:true});
      const selectedSeen=repeatCount
        ?original(seen,repeatCount,{...options,uniqueTopics:true})
        :[];
      const selected=[...selectedUnseen,...selectedSeen];

      if(selected.length<limit){
        const used=new Set(selected.map(item=>item.id));
        const remainder=original(source,source.length,{...options,uniqueTopics:false});
        for(const item of remainder){
          if(used.has(item.id))continue;
          selected.push(item);
          used.add(item.id);
          if(selected.length>=limit)break;
        }
      }

      return selected.slice(0,limit);
    };

    patched=true;
    window.UKMLA_COVERAGE_SOFT_DIVERSITY={
      repeatFraction:REPEAT_FRACTION,
      minSetForRepeat:MIN_SET_FOR_REPEAT
    };
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();