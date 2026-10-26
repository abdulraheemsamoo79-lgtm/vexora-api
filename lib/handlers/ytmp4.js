// VEXORA API - YouTube MP4 (for the bot's .video/.drama commands)
// GET /api/ytmp4?url=<youtube link OR video name>
// Returns: { status, result: { video_download, title, author, duration, thumbnail } }
//
// Backend (since 2026-10-26): the Apify actor
// utils/youtube-video-downloader - sibling of the utils/youtube-link
// audio actor that fixed /api/ytmp3. It downloads the video on
// Apify's side and hands back a ready mp4 link (signed key-value
// store URL). Live-verified: a 19s clip -> 480p mp4 in ~4s for
// $0.0012; a ~5 min music video -> mp4 (15.2 MB) in ~12s.
// Input is { url } ONLY (same lesson as the audio actor: extra
// fields are ignored at best). Quality is whatever the actor
// returns - there is no working quality input. The bot's .video
// plugin reads result.video_download.
// Token: APIFY_TOKEN_YT (the dedicated YouTube Apify account) when
// set, otherwise the shared APIFY_TOKEN - same as ytmp3.
//
// History: own extraction and yt-dlp both die on YouTube's
// server-IP bot wall ("Sign in to confirm you're not a bot",
// re-verified 2026-10-26); the KnightBot free key was revoked;
// the 2026-10-25 re-sweep (Invidious, cobalt, siputzx, the Arslan
// bot's APIs) found no other working backend. If this actor dies,
// only this file changes.

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
  const resp = await fetch('https://api.apify.com/v2/acts/utils~youtube-video-downloader/run-sync-get-dataset-items?timeout=50', {
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
      return sendJson(res, 200, { status: false, message: 'Missing ?url= (link or video name)' });
    }

    const token = process.env.APIFY_TOKEN_YT || process.env.APIFY_TOKEN;
    if (!token) {
      return sendJson(res, 200, { status: false, message: CLOSED });
    }

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
        video_download: item.downloadUrl,
        title: meta.title || item.title || 'YouTube Video',
        author: meta.author || 'YouTube',
        duration: meta.duration || fmtDur(item.duration),
        thumbnail: meta.thumbnail || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : ''),
        quality: item.qualityTier || '',
        filesize: item.bytes || 0
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
