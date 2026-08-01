(function(){
  'use strict';

  const PAGE_SIZE=100;
  const NEEDS_WORK_THRESHOLD=65;
  const state={filter:'answered',query:'',sort:'priority',limit:PAGE_SIZE};
  let observer=null;
  let scheduled=false;
  let cachedSignature='';
  let cachedStats=[];
  let cachedMap=new Map();

  function core(){return window.UKMLA_V2;}
  function analytics(){return window.UKMLA_QUESTION_ANALYTICS;}
  function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
  function normalise(value){return clean(value).normalize('NFKC').toLowerCase();}
  function escapeHtml(value){return core()?.escapeHtml(value)??String(value??'');}
  function answerEvents(){
    const rows=analytics()?.answerEvents?.();
    if(Array.isArray(rows))return rows;
    return(core()?.events?.()||[])
      .filter(item=>item?.kind==='answered'&&['basic','ai','biomedical'].includes(item.source))
      .sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
  }
  function weightedPerformance(rows){
    if(analytics()?.weightedPerformance)return analytics().weightedPerformance(rows);
    const newest=(rows||[]).slice().sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
    if(!newest.length)return{percent:50,answered:0};
    let correctWeight=2,totalWeight=4;
    newest.forEach((item,index)=>{
      const weight=index<30?Math.max(.58,1-index*.014):.12*Math.pow(.88,index-30);
      totalWeight+=weight;
      if(item.correct)correctWeight+=weight;
    });
    return{percent:Math.round(correctWeight/totalWeight*100),answered:newest.length};
  }
  function dataSignature(){
    const events=core()?.events?.()||[];
    const last=events.at(-1)||{};
    return`${events.length}:${last.id||''}:${last.at||''}`;
  }
  function healthClass(score){
    if(score===null)return'health-neutral';
    if(score<40)return'health-red';
    if(score<NEEDS_WORK_THRESHOLD)return'health-amber';
    return'health-green';
  }
  function formatDate(value){
    if(!value)return'Never';
    try{return new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});}catch(_){return String(value);}
  }
  function buildStats(){
    const api=core();
    if(!api?.App?.conditions?.length)return[];
    const signature=dataSignature();
    if(signature===cachedSignature&&cachedStats.length)return cachedStats;
    const grouped=new Map();
    for(const row of answerEvents()){
      if(!row?.conditionId)continue;
      if(!grouped.has(row.conditionId))grouped.set(row.conditionId,[]);
      grouped.get(row.conditionId).push(row);
    }
    cachedStats=api.App.conditions.map(condition=>{
      const rows=grouped.get(condition.id)||[];
      const answered=rows.length;
      const correct=rows.reduce((sum,row)=>sum+(row.correct?1:0),0);
      const health=answered?weightedPerformance(rows).percent:null;
      return{
        condition,
        id:condition.id,
        name:condition.name,
        topic:condition.topic,
        topicId:condition.topicId,
        presented:api.conditionCount(condition.id),
        answered,
        correct,
        rawAccuracy:answered?Math.round(correct/answered*100):null,
        health,
        lastAnsweredAt:rows.at(-1)?.at||null,
        search:normalise(`${condition.name} ${condition.topic}`)
      };
    });
    cachedMap=new Map(cachedStats.map(item=>[item.id,item]));
    cachedSignature=signature;
    return cachedStats;
  }
  function prioritySort(a,b){
    const aAnswered=a.answered>0,bAnswered=b.answered>0;
    if(aAnswered!==bAnswered)return aAnswered?-1:1;
    if(aAnswered){
      return a.health-b.health||b.answered-a.answered||String(a.name).localeCompare(String(b.name));
    }
    return a.presented-b.presented||String(a.name).localeCompare(String(b.name));
  }
  function sortedStats(items){
    const rows=items.slice();
    if(state.sort==='name')return rows.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    if(state.sort==='most-answered')return rows.sort((a,b)=>b.answered-a.answered||prioritySort(a,b));
    if(state.sort==='least-tested')return rows.sort((a,b)=>a.answered-b.answered||a.presented-b.presented||String(a.name).localeCompare(String(b.name)));
    if(state.sort==='recent')return rows.sort((a,b)=>String(b.lastAnsweredAt||'').localeCompare(String(a.lastAnsweredAt||''))||prioritySort(a,b));
    return rows.sort(prioritySort);
  }
  function filteredStats(){
    const query=normalise(state.query);
    return sortedStats(buildStats().filter(item=>{
      if(query&&!item.search.includes(query))return false;
      if(state.filter==='needs-work')return item.answered>0&&item.health<NEEDS_WORK_THRESHOLD;
      if(state.filter==='untested')return item.answered===0;
      if(state.filter==='all')return true;
      return item.answered>0;
    }));
  }
  function miniHealthHtml(item){
    if(!item||!item.answered){
      return`<span class="condition-mini-track health-neutral"><span></span></span><span class="condition-mini-label">Not yet answered</span>`;
    }
    return`<span class="condition-mini-track ${healthClass(item.health)}" style="--condition-health:${item.health}%"><span></span></span><span class="condition-mini-label">${item.health}% health · ${item.correct}/${item.answered} correct</span>`;
  }
  function decorateConditionCards(){
    if(!location.hash.startsWith('#/conditions'))return;
    buildStats();
    document.querySelectorAll('#app .condition-card[data-condition-card]').forEach(card=>{
      const item=cachedMap.get(card.dataset.conditionCard);
      if(!item)return;
      const summary=card.querySelector('.condition-summary');
      const heading=summary?.firstElementChild;
      if(summary&&heading){
        let mini=heading.querySelector('.condition-performance-mini');
        if(!mini){
          mini=document.createElement('div');
          mini.className='condition-performance-mini';
          heading.appendChild(mini);
        }
        const signature=`${item.health}:${item.answered}:${item.correct}`;
        if(mini.dataset.signature!==signature){
          mini.dataset.signature=signature;
          mini.innerHTML=miniHealthHtml(item);
          mini.title=item.answered
            ?`Recency-weighted condition health from ${item.answered} answer${item.answered===1?'':'s'}. Latest answers carry most weight.`
            :'No answered questions are recorded for this condition yet.';
        }
      }
      const count=summary?.querySelector('.condition-sup');
      if(count){
        const countText=`×${item.presented}`;
        if(count.textContent!==countText)count.textContent=countText;
        count.title=`Question exposure: ${item.presented} target question${item.presented===1?'':'s'} presented. This may exceed answered questions if a question was left before answering.`;
        count.setAttribute('aria-label',count.title);
      }
    });
  }
  function decorateFocus(){
    if(!location.hash.startsWith('#/focus'))return;
    const id=decodeURIComponent(location.hash.split('/').slice(2).join('/'))||core()?.App?.state?.focusId;
    const item=buildStats().find(row=>row.id===id);
    const index=document.querySelector('#app .focus-index');
    if(!item||!index)return;
    const health=item.answered?`${item.health}% health · ${item.correct}/${item.answered} correct`:'not yet answered';
    const text=index.textContent||'';
    const position=text.split('·')[0].trim();
    const next=`${position} · ${item.presented} presented · ${health}`;
    if(index.textContent!==next)index.textContent=next;
    index.title='“Presented” counts target questions shown. Condition health is recency weighted and only appears after an answer is recorded.';
  }
  function rankRowHtml(item){
    return`<button class="rank-row condition-rank-row" type="button" data-condition-performance-focus="${escapeHtml(item.id)}"><span>${escapeHtml(item.name)}</span><span>${item.health}% · ${item.answered} answered</span></button>`;
  }
  function decorateSnapshot(){
    if(!location.hash.startsWith('#/analytics'))return;
    const card=[...document.querySelectorAll('#app .metric-card')].find(node=>/^Weakest conditions/.test(node.querySelector('h3')?.textContent||''));
    if(!card)return;
    const ranked=buildStats().filter(item=>item.answered).sort(prioritySort).slice(0,10);
    const title=card.querySelector('h3');
    const list=card.querySelector('.rank-list');
    if(title&&title.textContent!=='Weakest conditions · snapshot')title.textContent='Weakest conditions · snapshot';
    if(list){
      const signature=ranked.map(item=>`${item.id}:${item.health}:${item.answered}`).join('|');
      if(list.dataset.conditionSignature!==signature){
        list.dataset.conditionSignature=signature;
        list.innerHTML=ranked.length?ranked.map(rankRowHtml).join(''):'<p>No condition-level answers logged yet.</p>';
        bindFocusButtons(list);
      }
    }
  }
  function conditionRowHtml(item){
    const score=item.answered?`${item.health}%`:'—';
    const detail=item.answered
      ?`${item.correct}/${item.answered} correct · ${item.presented} presented`
      :`${item.presented} presented · no answers`;
    return`<article class="condition-performance-row ${healthClass(item.health)}">
      <button class="condition-performance-name" type="button" data-condition-performance-focus="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.topic)}</small>
      </button>
      <div class="condition-performance-health" title="${item.answered?'Recency-weighted health; latest 30 answers dominate.':'No answered questions recorded.'}">
        <span class="condition-performance-track" style="--condition-health:${item.health??0}%"><span></span></span>
        <small>${escapeHtml(detail)}</small>
      </div>
      <div class="condition-performance-score"><strong>${score}</strong><small>${item.answered?'health':formatDate(item.lastAnsweredAt)}</small></div>
    </article>`;
  }
  function csvText(){
    const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
    const columns=['condition_id','condition_name','topic','presented','answered','correct','raw_accuracy_percent','recency_weighted_health_percent','last_answered_at'];
    return[
      columns.join(','),
      ...buildStats().map(item=>[
        item.id,item.name,item.topic,item.presented,item.answered,item.correct,item.rawAccuracy??'',item.health??'',item.lastAnsweredAt||''
      ].map(quote).join(','))
    ].join('\n');
  }
  function explorerShell(){
    return`<div class="condition-explorer-head"><div><h3>All condition performance</h3><p>Search every condition. Health is recency weighted with a neutral starting prior; the latest 30 answers dominate. “Presented” is exposure, not correctness.</p></div><button class="btn ghost" id="download-condition-performance" type="button">Download condition CSV</button></div>
      <div class="condition-explorer-controls">
        <label><span>Find condition</span><input class="input" id="condition-performance-search" type="search" placeholder="Condition or topic"></label>
        <label><span>View</span><select class="select" id="condition-performance-filter"><option value="answered">Answered</option><option value="needs-work">Needs work (&lt;65%)</option><option value="untested">Not yet answered</option><option value="all">All conditions</option></select></label>
        <label><span>Sort</span><select class="select" id="condition-performance-sort"><option value="priority">Weakest priority</option><option value="name">Name</option><option value="most-answered">Most answered</option><option value="least-tested">Least tested</option><option value="recent">Most recent</option></select></label>
      </div>
      <p class="result-line" id="condition-performance-result"></p>
      <div class="condition-performance-list" id="condition-performance-list"></div>
      <button class="btn ghost condition-performance-more" id="condition-performance-more" type="button" hidden>Show 100 more</button>`;
  }
  function ensureExplorer(){
    if(!location.hash.startsWith('#/analytics'))return null;
    const grid=document.querySelector('#app .analytics-grid');
    if(!grid)return null;
    let explorer=document.getElementById('condition-performance-explorer');
    if(!explorer){
      explorer=document.createElement('article');
      explorer.id='condition-performance-explorer';
      explorer.className='metric-card condition-explorer-card';
      explorer.innerHTML=explorerShell();
      grid.appendChild(explorer);
      bindExplorer(explorer);
    }
    return explorer;
  }
  function bindFocusButtons(root){
    root.querySelectorAll('[data-condition-performance-focus]').forEach(button=>{
      button.onclick=()=>core()?.go?.('focus',button.dataset.conditionPerformanceFocus);
    });
  }
  function bindExplorer(explorer){
    const search=explorer.querySelector('#condition-performance-search');
    const filter=explorer.querySelector('#condition-performance-filter');
    const sort=explorer.querySelector('#condition-performance-sort');
    search.value=state.query;
    filter.value=state.filter;
    sort.value=state.sort;
    search.oninput=()=>{state.query=search.value;state.limit=PAGE_SIZE;drawExplorer(explorer);};
    filter.onchange=()=>{state.filter=filter.value;state.limit=PAGE_SIZE;drawExplorer(explorer);};
    sort.onchange=()=>{state.sort=sort.value;state.limit=PAGE_SIZE;drawExplorer(explorer);};
    explorer.querySelector('#condition-performance-more').onclick=()=>{state.limit+=PAGE_SIZE;drawExplorer(explorer);};
    explorer.querySelector('#download-condition-performance').onclick=()=>core()?.downloadText?.(csvText(),`ukmla-condition-performance-${new Date().toISOString().slice(0,10)}.csv`,'text/csv');
  }
  function drawExplorer(explorer){
    const rows=filteredStats();
    const visible=rows.slice(0,state.limit);
    const list=explorer.querySelector('#condition-performance-list');
    const result=explorer.querySelector('#condition-performance-result');
    const more=explorer.querySelector('#condition-performance-more');
    const resultText=`Showing ${visible.length} of ${rows.length} matching conditions · ${buildStats().filter(item=>item.answered).length} answered overall`;
    if(result&&result.textContent!==resultText)result.textContent=resultText;
    if(list){
      const signature=`${state.filter}|${state.sort}|${normalise(state.query)}|${state.limit}|${visible.map(item=>`${item.id}:${item.health}:${item.answered}:${item.presented}`).join(';')}`;
      if(list.dataset.signature!==signature){
        list.dataset.signature=signature;
        list.innerHTML=visible.length?visible.map(conditionRowHtml).join(''):'<section class="empty"><p>No conditions match this view.</p></section>';
        bindFocusButtons(list);
      }
    }
    if(more){
      const hidden=visible.length>=rows.length;
      if(more.hidden!==hidden)more.hidden=hidden;
      const moreText=`Show ${Math.min(PAGE_SIZE,rows.length-visible.length)} more`;
      if(more.textContent!==moreText)more.textContent=moreText;
    }
  }
  function decorateAnalytics(){
    if(!location.hash.startsWith('#/analytics'))return;
    decorateSnapshot();
    const explorer=ensureExplorer();
    if(explorer)drawExplorer(explorer);
  }
  function injectStyles(){
    if(document.getElementById('condition-performance-styles'))return;
    const style=document.createElement('style');
    style.id='condition-performance-styles';
    style.textContent=`
      .condition-summary>div:first-child{min-width:0;flex:1}
      .condition-performance-mini{display:grid;grid-template-columns:minmax(70px,110px) minmax(0,1fr);align-items:center;gap:.5rem;margin-top:.42rem;max-width:430px}
      .condition-mini-track,.condition-performance-track{display:block;position:relative;height:7px;overflow:hidden;border-radius:999px;background:rgba(133,169,197,.18)}
      .condition-mini-track>span,.condition-performance-track>span{display:block;width:var(--condition-health,0%);height:100%;border-radius:inherit;background:var(--condition-colour,#8295a5);transition:width .22s ease}
      .health-red{--condition-colour:#ff667f}.health-amber{--condition-colour:#ffc35a}.health-green{--condition-colour:#67e3a2}.health-neutral{--condition-colour:#8295a5}
      .condition-mini-label{min-width:0;color:var(--muted);font-family:var(--sans);font-size:.72rem;line-height:1.2;overflow-wrap:anywhere}
      .condition-sup{white-space:nowrap}
      .condition-rank-row{width:100%;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .condition-rank-row:hover span:first-child,.condition-performance-name:hover strong{text-decoration:underline}
      .condition-explorer-card{grid-column:1/-1;min-width:0}
      .condition-explorer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
      .condition-explorer-head h3{margin-bottom:.35rem}.condition-explorer-head p{margin:0;max-width:760px;color:var(--muted)}
      .condition-explorer-controls{display:grid;grid-template-columns:minmax(220px,1.5fr) minmax(150px,.75fr) minmax(160px,.75fr);gap:.75rem;margin:1rem 0}
      .condition-explorer-controls label{display:grid;gap:.35rem}.condition-explorer-controls label>span{color:var(--muted);font-size:.75rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
      .condition-performance-list{display:grid;gap:.45rem}
      .condition-performance-row{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(170px,.8fr) auto;align-items:center;gap:1rem;padding:.72rem .8rem;border:1px solid rgba(133,169,197,.2);border-left:4px solid var(--condition-colour);border-radius:13px;background:rgba(255,255,255,.025)}
      .condition-performance-name{display:grid;min-width:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .condition-performance-name strong{min-width:0;overflow-wrap:anywhere}.condition-performance-name small,.condition-performance-health small,.condition-performance-score small{color:var(--muted)}
      .condition-performance-health{display:grid;gap:.32rem;min-width:0}.condition-performance-score{display:grid;justify-items:end;min-width:64px}.condition-performance-score strong{font-size:1.08rem}
      .condition-performance-more{display:block;margin:1rem auto 0}.condition-performance-more[hidden]{display:none}
      @media(max-width:760px){
        .condition-explorer-head{display:grid}.condition-explorer-controls{grid-template-columns:minmax(0,1fr)}
        .condition-performance-row{grid-template-columns:minmax(0,1fr) auto;gap:.6rem .8rem}.condition-performance-health{grid-column:1/-1;grid-row:2}.condition-performance-score{grid-column:2;grid-row:1}
      }
      @media(max-width:480px){.condition-performance-mini{grid-template-columns:72px minmax(0,1fr)}.condition-mini-label{font-size:.68rem}}
    `;
    document.head.appendChild(style);
  }
  function apply(){
    scheduled=false;
    if(!core()?.App?.loaded)return;
    injectStyles();
    decorateConditionCards();
    decorateFocus();
    decorateAnalytics();
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
  function initialise(){
    const app=document.getElementById('app');
    if(!app||!core()){setTimeout(initialise,100);return;}
    observer=new MutationObserver(schedule);
    observer.observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',()=>setTimeout(schedule,0));
    document.addEventListener('ukmlaLearningEvent',()=>{cachedSignature='';schedule();});
    document.addEventListener('ukmlaQuestionBankChanged',()=>{cachedSignature='';schedule();});
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
  window.UKMLA_CONDITION_PERFORMANCE={buildStats,csvText,NEEDS_WORK_THRESHOLD};
})();
