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
  'attp': require('../lib/handlers/attp'),
  'ttmp3': require('../lib/handlers/ttmp3'),
  'ytsearch': require('../lib/handlers/ytsearch'),
  'qr': require('../lib/handlers/qr'),
  'weather': require('../lib/handlers/weather'),
  'lyrics': require('../lib/handlers/lyrics'),
  'igdp': require('../lib/handlers/igdp'),
  'spotifydl': require('../lib/handlers/spotifydl'),
  'ytdl': require('../lib/handlers/ytdl'),
  'aptoide': require('../lib/handlers/aptoide'),
  'npmsearch': require('../lib/handlers/npmsearch'),
  'duckduckgo': require('../lib/handlers/duckduckgo'),
  'githubstalk': require('../lib/handlers/githubstalk'),
  'gitclone': require('../lib/handlers/gitclone'),
  'ssweb': require('../lib/handlers/ssweb'),
  'translate': require('../lib/handlers/translate'),
  'searchgroups': require('../lib/handlers/searchgroups'),
  'detiknews': require('../lib/handlers/detiknews'),
  'cekkhodam': require('../lib/handlers/cekkhodam'),
  'tahukahkamu': require('../lib/handlers/tahukahkamu'),
  'quran-ayah': require('../lib/handlers/quran-ayah'),
  'quran-surah': require('../lib/handlers/quran-surah'),
  'quran-search': require('../lib/handlers/quran-search'),
  'crypto': require('../lib/handlers/crypto'),
  'exchange': require('../lib/handlers/exchange'),
  'imdb': require('../lib/handlers/imdb'),
  'ip-lookup': require('../lib/handlers/ip-lookup'),
  'wikipedia': require('../lib/handlers/wikipedia'),
  'dictionary': require('../lib/handlers/dictionary'),
  'urban': require('../lib/handlers/urban'),
  'shorten': require('../lib/handlers/shorten'),
  'anime-gif': require('../lib/handlers/anime-gif'),
  'apk-search': require('../lib/handlers/apk-search'),
  'archive-search': require('../lib/handlers/archive-search'),
  'books': require('../lib/handlers/books'),
  'fda': require('../lib/handlers/fda'),
  'periodic-table': require('../lib/handlers/periodic-table'),
  'pokedex': require('../lib/handlers/pokedex'),
  'trivia': require('../lib/handlers/trivia'),
  'fact': require('../lib/handlers/fact'),
  'joke': require('../lib/handlers/joke'),
  'quote': require('../lib/handlers/quote'),
  'advice': require('../lib/handlers/advice'),
  'geocode': require('../lib/handlers/geocode'),
  'memes': require('../lib/handlers/memes'),
  'canvas-heart': require('../lib/handlers/canvas-heart'),
  'ai': require('../lib/handlers/ai')
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
