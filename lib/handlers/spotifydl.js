// VEXORA API - Spotify track downloader
// GET /api/spotifydl?url=<spotify track url>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Spotify direct download ka koi free backend reliably nahi
// chalta (sab live check kiye: fabdl 403, siputzx nodes down) —
// is liye: oEmbed se title/thumbnail, embed page se artist,
// phir apna hi ytmp3 handler (YouTube match) audio deta hai.
// Result mein note saaf likha jata hai.

const ytmp3 = require('./ytmp3');

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function captureRes() {
  return {
    statusCode: 200, body: null,
    writeHead(code) { this.statusCode = code; },
    setHeader() {}, getHeader() { return undefined; },
    end(b) { this.body = b; }
  };
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const url = String(searchParams.get('url') || '');
  if (!/open\.spotify\.com\/(intl-[a-z-]+\/)?track\/[A-Za-z0-9]+/.test(url)) {
    return sendJson(res, 400, { status: false, message: 'Valid Spotify track URL required: /api/spotifydl?url=<track url>' });
  }
  try {
    let title = '', artist = '', thumb = '';
    try {
      const oe = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url.split('?')[0]), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(20000)
      });
      const oeData = await oe.json();
      title = (oeData && oeData.title) || '';
      thumb = (oeData && oeData.thumbnail_url) || '';
    } catch (_) {}
    try {
      const id = (url.match(/track\/([A-Za-z0-9]+)/) || [])[1];
      if (id) {
        const em = await fetch('https://open.spotify.com/embed/track/' + id, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(20000)
        });
        const emHtml = await em.text();
        const mm = String(emHtml).match(/"artists":\[\{"name":"([^"]+)"/);
        if (mm) artist = mm[1];
      }
    } catch (_) {}
    if (!title) {
      return sendJson(res, 200, { status: false, message: 'Spotify link could not be read' });
    }
    const fakeReq = {
      url: '/api/ytmp3?url=' + encodeURIComponent(`${title} ${artist}`.trim()),
      method: 'GET',
      headers: {}
    };
    const cap = captureRes();
    await ytmp3(fakeReq, cap);
    let data = null;
    try { data = JSON.parse(cap.body); } catch (_) {}
    if (!data || !data.status || !data.result || !data.result.audio_download) {
      return sendJson(res, 200, { status: false, message: (data && data.message) || 'Audio could not be resolved' });
    }
    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        title,
        artist,
        thumbnail: thumb,
        audio_download: data.result.audio_download,
        note: 'Audio matched from YouTube — Spotify does not provide direct downloads.'
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
