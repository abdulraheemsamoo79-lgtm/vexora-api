// VEXORA API - npm package search
// GET /api/npmsearch?q=<package name>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Backend: npm registry ki apni public search API (no key needed).

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const query = searchParams.get('q');
    if (!query) {
      return sendJson(res, 400, {
        status: 400,
        error: 'Parameter "q" is required, example: ?q=axios'
      });
    }

    const r = await fetch(`https://registry.npmjs.com/-/v1/search?text=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(20000)
    });
    const data = await r.json();
    const objects = (data && data.objects) || [];

    if (!objects.length) {
      return sendJson(res, 404, {
        status: 404,
        error: `Package "${query}" not found.`
      });
    }

    const result = objects.map(({ package: pkg }) => ({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      link: pkg.links.npm
    }));

    return sendJson(res, 200, {
      status: 200,
      results: result
    });
  } catch (error) {
    return sendJson(res, 500, {
      status: 500,
      error: error.message
    });
  }
};
