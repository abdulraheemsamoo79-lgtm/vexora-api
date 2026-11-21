// TEMP debug (2026-11-21): Vercel ke andar se candidate YouTube
// backends ki asal halat parakhna. Fix ke baad ye file HATA di
// jayegi.
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}
const VID = 'jNQXAC9IVRw';
const VURL = 'https://www.youtube.com/watch?v=' + VID;

async function probeInv(base) {
  try {
    const r = await fetch(base + '/api/v1/videos/' + VID, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(9000)
    });
    if (!r.ok) return { base, status: r.status };
    const j = await r.json().catch(() => null);
    const fmts = (j && j.adaptiveFormats) || [];
    const mux = (j && j.formatStreams) || [];
    return { base, status: r.status, adaptive: fmts.length, muxed: mux.length, title: (j && j.title) || null };
  } catch (e) { return { base, error: String(e.message || e).slice(0, 60) }; }
}

const TUBE_CLIENTS = [
  { name: 'ANDROID', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip', client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en', gl: 'US' } },
  { name: 'TVHTML5', ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1', client: { clientName: 'TVHTML5', clientVersion: '7.20250205.16.00', hl: 'en', gl: 'US' } },
  { name: 'ANDROID_VR', ua: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip', client: { clientName: 'ANDROID_VR', clientVersion: '1.65.10', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, hl: 'en', gl: 'US' } },
  { name: 'WEB_EMBEDDED', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', client: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.20250203.01.00', hl: 'en', gl: 'US' } },
  { name: 'WEB', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', client: { clientName: 'WEB', clientVersion: '2.20250203.01.00', hl: 'en', gl: 'US' } }
];
async function probeTube(c) {
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/player?key=<redacted>&prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua },
      body: JSON.stringify({ context: { client: c.client }, videoId: VID, playbackContext: { contentPlaybackContext: { vis: 0, splay: false, lactMilliseconds: '-1', signatureTimestamp: 20073 } }, racyCheckOk: true, contentCheckOk: true }),
      signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) return { client: c.name, status: r.status };
    const j = await r.json().catch(() => null);
    const ps = j && j.playabilityStatus && j.playabilityStatus.status;
    const fmts = (j && j.streamingData && j.streamingData.adaptiveFormats) || [];
    const withUrl = fmts.filter(f => f && f.url).length;
    return { client: c.name, status: r.status, playability: ps || null, formats: fmts.length, withUrl };
  } catch (e) { return { client: c.name, error: String(e.message || e).slice(0, 60) }; }
}

async function probeApi(name, url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const t = await r.text().catch(() => '');
    return { name, status: r.status, body: t.slice(0, 220) };
  } catch (e) { return { name, error: String(e.message || e).slice(0, 60) }; }
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const set = searchParams.get('set') || 'inv';
  try {
    if (set === 'inv') {
      const bases = [
        'https://yt.chocolatemoo53.com',
        'https://inv.nadeko.net',
        'https://invidious.nerdvpn.de',
        'https://yewtu.be',
        'https://inv.tux.pizza',
        'https://invidious.jing.rocks',
        'https://iv.melmac.space',
        'https://invidious.0011.lt',
        'https://invidious.fdn.fr',
        'https://inv.us.projectsegfau.lt',
        'https://invidious.perennialte.ch',
        'https://inv.vern.cc'
      ];
      const results = await Promise.all(bases.map(probeInv));
      return sendJson(res, 200, { set, results });
    }
    if (set === 'tube') {
      const results = await Promise.all(TUBE_CLIENTS.map(probeTube));
      return sendJson(res, 200, { set, results });
    }
    if (set === 'apis') {
      const enc = encodeURIComponent(VURL);
      const results = await Promise.all([
        probeApi('david-ytmp4', 'https://apis.davidcyriltech.my.id/download/ytmp4?url=' + enc),
        probeApi('david-ytmp3', 'https://apis.davidcyriltech.my.id/download/ytmp3?url=' + enc),
        probeApi('tioo', 'https://backend1.tioo.eu.org/YouTube?url=' + enc),
        probeApi('siputzx-ytmp4', 'https://api.siputzx.my.id/api/d/ytmp4?url=' + enc),
        probeApi('siputzx-ytmp3', 'https://api.siputzx.my.id/api/d/ytmp3?url=' + enc),
        probeApi('vreden-youtube', 'https://api.vreden.web.id/youtube?url=' + enc),
        probeApi('ryzumi-ytmp4', 'https://api.ryzumi.vip/api/downloader/ytmp4?url=' + enc)
      ]);
      return sendJson(res, 200, { set, results });
    }
    return sendJson(res, 200, { status: false, message: 'unknown set' });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'debug error: ' + e.message });
  }
};
