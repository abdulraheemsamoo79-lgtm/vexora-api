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
// ⚠️ IP-BOUND LINK TRAP (2026-11-06, Pal Pal wali fail ki asal
// wajah): David Cyril kuch videos par savetube CDN link deta hai
// (kahin se bhi khulta hai) aur kuch par seedha googlevideo link —
// jo USI server ki IP ke saath bandha hota hai (link mein ip=
// param). Bot (Railway, dusri IP) use lene jaye to googlevideo
// 403 deta hai: card chala jata hai, video nahi aati. Is liye
// googlevideo wala link yahan MISS mana jata hai taake chain
// agle backend (tioo proxy / Apify) par chali jaye, jin ke links
// kahin se bhi khulte hain.
function isIpBoundLink(u) {
  try { return /(^|\.)googlevideo\.com$/i.test(new URL(u).hostname); } catch { return false; }
}

async function viaDavidCyril(videoUrl) {
  const resp = await fetch('https://apis.davidcyriltech.my.id/download/ytmp4?url=' + encodeURIComponent(videoUrl), {
    signal: AbortSignal.timeout(30000)
  });
  if (!resp.ok) return null;
  const j = await resp.json().catch(() => null);
  const dl = j?.result?.download_url;
  if (!j?.success || !dl) return null;
  if (isIpBoundLink(dl)) return null; // bot ke kaam ka nahi — agla backend
  return {
    downloadedFileUrl: dl,
    durationSeconds: 0,
    fileKey: null,
    quality: j.result?.quality || '480p',
    title: j.result?.title || null
  };
}

// Tioo (ProBoy-MD bot ke source se mili, 2026-11-06 live-verified):
// keyless. Is ka mp4 link ek PROXY (api.vidsnap.app) se ata hai —
// proxy khud googlevideo se file lati hai, is liye bot kahin se
// bhi le sakta hai (ranged GET 206 verify shuda). Quality 360p.

// ── Invidious PAIR mode (2026-11-10) ──────────────────────────
// Invidious ke adaptive formats mein audio aur video ALAG
// streams hote hain (muxed format is instance par maujood
// nahi). Is liye ye backend do proxy links (video + audio)
// return karta hai — dono instance ke apne proxy par, is liye
// bot kahin se bhi le sakta hai. Bot (ytdl-video.js) dono ko
// apne ffmpeg se mux karke bhejta hai. API ki jawab mein
// video_download = video link, audio_download = audio link,
// mode = 'pair' — bot pair mode pehchan kar mux karta hai.
async function viaInvidiousPair(videoUrl) {
  const vid = videoIdOf(videoUrl);
  if (!vid) return null;
  const data = await invidiousFormats(vid);
  if (!data || !data.videos.length || !data.audios.length) return null;
  // Quality: 360p/480p pehle (WhatsApp size + mux speed), na
  // mile to sab se kam resolution jo hai.
  const pick = (maxRes) => data.videos.find(v => (parseInt(v.resolution) || 9999) <= maxRes) || null;
  const vfmt = pick(480) || pick(720) || data.videos[data.videos.length - 1];
  const afmt = data.audios[0];
  if (!vfmt || !afmt) return null;
  // Har format ki har shakal (proxy pehle, phir direct) —
  // jo pehle asal media parakhi jaye wohi pakki.
  let vLink = null;
  for (const cand of invCandidates(data.base, vfmt)) {
    if (await probeMedia(cand)) { vLink = cand; break; }
  }
  if (!vLink) return null;
  let aLink = null;
  for (const cand of invCandidates(data.base, afmt)) {
    if (await probeMedia(cand)) { aLink = cand; break; }
  }
  if (!aLink) return null;
  return {
    pair: true,
    downloadedFileUrl: vLink,
    audioUrl: aLink,
    durationSeconds: data.lengthSeconds || 0,
    fileKey: null,
    quality: (vfmt.resolution || '360p') + ' (audio alag)',
    title: data.title || null
  };
}

async function viaTioo(videoUrl) {
  const resp = await fetch('https://backend1.tioo.eu.org/YouTube?url=' + encodeURIComponent(videoUrl), {
    signal: AbortSignal.timeout(20000)
  });
  if (!resp.ok) return null;
  const j = await resp.json().catch(() => null);
  if (!j?.status || !j?.mp4) return null;
  return {
    downloadedFileUrl: j.mp4,
    durationSeconds: 0,
    fileKey: null,
    quality: '360p',
    title: j.title || null
  };
}


// ── Invidious backend (2026-11-10 se PRIMARY) ─────────────────
// David Cyril ka MP3 link ab savetube ka HTML page dene laga aur
// Apify paid pool khatam ho gaya, to teeno YouTube commands band
// ho gaye the. Ek Invidious instance (yt.chocolatemoo53.com) live
// parakh kar lagaya gaya: us ke diye hue format links usi instance
// ke proxy se aate hain, is liye KISI bhi IP se khulte hain
// (googlevideo wale IP-bound 403 wala trap yahan nahi hai).
// Live-verified 2026-11-10: Pasoori / Pal Pal / Tere Bin (40 min)
// par audio+video dono ke links HTTP 206 asal media ke saath.
// ⚠️ Ek hi instance par inhisaar kamzor hai — instance mare to
// neeche walay purane backends (David/Apify) ab bhi chain mein
// hain; naya zinda instance mile to INVIDIOUS_BASES mein add kar
// dena, baqi code wohi rahega.
const INVIDIOUS_BASES = [
  'https://yt.chocolatemoo53.com'
];

function isIpBoundLink2(u) {
  try { return /(^|\.)googlevideo\.com$/i.test(new URL(u).hostname); } catch { return false; }
}

// Ek instance se asal formats lao; tor-host wale links ko usi
// instance ke /videoplayback proxy se aur direct googlevideo
// links ko jaisa hai waisa — lekin sirf wohi link return karo jo
// yahan se parakhne par asal audio/video nikle.
async function probeMedia(url) {
  try {
    const r = await fetch(url, {
      headers: { Range: 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow'
    });
    if (!(r.status === 200 || r.status === 206)) return false;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 32 || buf[0] === 0x3c) return false;
    const id3 = buf.length > 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    const sync = buf.length > 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
    const webm = buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    const ftyp = buf.length > 8 && buf.toString('latin1', 4, 8) === 'ftyp';
    const ogg = buf.length > 4 && buf.toString('latin1', 0, 4) === 'OggS';
    return id3 || sync || webm || ftyp || ogg;
  } catch { return false; }
}

async function invidiousFormats(videoId) {
  for (const base of INVIDIOUS_BASES) {
    try {
      const r = await fetch(base + '/api/v1/videos/' + videoId, {
        // ⚠️ ?local=true MAT lagana (2026-11-10 live saboot):
        // is instance par local mode companion-po-token wale
        // /videoplayback links deta hai jo bina token ke 403
        // ('Videoplayback URL has expired') dete hain — kuch
        // videos par chale, kuch par nahi. Baghair local ke
        // links seedha googlevideo se aate hain aur parakh
        // (probeMedia) faisla karta hai ke link asal mein
        // is IP se khulta hai ya nahi — David wala IP trap
        // isi parakh se pakra jata hai.
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000)
      });
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      const fmts = (j && j.adaptiveFormats) || [];
      if (!fmts.length) continue;
      const audios = fmts
        .filter(f => String(f.type || '').includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const videos = fmts
        .filter(f => String(f.type || '').includes('video') && String(f.type || '').includes('mp4'))
        .sort((a, b) => (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0));
      if (audios.length || videos.length) {
        return { base, audios, videos, title: j.title || null, lengthSeconds: j.lengthSeconds || 0 };
      }
    } catch {}
  }
  return null;
}

// Candidate link: Invidious hamesha apne proxy par rakho (IP
// trap se bachao); agar format pehle se proxy par hai to wohi.
function invCandidate(base, fmt) {
  if (!fmt || !fmt.url) return null;
  if (fmt.url.startsWith(base)) return fmt.url;
  // googlevideo direct link: pehle direct bhi parakha jayega
  // (neeche callers dono shaklein bari bari azmate hain).
  return fmt.url;
}

// Ek format ki DONO mumkin shaklein, tarteeb se: (1) instance
// ke /videoplayback proxy par (IP-bound hon ya na hon — proxy
// apni taraf se fresh signed link banata hai, 2026-11-10 ko
// Pal Pal Visualiser par sabit: direct googlevideo 403 tha,
// yehi format proxy par 206 asal webm), (2) direct jaisa hai.
function invCandidates(base, fmt) {
  if (!fmt || !fmt.url) return [];
  const out = [];
  try {
    const u = new URL(fmt.url);
    if (u.hostname.endsWith('googlevideo.com')) {
      out.push(base + '/videoplayback' + (u.search || ''));
    }
  } catch {}
  out.push(fmt.url);
  return [...new Set(out)];
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
    // (12-min par test shuda, 2026-11-06), lekin sust hai (~45s) -
    // long mode mein David ke baad tioo try hota hai; Apify actor
    // lambi video par waise bhi haar jata hai.
    const longMode = searchParams.get('long') === '1';

    // backend=david|tioo|apify — bot kisi EK backend ko majboor
    // kar sakta hai (jab pehle wale ka link bot par na khule).
    const backend = (searchParams.get('backend') || '').toLowerCase();

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
    const tryDavid = async () => { try { return await viaDavidCyril(videoUrl); } catch { return null; } };
    const tryTioo = async () => { try { return await viaTioo(videoUrl); } catch { return null; } };
    const tryApify = async () => {
      for (const t of tokens) {
        try {
          const it = await viaStreamers(videoUrl, t);
          if (it) return it;
        } catch {}
      }
      return null;
    };
    if (backend === 'invidious') {
      try { item = await viaInvidiousPair(videoUrl); } catch {}
    } else if (backend === 'david') {
      item = await tryDavid();
    } else if (backend === 'tioo') {
      item = await tryTioo();
    } else if (backend === 'apify') {
      if (!longMode) item = await tryApify();
    } else if (longMode) {
      item = await tryDavid();
      if (!item) item = await tryDavid(); // sust server — ek aur koshish
      if (!item) item = await tryTioo();
    } else {
      // 2026-11-10: Invidious pair mode sab se pehle — David
      // aadhi videos par IP-bound link deta hai, tioo down hai,
      // Apify pool khatam hai.
      try { item = await viaInvidiousPair(videoUrl); } catch {}
      if (!item) item = await tryDavid();
      if (!item) item = await tryTioo();
      if (!item) item = await tryApify();
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
        ...(item.pair ? { audio_download: item.audioUrl, mode: 'pair' } : {}),
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
