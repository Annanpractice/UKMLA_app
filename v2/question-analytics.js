(function(){
  'use strict';

  let scheduled=false;
  let observer=null;

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

  function decorateHome(){
    if(!location.hash.startsWith('#/home')&&location.hash!=='')return;
    const stats=bank()?.rollingStats(10);
    const card=document.querySelector('#app .hero-stats .stat:nth-child(3)');
    if(!stats||!card)return;
    const text=stats.count?`last ${stats.count} set${stats.count===1?'':'s'} accuracy`:'last 10 sets accuracy';
    setText(card.querySelector('strong'),`${stats.percent}%`);
    setText(card.querySelector('span'),text);
  }

  function chartSvg(attempts){
    const series=attempts.slice(-60);
    if(!series.length)return'<section class="empty"><p>Complete a question set to start the run chart.</p></section>';
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
    const circles=series.map(item=>`<circle class="run-chart-point" cx="${x(item)}" cy="${y(item.percent)}" r="5"><title>${escapeHtml(formatDate(item.completedAt))}: ${item.percent}% (${item.correctCount}/${item.questionCount}) · ${escapeHtml(item.title||item.sourceType)}</title></circle>`).join('');
    return`<div class="run-chart-wrap"><svg class="run-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Question-set percentage over time"><line class="run-chart-grid" x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}"></line><line class="run-chart-grid" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"></line>${grid}<line class="run-chart-median" x1="${left}" y1="${y(med)}" x2="${width-right}" y2="${y(med)}"></line><text class="run-chart-median-label" x="${width-right-4}" y="${y(med)-7}" text-anchor="end">Median ${Math.round(med)}%</text>${series.length>1?`<polyline class="run-chart-line" points="${points}"></polyline>`:''}${circles}<text class="run-chart-label" x="${left}" y="${height-18}" text-anchor="start">${escapeHtml(formatDate(series[0].completedAt,true))}</text><text class="run-chart-label" x="${width-right}" y="${height-18}" text-anchor="end">${escapeHtml(formatDate(series.at(-1).completedAt,true))}</text></svg></div>`;
  }

  function runChartCsv(){
    const rows=bank()?.completedAttempts()||[];
    const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
    const columns=['attempt_id','set_id','completed_at','source','title','correct','questions','percentage','device_id'];
    return[columns.join(','),...rows.map(item=>[item.attemptId,item.setId,item.completedAt,item.sourceType,item.title,item.correctCount,item.questionCount,item.percent,item.deviceId].map(quote).join(','))].join('\n');
  }

  function analyticsSummary(){
    const stats=bank()?.rollingStats(10)||{count:0,correct:0,questions:0,percent:0,attempts:[]};
    const completed=bank()?.completedAttempts()||[];
    const med=median(completed.map(item=>Number(item.percent)||0));
    const recent=stats.attempts.slice().reverse();
    const base=core()?.analyticsSummary?.()||'';
    const adjusted=base
      .replace('UKMLA QUIZ ANALYTICS','UKMLA QUESTION ANALYTICS')
      .replace(/Overall accuracy:.*(?:\n|$)/,'');
    return[
      'RECENT PERFORMANCE',
      `Rolling accuracy: ${stats.percent}% across the last ${stats.count} completed set${stats.count===1?'':'s'}`,
      `Recent answers: ${stats.correct}/${stats.questions}`,
      `Completed attempts in run chart: ${completed.length}`,
      `Run-chart median: ${completed.length?Math.round(med)+'%':'not available'}`,
      '',
      'LAST 10 COMPLETED SETS',
      ...(recent.length?recent.map((item,index)=>`${index+1}. ${formatDate(item.completedAt)} — ${item.title||item.sourceType} — ${item.percent}% (${item.correctCount}/${item.questionCount})`):['No completed sets yet.']),
      '',
      adjusted
    ].join('\n');
  }

  function decorateAnalytics(){
    if(!location.hash.startsWith('#/analytics'))return;
    const grid=document.querySelector('#app .analytics-grid');
    if(!grid||!bank())return;
    const stats=bank().rollingStats(10);
    const completed=bank().completedAttempts();
    const first=grid.querySelector('.metric-card:not(.run-chart-card)');
    if(first){
      setText(first.querySelector('h3'),'Last 10 completed sets');
      setText(first.querySelector('.metric-big'),`${stats.percent}%`);
      setText(first.querySelector('p'),stats.count?`${stats.correct}/${stats.questions} correct across ${stats.count} sets`:'No completed sets yet');
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
      const recent=completed.slice(-10).reverse();
      chart.dataset.signature=signature;
      chart.innerHTML=`<div class="run-chart-head"><div><h3>Performance run chart</h3><p>Each point is one completed question set. The centre line is the median percentage across the displayed history.</p></div><button class="btn ghost" id="download-run-chart">Download attempt CSV</button></div>${chartSvg(completed)}<div class="run-chart-history">${recent.map(item=>`<div class="run-chart-row"><span>${escapeHtml(formatDate(item.completedAt))}</span><span>${escapeHtml(item.title||bank().sourceLabel(item.sourceType))}</span><strong>${item.percent}%</strong></div>`).join('')}</div>`;
      chart.querySelector('#download-run-chart').onclick=()=>core().downloadText(runChartCsv(),`ukmla-run-chart-${new Date().toISOString().slice(0,10)}.csv`,'text/csv');
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
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
  window.UKMLA_QUESTION_ANALYTICS={analyticsSummary,runChartCsv,chartSvg};
})();
