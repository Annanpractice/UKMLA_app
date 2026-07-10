// Cloudflare Worker for secure UKMLA quiz generation.
// Store OPENAI_API_KEY with: npx wrangler secret put OPENAI_API_KEY
// Optional: set ALLOWED_ORIGIN and OPENAI_MODEL as Worker environment variables.

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

function cors(origin, allowed) {
  const value = !allowed || allowed === '*' || origin === allowed ? (origin || '*') : allowed;
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function schema() {
  const option = {
    type: 'object', additionalProperties: false,
    required: ['id', 'text', 'topic', 'condition', 'param'],
    properties: {
      id: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
      text: { type: 'string', minLength: 1 },
      topic: { type: 'string' },
      condition: { type: 'string' },
      param: { type: 'string', enum: ['Ix', 'Tx', 'Escalate', 'Mimics', 'Red flags'] }
    }
  };
  const question = {
    type: 'object', additionalProperties: false,
    required: ['id', 'questionNumber', 'questionType', 'questionTypeLabel', 'topic', 'targetCondition', 'learningPoint', 'stem', 'leadIn', 'options', 'correctOptionId', 'decisiveClue', 'rationale', 'strongestDistractorId', 'strongestDistractorExplanation', 'guideline'],
    properties: {
      id: { type: 'string' },
      questionNumber: { type: 'integer', minimum: 1, maximum: 10 },
      questionType: { type: 'string', enum: QUESTION_TYPES.map(x => x[0]) },
      questionTypeLabel: { type: 'string', enum: QUESTION_TYPES.map(x => x[1]) },
      topic: { type: 'string' },
      targetCondition: { type: 'string' },
      learningPoint: { type: 'string' },
      stem: { type: 'string' },
      leadIn: { type: 'string' },
      options: { type: 'array', minItems: 5, maxItems: 5, items: option },
      correctOptionId: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
      decisiveClue: { type: 'string' },
      rationale: { type: 'string' },
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
      schemaVersion: { type: 'string', enum: ['ukmla-ai-quiz-v1'] },
      quizId: { type: 'string' }, topic: { type: 'string' }, generatedAt: { type: 'string' },
      difficulty: { type: 'string', enum: ['standard', 'difficult', 'very_difficult'] },
      questions: { type: 'array', minItems: 10, maxItems: 10, items: question }
    }
  };
}

function instructions(payload) {
  return `You are writing a ten-item UK Medical Licensing Assessment-style SBA set for a newly qualified doctor.

Use the supplied encyclopedia material as the primary factual source. Do not invent exact doses, thresholds, contraindications, guideline dates or citations that are absent from the supplied material. Where the source lacks a verifiable external guideline citation, use source "Internal UKMLA encyclopedia content", a relevant title, and null checkedDate/url.

Create exactly ten questions in the exact order below, one of each type:
${QUESTION_TYPES.map((x, i) => `${i + 1}. ${x[0]} — ${x[1]}`).join('\n')}

Core item-writing requirements:
- Applied clinical decisions, not simple recall.
- Concise, clinically authentic stems with enough information to pass the cover test.
- One unambiguously best answer and four plausible, homogeneous distractors.
- Option IDs exactly A, B, C, D, E in order.
- Correct and distractor options must be similar in wording length and specificity. Never make the correct answer conspicuously longer or shorter.
- Use one or two legitimate difficulty levers only: sparse clues, close mimic, pathway position, danger prioritisation, contraindication, stability, failed treatment, or disposition threshold.
- Do not use rare trivia, ambiguous wording, omitted essential information, or two guideline-defensible answers.
- Every distractor must carry its true topic, condition and the closest scoring aspect: Ix, Tx, Escalate, Mimics or Red flags. This metadata is used to penalise cross-topic confusion.
- Include a short rationale and explain why the strongest distractor is wrong.
- Match difficulty: ${payload.difficulty}.

The supplied topic and encyclopedia facts follow:
${JSON.stringify(payload, null, 2)}`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env.ALLOWED_ORIGIN || '*');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not configured on the Worker.' }, 500, headers);

    try {
      const payload = await request.json();
      if (!payload?.topic || !Array.isArray(payload.conditions) || !payload.conditions.length) {
        return json({ error: 'A topic and at least one condition are required.' }, 400, headers);
      }
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-5-mini',
          input: [{ role: 'system', content: [{ type: 'input_text', text: 'Return only the requested schema-conforming UKMLA quiz.' }] }, { role: 'user', content: [{ type: 'input_text', text: instructions(payload) }] }],
          text: { format: { type: 'json_schema', name: 'ukmla_ai_quiz', strict: true, schema: schema() } }
        })
      });
      const raw = await response.json();
      if (!response.ok) return json({ error: raw?.error?.message || 'OpenAI request failed.' }, response.status, headers);
      const text = raw.output_text || raw.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
      if (!text) return json({ error: 'OpenAI returned no structured quiz.' }, 502, headers);
      return json(JSON.parse(text), 200, headers);
    } catch (error) {
      return json({ error: error.message || 'Quiz generation failed.' }, 500, headers);
    }
  }
};
