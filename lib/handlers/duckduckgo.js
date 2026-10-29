// VEXORA API - Web search (Bing primary, DuckDuckGo fallbacks)
// GET /api/duckduckgo?q=<search text>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API) —
// ye wahi FIXED version hai: DuckDuckGo datacenter IPs ko 403/202
// deta hai, is liye primary Bing hai, DDG lite/html sirf fallback.
// Ultra cheerio use karta tha; yahan wahi extraction regex se hai
// (purani API mein naye packages allowed nahi).

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, '')).trim();
}

function cleanLink(href) {
  if (!href) return href;
  try {
    const u = new URL(href.startsWith('//') ? 'https:' + href : href);
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return u.href;
  } catch (_) {
    return href;
  }
}

async function fetchText(url, params) {
  const qs = new URLSearchParams(params || {}).toString();
  const r = await fetch(qs ? url + '?' + qs : url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(20000)
  });
  return r.text();
}

// Primary: Bing search — Vercel jaisi datacenter IPs par bhi chalta
// hai, jabke DuckDuckGo (html + lite dono) unhein 403/202 deta hai.
async function viaBing(query) {
  const html = await fetchText('https://www.bing.com/search', { q: query });
  const results = [];
  const re = /<li class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const title = stripTags(m[2]);
    let link = decodeEntities(m[1]);
    try {
      const u = new URL(link).searchParams.get('u');
      if (u && u.startsWith('a1')) link = Buffer.from(u.slice(2), 'base64').toString('utf8');
    } catch (_) {}
    if (title && link) results.push({ title, link });
  }
  return results;
}

// Saare <a> tags scan karke wohi return karta hai jinki opening tag
// mein di gayi class ho (cheerio ke class selector ka regex badal).
function anchorsWithClass(html, needle) {
  const out = [];
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    if (!openTag.includes(needle)) continue;
    const hm = openTag.match(/href=(["'])(.*?)\1/);
    if (!hm) continue;
    out.push({ href: decodeEntities(hm[2]), text: stripTags(m[1]) });
  }
  return out;
}

async function viaLite(query) {
  const html = await fetchText('https://lite.duckduckgo.com/lite/', { q: query });
  const results = [];
  for (const a of anchorsWithClass(html, 'result-link')) {
    const title = a.text;
    const link = cleanLink(a.href);
    if (title && link) results.push({ title, link });
  }
  return results;
}

async function viaHtml(query) {
  const html = await fetchText('https://html.duckduckgo.com/html/', { q: query });
  const results = [];
  for (const a of anchorsWithClass(html, 'result__a')) {
    const title = a.text;
    const link = cleanLink(a.href);
    if (title && link) results.push({ title, link });
  }
  return results;
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const query = searchParams.get('q');
  if (!query) {
    return sendJson(res, 400, { status: 400, message: 'Parameter q is required.' });
  }

  try {
    let results = await viaBing(query).catch(() => []);
    if (!results.length) results = await viaLite(query).catch(() => []);
    if (!results.length) results = await viaHtml(query).catch(() => []);
    if (!results.length) {
      return sendJson(res, 500, { status: 500, message: 'Failed to fetch data.', error: 'No results from search backends' });
    }
    return sendJson(res, 200, { status: 200, results });
  } catch (err) {
    return sendJson(res, 500, { status: 500, message: 'Failed to fetch data.', error: err.message });
  }
};
