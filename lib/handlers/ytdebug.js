// TEMP debug (2026-11-21): Vercel ke andar se Tioo hosts ki asal
// halat — HTTP status + waqt. Fix ke baad ye file + router entry
// dono hataye jayenge.
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}
module.exports = async (req, res) => {
  const videoUrl = 'https://www.youtube.com/watch?v=kJQP7kiw5Fk';
  const hosts = ['https://backend1.tioo.eu.org', 'https://backend2.tioo.eu.org', 'https://backend3.tioo.eu.org'];
  const probe = async (host) => {
    const t0 = Date.now();
    try {
      const r = await fetch(host + '/YouTube?url=' + encodeURIComponent(videoUrl), { signal: AbortSignal.timeout(25000) });
      const txt = await r.text().catch(() => '');
      return { http: r.status, ms: Date.now() - t0, body: txt.slice(0, 140) };
    } catch (e) {
      return { http: 'ERR', ms: Date.now() - t0, body: String((e && e.message) || e).slice(0, 140) };
    }
  };
  const results = await Promise.all(hosts.map(probe));
  const out = {};
  hosts.forEach((h, i) => { out[h] = results[i]; });
  sendJson(res, 200, { status: true, from: 'vercel', results: out });
};
