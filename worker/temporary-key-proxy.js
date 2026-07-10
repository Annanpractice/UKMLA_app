// Cloudflare Worker: forwards one OpenAI Responses API request using a key supplied by the browser.
// The key is read from the X-OpenAI-Key request header and is never stored.

function cors(origin, allowedOrigin) {
  const allowed = !allowedOrigin || allowedOrigin === '*' || origin === allowedOrigin;
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-OpenAI-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env.ALLOWED_ORIGIN || '*');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405, headers);
    }

    if (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*' && origin !== env.ALLOWED_ORIGIN) {
      return json({ error: 'Origin not allowed.' }, 403, headers);
    }

    const apiKey = request.headers.get('X-OpenAI-Key') || '';
    if (!apiKey.startsWith('sk-')) {
      return json({ error: 'A valid temporary OpenAI API key is required.' }, 400, headers);
    }

    try {
      const body = await request.text();
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body
      });

      const responseBody = await upstream.text();
      return new Response(responseBody, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
          ...headers
        }
      });
    } catch (error) {
      return json({ error: error.message || 'Proxy request failed.' }, 502, headers);
    }
  }
};
