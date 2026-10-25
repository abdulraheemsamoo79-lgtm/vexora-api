// VEXORA API - single router function.
// Vercel Hobby plan allows max 12 serverless functions per project, so all
// endpoints live in lib/handlers/ and are dispatched from this ONE function.
const handlers = {
  'ping': require('../lib/handlers/ping'),
  'ttdl': require('../lib/handlers/ttdl'),
  'tiktok-v2': require('../lib/handlers/tiktok-v2'),
  'ttsearch': require('../lib/handlers/ttsearch'),
  'mediafire': require('../lib/handlers/mediafire'),
  'instagram': require('../lib/handlers/instagram'),
  'fbdl': require('../lib/handlers/fbdl'),
  'capcut': require('../lib/handlers/capcut'),
  'pinterest-photo': require('../lib/handlers/pinterest-photo'),
  'pinterest-video': require('../lib/handlers/pinterest-video'),
  'twitter': require('../lib/handlers/twitter'),
  'gdrive': require('../lib/handlers/gdrive'),
  'ytmp3': require('../lib/handlers/ytmp3'),
  'ytmp4': require('../lib/handlers/ytmp4'),
  'attp': require('../lib/handlers/attp')
};

module.exports = (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const name = pathname.replace(/^\/api\/?/, '').split('/')[0] || 'ping';
    const handler = handlers[name];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: false, message: 'Endpoint not found: /api/' + name }, null, 2));
    }
    return handler(req, res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: false, message: 'Router error: ' + e.message }));
  }
};
