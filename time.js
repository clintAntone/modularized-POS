const http = require('http');

const PORT = 3002;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.url === '/api/time' && req.method === 'GET') {
    const now = new Date();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      timestamp: now.getTime(),
      iso: now.toISOString(),
      source: 'SERVER_LOCAL',
      timezone: 'UTC'
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Time API running on http://0.0.0.0:${PORT}`);
});
