// VEXORA API - AI Chat
// GET /api/ai?q=<prompt>   (also accepts ?prompt= and ?text=)
// Backend: Pollinations (free public AI service, no API key needed).
// Fallback chain: 1) text.pollinations.ai GET  2) text.pollinations.ai/openai POST
// Chosen 2026-10-30 after live tests: Pollinations answered both test prompts
// coherently; PrinceTech returned 402 DEPLOYMENT_DISABLED and the Siputzx AI
// routes returned 404, so neither is in the chain.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

const TIMEOUT = 20000;

async function askGet(q) {
  const url = 'https://text.pollinations.ai/' + encodeURIComponent(q);
  const r = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { 'User-Agent': 'VEXORA-API' }
  });
  if (!r.ok) throw new Error('pollinations GET HTTP ' + r.status);
  const txt = (await r.text()).trim();
  if (!txt) throw new Error('pollinations GET empty answer');
  return txt;
}

async function askPost(q) {
  const r = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'VEXORA-API' },
    body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: q }] }),
    signal: AbortSignal.timeout(TIMEOUT)
  });
  if (!r.ok) throw new Error('pollinations POST HTTP ' + r.status);
  const data = await r.json();
  const txt = (data?.choices?.[0]?.message?.content || '').trim();
  if (!txt) throw new Error('pollinations POST empty answer');
  return txt;
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const q = (searchParams.get('q') || searchParams.get('prompt') || searchParams.get('text') || '').trim();
    if (!q) {
      return sendJson(res, 200, { status: false, message: 'Missing ?q= parameter' });
    }

    const chain = [
      ['pollinations', askGet],
      ['pollinations-openai', askPost]
    ];
    for (const [name, fn] of chain) {
      try {
        const answer = await fn(q);
        return sendJson(res, 200, {
          status: true,
          creator: 'VEXORA API',
          result: { question: q, answer, backend: name }
        });
      } catch (e) {
        // this backend failed; try the next one in the chain
      }
    }
    return sendJson(res, 200, { status: false, message: 'AI is busy right now, please try again in a moment' });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
