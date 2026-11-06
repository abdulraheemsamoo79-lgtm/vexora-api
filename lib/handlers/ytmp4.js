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

// WhatsApp par video sirf ~16MB tak jati hai; 480p par takreeban
// 10 minute se lambi video na is limit mein ati hai, na hi actor
// 55s ki window mein use bana pata hai (22-min video par 57s jal
// kar khali jawab aya tha - 2026-11-06). Lambi video ko shuru mein
// hi saaf mana kar do taake user ko ghalat 'servers unavailable'
// wala dhoka na mile.
const TOO_LONG_MSG = 'This video is too long for WhatsApp (about 10 minutes max). Please try a shorter video.';

function durationSecondsOf(meta) {
  if (!meta) return 0;
  if (meta.duration && String(meta.duration).includes(':')) {
    const parts = String(meta.duration).split(':').map(x => parseInt(x, 10) || 0);
    let sec = 0;
    for (const p of parts) sec = sec * 60 + p;
    return sec;
  }
  return 0;
}

function videoIdOf(u) {
  const m = String(u).match(/(?:v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// PRIMARY (2026-11-06 se): David Cyril APIs — Silva bot ke source
// se mili, live-verified (480p video ~8s, direct savetube CDN link,
// koi key nahi). Us se pehle Arslan tha jo 402 DEPLOYMENT_DISABLED
// par mar gaya; Arslan ki baqi tamam deployments bhi usi din band
// milein (full sweep 2026-11-06). Agar ye bhi mare to neeche wala
// Apify streamers fallback ab bhi maujood hai.
async function viaDavidCyril(videoUrl) {
  const resp = await fetch('https://apis.davidcyriltech.my.id/download/ytmp4?url=' + encodeURIComponent(videoUrl), {
    signal: AbortSignal.timeout(30000)
  });
  if (!resp.ok) return null;
  const j = await resp.json().catch(() => null);
  const dl = j?.result?.download_url;
  if (!j?.success || !dl) return null;
  return {
    downloadedFileUrl: dl,
    durationSeconds: 0,
    fileKey: null,
    quality: j.result?.quality || '480p',
    title: j.result?.title || null
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
    // The tokens only feed the streamers fallback. BOTH tokens are
    // tried in order (dedicated YT pool first, shared pool second):
    // on 2026-11-06 the dedicated APIFY_TOKEN_YT turned invalid and
    // its instant auth failure shadowed the healthy shared token,
    // killing .video/.play together while /api/instagram (shared
    // token only) kept working. Never let one bad token do that again.

    // long=1 (bot ka document mode): 10+ minute ki video ko rokna
    // nahi hai - wo WhatsApp par video ban kar nahi, FILE (document)
    // ban kar jayegi. David Cyril lambi video ka link de deta hai
    // (12-min par test shuda, 2026-11-06), lekin sust hai (~45s),
    // is liye long mode mein sirf wahi try hota hai - Apify actor
    // lambi video par waise bhi haar jata hai.
    const longMode = searchParams.get('long') === '1';

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
        if (!longMode && (Number(v.seconds) || durationSecondsOf(meta)) > 600) {
          return sendJson(res, 200, { status: false, message: TOO_LONG_MSG });
        }
      } catch {
        return sendJson(res, 200, { status: false, message: CLOSED });
      }
    }

    const tokens = [...new Set([process.env.APIFY_TOKEN_YT, process.env.APIFY_TOKEN].filter(Boolean))];
    if (isUrl && !meta.title) {
      const m0 = await metaForUrl(videoUrl);
      if (m0 && m0.title) meta = { ...m0, ...meta };
      if (!longMode && durationSecondsOf(meta) > 600) {
        return sendJson(res, 200, { status: false, message: TOO_LONG_MSG });
      }
    }

    let item = null;
    try {
      item = await viaDavidCyril(videoUrl);
    } catch {}
    if (!item && longMode) {
      // Ek aur koshish - lambi video par pehli dafa sust pad sakta hai
      try {
        item = await viaDavidCyril(videoUrl);
      } catch {}
    }
    if (!item && !longMode) {
      for (const t of tokens) {
        try {
          item = await viaStreamers(videoUrl, t);
        } catch {}
        if (item) break;
      }
    }
    if (!item) {
      return sendJson(res, 200, { status: false, message: longMode ? 'This long video could not be prepared right now. Please try again in a little while.' : CLOSED });
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
