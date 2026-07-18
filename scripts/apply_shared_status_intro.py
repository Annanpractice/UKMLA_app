from pathlib import Path
import re


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected patch target missing in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def regex_once(path, pattern, replacement):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'Expected one regex patch in {path}, found {count}')
    file.write_text(updated, encoding='utf-8')


# Replace the obstructive floating generation pill with the quiz progress borrower.
ai = 'v2/ai-ui.js'
regex_once(
    ai,
    r"function injectBackgroundStyle\(\)\{.*?\n\}\n\nfunction pipelineOptions",
    r'''let completionStatusUntil=0;
let sharedStatusKind='idle';
let restoreStatusTimer=null;

function statusNodes(){return[...document.querySelectorAll('[data-shared-quiz-status]')];}
function prepareStatusNode(node){
  if(node.dataset.sharedStatusReady==='1')return;
  const label=node.querySelector('[data-shared-status-label]');
  const detail=node.querySelector('[data-shared-status-detail]');
  const fill=node.querySelector('[data-shared-status-fill]');
  if(label)label.dataset.defaultText=label.textContent||'';
  if(detail)detail.dataset.defaultText=detail.textContent||'';
  if(fill)fill.dataset.defaultValue=fill.dataset.defaultValue||String(fill.style.getPropertyValue('--value')||'0%').replace('%','');
  node.dataset.sharedStatusReady='1';
}
function restoreStatusNode(node){
  prepareStatusNode(node);
  const label=node.querySelector('[data-shared-status-label]');
  const detail=node.querySelector('[data-shared-status-detail]');
  const fill=node.querySelector('[data-shared-status-fill]');
  if(label)label.textContent=label.dataset.defaultText||'';
  if(detail)detail.textContent=detail.dataset.defaultText||'';
  if(fill)fill.style.setProperty('--value',`${Number(fill.dataset.defaultValue)||0}%`);
  node.classList.remove('generation-borrowed','generation-ready');
  node.removeAttribute('aria-live');
}
function stageText(job){
  const raw=String(job?.lastMessage||'Generating questions').replace(/\s+completed$/i,'').trim();
  return raw||'Generating questions';
}
function updateSharedStatus(job=latestProgress){
  document.getElementById('ai-background-build')?.remove();
  const nodes=statusNodes();
  const active=isBuilding();
  const kind=active?'active':job?.status==='complete'?'complete':'idle';
  if(kind==='complete'&&sharedStatusKind!=='complete')completionStatusUntil=Date.now()+2400;
  sharedStatusKind=kind;
  if(restoreStatusTimer){clearTimeout(restoreStatusTimer);restoreStatusTimer=null;}
  const percent=Math.max(0,Math.min(100,Number(job?.percent)||0));
  for(const node of nodes){
    prepareStatusNode(node);
    const label=node.querySelector('[data-shared-status-label]');
    const detail=node.querySelector('[data-shared-status-detail]');
    const fill=node.querySelector('[data-shared-status-fill]');
    if(active){
      if(label)label.textContent=`Generating questions · ${percent}%`;
      if(detail)detail.textContent=stageText(job);
      if(fill)fill.style.setProperty('--value',`${percent}%`);
      node.classList.add('generation-borrowed');
      node.classList.remove('generation-ready');
      node.setAttribute('aria-live','polite');
    }else if(kind==='complete'&&Date.now()<completionStatusUntil){
      if(label)label.textContent='New question set saved';
      if(detail)detail.textContent='Ready in Question Bank';
      if(fill)fill.style.setProperty('--value','100%');
      node.classList.remove('generation-borrowed');
      node.classList.add('generation-ready');
      node.setAttribute('aria-live','polite');
    }else restoreStatusNode(node);
  }
  if(kind==='complete'&&Date.now()<completionStatusUntil){
    restoreStatusTimer=setTimeout(()=>{for(const node of statusNodes())restoreStatusNode(node);},Math.max(80,completionStatusUntil-Date.now()));
  }
}
function updateIndicator(job=latestProgress){updateSharedStatus(job);}
function refreshSharedStatus(){updateSharedStatus(latestProgress);}

function pipelineOptions'''
)

replace_once(
    ai,
    "function renderSet(container,set,source='ai'){\n  if(!container||!set)return;\n  playState={set,source,index:0,answers:[],correct:0,container};\n  drawQuestion();\n}",
    "function renderSet(container,set,source='ai'){\n  if(!container||!set)return;\n  if(source==='ai')window.UKMLA_QUESTION_BANK?.markSeen?.(set.quizId||set.setId);\n  playState={set,source,index:0,answers:[],correct:0,container};\n  drawQuestion();\n}"
)

replace_once(
    ai,
    "state.container.innerHTML=`<article class=\"quiz-card\" style=\"max-width:920px;margin:auto\"><div class=\"topic-meta\"><span>Question ${state.index+1} of ${state.set.questions.length}</span><span>${escapeHtml(question.questionTypeLabel)}</span></div><div class=\"progress-track\" style=\"margin-top:12px\"><div class=\"progress-fill\" style=\"--value:${Math.round((state.index+1)/state.set.questions.length*100)}%\"></div></div>",
    "state.container.innerHTML=`<article class=\"quiz-card\" style=\"max-width:920px;margin:auto\" data-shared-quiz-status><div class=\"topic-meta\"><span data-shared-status-label>Question ${state.index+1} of ${state.set.questions.length}</span><span data-shared-status-detail>${escapeHtml(question.questionTypeLabel)}</span></div><div class=\"progress-track\" style=\"margin-top:12px\"><div class=\"progress-fill\" data-shared-status-fill data-default-value=\"${Math.round((state.index+1)/state.set.questions.length*100)}\" style=\"--value:${Math.round((state.index+1)/state.set.questions.length*100)}%\"></div></div>"
)
replace_once(
    ai,
    "  state.container.querySelectorAll('[data-ai-option]').forEach(button=>button.onclick=()=>answerQuestion(button.dataset.aiOption));",
    "  refreshSharedStatus();\n  state.container.querySelectorAll('[data-ai-option]').forEach(button=>button.onclick=()=>answerQuestion(button.dataset.aiOption));"
)
replace_once(
    ai,
    "  latestProgress:()=>latestProgress,",
    "  latestProgress:()=>latestProgress,\n  refreshSharedStatus,"
)

# Track generated sets that have not yet been opened and expose their count to navigation.
bank = 'v2/question-bank.js'
replace_once(
    bank,
    "  const SCHEMA='ukmla-question-bank-v1';\n  const TRACKED_SOURCES=new Set(['basic','ai','biomedical','knowledge']);",
    "  const SCHEMA='ukmla-question-bank-v1';\n  const UNSEEN_KEY='ukmlaQuestionBankUnseenV1';\n  const TRACKED_SOURCES=new Set(['basic','ai','biomedical','knowledge']);"
)
replace_once(
    bank,
    "  let reconciliationPromise=null;\n  let volatileIndex=[];",
    "  let reconciliationPromise=null;\n  let volatileIndex=[];\n  let volatileUnseen=new Set();"
)
replace_once(
    bank,
    "  function notify(){document.dispatchEvent(new Event('ukmlaQuestionBankChanged'));}",
    """  function unseenSetIds(){return[...new Set([...parse(localStorage.getItem(UNSEEN_KEY),[]).map(String),...volatileUnseen])];}
  function saveUnseen(ids){
    volatileUnseen=new Set((ids||[]).map(String));
    try{localStorage.setItem(UNSEEN_KEY,JSON.stringify([...volatileUnseen]));volatileUnseen.clear();return true;}
    catch(_){return false;}
  }
  function unseenCount(){
    const available=new Set(bankIndex().map(record=>String(record.setId)));
    return unseenSetIds().filter(setId=>available.has(String(setId))).length;
  }
  function markUnseen(setId){
    const id=String(setId||'');
    if(!id)return false;
    const ids=unseenSetIds();
    if(!ids.includes(id))ids.push(id);
    saveUnseen(ids);
    notify();
    return true;
  }
  function markSeen(setId){
    const id=String(setId||'');
    if(!id)return false;
    saveUnseen(unseenSetIds().filter(item=>item!==id));
    notify();
    return true;
  }
  function notify(){
    document.dispatchEvent(new Event('ukmlaQuestionBankChanged'));
    document.dispatchEvent(new CustomEvent('ukmlaQuestionBankBadgeChanged',{detail:{count:unseenCount()}}));
  }"""
)
replace_once(
    bank,
    "    saveAttempts(attempts().filter(item=>item.setId!==setId));\n    notify();",
    "    saveAttempts(attempts().filter(item=>item.setId!==setId));\n    saveUnseen(unseenSetIds().filter(item=>item!==String(setId)));\n    notify();"
)
replace_once(
    bank,
    "    const set=await loadSet(setId);\n    if(!set){core()?.toast('This set is listed but its full content is not on this device. Pull sync or restore a backup.');return;}",
    "    const set=await loadSet(setId);\n    if(!set){core()?.toast('This set is listed but its full content is not on this device. Pull sync or restore a backup.');return;}\n    markSeen(setId);"
)
replace_once(
    bank,
    "root.innerHTML=`<article class=\"quiz-card bank-player\"><div class=\"bank-player-top\"><button class=\"btn ghost\" id=\"bank-back\">← Question Bank</button><span>Question ${index+1} of ${set.questions.length}</span></div><div class=\"progress-track\"><div class=\"progress-fill\" style=\"--value:${Math.round((index+1)/set.questions.length*100)}%\"></div></div><div class=\"topic-meta\"><span>${escapeHtml(set.topic||setRecord(set.setId||set.quizId)?.title||'Saved set')}</span><span>${escapeHtml(question.questionTypeLabel||'UKMLA question')}</span></div>",
    "root.innerHTML=`<article class=\"quiz-card bank-player\" data-shared-quiz-status><div class=\"bank-player-top\"><button class=\"btn ghost\" id=\"bank-back\">← Question Bank</button><span data-shared-status-label>Question ${index+1} of ${set.questions.length}</span></div><div class=\"progress-track\"><div class=\"progress-fill\" data-shared-status-fill data-default-value=\"${Math.round((index+1)/set.questions.length*100)}\" style=\"--value:${Math.round((index+1)/set.questions.length*100)}%\"></div></div><div class=\"topic-meta\"><span>${escapeHtml(set.topic||setRecord(set.setId||set.quizId)?.title||'Saved set')}</span><span data-shared-status-detail>${escapeHtml(question.questionTypeLabel||'UKMLA question')}</span></div>"
)
replace_once(
    bank,
    "    root.dataset.activeQuestionTab='bank';\n    root.querySelector('#bank-back').onclick=drawBank;",
    "    root.dataset.activeQuestionTab='bank';\n    window.UKMLA_V2_AI?.refreshSharedStatus?.();\n    root.querySelector('#bank-back').onclick=drawBank;"
)
replace_once(
    bank,
    "    document.addEventListener('ukmlaLearningEvent',event=>void handleLearningEvent(event.detail));\n    void migrateLegacy().catch(error=>core()?.toast(`Storage migration paused: ${error.message}`));",
    "    document.addEventListener('ukmlaLearningEvent',event=>void handleLearningEvent(event.detail));\n    document.addEventListener('ukmlaAiCompletedSetStored',event=>markUnseen(event.detail?.setId));\n    void migrateLegacy().catch(error=>core()?.toast(`Storage migration paused: ${error.message}`));"
)
replace_once(
    bank,
    "    mount,storeSet,loadSet,removeSet,bankIndex,reconcileIndex,attempts,beginAttempt,attemptById,",
    "    mount,storeSet,loadSet,removeSet,bankIndex,reconcileIndex,attempts,beginAttempt,attemptById,\n    unseenSetIds,unseenCount,markUnseen,markSeen,"
)

# Add the red unread-style badge to both desktop and mobile Questions navigation.
workspace = 'v2/question-workspace.js'
replace_once(
    workspace,
    "  function relabelNavigation(){",
    """  function updateQuestionsBadge(){
    const count=Number(window.UKMLA_QUESTION_BANK?.unseenCount?.()||0);
    document.querySelectorAll('[data-nav="quiz"]').forEach(button=>{
      let badge=button.querySelector('.nav-unseen-badge');
      if(!badge){
        badge=document.createElement('span');
        badge.className='nav-unseen-badge';
        badge.setAttribute('aria-hidden','true');
        button.appendChild(badge);
      }
      badge.textContent=count>9?'9+':String(count);
      badge.hidden=count<1;
      button.classList.toggle('has-unseen-question-set',count>0);
    });
  }

  function relabelNavigation(){"""
)
replace_once(
    workspace,
    "    setText(document.getElementById('home-quiz'),'Start UKMLA questions');\n  }",
    "    setText(document.getElementById('home-quiz'),'Start UKMLA questions');\n    updateQuestionsBadge();\n  }"
)
replace_once(
    workspace,
    "    window.addEventListener('hashchange',()=>setTimeout(schedule,0));\n    schedule();",
    "    window.addEventListener('hashchange',()=>setTimeout(schedule,0));\n    document.addEventListener('ukmlaQuestionBankChanged',updateQuestionsBadge);\n    document.addEventListener('ukmlaQuestionBankBadgeChanged',updateQuestionsBadge);\n    document.addEventListener('ukmlaAiCompletedSetStored',updateQuestionsBadge);\n    schedule();"
)
replace_once(
    workspace,
    "  window.UKMLA_QUESTION_WORKSPACE={openTab,applyBranding};",
    "  window.UKMLA_QUESTION_WORKSPACE={openTab,applyBranding,updateQuestionsBadge};"
)

# Load the opening film above the already-rendering app and advance runtime versions.
html = 'v2/app.html'
replace_once(html, '  <link rel="stylesheet" href="./v2/app.css?v=2">', '  <link rel="stylesheet" href="./v2/app.css?v=2">\n  <link rel="stylesheet" href="./v2/intro.css?v=1">\n  <script src="./v2/intro.js?v=1" defer></script>')
replace_once(
    html,
    '<body>\n  <div id="app-shell">',
    '<body>\n  <div class="app-intro" id="app-intro" aria-label="UKMLA opening animation">\n    <video class="app-intro-video" id="app-intro-video" src="./assets/ukmla-intro.mp4" preload="auto" playsinline></video>\n    <button class="app-intro-play" id="app-intro-play" type="button" hidden>Tap to play intro</button>\n    <button class="app-intro-skip" id="app-intro-skip" type="button">Skip</button>\n  </div>\n  <div id="app-shell">'
)
replace_once(html, '<script src="./v2/question-bank.js?v=3"></script>', '<script src="./v2/question-bank.js?v=4"></script>')
replace_once(html, '<script src="./v2/ai-ui.js?v=4"></script>', '<script src="./v2/ai-ui.js?v=5"></script>')
replace_once(html, '<script src="./v2/question-workspace.js?v=2"></script>', '<script src="./v2/question-workspace.js?v=3"></script>')

worker = 'service-worker.js'
replace_once(worker, "const CACHE_NAME='ukmla-cards-v14-generated-set-survival';", "const CACHE_NAME='ukmla-cards-v15-shared-status-intro';")
replace_once(worker, "'./v2/app.css','./v2/psa.css'", "'./v2/app.css','./v2/intro.css','./v2/psa.css'")
replace_once(worker, "'./v2/core.js','./v2/large-storage.js'", "'./assets/ukmla-intro.mp4','./v2/intro.js','./v2/core.js','./v2/large-storage.js'")
