// TEMPORARY diagnostic (2026-11-20) — Vercel ke andar se
// YouTube backends ki asal halat. Fix ke baad hata dena.
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const vid = searchParams.get('v') || 'kJQP7kiw5Fk';
  const out = { vid, region: process.env.VERCEL_REGION || 'unknown', checks: {} };

  // 1) Invidious instance API
  try {
    const r = await fetch('https://yt.chocolatemoo53.com/api/v1/videos/' + vid, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000)
    });
    let n = -1;
    if (r.ok) {
      const j = await r.json().catch(() => null);
      n = ((j && j.adaptiveFormats) || []).length;
    }
    out.checks.invidious = { http: r.status, adaptiveFormats: n };
  } catch (e) {
    out.checks.invidious = { error: String((e && e.message) || e).slice(0, 160) };
  }

  // 2) Innertube clients
  const clients = [
    ['ANDROID', 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip', { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en', gl: 'US' }],
    ['IOS', 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X;)', { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', hl: 'en', gl: 'US' }],
    ['WEB', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', { clientName: 'WEB', clientVersion: '2.20251110.01.00', hl: 'en', gl: 'US' }]
  ];
  for (const [name, ua, client] of clients) {
    try {
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
        body: JSON.stringify({
          context: { client },
          videoId: vid,
          playbackContext: { contentPlaybackContext: { vis: 0, splay: false, lactMilliseconds: '-1', signatureTimestamp: 20073 } },
          racyCheckOk: true,
          contentCheckOk: true
        }),
        signal: AbortSignal.timeout(15000)
      });
      let info = { http: r.status };
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j) {
          info.playability = (j.playabilityStatus || {}).status || '?';
          info.reason = (j.playabilityStatus || {}).reason || '';
          const fmts = ((j.streamingData || {}).adaptiveFormats) || [];
          info.formats = fmts.length;
          info.withUrl = fmts.filter(f => f && f.url).length;
        }
      }
      out.checks['innertube_' + name] = info;
    } catch (e) {
      out.checks['innertube_' + name] = { error: String((e && e.message) || e).slice(0, 160) };
    }
  }

  return sendJson(res, 200, out);
};
