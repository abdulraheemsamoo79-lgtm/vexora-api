// VEXORA API - Instagram profile picture (DP) fetcher
// GET /api/igdp?username=<instagram username>   (a profile link also works)
// Returns: { status, result: { username, name, dp, followers, following, biography } }
// Method 1: Instagram's own public profile endpoint (free, no key)
// Method 2 (fallback): Apify instagram-profile-scraper (uses APIFY_TOKEN)

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function parseUsername(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (m) return m[1];
  return s.replace(/^@/, '').split(/[\s/?#]/)[0];
}

async function viaInstagram(username) {
  const r = await fetch(
    'https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username),
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
        'x-ig-app-id': '936619743392459',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(20000)
    }
  );
  if (!r.ok) throw new Error('Instagram answered HTTP ' + r.status);
  const j = await r.json();
  const u = j && j.data && j.data.user;
  if (!u) throw new Error('Profile not found');
  return {
    username: u.username || username,
    name: u.full_name || '',
    dp: u.profile_pic_url_hd || u.profile_pic_url || '',
    biography: u.biography || '',
    followers: (u.edge_followed_by && u.edge_followed_by.count) ?? null,
    following: (u.edge_follow && u.edge_follow.count) ?? null,
    verified: !!u.is_verified,
    private: !!u.is_private
  };
}

async function viaApify(username) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('No fallback available');
  const r = await fetch('https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username] }),
    signal: AbortSignal.timeout(55000)
  });
  const items = await r.json();
  if (!Array.isArray(items) || !items.length) throw new Error('Profile not found');
  const u = items[0];
  return {
    username: u.username || username,
    name: u.fullName || '',
    dp: u.profilePicUrlHD || u.profilePicUrl || '',
    biography: u.biography || '',
    followers: (u.followersCount !== undefined ? u.followersCount : null),
    following: (u.followsCount !== undefined ? u.followsCount : null),
    verified: !!u.verified,
    private: !!u.isPrivate
  };
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const username = parseUsername(searchParams.get('username') || searchParams.get('url') || searchParams.get('q') || '');
    if (!username) {
      return sendJson(res, 200, { status: false, message: 'Missing ?username= parameter' });
    }

    let result = null;
    try { result = await viaInstagram(username); } catch (e) { /* try fallback */ }
    if (!result) {
      try { result = await viaApify(username); } catch (e) { /* both failed */ }
    }
    if (!result || !result.dp) {
      return sendJson(res, 200, {
        status: false,
        message: 'Could not fetch this profile (private, wrong username, or Instagram blocked the request)'
      });
    }

    return sendJson(res, 200, { status: true, creator: 'VEXORA API', result });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
