// VEXORA API - YouTube MP3 (for the bot's .play/.song command)
// GET /api/ytmp3?url=<youtube link OR song name>
// Returns: { status, result: { audio_download, title, author, duration, thumbnail } }
//
// Backend (since 2026-10-26): the Apify actor utils/youtube-link
// ("YouTube Audio Downloader") - it extracts the song's audio on
// Apify's side and hands back a ready download link (audio/webm).
// Live-verified: Billie Jean -> full 4:55 song, ~4.9 MB webm, ~15s,
// charged $0.025 (~$0.005 per minute of audio, from the same shared
// APIFY_TOKEN pool as Instagram/Facebook). The bot's .play plugin
// converts the webm to mp3 with the bot's own ffmpeg before sending.
// A song NAME is first resolved to a video with yt-search (already a
// dependency of this project for /api/ytsearch).
//
// History: own extraction (youtubei.js) fails on YouTube's server-IP
// blocks; the KnightBot free key was revoked; a full 2026-10-25
// re-sweep (Invidious x10, cobalt x17 JWT-locked, siputzx routes
// removed, davidcyril/ryzen/agatz/vreden/akuari dead or key-gated)
// and the Arslan-bot APIs recovered 2026-10-26 (izumi/violetics/
// snapinsta hosts gone, okatsu 402 DEPLOYMENT_DISABLED) found no
// other working backend. If this actor dies, only this file changes.

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

async function viaActor(videoUrl, token) {
  const resp = await fetch('https://api.apify.com/v2/acts/utils~youtube-link/run-sync-get-dataset-items?timeout=50', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ url: videoUrl }),
    signal: AbortSignal.timeout(58000)
  });
  if (!resp.ok) return null;
  const items = await resp.json();
  if (!Array.isArray(items)) return null;
  const item = items.find(i => i && i.ok && i.downloadUrl) || null;
  if (!item) return null;
  return item;
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const input = (searchParams.get('url') || searchParams.get('query') || '').trim();
    if (!input) {
      return sendJson(res, 200, { status: false, message: 'Missing ?url= (link or song name)' });
    }

    // YouTube has its OWN Apify account when APIFY_TOKEN_YT is set
    // (separate $5/mo pool, user decision 2026-10-26); falls back to
    // the shared APIFY_TOKEN otherwise.
    const token = process.env.APIFY_TOKEN_YT || process.env.APIFY_TOKEN;
    if (!token) {
      return sendJson(res, 200, { status: false, message: CLOSED });
    }

    const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(input);
    let videoUrl = input;
    let meta = {};

    if (!isUrl) {
      // Song name -> find the video first (yt-search, search only)
      try {
        const yts = require('yt-search');
        const r = await yts(input);
        const v = (r && r.videos && r.videos[0]) || null;
        if (!v) {
          return sendJson(res, 200, { status: false, message: 'Song not found' });
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
      item = await viaActor(videoUrl, token);
    } catch {}
    if (!item) {
      return sendJson(res, 200, { status: false, message: CLOSED });
    }

    const vid = videoIdOf(videoUrl);
    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        audio_download: item.downloadUrl,
        title: meta.title || item.title || 'YouTube Song',
        author: meta.author || 'YouTube',
        duration: meta.duration || fmtDur(item.duration),
        thumbnail: meta.thumbnail || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '')
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
