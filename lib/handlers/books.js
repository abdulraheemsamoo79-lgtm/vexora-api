// VEXORA API - Book Search
// GET /api/books?q=<book title>
// Backend history:
//  - Was a RedxAPI proxy, but the Redx /api/books path itself is dead
//    (production test 2026-11-22: HTTP 502 'upstream busy' on every try,
//    while all other Redx paths work) - so the backend was swapped.
//  - NOW: Open Library search (keyless, no signup) - returns title,
//    author, first publish year, edition count and a cover image URL.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const q = (searchParams.get('q') || searchParams.get('query') || '').trim();
    if (!q) {
      return sendJson(res, 200, { status: false, message: 'Missing ?q= parameter', result: [] });
    }

    const api = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(q) +
      '&limit=10&fields=title,author_name,first_publish_year,cover_i,edition_count';
    const r = await fetch(api, {
      headers: { 'User-Agent': 'VEXORA-API/1.0 (book search)' },
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) {
      return sendJson(res, 200, { status: false, message: 'Book search is unavailable right now. Please try again.', result: [] });
    }
    const data = await r.json();
    const docs = Array.isArray(data.docs) ? data.docs : [];
    if (!docs.length) {
      return sendJson(res, 200, { status: false, message: 'No books found for: ' + q, result: [] });
    }

    const result = docs.map((d) => ({
      title: d.title || 'Unknown',
      author: Array.isArray(d.author_name) && d.author_name.length ? d.author_name.join(', ') : 'Unknown',
      first_publish_year: d.first_publish_year || null,
      editions: d.edition_count || null,
      cover: d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg' : null
    }));

    return sendJson(res, 200, { status: true, creator: 'VEXORA API', total: data.numFound || result.length, result });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Book search is unavailable right now. Please try again.', result: [] });
  }
};
