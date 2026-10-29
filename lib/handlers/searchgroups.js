// VEXORA API - WhatsApp group link search
// GET /api/searchgroups?q=<search text>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Backend: groupsor.link search pages. Ultra cheerio se .maindiv
// blocks aur join buttons nikaalta tha; yahan wahi extraction
// position-based regex se hai (naye packages allowed nahi).
// NOTE: ye backend slow hai (Ultra par ~70s dekha gaya tha) —
// Vercel ki 60s limit par production mein timeout ho sakta hai.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

async function cariGC(q) {
  try {
    const r = await fetch(`https://groupsor.link/group/searchmore/${q.replace(/\s+/g, '-')}`, {
      signal: AbortSignal.timeout(30000)
    });
    const data = await r.text();
    const result = [];

    // Har 'maindiv' occurrence ek result block ka start hai —
    // us segment ka pehla <img> us group ka thumb/title hai.
    const positions = [];
    let i = -1;
    while ((i = data.indexOf('maindiv', i + 1)) !== -1) positions.push(i);
    for (let k = 0; k < positions.length; k++) {
      const seg = data.slice(positions[k], k + 1 < positions.length ? positions[k + 1] : positions[k] + 5000);
      const img = seg.match(/<img\b[^>]*>/);
      let alt = '', src = '';
      if (img) {
        alt = (img[0].match(/alt="([^"]*)"/) || [])[1] || '';
        src = (img[0].match(/src="([^"]*)"/) || [])[1] || '';
      }
      result.push({
        title: alt.trim(),
        thumb: src.trim(),
        link: ''
      });
    }

    // Join buttons: har result ke div.post-info-rate-share block
    // mein span.joinbtn ke andar group/join wala anchor hota hai —
    // wahi href index ke hisaab se result se joda jata hai
    // (Ultra cheerio mein div.post-info-rate-share > .joinbtn
    // selector se bilkul yahi nikaalta tha).
    const pirPositions = [];
    let p = -1;
    while ((p = data.indexOf('post-info-rate-share', p + 1)) !== -1) pirPositions.push(p);
    pirPositions.forEach((start, k) => {
      if (!result[k]) return;
      const seg = data.slice(start, start + 1200);
      const am = seg.match(/<a\b[^>]*href="([^"]*group\/join[^"]*)"/);
      if (am) {
        result[k].link = am[1].trim().replace('https://groupsor.link/group/join/', 'https://chat.whatsapp.com/');
      }
    });

    return result;
  } catch (e) {
    console.error(e);
    return [];
  }
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const q = searchParams.get('q');
  if (!q) {
    return sendJson(res, 400, {
      status: 400,
      creator: 'VEXORA API',
      error: 'Enter group keywords!'
    });
  }

  const result = await cariGC(q);

  if (result.length === 0) {
    return sendJson(res, 404, {
      status: 404,
      creator: 'VEXORA API',
      error: 'Group not found or failed.'
    });
  }

  return sendJson(res, 200, {
    status: 200,
    creator: 'VEXORA API',
    result
  });
};
