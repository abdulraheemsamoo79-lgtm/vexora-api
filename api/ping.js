// VEXORA API - health check / status endpoint
module.exports = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: true,
    service: 'VEXORA API',
    version: '1.0.0',
    creator: 'VEXORA SMD',
    time: new Date().toISOString(),
    endpoints: [
      '/api/ping',
      '/api/ttdl?url=<tiktok url>',
      '/api/tiktok-v2?url=<tiktok url>',
      '/api/ttsearch?q=<search text>',
      '/api/mediafire?url=<mediafire url>',
      '/api/instagram?url=<instagram url>',
      '/api/attp?text=<text>'
    ]
  }, null, 2));
};
