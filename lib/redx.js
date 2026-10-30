// VEXORA API - RedxAPI proxy helper
// Shared by all RedxAPI-backed handlers (quran-*, crypto, imdb, ...).
// The upstream key comes ONLY from the REDX_API_KEY env var - never hardcoded.
//
// Upstream quirks handled here:
//  1. The host sits behind a free-hosting JS cookie challenge: a request
//     without the right cookie gets an HTML page whose script carries three
//     hex constants in toNumbers("...") calls (AES key, IV, ciphertext) and a
//     document.cookie="NAME"+... assignment. We solve it locally: AES-128-CBC
//     decrypt (built-in crypto) -> cookie value = decrypted bytes as hex.
//     The solved cookie is cached in module scope and re-solved if the
//     challenge page shows up again.
//  2. The host's TLS certificate does not cover its www name (that is why
//     browsers show a certificate warning), so these upstream calls use the
//     built-in https module with rejectUnauthorized disabled FOR THIS HOST
//     ONLY. No user data is sent upstream beyond the caller's query params.

const https = require('https');
const crypto = require('crypto');

const UPSTREAM = 'https://www.redxapi.gt.tc';
const UA = 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const TIMEOUT_MS = 20000;

let cachedCookie = null; // "name=value"

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function busy(res) {
  return sendJson(res, 502, { status: false, message: 'RedxAPI upstream is busy or unreachable, try again later' });
}

function getText(urlStr, cookie) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      rejectUnauthorized: false, // upstream cert does not cover its www name
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/html;q=0.8, */*;q=0.5',
        ...(cookie ? { Cookie: cookie } : {})
      },
      timeout: TIMEOUT_MS
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve({ status: resp.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
      resp.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('upstream timeout')));
    req.on('error', reject);
    req.end();
  });
}

function isChallenge(text) {
  return typeof text === 'string' && text.includes('/aes.js') && text.includes('toNumbers(');
}

function solveChallenge(html) {
  const nums = [...html.matchAll(/toNumbers\("([0-9a-fA-F]+)"\)/g)].map((m) => m[1]);
  const nameMatch = html.match(/document\.cookie="([^"]*?)"/);
  if (nums.length < 3 || !nameMatch) return null;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-128-cbc',
      Buffer.from(nums[0], 'hex'),
      Buffer.from(nums[1], 'hex')
    );
    // The challenge's slowAES padding is not strict PKCS#7, so decrypt raw
    // and strip the pad bytes manually (same approach as the proven solver).
    decipher.setAutoPadding(false);
    let plain = Buffer.concat([decipher.update(Buffer.from(nums[2], 'hex')), decipher.final()]);
    const pad = plain[plain.length - 1];
    if (pad >= 1 && pad <= 16) plain = plain.subarray(0, plain.length - pad);
    let name = nameMatch[1];
    if (name.endsWith('=')) name = name.slice(0, -1);
    if (!name) return null;
    return name + '=' + plain.toString('hex');
  } catch (e) {
    return null;
  }
}

async function callRedx(res, slug, searchParams) {
  const key = process.env.REDX_API_KEY;
  if (!key) {
    return sendJson(res, 500, { status: false, message: 'REDX_API_KEY is not set on the server yet' });
  }

  const params = new URLSearchParams();
  for (const [k, v] of searchParams.entries()) {
    if (k !== 'apikey') params.append(k, v);
  }
  params.set('apikey', key);
  const url = `${UPSTREAM}/api/${slug}?${params.toString()}`;

  try {
    let r = await getText(url, cachedCookie);
    let fetches = 1;

    if (isChallenge(r.text)) {
      const solved = solveChallenge(r.text);
      if (!solved) return busy(res);
      cachedCookie = solved;
      const sep = url.includes('?') ? '&' : '?';
      r = await getText(url + sep + 'i=1', cachedCookie);
      fetches++;
      if (isChallenge(r.text)) return busy(res);
    }

    if ((r.status >= 500 || r.status === 0) && fetches < 3) {
      r = await getText(url, cachedCookie);
      if (isChallenge(r.text)) return busy(res);
    }

    if (r.status >= 500 || r.status === 0) return busy(res);

    let parsed = null;
    try { parsed = JSON.parse(r.text); } catch (e) { /* not JSON */ }
    if (parsed === null) return busy(res);

    res.writeHead(r.status >= 200 && r.status < 500 ? r.status : 200, { 'Content-Type': 'application/json' });
    return res.end(r.text);
  } catch (e) {
    return busy(res);
  }
}

module.exports = { callRedx };
