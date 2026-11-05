// VEXORA API - xHamster search + stream resolver
// GET /api/xhamster?action=search&q=<text>
//   -> { status, result: [ { title, url, duration, views, thumb, author } ] }
// GET /api/xhamster?action=info&url=<video page url>
//   -> { status, result: { title, duration, views, thumb, author, height, variantUrl, estBytes } }
// Why here: the bot's host (Railway) is served a stripped page by the
// site, while this API's network gets the full page. Extraction runs
// here; the bot only downloads the resolved HLS variant via ffmpeg.
// Method: window.initials -> xplayer sources -> hex URL decipher
// (7 byte-generator algorithms, same as open-source extractors).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

// ---------- URL decipher ----------
function makeGen(algoId, seed) {
  let s = seed | 0;
  const algos = {
    1: () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return s; },
    2: () => { s = (s ^ (s << 13)) | 0; s = (s ^ (s >>> 17)) | 0; s = (s ^ (s << 5)) | 0; return s; },
    3: () => { s = (s + 0x9e3779b9) | 0; let v = s; v = (v ^ (v >>> 16)) | 0; v = Math.imul(v, 0x85ebca77); v = (v ^ (v >>> 13)) | 0; v = Math.imul(v, 0xc2b2ae3d); return (v ^ (v >>> 16)) | 0; },
    4: () => { s = (s + 0x6d2b79f5) | 0; let v = s; v = ((v << 7) | (v >>> 25)) | 0; v = (v + 0x9e3779b9) | 0; v = (v ^ (v >>> 11)) | 0; return Math.imul(v, 0x27d4eb2d); },
    5: () => { s = (s ^ (s << 7)) | 0; s = (s ^ (s >>> 9)) | 0; s = (s ^ (s << 8)) | 0; s = (s + 0xa5a5a5a5) | 0; return s; },
    6: () => { s = (Math.imul(s, 0x2c9277b5) + 0xac564b05) | 0; const s2 = (s ^ (s >>> 18)) | 0; const sh = (s >>> 27) & 31; return (s2 >>> sh) | 0; },
    7: () => { s = (s + 0x9e3779b9) | 0; let e = (s ^ (s << 5)) | 0; e = Math.imul(e, 0x7feb352d); e = (e ^ (e >>> 15)) | 0; return Math.imul(e, 0x846ca68b); }
  };
  const fn = algos[algoId];
  if (!fn) throw new Error('unknown algo');
  return () => fn() & 0xFF;
}
function decipherHex(hex) {
  const data = Buffer.from(hex, 'hex');
  const gen = makeGen(data[0], data.readInt32LE(1));
  const out = Buffer.alloc(data.length - 5);
  for (let i = 5; i < data.length; i++) out[i - 5] = data[i] ^ gen();
  return out.toString('latin1');
}
function decipherUrl(u) {
  if (!u || typeof u !== 'string') return null;
  if (/^[0-9a-fA-F]{12,}$/.test(u)) { try { return decipherHex(u); } catch (e) { return null; } }
  if (/^https?:\/\//.test(u)) {
    const m = u.match(/^(https?:\/\/[^/]+)\/([0-9a-fA-F]{12,})([/,].*)$/);
    if (m) { try { return m[1] + '/' + decipherHex(m[2]) + m[3]; } catch (e) { return null; } }
    return u;
  }
  return null;
}
function parseInitials(html) {
  const i = html.indexOf('window.initials');
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let p = start; p < html.length; p++) {
    const ch = html[p];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(html.slice(start, p + 1)); } catch (e) { return null; } } }
  }
  return null;
}

// ---------- fetch with retries (site kabhi halka page deti hai) ----------
const jar = {};
async function fetchText(url, extra) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(extra || {}) }, redirect: 'follow' });
  try {
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of sc) { const kv = String(c).split(';')[0]; const ix = kv.indexOf('='); if (ix > 0) jar[kv.slice(0, ix).trim()] = kv.slice(ix + 1).trim(); }
  } catch (e) {}
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
async function fetchRich(url, isGood) {
  let lastErr = null;
  for (let a = 0; a < 3; a++) {
    try {
      const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      const html = await fetchText(url, { ...(cookie ? { 'Cookie': cookie } : {}), ...(a > 0 ? { 'Referer': 'https://xhamster.com/' } : {}) });
      const init = parseInitials(html);
      if (init && isGood(init)) return init;
    } catch (e) { lastErr = e; }
    if (a < 2) await new Promise(r => setTimeout(r, 900));
  }
  if (lastErr) throw lastErr;
  throw new Error('video data nahi mila');
}

async function doSearch(q) {
  const init = await fetchRich('https://xhamster.com/search/' + encodeURIComponent(q),
    d => !!(d.searchResult && Array.isArray(d.searchResult.videoThumbProps) && d.searchResult.videoThumbProps.length));
  return init.searchResult.videoThumbProps.filter(v => v && v.pageURL && v.title).slice(0, 10).map(v => ({
    title: String(v.title).replace(/\s+/g, ' ').trim(),
    url: v.pageURL,
    duration: parseInt(v.duration, 10) || 0,
    views: parseInt(v.views, 10) || 0,
    thumb: v.thumbURL || v.imageURL || '',
    author: (v.landing && v.landing.name) || ''
  }));
}

async function doInfo(pageUrl) {
  const init = await fetchRich(pageUrl,
    d => !!(d.videoModel && d.xplayerSettings && d.xplayerSettings.sources && (d.xplayerSettings.sources.standard || d.xplayerSettings.sources.hls)));
  const vm = init.videoModel;
  const sources = init.xplayerSettings.sources || {};
  let master = null;
  const stdH264 = (sources.standard && sources.standard.h264) || [];
  const auto = stdH264.find(f => f.quality === 'auto') || stdH264[0];
  if (auto) master = decipherUrl(auto.url) || decipherUrl(auto.fallback);
  if (!master && sources.hls && sources.hls.h264) master = decipherUrl(sources.hls.h264.url) || decipherUrl(sources.hls.h264.fallback);
  if (!master && sources.hls && sources.hls.av1) master = decipherUrl(sources.hls.av1.url) || decipherUrl(sources.hls.av1.fallback);
  if (!master) throw new Error('stream nahi mila');
  const duration = parseInt(vm.duration, 10) || 0;
  // variant pick (best <= 480p, h264 preferred, <= ~190MB)
  const text = await fetchText(master, { 'Referer': 'https://xhamster.com/' });
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1], 10) || 0;
    const res = lines[i].match(/RESOLUTION=(\d+)x(\d+)/) || [];
    const codecs = (lines[i].match(/CODECS="([^"]*)"/) || [])[1] || '';
    const uri = lines[i + 1] || '';
    if (uri && !uri.startsWith('#')) variants.push({ bw, h: parseInt(res[2], 10) || 0, codecs, url: new URL(uri, master).href });
  }
  if (!variants.length) throw new Error('quality list nahi mili');
  const h264 = variants.filter(v => /avc1/.test(v.codecs));
  const pool = h264.length ? h264 : variants;
  const est = v => duration > 0 ? (v.bw / 8) * duration : 0;
  let cands = pool.filter(v => v.h <= 480).sort((a, b) => b.h - a.h);
  if (!cands.length) cands = [...pool].sort((a, b) => a.h - b.h).slice(0, 1);
  let pick = cands[0];
  if (est(pick) > 190 * 1024 * 1024) {
    for (const c of [...pool].sort((a, b) => a.h - b.h)) { if (est(c) <= 190 * 1024 * 1024) { pick = c; break; } }
  }
  return {
    title: String(vm.title || 'xHamster Video').replace(/\s+/g, ' ').trim(),
    duration,
    views: parseInt(vm.views, 10) || 0,
    thumb: vm.thumbURL || vm.previewThumbURL || '',
    author: (vm.author && vm.author.name) || (vm.channelModel && vm.channelModel.name) || '',
    height: pick.h,
    variantUrl: pick.url,
    estBytes: Math.round(est(pick))
  };
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const action = (searchParams.get('action') || 'info').toLowerCase();
    if (action === 'search') {
      const q = (searchParams.get('q') || '').trim();
      if (!q) return sendJson(res, 200, { status: false, message: 'Missing ?q= parameter' });
      const results = await doSearch(q);
      if (!results.length) return sendJson(res, 200, { status: false, message: 'No videos found for: ' + q });
      return sendJson(res, 200, { status: true, creator: 'VEXORA API', query: q, result: results });
    }
    const url = (searchParams.get('url') || '').trim();
    if (!url || !/(xhamster\.|xhvid\.|xhday\.|xhms\.)/i.test(url)) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid ?url= parameter' });
    }
    const info = await doInfo(url);
    return sendJson(res, 200, { status: true, creator: 'VEXORA API', result: info });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
