(function(){
  'use strict';

  let scheduled=false;
  let observer=null;
  const ANALYTICS_SOURCES=new Set(['basic','ai','biomedical']);
  const RECENT_QUESTION_WINDOW=30;
  const TREND_BLOCK_SIZE=10;
  const RUN_CHART_SET_GROUP=5;

  function core(){return window.UKMLA_V2;}
  function bank(){return window.UKMLA_QUESTION_BANK;}
  function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'');}
  function formatDate(value,compact=false){
    if(!value)return'—';
    try{return new Date(value).toLocaleDateString(undefined,compact?{day:'numeric',month:'short'}:{day:'numeric',month:'short',year:'numeric'});}catch(_){return String(value);}
  }
  function median(values){
    if(!values.length)return 0;
    const sorted=values.slice().sort((a,b)=>a-b);
    const middle=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  }
  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  function eligibleCompleted(){return(bank()?.completedAttempts()||[]).filter(item=>ANALYTICS_SOURCES.has(item.sourceType));}
  function answerEvents(){
    return(core()?.events?.()||[])
      .filter(item=>item?.kind==='answered'&&ANALYTICS_SOURCES.has(item.source))
      .sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
  }
  function rowsForTopic(topicId){return answerEvents().filter(item=>item.topicId===topicId);}
  function recentWeight(index){
    if(index<RECENT_QUESTION_WINDOW)return Math.max(.58,1-index*.014);
    return .12*Math.pow(.88,index-RECENT_QUESTION_WINDOW);
  }
  function weightedPerformance(rows){
    const newest=(rows||[]).slice().sort((a,b)=>String(b.at||b.answeredAt||'').localeCompare(String(a.at||a.answeredAt||'')));
    if(!newest.length)return{percent:50,answered:0,recentCount:0,correctWeight:0,totalWeight:0};
    let correctWeight=2;
    let totalWeight=4;
    newest.forEach((item,index)=>{
      const weight=recentWeight(index);
      totalWeight+=weight;
      if(item.correct)correctWeight+=weight;
    });
    return{
      percent:Math.round(correctWeight/totalWeight*100),
      answered:newest.length,
      recentCount:Math.min(RECENT_QUESTION_WINDOW,newest.length),
      correctWeight,
      totalWeight
    };
  }
  function completedTenTrend(rows){
    const ordered=(rows||[]).slice().sort((a,b)=>String(a.at||a.answeredAt||'').localeCompare(String(b.at||b.answeredAt||'')));
    const milestone=Math.floor(ordered.length/TREND_BLOCK_SIZE)*TREND_BLOCK_SIZE;
    if(milestone<TREND_BLOCK_SIZE*2)return null;
    const currentRows=ordered.slice(0,milestone);
    const previousRows=ordered.slice(0,milestone-TREND_BLOCK_SIZE);
    const latestBlock=ordered.slice(milestone-TREND_BLOCK_SIZE,milestone);
    const priorBlock=ordered.slice(milestone-TREND_BLOCK_SIZE*2,milestone-TREND_BLOCK_SIZE);
    const current=weightedPerformance(currentRows).percent;
    const previous=weightedPerformance(previousRows).percent;
    const latestCorrect=latestBlock.filter(item=>item.correct).length;
    const priorCorrect=priorBlock.filter(item=>item.correct).length;
    return{
      delta:current-previous,
      milestone,
      current,
      previous,
      latestCorrect,
      priorCorrect
    };
  }
  function rollingStats(limit=10){
    const recent=eligibleCompleted().slice(-limit);
    const correct=recent.reduce((sum,item)=>sum+Number(item.correctCount||0),0);
    const questions=recent.reduce((sum,item)=>sum+Number(item.questionCount||0),0);
    return{attempts:recent,count:recent.length,correct,questions,percent:questions?Math.round(correct/questions*100):0};
  }
  function healthColour(value){
    const score=Math.max(0,Math.min(100,Number(value)||0));
    if(score<40)return'#ff667f';
    if(score<65)return'#ffc35a';
    return'#67e3a2';
  }
  function improvementBadge(className,trend){
    if(!trend||trend.delta<=0)return'';
    return`<span class="${className}" title="Recency-weighted score after ${trend.milestone} topic answers; latest completed 10: ${trend.latestCorrect}/10, previous 10: ${trend.priorCorrect}/10">+${trend.delta} pts</span>`;
  }
  function injectStyles(){
    if(document.getElementById('question-recency-analytics-style'))return;
    const style=document.createElement('style');
    style.id='question-recency-analytics-style';
    style.textContent=`
      .topic-improvement,.performance-improvement{display:inline-flex;align-items:center;white-space:nowrap;margin-left:.5rem;padding:.16rem .45rem;border:1px solid rgba(74,242,255,.65);border-radius:999px;background:rgba(0,221,255,.09);color:#62f3ff;font-size:.72rem;font-weight:800;letter-spacing:.03em;box-shadow:0 0 12px rgba(44,226,255,.34),inset 0 0 10px rgba(44,226,255,.08);text-shadow:0 0 8px rgba(98,243,255,.8)}
      .topic-card .health-row{flex-wrap:wrap}.topic-card .topic-improvement{margin-left:.4rem}.recency-note{color:var(--muted);font-size:.78rem}.rank-row .topic-improvement{margin-left:auto}
      #ai-background-build{position:fixed;z-index:140;right:16px;bottom:calc(88px + env(safe-area-inset-bottom));max-width:min(360px,calc(100vw - 32px));border:1px solid rgba(85,213,255,.45);border-radius:18px;background:rgba(3,21,43,.96);box-shadow:0 14px 38px rgba(0,0,0,.42),0 0 20px rgba(28,187,255,.18);color:#eaf8ff;padding:11px 13px;cursor:pointer;font:inherit;text-align:left}
      #ai-background-build strong{display:block;font-size:.88rem}#ai-background-build span{display:block;margin-top:3px;color:#9ed8f2;font-size:.76rem}#ai-background-build[hidden]{display:none}
    `;
    document.head.appendChild(style);
  }

  function decorateHome(){
    if(!location.hash.startsWith('#/home')&&location.hash!=='')return;
    injectStyles();
    const allRows=answerEvents();
    const overall=weightedPerformance(allRows);
    const overallTrend=completedTenTrend(allRows);
    const card=document.querySelector('#app .hero-stats .stat:nth-child(3)');
    if(card){
      setText(card.querySelector('strong'),`${overall.percent}%`);
      setText(card.querySelector('span'),'recency-weighted accuracy');
      let badge=card.querySelector('.performance-improvement');
      if(overallTrend?.delta>0){
        if(!badge){badge=document.createElement('span');badge.className='performance-improvement';card.appendChild(badge);}
        badge.textContent=`+${overallTrend.delta} pts`;
        badge.title=`Improvement after the latest completed ten-question block (${overallTrend.latestCorrect}/10 versus ${overallTrend.priorCorrect}/10).`;
      }else badge?.remove();
    }

    const pageNote=document.querySelector('#app .page-head p');
    if(pageNote&&/superscript|Health remains/i.test(pageNote.textContent||'')){
      setText(pageNote,'Topic percentages are recency weighted: the latest 30 answers dominate, with a sharp fall in influence before that. A neon badge appears after each completed ten-answer topic block when performance improves.');
    }

    for(const topic of core()?.App?.topics||[]){
      const topicCard=document.querySelector(`#app [data-topic="${topic.id}"]`);
      if(!topicCard)continue;
      const rows=rowsForTopic(topic.id);
      if(!rows.length)continue;
      const performance=weightedPerformance(rows);
      const trend=completedTenTrend(rows);
      const fill=topicCard.querySelector('.health-fill');
      const value=topicCard.querySelector('.health-value');
      if(fill)fill.style.setProperty('--value',`${performance.percent}%`);
      if(value)setText(value,`${performance.percent}%`);
      topicCard.style.setProperty('--health-color',healthColour(performance.percent));
      topicCard.title=`Recency-weighted from ${rows.length} answer${rows.length===1?'':'s'}; latest ${performance.recentCount} carry most weight.`;
      let badge=topicCard.querySelector('.topic-improvement');
      if(trend?.delta>0){
        if(!badge){badge=document.createElement('span');badge.className='topic-improvement';topicCard.querySelector('.health-row')?.appendChild(badge);}
        badge.textContent=`+${trend.delta} pts`;
        badge.title=`Latest completed 10: ${trend.latestCorrect}/10; previous 10: ${trend.priorCorrect}/10.`;
      }else badge?.remove();
    }
  }

  function aggregateAttempts(attempts,groupSize=RUN_CHART_SET_GROUP){
    const ordered=(attempts||[]).slice().sort((a,b)=>String(a.completedAt||'').localeCompare(String(b.completedAt||'')));
    const groups=[];
    for(let index=0;index+groupSize<=ordered.length;index+=groupSize){
      const chunk=ordered.slice(index,index+groupSize);
      const correct=chunk.reduce((sum,item)=>sum+Number(item.correctCount||0),0);
      const questions=chunk.reduce((sum,item)=>sum+Number(item.questionCount||0),0);
      groups.push({
        groupNumber:groups.length+1,
        setCount:chunk.length,
        correctCount:correct,
        questionCount:questions,
        percent:questions?Math.round(correct/questions*100):0,
        startedAt:chunk[0]?.completedAt||null,
        completedAt:chunk.at(-1)?.completedAt||null,
        attemptIds:chunk.map(item=>item.attemptId),
        setIds:chunk.map(item=>item.setId),
        titles:[...new Set(chunk.map(item=>item.title||item.sourceType).filter(Boolean))]
      });
    }
    return groups;
  }

  function chartSvg(attempts){
    const groups=aggregateAttempts(attempts);
    const pending=(attempts||[]).length%RUN_CHART_SET_GROUP;
    const series=groups.slice(-60);
    if(!series.length)return`<section class="empty"><p>Complete ${RUN_CHART_SET_GROUP} question sets to create the first 50-question run-chart point.${pending?` ${pending}/${RUN_CHART_SET_GROUP} sets are currently banked.`:''}</p></section>`;
    const width=920,height=330,left=52,right=24,top=24,bottom=52;
    const plotWidth=width-left-right,plotHeight=height-top-bottom;
    const timestamps=series.map(item=>new Date(item.completedAt).getTime());
    const valid=timestamps.filter(Number.isFinite);
    const minTime=Math.min(...valid),maxTime=Math.max(...valid);
    const span=Math.max(1,maxTime-minTime);
    const x=item=>series.length===1?left+plotWidth/2:left+((new Date(item.completedAt).getTime()-minTime)/span)*plotWidth;
    const y=value=>top+(100-Math.max(0,Math.min(100,Number(value)||0)))/100*plotHeight;
    const points=series.map(item=>`${x(item).toFixed(1)},${y(item.percent).toFixed(1)}`).join(' ');
    const med=median(series.map(item=>Number(item.percent)||0));
    const grid=[0,25,50,75,100].map(value=>`<line class="run-chart-grid" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"></line><text class="run-chart-label" x="${left-9}" y="${y(value)+4}" text-anchor="end">${value}%</text>`).join('');
    const circles=series.map(item=>`<circle class="run-chart-point" cx="${x(item)}" cy="${y(item.percent)}" r="5"><title>50-question block ${item.groupNumber}: ${item.percent}% (${item.correctCount}/${item.questionCount}) · ${escapeHtml(formatDate(item.startedAt))} to ${escapeHtml(formatDate(item.completedAt))}</title></circle>`).join('');
    return`<div class="run-chart-wrap"><svg class="run-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Performance aggregated into five-set blocks over time"><line class="run-chart-grid" x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}"></line><line class="run-chart-grid" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"></line>${grid}<line class="run-chart-median" x1="${left}" y1="${y(med)}" x2="${width-right}" y2="${y(med)}"></line><text class="run-chart-median-label" x="${width-right-4}" y="${y(med)-7}" text-anchor="end">Median ${Math.round(med)}%</text>${series.length>1?`<polyline class="run-chart-line" points="${points}"></polyline>`:''}${circles}<text class="run-chart-label" x="${left}" y="${height-18}" text-anchor="start">${escapeHtml(formatDate(series[0].completedAt,true))}</text><text class="run-chart-label" x="${width-right}" y="${height-18}" text-anchor="end">${escapeHtml(formatDate(series.at(-1).completedAt,true))}</text></svg></div>`;
  }

  function runChartCsv(){
    const rows=aggregateAttempts(eligibleCompleted());
    const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
    const columns=['block_number','first_completed_at','last_completed_at','set_count','correct','questions','percentage','attempt_ids','set_ids'];
    return[columns.join(','),...rows.map(item=>[item.groupNumber,item.startedAt,item.completedAt,item.setCount,item.correctCount,item.questionCount,item.percent,item.attemptIds.join('|'),item.setIds.join('|')].map(quote).join(','))].join('\n');
  }

  function analyticsSummary(){
    const rows=answerEvents();
    const weighted=weightedPerformance(rows);
    const trend=completedTenTrend(rows);
    const completed=eligibleCompleted();
    const groups=aggregateAttempts(completed);
    const med=median(groups.map(item=>Number(item.percent)||0));
    const recent=groups.slice(-10).reverse();
    const pending=completed.length%RUN_CHART_SET_GROUP;
    const base=core()?.analyticsSummary?.()||'';
    const adjusted=base
      .replace('UKMLA QUIZ ANALYTICS','UKMLA QUESTION ANALYTICS')
      .replace(/Overall accuracy:.*(?:\n|$)/,'');
    return[
      'RECENCY-WEIGHTED PERFORMANCE',
      `Weighted accuracy: ${weighted.percent}% across ${weighted.answered} recorded answers`,
      `Weighting: latest ${RECENT_QUESTION_WINDOW} answers dominate; earlier answers decay sharply`,
      trend?`Latest completed ten-question change: ${trend.delta>=0?'+':''}${trend.delta} points (${trend.latestCorrect}/10 versus ${trend.priorCorrect}/10)`: 'Latest completed ten-question change: needs 20 answers',
      '',
      '50-QUESTION RUN CHART',
      `Completed five-set blocks: ${groups.length}`,
      `Pending sets toward next block: ${pending}/${RUN_CHART_SET_GROUP}`,
      `Run-chart median: ${groups.length?Math.round(med)+'%':'not available'}`,
      '',
      'LAST 10 COMPLETE 50-QUESTION BLOCKS',
      ...(recent.length?recent.map(item=>`${item.groupNumber}. ${formatDate(item.startedAt)}–${formatDate(item.completedAt)} — ${item.percent}% (${item.correctCount}/${item.questionCount})`):['No complete 50-question block yet.']),
      '',
      adjusted
    ].join('\n');
  }

  function decorateAnalytics(){
    if(!location.hash.startsWith('#/analytics'))return;
    injectStyles();
    const grid=document.querySelector('#app .analytics-grid');
    if(!grid||!bank())return;
    const rows=answerEvents();
    const weighted=weightedPerformance(rows);
    const trend=completedTenTrend(rows);
    const completed=eligibleCompleted();
    const groups=aggregateAttempts(completed);
    const first=grid.querySelector('.metric-card:not(.run-chart-card)');
    if(first){
      setText(first.querySelector('h3'),'Recency-weighted accuracy');
      setText(first.querySelector('.metric-big'),`${weighted.percent}%`);
      const trendText=trend?.delta>0?` · +${trend.delta} points after the latest completed 10`:'';
      setText(first.querySelector('p'),`${weighted.answered} answers; latest ${Math.min(RECENT_QUESTION_WINDOW,weighted.answered)} dominate${trendText}`);
    }

    const topicCard=[...grid.querySelectorAll('.metric-card')].find(card=>card.querySelector('h3')?.textContent==='Weakest topics');
    if(topicCard){
      setText(topicCard.querySelector('h3'),'Recency-weighted topics');
      const ranked=(core()?.App?.topics||[]).map(topic=>{
        const topicRows=rowsForTopic(topic.id);
        return{topic,rows:topicRows,performance:weightedPerformance(topicRows),trend:completedTenTrend(topicRows)};
      }).filter(item=>item.rows.length).sort((a,b)=>a.performance.percent-b.performance.percent).slice(0,10);
      const list=topicCard.querySelector('.rank-list');
      if(list)list.innerHTML=ranked.length?ranked.map(item=>`<div class="rank-row"><span>${escapeHtml(item.topic.name)}</span><span>${item.performance.percent}%${improvementBadge('topic-improvement',item.trend)}</span></div>`).join(''):'<p>No topic answers logged yet.</p>';
    }

    let chart=document.getElementById('question-run-chart');
    if(!chart){
      chart=document.createElement('article');
      chart.id='question-run-chart';
      chart.className='metric-card run-chart-card';
      grid.prepend(chart);
    }
    const signature=completed.map(item=>`${item.attemptId}:${item.updatedAt}:${item.percent}`).join('|');
    if(chart.dataset.signature!==signature){
      const recentGroups=groups.slice(-10).reverse();
      const pending=completed.length%RUN_CHART_SET_GROUP;
      chart.dataset.signature=signature;
      chart.innerHTML=`<div class="run-chart-head"><div><h3>Performance run chart</h3><p>Each point aggregates five completed question sets—normally 50 questions. The centre line is the median across complete blocks.${pending?` ${pending}/${RUN_CHART_SET_GROUP} sets are banked toward the next point.`:''}</p></div><button class="btn ghost" id="download-run-chart">Download 50-question CSV</button></div>${chartSvg(completed)}<div class="run-chart-history">${recentGroups.map(item=>`<div class="run-chart-row"><span>${escapeHtml(formatDate(item.completedAt))}</span><span>Block ${item.groupNumber} · ${item.setCount} sets</span><strong>${item.percent}%</strong></div>`).join('')}</div>`;
      chart.querySelector('#download-run-chart').onclick=()=>core().downloadText(runChartCsv(),`ukmla-50-question-run-chart-${new Date().toISOString().slice(0,10)}.csv`,'text/csv');
    }

    const copy=document.getElementById('copy-summary');
    if(copy&&!copy.dataset.rollingSummary){
      copy.dataset.rollingSummary='true';
      copy.onclick=()=>core().copyText(analyticsSummary(),'Analytics copied');
    }
  }

  function apply(){scheduled=false;decorateHome();decorateAnalytics();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
  function initialise(){
    const app=document.getElementById('app');
    if(!app||!bank()){setTimeout(initialise,100);return;}
    observer=new MutationObserver(schedule);
    observer.observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',()=>setTimeout(schedule,0));
    document.addEventListener('ukmlaQuestionBankChanged',schedule);
    document.addEventListener('ukmlaLearningEvent',schedule);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
  window.UKMLA_QUESTION_ANALYTICS={
    analyticsSummary,runChartCsv,chartSvg,rollingStats,eligibleCompleted,
    answerEvents,weightedPerformance,completedTenTrend,aggregateAttempts,
    RECENT_QUESTION_WINDOW,TREND_BLOCK_SIZE,RUN_CHART_SET_GROUP
  };
})();