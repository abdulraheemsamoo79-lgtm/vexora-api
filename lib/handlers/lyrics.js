// VEXORA API - Song lyrics finder
// GET /api/lyrics?q=<artist - title>   (or ?artist=<a>&title=<t>)
// If only a song name is given, the first search match is used.
// Returns: { status, result: { title, artist, lyrics } }
// Backend: lyrics.ovh (free public lyrics service)

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

async function fetchJson(url, ms) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'VEXORA-API/1.3' },
    signal: AbortSignal.timeout(ms || 20000)
  });
  return r.json();
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    let artist = (searchParams.get('artist') || '').trim();
    let title = (searchParams.get('title') || '').trim();
    const q = (searchParams.get('q') || searchParams.get('query') || '').trim();

    if (!artist && !title && q) {
      if (q.includes(' - ')) {
        const parts = q.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else {
        // Only a name was given - find the best-known match first.
        title = q;
        try {
          const sug = await fetchJson('https://api.lyrics.ovh/suggest/' + encodeURIComponent(q));
          const hit = sug && Array.isArray(sug.data) ? sug.data[0] : null;
          if (hit && hit.title && hit.artist && hit.artist.name) {
            title = hit.title;
            artist = hit.artist.name;
          }
        } catch (_) { /* fall through with the raw query as title */ }
      }
    }

    if (!title) {
      return sendJson(res, 200, { status: false, message: 'Missing song name. Use ?q=<artist - title>' });
    }
    if (!artist) {
      return sendJson(res, 200, { status: false, message: 'Artist name needed. Use the format: Artist - Song Title' });
    }

    const data = await fetchJson(
      'https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title)
    );
    if (!data || !data.lyrics) {
      return sendJson(res, 200, { status: false, message: `Lyrics not found for: ${artist} - ${title}` });
    }

    const lyrics = String(data.lyrics).replace(/\r\n/g, '\n').trim();
    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        title,
        artist,
        lyrics: lyrics.slice(0, 6000),
        truncated: lyrics.length > 6000
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
