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

// Pehla backend (2026-11-06 se): David Cyril APIs — seedha MP3
// link, ~2s, koi key nahi (live-verified). Agar fail ho to neeche
// wala Apify actor (utils/youtube-link) fallback hai — us ki webm
// ko bot khud mp3 mein badalta hai, jabke davidcyril ka link seedha
// mp3 hai (bot ke liye aur behtar).
async function viaDavidCyril(videoUrl) {
  const resp = await fetch('https://apis.davidcyriltech.my.id/download/ytmp3?url=' + encodeURIComponent(videoUrl), {
    signal: AbortSignal.timeout(30000)
  });
  if (!resp.ok) return null;
  const j = await resp.json().catch(() => null);
  const dl = j?.result?.download_url;
  if (!j?.success || !dl) return null;
  return { downloadUrl: dl, title: j.result?.title || null, duration: 0 };
}


// Stream mode (2026-11-10): Vercel ki apni IP par googlevideo
// har link 403 deta hai (invtest se sabit), lekin Invidious ke
// PROXY links instance ke server se media late hain — wo bot
// (Railway) par khulte hain. Is liye API yahan sirf formats se
// sab se achha audio chunn kar us ke DONO link (proxy + direct)
// bot ko de deti hai; bot khud parakh kar jo khule use lega.
// Return: { streamLinks: [proxy, direct], title, duration }
async function viaInvidiousStreamAudio(videoUrl) {
  const vid = videoIdOf(videoUrl);
  if (!vid) return null;
  const data = await invidiousFormats(vid);
  if (!data || !data.audios.length) return null;
  const f = data.audios[0];
  return {
    streamLinks: invCandidates(data.base, f),
    title: data.title,
    duration: data.lengthSeconds || 0
  };
}

// David Cyril ke savetube links kabhi kabhi asal mp3 ki bajaye
// savetube ki apni website (HTML page) par redirect ho jate hain —
// 2026-11-08 ko live pakra gaya ("Banere Te": link se 52 KB ka HTML
// aya, bot ne wahi 'audio' bana kar bhej diya, WhatsApp par play
// nahi hua). Is liye David wale link ko pehle parakho: pehle chand
// bytes asal audio ke honay chahiye (ID3 / MPEG frame sync / webm /
// ftyp / OggS, aur content-type HTML na ho). Fail ho to link reject
// karke neeche wala Apify fallback chalega.
async function linkServesAudio(url) {
  try {
    const r = await fetch(url, {
      headers: { Range: 'bytes=0-2047', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow'
    });
    if (!r.ok && r.status !== 206) return false;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) return false;
    if (buf[0] === 0x3c) return false; // '<' — HTML/XML page
    const id3 = buf.length > 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    const sync = buf.length > 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
    const webm = buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    const ftyp = buf.length > 8 && buf.toString('latin1', 4, 8) === 'ftyp';
    const ogg = buf.length > 4 && buf.toString('latin1', 0, 4) === 'OggS';
    return id3 || sync || webm || ftyp || ogg;
  } catch {
    return false;
  }
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
    // (separate $5/mo pool, user decision 2026-10-26); the shared
    // APIFY_TOKEN is the fallback. BOTH are tried in order: on
    // 2026-11-06 the dedicated token turned invalid and its instant
    // auth failure shadowed the healthy shared token, killing
    // .play/.video together. Never let one bad token do that again.
    const tokens = [...new Set([process.env.APIFY_TOKEN_YT, process.env.APIFY_TOKEN].filter(Boolean))];
    // ⚠️ 2026-11-10 fix: pehle yahan 'token na ho to CLOSED'
    // wala gate tha — Invidious keyless backend lagne ke baad
    // ye gate ghalat ho gaya tha: jahan env mein token set hi
    // nahi, wahan Invidious tak pohonchne se pehle hi CLOSED
    // jawab chala jata tha aur .song band para raha. Ab gate
    // hata diya — tokens sirf Apify fallback ke liye hain,
    // khaali hon to wo loop khud hi skip ho jata hai.

    const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(input);
    let videoUrl = input;
    let meta = {};

    // Name search ke liye candidates ki list (2026-11-10 gehra
    // fix): kabhi kabhi pehli video ka stream YouTube se kharab
    // aata hai (Pal Pal Visualiser — har format 403), jabke usi
    // ganay ki dusri upload bilkul sahi chalti hai. To sirf [0]
    // par inhisaar khatam: pehli 10 videos candidates hain, Invidious
    // jo pehle asal audio de de wohi gana bhej a jayega.
    let nameCandidates = null;
    if (!isUrl) {
      try {
        const yts = require('yt-search');
        const r = await yts(input);
        const v = (r && r.videos && r.videos[0]) || null;
        if (!v) {
          return sendJson(res, 200, { status: false, message: 'Song not found' });
        }
        nameCandidates = (r.videos || []).slice(0, 10);
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

    // ?backend=apify David ko skip karke seedha Apify chalata hai
    // (bot ka .play kharab link milne par yahi retry karta hai).
    const forceBackend = (searchParams.get('backend') || '').toLowerCase();

    let item = null;
    // Invidious sab se pehle (2026-11-10): David ka MP3 link ab
    // HTML page deta hai aur Apify pool khatam hai — force
    // sirf tab skip karo jab bot ne khaas backend manga ho.
    // Stream mode: API khud download nahi karti — bot ke liye
    // links de kar wahi jawab bhej do (bot parakhega).
    if (!forceBackend) {
      const candList = nameCandidates || [null];
      for (const cand of candList) {
        const u = cand ? cand.url : videoUrl;
        let st = null;
        try { st = await viaInvidiousStreamAudio(u); } catch {}
        if (st && st.streamLinks && st.streamLinks.length) {
          const m2 = cand ? {
            title: cand.title,
            author: (cand.author && cand.author.name) || 'YouTube',
            duration: cand.timestamp || fmtDur(cand.seconds),
            thumbnail: cand.thumbnail || ''
          } : meta;
          const vid2 = videoIdOf(u);
          return sendJson(res, 200, {
            status: true,
            creator: 'VEXORA API',
            result: {
              audio_download: st.streamLinks[0],
              audio_fallbacks: st.streamLinks.slice(1),
              mode: 'stream',
              title: m2.title || st.title || 'YouTube Song',
              author: m2.author || 'YouTube',
              duration: m2.duration || fmtDur(st.duration),
              thumbnail: m2.thumbnail || (vid2 ? `https://i.ytimg.com/vi/${vid2}/hqdefault.jpg` : '')
            }
          });
        }
      }
    }
    if (!item && forceBackend !== 'apify') {
      try {
        item = await viaDavidCyril(videoUrl);
      } catch {}
      // Link asal audio deta bhi hai ya sirf HTML page? Na de to
      // reject — Apify fallback chalega.
      if (item && !(await linkServesAudio(item.downloadUrl))) {
        item = null;
      }
    }
    for (const t of item ? [] : tokens) {
      try {
        item = await viaActor(videoUrl, t);
      } catch {}
      if (item) break;
    }
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
