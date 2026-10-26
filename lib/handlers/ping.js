// VEXORA API - health check / status endpoint
module.exports = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: true,
    service: 'VEXORA API',
    version: '1.3.0',
    creator: 'VEXORA SMD',
    time: new Date().toISOString(),
    endpoints: [
      '/api/ping',
      '/api/ttdl?url=<tiktok url>',
      '/api/tiktok-v2?url=<tiktok url>',
      '/api/ttsearch?q=<search text>',
      '/api/mediafire?url=<mediafire url>',
      '/api/instagram?url=<instagram url>',
      '/api/fbdl?url=<facebook url>',
      '/api/capcut?url=<capcut url>',
      '/api/pinterest-photo?url=<pin url>',
      '/api/pinterest-video?url=<pin url>',
      '/api/twitter?url=<tweet url>',
      '/api/gdrive?url=<drive url>',
      '/api/ytmp3?url=<youtube link or song name>',
      '/api/ytmp4?url=<youtube link>',
      '/api/attp?text=<text>',
      '/api/ttmp3?url=<tiktok url>',
      '/api/ytsearch?q=<search text>',
      '/api/qr?text=<text or link>',
      '/api/weather?city=<city name>',
      '/api/lyrics?q=<artist - title>',
      '/api/igdp?username=<instagram username>'
    ]
  }, null, 2));
};
