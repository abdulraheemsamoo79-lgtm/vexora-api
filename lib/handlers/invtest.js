// TEMP diagnostic (2026-11-10): Vercel ke andar se Invidious
// instance tak asal mein kya hota hai, ye dekhne ke liye.
// Masla hal hote hi ye handler HATA diya jayega.
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}
function magicInfo(buf) {
  if (!buf || buf.length < 4) return 'too-small(' + (buf ? buf.length : 0) + ')';
  const h = buf.slice(0, 12);
  if (h[0] === 0x3c) return 'HTML';
  if (h.slice(0, 3).toString('latin1') === 'ID3') return 'MP3';
  if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) return 'MP3';
  if (h.slice(4, 8).toString('latin1') === 'ftyp') return 'MP4/M4A';
  if (h.slice(0, 4).toString('latin1') === 'OggS') return 'OGG';
  if (h[0] === 0x1a && h[1] === 0x45) return 'WEBM';
  return 'text?:' + h.toString('latin1').replace(/[^\x20-\x7e]/g, '.').slice(0, 30);
}
async function probe(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, ct: r.headers.get('content-type'), magic: magicInfo(buf), len: buf.length };
  } catch (e) { return { error: e.message.slice(0, 90), cause: String(e.cause || '').slice(0, 90) }; }
}
module.exports = async (req, res) => {
  const out = { region: process.env.VERCEL_REGION || '?', node: process.version };
  const BASE = 'https://yt.chocolatemoo53.com';
  try {
    const t0 = Date.now();
    const r = await fetch(BASE + '/api/v1/videos/5Eqb_-j3FDA', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    out.instanceStatus = r.status;
    out.instanceMs = Date.now() - t0;
    const j = await r.json().catch(() => null);
    const fmts = (j && j.adaptiveFormats) || [];
    out.title = j && j.title ? String(j.title).slice(0, 40) : null;
    out.formats = fmts.length;
    const aud = fmts.filter(f => String(f.type).includes('audio')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    if (aud) {
      out.audioHost = new URL(aud.url).hostname;
      out.proxyProbe = await probe(BASE + '/videoplayback' + new URL(aud.url).search);
      out.directProbe = await probe(aud.url);
    }
  } catch (e) { out.instanceError = e.message.slice(0, 120) + ' | cause: ' + String(e.cause || '').slice(0, 120); }
  try {
    const d = await fetch('https://apis.davidcyriltech.my.id/download/ytmp3?url=' + encodeURIComponent('https://youtube.com/watch?v=5Eqb_-j3FDA'), { signal: AbortSignal.timeout(20000) });
    const dj = await d.json().catch(() => null);
    out.davidStatus = d.status;
    out.davidSuccess = dj && dj.success;
    out.davidLinkHost = dj && dj.result && dj.result.download_url ? new URL(dj.result.download_url).hostname : null;
  } catch (e) { out.davidError = e.message.slice(0, 100); }
  return sendJson(res, 200, out);
};
