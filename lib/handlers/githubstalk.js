// VEXORA API - GitHub profile stalk
// GET /api/githubstalk?username=<github username>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Ultra cheerio se profile page scrape karta tha; yahan wahi
// fields regex se nikale gaye hain (naye packages allowed nahi).

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '').trim();
}

// Pehla anchor jis ka href diye gaye suffix par khatam ho, us ke
// andar ke diye gaye class wale span ka text (cheerio ke
// a[href$="..."] span.<cls> selector ka regex badal).
function anchorSpanText(html, hrefSuffix, spanClass) {
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    const hm = openTag.match(/href="([^"]*)"/);
    if (!hm || !hm[1].endsWith(hrefSuffix)) continue;
    const sm = m[1].match(new RegExp('<span[^>]*class="[^"]*' + spanClass + '[^"]*"[^>]*>([^<]*)</span>'));
    return sm ? sm[1].trim() : '';
  }
  return '';
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const username = searchParams.get('username');
    if (!username) {
      return sendJson(res, 400, {
        status: false,
        code: 400,
        creator: 'VEXORA API',
        message: 'Please enter a GitHub username!'
      });
    }

    const url = `https://github.com/${username}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000)
    });
    const data = await r.text();

    const titleMatch = data.match(/<title>([^<]*)<\/title>/);
    if ((titleMatch && titleMatch[1].includes('Page not found')) || r.status === 404) {
      return sendJson(res, 404, {
        status: false,
        code: 404,
        creator: 'VEXORA API',
        message: `Account *${username}* not found.`
      });
    }

    const nameM = data.match(/<span[^>]*class="[^"]*p-name[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const name = (nameM ? stripTags(nameM[1]) : '') || username;
    const followers = anchorSpanText(data, 'followers', 'text-bold') || '0';
    const following = anchorSpanText(data, 'following', 'text-bold') || '0';
    const repo = anchorSpanText(data, '?tab=repositories', 'Counter') || '0';

    let avatar = '';
    const imgRe = /<img\b[^>]*>/g;
    let im;
    while ((im = imgRe.exec(data)) !== null) {
      if (!im[0].includes('avatar-user')) continue;
      const sm = im[0].match(/src="([^"]+)"/);
      if (sm) { avatar = sm[1].replace(/&amp;/g, '&'); break; }
    }
    avatar = avatar + '?size=400';

    return sendJson(res, 200, {
      status: true,
      code: 200,
      creator: 'VEXORA API',
      data: {
        name,
        username,
        followers,
        following,
        repository: repo,
        avatar,
        profile_url: url
      }
    });
  } catch (error) {
    return sendJson(res, 500, {
      status: false,
      code: 500,
      creator: 'VEXORA API',
      message: 'An error occurred while fetching data.',
      error: error.message
    });
  }
};
