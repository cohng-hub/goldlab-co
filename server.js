const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const LM_STUDIO_TARGET = 'http://127.0.0.1:1234';
const FILE_PATH = path.join(__dirname, 'standalone.html');

const server = http.createServer((req, res) => {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy /v1/* requests to LM Studio
  if (req.url.startsWith('/v1/')) {
    const proxyUrl = `${LM_STUDIO_TARGET}${req.url}`;
    const parsedUrl = new URL(proxyUrl);

    const proxyReq = http.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${parsedUrl.hostname}:${parsedUrl.port}`
        }
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.error('LM Studio Proxy Error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'LM Studio 서버에 연결할 수 없습니다.', details: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve standalone.html
  fs.readFile(FILE_PATH, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('standalone.html 파일을 찾을 수 없습니다.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 로컬 AI 웹서버 & LM Studio 프록시 실행 중!`);
  console.log(`👉 접속 주소: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
