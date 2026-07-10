/* AI-generated UKMLA quiz interface.
   Loaded by remote-sync.js so the main baked HTML does not need to be rewritten.
*/
(function () {
  'use strict';

  const KEYS = {
    sets: 'ukmlaAiGeneratedQuizSetsV1',
    config: 'ukmlaAiQuizConfigV1',
    progress: 'ukmlaQuizProgressV1',
    decisions: 'ukmlaAiDecisionDataV1'
  };
  const PARAMS = ['Ix', 'Tx', 'Escalate', 'Mimics', 'Red flags'];
  const TYPE_PARAM = {
    sparse_most_likely_diagnosis: 'Mimics',
    close_mimic_discrimination: 'Mimics',
    first_line_investigation: 'Ix',
    dangerous_diagnosis_priority_exclusion: 'Red flags',
    next_step_after_initial_result: 'Ix',
    immediate_emergency_management: 'Escalate',
    stable_first_line_treatment: 'Tx',
    contraindication_caveat_switch: 'Tx',
    failure_or_deterioration: 'Escalate',
    escalation_referral_disposition: 'Escalate'
  };
  const TYPE_LABELS = [
    'Sparse presentation: most likely diagnosis',
    'Close-mimic discrimination',
    'First-line investigation',
    'Dangerous diagnosis: priority exclusion',
    'Next step after an initial result',
    'Immediate emergency management',
    'Standard first-line treatment in a stable patient',
    'Contraindication or caveat switch',
    'Failure of first-line treatment or deterioration',
    'Escalation, referral, disposition or safety net'
  ];

  const state = { set: null, index: 0, answers: [], submitted: false };

  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function load(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch (_) { return fallback; }
  }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
  function nudge(current, target, weight) { return Math.round(clamp(current, 0, 100) * (1 - weight) + clamp(target, 0, 100) * weight); }

  function sectionTitle(section) {
    const h2 = section && section.querySelector('h2');
    if (!h2) return 'Uncategorised';
    const copy = h2.cloneNode(true);
    copy.querySelectorAll('.inferred').forEach(node => node.remove());
    return clean(copy.textContent);
  }

  function conditionData(card, index) {
    const fields = {};
    card.querySelectorAll('.items li').forEach(li => {
      const label = li.querySelector('.label');
      if (!label) return;
      const key = clean(label.textContent).replace(/:$/, '');
      if (PARAMS.includes(key)) fields[key] = clean(li.textContent.replace(label.textContent, ''));
    });
    const section = card.closest('.section');
    return {
      id: `condition-${index}`,
      name: clean(card.querySelector('summary')?.textContent),
      topic: sectionTitle(section),
      topicId: section?.id || 'uncategorised',
      fields
    };
  }

  function catalogue() {
    return Array.from(document.querySelectorAll('.card')).map(conditionData).filter(x => x.name && Object.keys(x.fields).length);
  }

  function getDecisionFor(condition, index) {
    const decisions = load(KEYS.decisions, {});
    const candidates = Object.values(decisions || {});
    return candidates.find(item => clean(item?.conditionName).toLowerCase() === condition.name.toLowerCase()) || null;
  }

  function buildPayload(topic, conditionName, difficulty) {
    const all = catalogue();
    const selected = all.filter(item => item.topic === topic && (!conditionName || conditionName === '__all__' || item.name === conditionName));
    return {
      topic,
      difficulty,
      generatedAt: new Date().toISOString(),
      conditions: selected.map((condition, index) => ({ ...condition, decisionData: getDecisionFor(condition, index) })),
      requirements: {
        questionCount: 10,
        optionLabels: ['A', 'B', 'C', 'D', 'E'],
        typeLabels: TYPE_LABELS,
        balancedOptionLengths: true,
        oneQuestionPerType: true,
        fiveHomogeneousOptions: true,
        conciseClinicalStems: true
      }
    };
  }

  function validate(set) {
    const errors = [];
    if (!set || !Array.isArray(set.questions) || set.questions.length !== 10) errors.push('The response must contain exactly ten questions.');
    const seenTypes = new Set();
    const seenStems = new Set();
    (set?.questions || []).forEach((q, i) => {
      if (!q.questionType) errors.push(`Question ${i + 1}: missing questionType.`); else seenTypes.add(q.questionType);
      const stemKey = clean(q.stem).toLowerCase();
      if (!stemKey) errors.push(`Question ${i + 1}: missing stem.`);
      if (seenStems.has(stemKey)) errors.push(`Question ${i + 1}: duplicate stem.`); else seenStems.add(stemKey);
      if (!Array.isArray(q.options) || q.options.length !== 5) errors.push(`Question ${i + 1}: requires five options.`);
      const ids = (q.options || []).map(o => o.id);
      if (ids.join('') !== 'ABCDE') errors.push(`Question ${i + 1}: option IDs must be A-E in order.`);
      if (!ids.includes(q.correctOptionId)) errors.push(`Question ${i + 1}: invalid correctOptionId.`);
      const lengths = (q.options || []).map(o => clean(o.text).length).filter(Boolean);
      if (lengths.length === 5) {
        const correct = clean(q.options.find(o => o.id === q.correctOptionId)?.text).length;
        const median = [...lengths].sort((a,b) => a-b)[2];
        if (correct > median * 1.55 || correct < median * 0.55) errors.push(`Question ${i + 1}: correct option length is conspicuous.`);
      }
      if (!clean(q.rationale) || !clean(q.strongestDistractorExplanation)) errors.push(`Question ${i + 1}: rationale is incomplete.`);
    });
    if (seenTypes.size !== 10) errors.push('Each of the ten prescribed question types must appear exactly once.');
    return errors;
  }

  function ensureTopic(progress, topic) {
    if (!progress[topic] || typeof progress[topic] !== 'object') progress[topic] = {};
    const t = progress[topic];
    if (!Number.isFinite(Number(t.health))) t.health = 50;
    if (!Number.isFinite(Number(t.attempts))) t.attempts = 0;
    if (!Number.isFinite(Number(t.correct))) t.correct = 0;
    if (!Number.isFinite(Number(t.borrowedHits))) t.borrowedHits = 0;
    if (!Number.isFinite(Number(t.sameTopicConfusions))) t.sameTopicConfusions = 0;
    if (!t.params) t.params = {};
    PARAMS.forEach(param => {
      if (!t.params[param]) t.params[param] = { health: 50, attempts: 0, correct: 0, borrowedHits: 0, sameTopicConfusions: 0 };
    });
    if (!progress.__mistakes) progress.__mistakes = [];
    if (!progress.__confusions) progress.__confusions = {};
    return t;
  }

  function scoreQuestion(q, chosen) {
    const progress = load(KEYS.progress, {});
    const topicName = q.topic || state.set.topic;
    const param = TYPE_PARAM[q.questionType] || 'Escalate';
    const topic = ensureTopic(progress, topicName);
    const aspect = topic.params[param];
    const correct = chosen.id === q.correctOptionId;
    const target = correct ? 100 : 0;
    topic.health = nudge(topic.health, target, 0.18);
    topic.attempts += 1;
    if (correct) topic.correct += 1;
    aspect.health = nudge(aspect.health, target, 0.18);
    aspect.attempts += 1;
    if (correct) aspect.correct += 1;

    if (!correct) {
      const borrowedTopic = chosen.topic;
      if (borrowedTopic && borrowedTopic !== topicName) {
        const borrowed = ensureTopic(progress, borrowedTopic);
        const borrowedParam = borrowed.params[chosen.param || param] || borrowed.params[param];
        borrowed.health = nudge(borrowed.health, 25, 0.10);
        borrowed.borrowedHits += 1;
        borrowedParam.health = nudge(borrowedParam.health, 25, 0.10);
        borrowedParam.borrowedHits += 1;
      } else {
        topic.sameTopicConfusions += 1;
        aspect.sameTopicConfusions += 1;
      }
      progress.__mistakes.unshift({
        at: new Date().toISOString(), askedSection: topicName, askedCondition: q.targetCondition,
        selectedSection: chosen.topic || topicName, selectedCondition: chosen.condition || '', param,
        selectedText: chosen.text, correctText: q.options.find(o => o.id === q.correctOptionId)?.text || ''
      });
      progress.__mistakes = progress.__mistakes.slice(0, 120);
    }
    save(KEYS.progress, progress);
    document.dispatchEvent(new CustomEvent('ukmlaAiQuizScored', { detail: { topic: topicName, param, correct } }));
    return correct;
  }

  function refreshVisibleHealth() {
    const progress = load(KEYS.progress, {});
    document.querySelectorAll('.nav a[href^="#"]').forEach(link => {
      const section = document.querySelector(link.getAttribute('href'));
      if (!section) return;
      const topic = sectionTitle(section);
      const score = progress[topic]?.health ?? 50;
      const scoreEl = link.querySelector('.topic-score');
      if (scoreEl) scoreEl.textContent = `${score}%`;
      const bulb = link.querySelector('.topic-bulb');
      if (bulb) {
        const hue = score < 40 ? 2 + 26 * score / 40 : score < 70 ? 28 + 26 * (score - 40) / 30 : 54 + 70 * (score - 70) / 30;
        bulb.style.setProperty('--bulb-color', `hsl(${Math.round(hue)} 82% ${score >= 85 ? 34 : 39}%)`);
        bulb.style.setProperty('--bulb-glow', `hsla(${Math.round(hue)},82%,39%,.42)`);
      }
    });
    document.querySelectorAll('.section').forEach(section => {
      const topic = sectionTitle(section);
      const score = progress[topic]?.health ?? 50;
      const wrap = section.querySelector('.section-health-wrap');
      if (wrap) {
        const text = Array.from(wrap.childNodes).find(n => n.nodeType === Node.TEXT_NODE || n.matches?.('span:not(.section-bulb)'));
        if (text) text.textContent = `${score}%`;
      }
    });
  }

  async function generateQuiz() {
    const status = document.getElementById('aiq-status');
    const generate = document.getElementById('aiq-generate');
    const config = load(KEYS.config, {});
    const endpoint = clean(document.getElementById('aiq-endpoint').value || config.endpoint);
    const topic = document.getElementById('aiq-topic').value;
    const condition = document.getElementById('aiq-condition').value;
    const difficulty = document.getElementById('aiq-difficulty').value;
    if (!endpoint || endpoint.includes('YOUR-WORKER')) { status.textContent = 'Enter the deployed Worker endpoint first.'; return; }
    save(KEYS.config, { endpoint });
    generate.disabled = true;
    status.textContent = 'Generating and validating ten questions…';
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload(topic, condition, difficulty)) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      const errors = validate(data);
      if (errors.length) throw new Error(errors.slice(0, 4).join(' '));
      state.set = data; state.index = 0; state.answers = []; state.submitted = false;
      const sets = load(KEYS.sets, []);
      sets.unshift(data);
      save(KEYS.sets, sets.slice(0, 30));
      status.textContent = 'Ten-question set generated and passed local validation.';
      renderQuiz();
    } catch (error) {
      status.textContent = `Generation failed: ${error.message}`;
    } finally { generate.disabled = false; }
  }

  function renderQuiz() {
    const area = document.getElementById('aiq-play');
    if (!state.set) { area.innerHTML = '<p class="aiq-muted">Generate a set or load a previous set.</p>'; return; }
    const q = state.set.questions[state.index];
    const answer = state.answers[state.index];
    area.innerHTML = `
      <div class="aiq-progress">Question ${state.index + 1} of 10 · ${clean(q.questionTypeLabel || q.questionType)}</div>
      <h3>${clean(q.stem)}</h3>
      <p class="aiq-leadin">${clean(q.leadIn)}</p>
      <div class="aiq-options">${q.options.map(o => `<button type="button" class="aiq-option ${answer?.selected === o.id ? 'selected' : ''}" data-id="${o.id}"><b>${o.id}.</b> ${clean(o.text)}</button>`).join('')}</div>
      <div id="aiq-feedback">${answer ? feedbackHtml(q, answer) : ''}</div>
      <div class="aiq-nav"><button id="aiq-prev" type="button" ${state.index === 0 ? 'disabled' : ''}>Previous</button><button id="aiq-next" type="button" ${state.index === 9 ? 'disabled' : ''}>Next</button></div>`;
    area.querySelectorAll('.aiq-option').forEach(button => button.addEventListener('click', () => choose(button.dataset.id)));
    area.querySelector('#aiq-prev')?.addEventListener('click', () => { state.index -= 1; renderQuiz(); });
    area.querySelector('#aiq-next')?.addEventListener('click', () => { state.index += 1; renderQuiz(); });
  }

  function feedbackHtml(q, answer) {
    return `<div class="aiq-feedback ${answer.correct ? 'correct' : 'incorrect'}"><strong>${answer.correct ? 'Correct' : 'Incorrect'}.</strong> ${clean(q.rationale)}<br><span>${clean(q.strongestDistractorExplanation)}</span></div>`;
  }

  function choose(id) {
    if (state.answers[state.index]) return;
    const q = state.set.questions[state.index];
    const chosen = q.options.find(o => o.id === id);
    const correct = scoreQuestion(q, chosen);
    state.answers[state.index] = { selected: id, correct };
    refreshVisibleHealth();
    renderQuiz();
  }

  function populateTopics() {
    const topicSelect = document.getElementById('aiq-topic');
    const topics = [...new Set(catalogue().map(x => x.topic))];
    topicSelect.innerHTML = topics.map(t => `<option>${clean(t)}</option>`).join('');
    topicSelect.addEventListener('change', populateConditions);
    populateConditions();
  }

  function populateConditions() {
    const topic = document.getElementById('aiq-topic').value;
    const conditions = catalogue().filter(x => x.topic === topic);
    document.getElementById('aiq-condition').innerHTML = '<option value="__all__">Whole topic</option>' + conditions.map(c => `<option>${clean(c.name)}</option>`).join('');
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `.aiq-shell{margin:1.4rem max(1.2rem,4vw);padding:1.2rem;background:var(--panel,#fffefa);border:1px solid var(--line,#d8d0c4);border-radius:18px;box-shadow:var(--shadow,0 10px 30px rgba(29,27,24,.08))}.aiq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.8rem}.aiq-grid label{display:grid;gap:.3rem;font-weight:700}.aiq-grid select,.aiq-grid input{width:100%;padding:.7rem;border:1px solid var(--line,#d8d0c4);border-radius:10px;background:#fff}.aiq-actions{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-top:1rem}.aiq-muted,#aiq-status{color:var(--muted,#70695f)}#aiq-play{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line,#d8d0c4)}.aiq-progress{font-size:.85rem;color:var(--muted,#70695f);text-transform:uppercase;letter-spacing:.05em}.aiq-leadin{font-weight:700}.aiq-options{display:grid;gap:.55rem}.aiq-option{text-align:left;border-radius:12px;padding:.8rem 1rem;font-size:.98rem}.aiq-option.selected{border-color:var(--accent,#2f5d62);background:var(--accent-soft,#e4eeee)}.aiq-feedback{margin-top:1rem;padding:.9rem;border-radius:12px}.aiq-feedback.correct{background:#e7f4e8}.aiq-feedback.incorrect{background:#f6e8e8}.aiq-nav{display:flex;justify-content:space-between;margin-top:1rem}@media(max-width:700px){.aiq-shell{margin:1rem}.aiq-option{border-radius:10px}}`;
    document.head.appendChild(style);
  }

  function makeInterface() {
    if (document.getElementById('ai-generated-quiz')) return;
    injectStyles();
    const section = document.createElement('section');
    section.id = 'ai-generated-quiz';
    section.className = 'aiq-shell';
    const config = load(KEYS.config, {});
    section.innerHTML = `<h2>AI Generated Quiz</h2><p class="aiq-muted">Ten applied UKMLA-style SBAs: one of each prescribed question type. Results update the existing topic-health system.</p><div class="aiq-grid"><label>Topic<select id="aiq-topic"></select></label><label>Condition<select id="aiq-condition"></select></label><label>Difficulty<select id="aiq-difficulty"><option value="standard">Standard</option><option value="difficult" selected>Difficult</option><option value="very_difficult">Very difficult</option></select></label><label>Secure API endpoint<input id="aiq-endpoint" type="url" value="${clean(config.endpoint || 'https://YOUR-WORKER.workers.dev')}" spellcheck="false"></label></div><div class="aiq-actions"><button id="aiq-generate" type="button">Generate 10 questions</button><span id="aiq-status">AI-generated questions require checking against current UK guidance.</span></div><div id="aiq-play"></div>`;
    const quiz = document.getElementById('quiz-panel') || document.querySelector('.quiz-panel') || document.querySelector('main');
    if (quiz?.parentNode) quiz.parentNode.insertBefore(section, quiz.nextSibling); else document.body.appendChild(section);
    populateTopics();
    document.getElementById('aiq-generate').addEventListener('click', generateQuiz);
    renderQuiz();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeInterface);
  else makeInterface();
})();
