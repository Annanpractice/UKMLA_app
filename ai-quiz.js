/* AI-generated UKMLA quiz interface.
   The pasted OpenAI key is held only in this page's JavaScript memory.
   It is never written to localStorage, Firebase, or the repository.
*/
(function () {
  'use strict';

  const KEYS = {
    sets: 'ukmlaAiGeneratedQuizSetsV1',
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
  const QUESTION_TYPES = [
    ['sparse_most_likely_diagnosis', 'Sparse presentation: most likely diagnosis'],
    ['close_mimic_discrimination', 'Close-mimic discrimination'],
    ['first_line_investigation', 'First-line investigation'],
    ['dangerous_diagnosis_priority_exclusion', 'Dangerous diagnosis: priority exclusion'],
    ['next_step_after_initial_result', 'Next step after an initial result'],
    ['immediate_emergency_management', 'Immediate emergency management'],
    ['stable_first_line_treatment', 'Standard first-line treatment in a stable patient'],
    ['contraindication_caveat_switch', 'Contraindication or caveat switch'],
    ['failure_or_deterioration', 'Failure of first-line treatment or deterioration'],
    ['escalation_referral_disposition', 'Escalation, referral, disposition or safety net']
  ];
  const state = { set: null, index: 0, answers: [], apiKey: '', warnings: [] };

  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function load(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch (_) { return fallback; }
  }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
  function nudge(current, target, weight) { return Math.round(clamp(current, 0, 100) * (1 - weight) + clamp(target, 0, 100) * weight); }
  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

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

  function getDecisionFor(condition) {
    const decisions = load(KEYS.decisions, {});
    return Object.values(decisions || {}).find(item => clean(item?.conditionName).toLowerCase() === condition.name.toLowerCase()) || null;
  }

  function recentTargetConditions() {
    const names = new Set();
    for (const set of load(KEYS.sets, []).slice(0, 20)) {
      for (const question of set?.questions || []) {
        const name = clean(question?.targetCondition).toLowerCase();
        if (name) names.add(name);
      }
    }
    return names;
  }

  function randomAcrossEncyclopedia(count) {
    const all = catalogue();
    const recent = recentTargetConditions();
    let eligible = all.filter(condition => !recent.has(condition.name.toLowerCase()));
    if (eligible.length < count) eligible = all.slice();

    const byTopic = new Map();
    for (const condition of eligible) {
      if (!byTopic.has(condition.topic)) byTopic.set(condition.topic, []);
      byTopic.get(condition.topic).push(condition);
    }

    const selected = [];
    for (const topic of shuffle([...byTopic.keys()])) {
      const group = byTopic.get(topic);
      selected.push(group[Math.floor(Math.random() * group.length)]);
      if (selected.length === count) break;
    }

    if (selected.length < count) {
      const used = new Set(selected.map(condition => condition.name.toLowerCase()));
      for (const condition of shuffle(eligible)) {
        if (used.has(condition.name.toLowerCase())) continue;
        selected.push(condition);
        used.add(condition.name.toLowerCase());
        if (selected.length === count) break;
      }
    }

    return shuffle(selected).slice(0, count);
  }

  function buildPayload(topic, conditionName, difficulty, mode = 'topic') {
    const randomMode = mode === 'random_all_conditions';
    const selected = randomMode
      ? randomAcrossEncyclopedia(10)
      : catalogue().filter(item => item.topic === topic && (conditionName === '__all__' || item.name === conditionName));
    return {
      mode,
      topic: randomMode ? 'All encyclopedia conditions' : topic,
      difficulty,
      generatedAt: new Date().toISOString(),
      conditions: selected.map(condition => ({ ...condition, decisionData: getDecisionFor(condition) })),
      requirements: {
        questionCount: 10,
        optionLabels: ['A', 'B', 'C', 'D', 'E'],
        typeLabels: QUESTION_TYPES.map(x => x[1]),
        balancedOptionLengths: true,
        oneQuestionPerType: true,
        fiveHomogeneousOptions: true,
        conciseClinicalStems: true,
        oneQuestionPerSelectedCondition: randomMode,
        noDuplicateTargetConditions: randomMode,
        broadTopicSpread: randomMode
      }
    };
  }

  function responseSchema() {
    const option = {
      type: 'object', additionalProperties: false,
      required: ['id', 'text', 'topic', 'condition', 'param'],
      properties: {
        id: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
        text: { type: 'string' }, topic: { type: 'string' }, condition: { type: 'string' },
        param: { type: 'string', enum: PARAMS }
      }
    };
    const question = {
      type: 'object', additionalProperties: false,
      required: ['id', 'questionNumber', 'questionType', 'questionTypeLabel', 'topic', 'targetCondition', 'learningPoint', 'stem', 'leadIn', 'options', 'correctOptionId', 'decisiveClue', 'rationale', 'strongestDistractorId', 'strongestDistractorExplanation', 'guideline'],
      properties: {
        id: { type: 'string' }, questionNumber: { type: 'integer', minimum: 1, maximum: 10 },
        questionType: { type: 'string', enum: QUESTION_TYPES.map(x => x[0]) },
        questionTypeLabel: { type: 'string', enum: QUESTION_TYPES.map(x => x[1]) },
        topic: { type: 'string' }, targetCondition: { type: 'string' }, learningPoint: { type: 'string' },
        stem: { type: 'string' }, leadIn: { type: 'string' },
        options: { type: 'array', minItems: 5, maxItems: 5, items: option },
        correctOptionId: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
        decisiveClue: { type: 'string' }, rationale: { type: 'string' },
        strongestDistractorId: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
        strongestDistractorExplanation: { type: 'string' },
        guideline: {
          type: 'object', additionalProperties: false,
          required: ['source', 'title', 'checkedDate', 'url'],
          properties: {
            source: { type: 'string' }, title: { type: 'string' },
            checkedDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            url: { anyOf: [{ type: 'string' }, { type: 'null' }] }
          }
        }
      }
    };
    return {
      type: 'object', additionalProperties: false,
      required: ['schemaVersion', 'quizId', 'topic', 'generatedAt', 'difficulty', 'questions'],
      properties: {
        schemaVersion: { type: 'string', enum: ['ukmla-ai-quiz-v1'] }, quizId: { type: 'string' },
        topic: { type: 'string' }, generatedAt: { type: 'string' },
        difficulty: { type: 'string', enum: ['standard', 'difficult', 'very_difficult'] },
        questions: { type: 'array', minItems: 10, maxItems: 10, items: question }
      }
    };
  }

  function prompt(payload) {
    const randomInstruction = payload.mode === 'random_all_conditions'
      ? `\nRANDOM ENCYCLOPEDIA MODE: The ten supplied conditions are already randomly selected from ten different encyclopedia topic areas. Question 1 must use conditions[0], question 2 conditions[1], and so on. Use every supplied condition exactly once as targetCondition. Do not substitute, repeat, omit, health-rank or regroup them. Each question.topic must equal that condition's true topic.`
      : '';
    return `Write a ten-item UK Medical Licensing Assessment-style SBA set for a newly qualified doctor.
Use the supplied encyclopedia material as the primary factual source. Do not invent exact doses, thresholds, contraindications, dates, or external citations absent from it.
Create exactly ten questions in this exact order:\n${QUESTION_TYPES.map((x, i) => `${i + 1}. ${x[0]} — ${x[1]}`).join('\n')}
Requirements: applied clinical decisions; concise authentic stems; enough information for the cover test; one unambiguously best answer; four plausible homogeneous distractors; A-E in order; correct and distractor options similar in length and specificity; one or two legitimate difficulty levers only; no rare trivia or omitted essential information. Every option must include its true topic, condition, and nearest scoring aspect (Ix, Tx, Escalate, Mimics, or Red flags). Include a short rationale and explain why the strongest distractor is wrong. Difficulty: ${payload.difficulty}.${randomInstruction}
For an unverifiable guideline field use source "Internal UKMLA encyclopedia content", a relevant title, and null checkedDate/url.
Source material:\n${JSON.stringify(payload)}`;
  }

  function extractOutputText(data) {
    if (typeof data.output_text === 'string') return data.output_text;
    for (const item of data.output || []) {
      for (const content of item.content || []) if (content.type === 'output_text' && content.text) return content.text;
    }
    return '';
  }

  function validate(set, payload) {
    const errors = [];
    const warnings = [];
    if (!set || !Array.isArray(set.questions) || set.questions.length !== 10) errors.push('The response must contain exactly ten questions.');
    const seenTypes = new Set();
    const seenStems = new Set();
    const seenTargets = new Set();
    (set?.questions || []).forEach((q, i) => {
      if (!q.questionType) errors.push(`Question ${i + 1}: missing question type.`); else seenTypes.add(q.questionType);
      const stem = clean(q.stem).toLowerCase();
      if (!stem) errors.push(`Question ${i + 1}: missing stem.`);
      if (seenStems.has(stem)) errors.push(`Question ${i + 1}: duplicate stem.`); else seenStems.add(stem);
      const target = clean(q.targetCondition).toLowerCase();
      if (target) {
        if (seenTargets.has(target)) warnings.push(`Question ${i + 1}: target condition is repeated.`);
        seenTargets.add(target);
      }
      if (!Array.isArray(q.options) || q.options.length !== 5) errors.push(`Question ${i + 1}: requires five options.`);
      const ids = (q.options || []).map(o => o.id);
      if (ids.join('') !== 'ABCDE') errors.push(`Question ${i + 1}: option IDs must be A-E in order.`);
      if (!ids.includes(q.correctOptionId)) errors.push(`Question ${i + 1}: invalid correct answer.`);
      const lengths = (q.options || []).map(o => clean(o.text).length).filter(Boolean);
      if (lengths.length === 5) {
        const correct = clean(q.options.find(o => o.id === q.correctOptionId)?.text).length;
        const median = [...lengths].sort((a, b) => a - b)[2];
        if (correct > median * 1.55 || correct < median * 0.55) warnings.push(`Question ${i + 1}: correct option length differs noticeably from the distractors.`);
      }
      if (!clean(q.rationale) || !clean(q.strongestDistractorExplanation)) errors.push(`Question ${i + 1}: rationale is incomplete.`);
    });
    if (seenTypes.size !== 10) errors.push('Each prescribed question type must appear exactly once.');

    if (payload?.mode === 'random_all_conditions') {
      const expected = payload.conditions.map(condition => condition.name.toLowerCase());
      const actual = (set?.questions || []).map(question => clean(question.targetCondition).toLowerCase());
      if (new Set(actual).size !== 10) errors.push('Random encyclopedia mode requires ten different target conditions.');
      expected.forEach((name, index) => {
        if (actual[index] !== name) errors.push(`Question ${index + 1}: random target condition changed or moved.`);
        const expectedTopic = clean(payload.conditions[index]?.topic).toLowerCase();
        const actualTopic = clean(set?.questions?.[index]?.topic).toLowerCase();
        if (expectedTopic && actualTopic !== expectedTopic) errors.push(`Question ${index + 1}: target topic does not match the selected condition.`);
      });
    }
    return { errors, warnings };
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
    return correct;
  }

  function refreshVisibleHealth() {
    const progress = load(KEYS.progress, {});
    document.querySelectorAll('.nav a[href^="#"]').forEach(link => {
      const section = document.querySelector(link.getAttribute('href'));
      if (!section) return;
      const score = progress[sectionTitle(section)]?.health ?? 50;
      const scoreEl = link.querySelector('.topic-score');
      if (scoreEl) scoreEl.textContent = `${score}%`;
      const bulb = link.querySelector('.topic-bulb');
      if (bulb) {
        const hue = score < 40 ? 2 + 26 * score / 40 : score < 70 ? 28 + 26 * (score - 40) / 30 : 54 + 70 * (score - 70) / 30;
        bulb.style.setProperty('--bulb-color', `hsl(${Math.round(hue)} 82% ${score >= 85 ? 34 : 39}%)`);
        bulb.style.setProperty('--bulb-glow', `hsla(${Math.round(hue)},82%,39%,.42)`);
      }
    });
  }

  async function generateQuiz(mode = 'topic') {
    const status = document.getElementById('aiq-status');
    const buttons = [document.getElementById('aiq-generate'), document.getElementById('aiq-random')].filter(Boolean);
    const keyInput = document.getElementById('aiq-key');
    state.apiKey = keyInput.value.trim();
    if (!state.apiKey.startsWith('sk-')) { status.textContent = 'Paste a valid OpenAI API key for this session.'; return; }
    const payload = buildPayload(
      document.getElementById('aiq-topic').value,
      document.getElementById('aiq-condition').value,
      document.getElementById('aiq-difficulty').value,
      mode
    );
    if (mode === 'random_all_conditions' && payload.conditions.length !== 10) {
      status.textContent = 'The encyclopedia did not provide ten eligible unique conditions.';
      state.apiKey = '';
      keyInput.value = '';
      return;
    }
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = mode === 'random_all_conditions'
      ? 'Randomly selected ten conditions across the encyclopedia. Generating and validating…'
      : 'Generating and validating ten questions…';
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          input: [
            { role: 'system', content: [{ type: 'input_text', text: 'Return only the requested schema-conforming UKMLA quiz.' }] },
            { role: 'user', content: [{ type: 'input_text', text: prompt(payload) }] }
          ],
          text: { format: { type: 'json_schema', name: 'ukmla_ai_quiz', strict: true, schema: responseSchema() } }
        })
      });
      const raw = await response.json();
      if (!response.ok) throw new Error(raw?.error?.message || `OpenAI request failed (${response.status}).`);
      const output = extractOutputText(raw);
      if (!output) throw new Error('OpenAI returned no structured quiz.');
      const data = JSON.parse(output);
      const validation = validate(data, payload);
      if (validation.errors.length) throw new Error(validation.errors.slice(0, 4).join(' '));
      state.set = data;
      state.index = 0;
      state.answers = [];
      state.warnings = validation.warnings;
      const sets = load(KEYS.sets, []);
      sets.unshift(data);
      save(KEYS.sets, sets.slice(0, 30));
      const prefix = mode === 'random_all_conditions' ? 'Random encyclopedia set generated.' : 'Ten-question set generated.';
      status.textContent = validation.warnings.length
        ? `${prefix} ${validation.warnings.length} option-length warning${validation.warnings.length === 1 ? '' : 's'} noted, but the set is usable.`
        : `${prefix} Passed local validation.`;
      renderQuiz();
    } catch (error) {
      status.textContent = `Generation failed: ${error.message}`;
    } finally {
      state.apiKey = '';
      keyInput.value = '';
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function renderQuiz() {
    const area = document.getElementById('aiq-play');
    if (!state.set) { area.innerHTML = '<p class="aiq-muted">Generate a set to begin.</p>'; return; }
    const q = state.set.questions[state.index];
    const answer = state.answers[state.index];
    area.innerHTML = `<div class="aiq-progress">Question ${state.index + 1} of 10 · ${clean(q.questionTypeLabel || q.questionType)}</div><h3>${clean(q.stem)}</h3><p class="aiq-leadin">${clean(q.leadIn)}</p><div class="aiq-options">${q.options.map(o => `<button type="button" class="aiq-option ${answer?.selected === o.id ? 'selected' : ''}" data-id="${o.id}"><b>${o.id}.</b> ${clean(o.text)}</button>`).join('')}</div><div id="aiq-feedback">${answer ? feedbackHtml(q, answer) : ''}</div><div class="aiq-nav"><button id="aiq-prev" type="button" ${state.index === 0 ? 'disabled' : ''}>Previous</button><button id="aiq-next" type="button" ${state.index === 9 ? 'disabled' : ''}>Next</button></div>`;
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
    state.answers[state.index] = { selected: id, correct: scoreQuestion(q, chosen) };
    refreshVisibleHealth();
    renderQuiz();
  }

  function populateTopics() {
    const topicSelect = document.getElementById('aiq-topic');
    topicSelect.innerHTML = [...new Set(catalogue().map(x => x.topic))].map(t => `<option>${clean(t)}</option>`).join('');
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
    style.textContent = `.aiq-shell{margin:1.4rem max(1.2rem,4vw);padding:1.2rem;background:var(--panel,#fffefa);border:1px solid var(--line,#d8d0c4);border-radius:18px;box-shadow:var(--shadow,0 10px 30px rgba(29,27,24,.08))}.aiq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.8rem}.aiq-grid label{display:grid;gap:.3rem;font-weight:700}.aiq-grid select,.aiq-grid input{width:100%;padding:.7rem;border:1px solid var(--line,#d8d0c4);border-radius:10px;background:#fff}.aiq-key-note{margin:.45rem 0 0;color:#8b2323;font-size:.88rem}.aiq-actions{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-top:1rem}.aiq-random-note{flex-basis:100%;margin:.15rem 0 0;color:var(--muted,#70695f);font-size:.86rem}.aiq-muted,#aiq-status{color:var(--muted,#70695f)}#aiq-play{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line,#d8d0c4)}.aiq-progress{font-size:.85rem;color:var(--muted,#70695f);text-transform:uppercase;letter-spacing:.05em}.aiq-leadin{font-weight:700}.aiq-options{display:grid;gap:.55rem}.aiq-option{text-align:left;border-radius:12px;padding:.8rem 1rem;font-size:.98rem}.aiq-option.selected{border-color:var(--accent,#2f5d62);background:var(--accent-soft,#e4eeee)}.aiq-feedback{margin-top:1rem;padding:.9rem;border-radius:12px}.aiq-feedback.correct{background:#e7f4e8}.aiq-feedback.incorrect{background:#f6e8e8}.aiq-nav{display:flex;justify-content:space-between;margin-top:1rem}@media(max-width:700px){.aiq-shell{margin:1rem}.aiq-option{border-radius:10px}.aiq-actions button{width:100%}}`;
    document.head.appendChild(style);
  }

  function makeInterface() {
    if (document.getElementById('ai-generated-quiz')) return;
    injectStyles();
    const section = document.createElement('section');
    section.id = 'ai-generated-quiz';
    section.className = 'aiq-shell';
    section.innerHTML = `<h2>AI Generated Quiz</h2><p class="aiq-muted">Ten applied UKMLA-style SBAs. Results update the existing topic-health system.</p><div class="aiq-grid"><label>Topic<select id="aiq-topic"></select></label><label>Condition<select id="aiq-condition"></select></label><label>Difficulty<select id="aiq-difficulty"><option value="standard">Standard</option><option value="difficult" selected>Difficult</option><option value="very_difficult">Very difficult</option></select></label><label>Temporary OpenAI API key<input id="aiq-key" type="password" autocomplete="off" placeholder="sk-…" spellcheck="false"><span class="aiq-key-note">Used for one generation request, then cleared. It is not saved or synced.</span></label></div><div class="aiq-actions"><button id="aiq-generate" type="button">Generate selected-topic quiz</button><button id="aiq-random" type="button">Random encyclopedia: 10 conditions</button><span id="aiq-status">AI-generated questions require checking against current UK guidance.</span><p class="aiq-random-note">Random mode ignores the topic selectors and draws ten unique conditions from ten different topic areas, avoiding recently tested conditions where possible.</p></div><div id="aiq-play"></div>`;
    const quiz = document.getElementById('quiz-panel') || document.querySelector('.quiz-panel') || document.querySelector('main');
    if (quiz?.parentNode) quiz.parentNode.insertBefore(section, quiz.nextSibling); else document.body.appendChild(section);
    populateTopics();
    document.getElementById('aiq-generate').addEventListener('click', () => generateQuiz('topic'));
    document.getElementById('aiq-random').addEventListener('click', () => generateQuiz('random_all_conditions'));
    renderQuiz();
  }

  window.addEventListener('pagehide', () => { state.apiKey = ''; const input = document.getElementById('aiq-key'); if (input) input.value = ''; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeInterface);
  else makeInterface();
})();
