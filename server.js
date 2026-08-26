const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const LM_STUDIO_TARGET = 'http://127.0.0.1:1234';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

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

  // 1. 한국금거래소(Korea Gold Exchange) 공식 실시간 시세 API 프록시
  if (req.url.startsWith('/api/gold-rates') || req.url.startsWith('/api/main')) {
    const kgeReq = https.request('https://koreagoldx.co.kr/api/main', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json;charset=UTF-8',
        'Origin': 'https://koreagoldx.co.kr',
        'Referer': 'https://koreagoldx.co.kr/'
      }
    }, (kgeRes) => {
      res.writeHead(kgeRes.statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      kgeRes.pipe(res);
    });

    kgeReq.on('error', (err) => {
      console.error('KGE Proxy Error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '한국금거래소 시세 서버에 연결할 수 없습니다.', details: err.message }));
    });

    kgeReq.write(JSON.stringify({}));
    kgeReq.end();
    return;
  }

  // 2. Proxy /v1/* requests to LM Studio
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

  // 3. Serve Static Web Files
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for standalone.html if requested
      const fallbackPath = path.join(__dirname, 'standalone.html');
      if (fs.existsSync(fallbackPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(fallbackPath).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 골드랩 웹서버 & 한국금거래소 실시간 시세 프록시 가동!`);
  console.log(`👉 접속 주소: http://localhost:${PORT}`);
  console.log(`👉 시세 API: http://localhost:${PORT}/api/gold-rates`);
  console.log(`==================================================`);
});
