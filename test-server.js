// Local test server - Vercel functions ko local chalane ke liye
// Usage: node test-server.js  ->  http://localhost:8311/api/ping
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/' || u.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.replace('/api/', '').replace(/[^a-z0-9-]/gi, '');
    const file = path.join(__dirname, 'api', name + '.js');
    if (fs.existsSync(file)) {
      delete require.cache[require.resolve(file)];
      return require(file)(req, res);
    }
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: false, message: 'Not found' }));
});

server.listen(8311, () => console.log('VEXORA API local test: http://localhost:8311'));
