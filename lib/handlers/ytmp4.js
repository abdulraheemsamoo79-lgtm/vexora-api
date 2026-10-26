// VEXORA API - YouTube MP4 (for the bot's .video/.drama commands)
// GET /api/ytmp4?url=<youtube link OR video name>
// Returns: { status, result: { video_download, title, author, duration, thumbnail } }
//
// Backends (chain, since 2026-10-26 evening):
// 1) PRIMARY: arslan-apis-v2.vercel.app/download/ytmp4 (keyless,
//    found in the REDX-MINI bot source the owner supplied). ~5s,
//    returns a direct googlevideo mp4 (itag 18, 360p) — fast and
//    WhatsApp-sized. Its /download/ytmp3 route is BROKEN (dead
//    proxy links), only ytmp4 is used. If this host dies, the
//    chain below still covers .video.
// 2) FALLBACK: the Apify actor streamers/youtube-video-downloader
//    (823k+ runs). Input:
// { videos: [{ url }], storeInKVStore: true, preferredQuality: '480p' }
// - it returns downloadedFileUrl, a public key-value-store mp4 link
// (the bot downloads/sends it straight away; the file expires in
// ~3 days, which is fine). 480p is deliberate: 720p processing
// timed out (>55s) on a 2:13 video and 480p keeps files under
// WhatsApp's 16 MB video limit for typical song lengths.
// Measured: 19s clip -> 25s, 2:13 song -> 38s. Slow but working.
//
// Previous backend utils/youtube-video-downloader DIED on
// 2026-10-26 (~15:00 PKT): every run TIMED-OUT at 50s, even the
// 19s clip that took 4s that morning - the actor broke, not the
// credit (account usage was ~$0.03) and not the video (the audio
// actor utils/youtube-link still works). If streamers dies too,
// only this file changes.
//
// Token: APIFY_TOKEN_YT (the dedicated YouTube Apify account) when
// set, otherwise the shared APIFY_TOKEN - same as ytmp3.
//
// History: own extraction and yt-dlp die on YouTube's server-IP bot
// wall ("Sign in to confirm you're not a bot"); the KnightBot free
// key was revoked; the 2026-10-25 re-sweep found nothing better.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

const CLOSED = 'YouTube wala backend abhi band hai - kuch arse mai wapas ayega';

function fmtDur(sec) {
  const s = Math.round(Number(sec) || 0);
  if (!s) return 'N/A';
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function videoIdOf(u) {
  const m = String(u).match(/(?:v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function viaArslan(videoUrl) {
  const resp = await fetch('https://arslan-apis-v2.vercel.app/download/ytmp4?url=' + encodeURIComponent(videoUrl), {
    signal: AbortSignal.timeout(25000)
  });
  if (!resp.ok) return null;
  const j = await resp.json().catch(() => null);
  const dl = j?.result?.download?.url;
  if (!j?.status || !dl) return null;
  return {
    downloadedFileUrl: dl,
    durationSeconds: 0,
    fileKey: null,
    quality: j.result?.metadata?.quality || '360p',
    title: j.result?.metadata?.title || null
  };
}

async function viaStreamers(videoUrl, token) {
  if (!token) return null;
  const resp = await fetch('https://api.apify.com/v2/acts/streamers~youtube-video-downloader/run-sync-get-dataset-items?timeout=55', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      videos: [{ url: videoUrl }],
      storeInKVStore: true,
      preferredQuality: '480p'
    }),
    signal: AbortSignal.timeout(58000)
  });
  if (!resp.ok) return null;
  const items = await resp.json();
  if (!Array.isArray(items)) return null;
  const item = items.find(i => i && i.downloadedFileUrl) || null;
  if (!item) return null;
  return item;
}

// Best-effort metadata for a bare URL input (name inputs already
// have it from the search). Raced against a short timeout so it can
// never eat the actor's time budget.
async function metaForUrl(videoUrl) {
  try {
    const yts = require('yt-search');
    const r = await Promise.race([
      yts(videoUrl),
      new Promise((_, rej) => setTimeout(() => rej(new Error('meta timeout')), 5000))
    ]);
    const v = (r && r.videos && r.videos[0]) || null;
    if (!v) return {};
    return {
      title: v.title,
      author: (v.author && v.author.name) || 'YouTube',
      duration: v.timestamp || fmtDur(v.seconds),
      thumbnail: v.thumbnail || ''
    };
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const input = (searchParams.get('url') || searchParams.get('query') || '').trim();
    if (!input) {
      return sendJson(res, 200, { status: false, message: 'Missing ?url= (link or video name)' });
    }

    // No early token gate: the primary backend (arslan) is keyless.
    // The token only feeds the streamers fallback.
    const token = process.env.APIFY_TOKEN_YT || process.env.APIFY_TOKEN;

    const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(input);
    let videoUrl = input;
    let meta = {};

    if (!isUrl) {
      // Video name -> find the video first (yt-search, search only)
      try {
        const yts = require('yt-search');
        const r = await yts(input);
        const v = (r && r.videos && r.videos[0]) || null;
        if (!v) {
          return sendJson(res, 200, { status: false, message: 'Video not found' });
        }
        videoUrl = v.url;
        meta = {
          title: v.title,
          author: (v.author && v.author.name) || 'YouTube',
          duration: v.timestamp || fmtDur(v.seconds),
          thumbnail: v.thumbnail || ''
        };
      } catch {
        return sendJson(res, 200, { status: false, message: CLOSED });
      }
    }

    let item = null;
    try {
      item = await viaArslan(videoUrl);
    } catch {}
    if (!item) {
      try {
        item = await viaStreamers(videoUrl, token);
      } catch {}
    }
    if (!item) {
      return sendJson(res, 200, { status: false, message: CLOSED });
    }

    if (!meta.title) {
      const m2 = await metaForUrl(videoUrl);
      meta = { ...m2, ...meta };
    }

    const vid = videoIdOf(videoUrl);
    const fileTitle = item.fileKey
      ? item.fileKey.replace(/^[A-Za-z0-9_-]{11}_/, '').replace(/\.mp4$/i, '')
      : null;
    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        video_download: item.downloadedFileUrl,
        title: meta.title || item.title || fileTitle || 'YouTube Video',
        author: meta.author || 'YouTube',
        duration: meta.duration || fmtDur(item.durationSeconds),
        thumbnail: meta.thumbnail || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : ''),
        quality: item.quality || '480p',
        filesize: 0
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
