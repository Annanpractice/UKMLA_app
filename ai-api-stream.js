(function () {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const API = 'https://api.openai.com/v1/responses';
  const HYBRID_POSITIONS = [1, 3, 5, 7, 9];
  const QUESTION_TYPE_IDS = [
    'sparse_most_likely_diagnosis',
    'close_mimic_discrimination',
    'first_line_investigation',
    'dangerous_diagnosis_priority_exclusion',
    'next_step_after_initial_result',
    'immediate_emergency_management',
    'stable_first_line_treatment',
    'contraindication_caveat_switch',
    'failure_or_deterioration',
    'escalation_referral_disposition'
  ];
  const TYPE_ASPECT = {
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

  function emit(message, detail) {
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint', { detail: { message, detail: detail || null } }));
  }

  function labelFor(body) {
    try {
      const parsed = JSON.parse(body || '{}');
      return parsed?.text?.format?.name === 'ukmla_option_normalisation' ? 'normalisation' : 'quiz';
    } catch (_) {
      return 'quiz';
    }
  }

  function questionProgress(text) {
    const nums = [...text.matchAll(/"questionNumber"\s*:\s*(\d+)/g)].map(match => Number(match[1]));
    const types = [...text.matchAll(/"questionTypeLabel"\s*:\s*"([^"]+)"/g)].map(match => match[1]);
    if (!nums.length) return null;
    const number = Math.max(...nums);
    return types[number - 1]
      ? `Receiving question ${number} of 10: ${types[number - 1]}…`
      : `Receiving question ${number} of 10…`;
  }

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (_) { return fallback; }
  }

  function extractJsonObject(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let begun = false;
    for (let index = start; index < text.length; index++) {
      const char = text[index];
      if (!begun) {
        if (char !== '{') continue;
        begun = true;
        depth = 1;
        start = index;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(start, index + 1);
      }
    }
    return null;
  }

  function parseSource(text) {
    const marker = 'Source material:\n';
    const markerIndex = text.lastIndexOf(marker);
    if (markerIndex < 0) return null;
    const objectText = extractJsonObject(text, markerIndex + marker.length);
    if (!objectText) return null;
    try { return JSON.parse(objectText); }
    catch (_) { return null; }
  }

  function health(topic) {
    const progress = load('ukmlaQuizProgressV1', {});
    return Number(progress?.[topic]?.health ?? 50);
  }

  function recentPairs() {
    const pairs = new Set();
    for (const set of load('ukmlaAiGeneratedQuizSetsV1', []).slice(0, 12)) {
      for (const question of set.questions || []) pairs.add(`${question.targetCondition || ''}|${question.questionType || ''}`);
    }
    return pairs;
  }

  function clinicalAnchor(condition, aspect) {
    return condition.fields?.[aspect] || condition.fields?.Tx || condition.fields?.Ix || '';
  }

  function distractorAnchors(conditions, targetCondition, aspect) {
    return conditions
      .filter(condition => condition.name !== targetCondition.name)
      .map(condition => ({ condition: condition.name, anchor: clinicalAnchor(condition, aspect) }))
      .filter(item => item.anchor)
      .slice(0, 4);
  }

  function skeleton(condition, position, allConditions) {
    const typeId = QUESTION_TYPE_IDS[position - 1] || '';
    const aspect = TYPE_ASPECT[typeId] || 'Escalate';
    return {
      questionNumber: position,
      questionType: typeId,
      targetCondition: condition.name,
      targetTopic: condition.topic,
      testedAspect: aspect,
      correctClinicalAnchor: clinicalAnchor(condition, aspect),
      decisionData: condition.decisionData || null,
      distractorAnchors: distractorAnchors(allConditions, condition, aspect)
    };
  }

  function hybridSkeletons(payload) {
    const conditions = (payload.conditions || []).slice();
    const usedPairs = recentPairs();
    const selected = [];
    const usedNames = new Set();
    const ranked = conditions.sort((a, b) => health(a.topic || payload.topic) - health(b.topic || payload.topic));

    HYBRID_POSITIONS.forEach(position => {
      const typeId = QUESTION_TYPE_IDS[position - 1] || '';
      const aspect = TYPE_ASPECT[typeId] || 'Escalate';
      let condition = ranked.find(item => !usedNames.has(item.name) && item.fields?.[aspect] && !usedPairs.has(`${item.name}|${typeId}`));
      if (!condition) condition = ranked.find(item => !usedNames.has(item.name) && item.fields?.[aspect]);
      if (!condition) condition = ranked.find(item => !usedNames.has(item.name));
      if (!condition) return;
      usedNames.add(condition.name);
      selected.push(skeleton(condition, position, ranked));
    });
    return selected;
  }

  function randomSkeletons(payload) {
    const conditions = (payload.conditions || []).slice(0, 10);
    if (conditions.length !== 10) return [];
    return conditions.map((condition, index) => skeleton(condition, index + 1, conditions));
  }

  function addArchitecturePrompt(body) {
    if (body?.text?.format?.name !== 'ukmla_ai_quiz') return 'none';
    for (const item of body.input || []) {
      for (const content of item.content || []) {
        if (item.role !== 'user' || content.type !== 'input_text') continue;
        const source = parseSource(content.text);
        if (!source) continue;

        if (source.mode === 'random_all_conditions') {
          const skeletons = randomSkeletons(source);
          if (skeletons.length !== 10) continue;
          content.text += `\n\nFULL RANDOM ENCYCLOPEDIA ARCHITECTURE:\nAll ten question targets are fixed by the HTML-derived skeletons below. The conditions were selected randomly from across the entire encyclopedia and must not be health-ranked, replaced, repeated, omitted or moved. Question 1 uses skeleton 1, question 2 skeleton 2, and so on. Preserve each target condition, true topic, question type, tested aspect and clinical anchor while producing the same very-difficult sparse UKMLA format. Use each target exactly once. Do not reveal source, topic, condition or scoring metadata in visible answer text.\nRandom all-condition skeletons:\n${JSON.stringify(skeletons)}`;
          emit('Prepared ten random encyclopedia conditions across ten topic areas.');
          return 'random';
        }

        const skeletons = hybridSkeletons(source);
        if (skeletons.length !== 5) continue;
        content.text += `\n\nHYBRID 5+5 ARCHITECTURE:\nQuestions 1, 3, 5, 7 and 9 must be built around the fixed HTML-derived skeletons below. Questions 2, 4, 6, 8 and 10 should use the existing encyclopedia-informed generation method. Apply the same UKMLA specification, difficulty, schema, rationale and option-normalisation rules to all ten. For each HTML-derived question, preserve its target condition, tested aspect and correct clinical anchor while transforming it into an authentic UKMLA-style SBA. Do not reveal source, topic, condition or scoring metadata in visible answer text. Avoid recently used condition/question-type pairs when alternatives exist.\nHTML-derived skeletons:\n${JSON.stringify(skeletons)}`;
        emit('Prepared five HTML-derived question skeletons and five conventionally generated question slots.');
        return 'hybrid';
      }
    }
    return 'none';
  }

  async function streamRequest(input, init) {
    let body;
    try { body = JSON.parse(init.body); }
    catch (_) { return nativeFetch(input, init); }

    const mode = labelFor(init.body);
    const architecture = mode === 'quiz' ? addArchitecturePrompt(body) : 'normalisation';
    body.stream = true;
    if (mode === 'quiz') {
      emit(architecture === 'random'
        ? 'Submitting the ten-condition random encyclopedia quiz request to OpenAI…'
        : 'Submitting the hybrid 5+5 UKMLA quiz request to OpenAI…');
    } else {
      emit('Submitting the option-normalisation request to OpenAI…');
    }

    const response = await nativeFetch(input, { ...init, body: JSON.stringify(body) });
    if (!response.ok || !response.body) return response;
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/event-stream')) return response;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let output = '';
    let finalEvent = null;
    let lastQuestion = 0;
    let lastChars = 0;

    while (true) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const dataLines = chunk.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim());
        for (const line of dataLines) {
          if (!line || line === '[DONE]') continue;
          let event;
          try { event = JSON.parse(line); }
          catch (_) { continue; }

          if (event.type === 'response.created') {
            emit(mode === 'quiz' ? 'OpenAI accepted the quiz request.' : 'OpenAI accepted the normalisation request.');
          }
          if (event.type === 'response.in_progress') {
            emit(mode === 'quiz' ? 'OpenAI is generating the structured quiz output.' : 'OpenAI is generating normalised answer options.');
          }
          if (event.type === 'response.output_text.delta') {
            output += event.delta || '';
            if (mode === 'quiz') {
              const message = questionProgress(output);
              const number = message && Number((message.match(/question (\d+)/) || [])[1]);
              if (message && number > lastQuestion) {
                lastQuestion = number;
                emit(message);
              } else if (output.length - lastChars > 2500) {
                lastChars = output.length;
                emit(`Receiving structured quiz output… ${output.length.toLocaleString()} characters received.`);
              }
            } else if (output.length - lastChars > 800) {
              lastChars = output.length;
              emit(`Receiving normalised option text… ${output.length.toLocaleString()} characters received.`);
            }
          }
          if (event.type === 'response.output_text.done' && event.text) output = event.text;
          if (event.type === 'response.completed') {
            finalEvent = event;
            emit(mode === 'quiz' ? 'OpenAI completed the structured quiz response.' : 'OpenAI completed the option-normalisation response.');
          }
          if (event.type === 'response.failed' || event.type === 'error') emit('OpenAI reported an error while generating the response.');
        }
      }
    }

    const responseObject = finalEvent?.response || { output_text: output, output: [{ content: [{ type: 'output_text', text: output }] }] };
    if (!responseObject.output_text) responseObject.output_text = output;
    return new Response(JSON.stringify(responseObject), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url === API && init && init.method === 'POST') return streamRequest(input, init);
    return nativeFetch(input, init);
  };
})();
