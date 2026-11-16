// server.js - Production-Ready Server for GoldLab&co Platform
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Load environment variables safely (never overwrite host/Cloudtype injected env vars)
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  } else {
    // Fallback .env reader
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...v] = trimmed.split('=');
          const key = k.trim();
          if (process.env[key] === undefined) {
            process.env[key] = v.join('=').trim();
          }
        }
      }
    }
  }
} catch (e) {
  console.log('[Server] Note: .env loaded or defaults applied.');
}

const PORT = parseInt(process.env.PORT, 10) || 3000;
const { getDB } = require('./server/db');
const { handleApiRequest } = require('./server/routes');

// Initialize database on boot
getDB();

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
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
};

let kgeCache = { data: null, timestamp: 0 };

async function fetchLiveKGEFromUpstream() {
  const now = Date.now();
  if (kgeCache.data && (now - kgeCache.timestamp < 60000)) {
    return kgeCache.data;
  }

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const homeRes = await fetch('https://www.koreagoldx.co.kr/', {
      method: 'GET',
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });

    const rawCookies = typeof homeRes.headers.getSetCookie === 'function'
      ? homeRes.headers.getSetCookie()
      : (homeRes.headers.get('set-cookie') ? [homeRes.headers.get('set-cookie')] : []);
    const cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

    const html = await homeRes.text();
    const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+name="csrf-token"/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    const reqHeaders = {
      'User-Agent': ua,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'https://www.koreagoldx.co.kr',
      'Referer': 'https://www.koreagoldx.co.kr/',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    };
    if (cookieHeader) reqHeaders['Cookie'] = cookieHeader;
    if (csrfToken) reqHeaders['X-CSRF-TOKEN'] = csrfToken;

    const apiRes = await fetch('https://www.koreagoldx.co.kr/api/main', {
      method: 'POST',
      headers: reqHeaders,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!apiRes.ok) {
      throw new Error(`KGE upstream HTTP ${apiRes.status}`);
    }

    const json = await apiRes.json();
    if (json && json.officialPrice4 && json.officialPrice4.s_pure) {
      kgeCache = { data: json, timestamp: Date.now() };
      return json;
    }
    throw new Error('Invalid KGE response payload');
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

const server = http.createServer((req, res) => {
  // Global CORS and Security Headers
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Handle preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:' + PORT}`);

  // 0. Container Health Check Endpoint (/healthz)
  if (parsedUrl.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', online: true, timestamp: new Date().toISOString() }));
    return;
  }

  // 1. KGE Direct Proxy for Real-Time Benchmark Rates
  if (parsedUrl.pathname === '/api/kge-proxy') {
    fetchLiveKGEFromUpstream()
      .then((data) => {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': origin,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify(data));
      })
      .catch((err) => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '한국금거래소 시세 서버에 연결할 수 없습니다.', details: err.message }));
      });
    return;
  }

  // 2. Central REST API Routing
  if (parsedUrl.pathname.startsWith('/api/')) {
    let rawBody = '';
    req.on('data', chunk => {
      rawBody += chunk;
      // Protect from body overflow (Max 12MB for high-res photo uploads)
      if (rawBody.length > 12 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', async () => {
      let body = {};
      if (rawBody && rawBody.trim()) {
        try {
          body = JSON.parse(rawBody);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '유효한 JSON 형식의 요청 본문이 아닙니다.' }));
          return;
        }
      }

      try {
        await handleApiRequest(req, res, parsedUrl, body);
      } catch (err) {
        console.error('[API Error]', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }));
      }
    });
    return;
  }

  // 3. Static Web Files Server & Legacy URL Redirects
  let reqPath = parsedUrl.pathname;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Redirect legacy Cafe24 / shopping mall paths to home
  if (/^\/(product\/compare|order\/basket|member\/|board\/|category\/|shop\/|goods\/|order\/|myshop\/)/i.test(reqPath)) {
    res.writeHead(301, { 'Location': '/' });
    res.end();
    return;
  }

  // Remove leading slashes and prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Clean URL support: e.g. /appraisal -> /appraisal.html
      const htmlFallback = filePath + '.html';
      if (fs.existsSync(htmlFallback) && fs.statSync(htmlFallback).isFile()) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(htmlFallback).pipe(res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>404 Not Found - GoldLab&co</title><style>body{background:#0F172A;color:#F8FAFC;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column}h1{color:#D4AF37;margin-bottom:8px}a{color:#D4AF37;text-decoration:none;border:1px solid #D4AF37;padding:8px 16px;border-radius:6px;margin-top:16px}</style></head>
<body><h1>404 - 페이지를 찾을 수 없습니다</h1><p>요청하신 페이지가 존재하지 않거나 이동되었습니다.</p><a href="/">골드랩 홈으로 이동</a></body></html>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`👑 골드랩&co (GoldLab&co) 비즈니스 플랫폼 서버 가동`);
    console.log(`📍 서비스 주소: http://0.0.0.0:${PORT}`);
    console.log(`📡 REST API 엔드포인트: http://0.0.0.0:${PORT}/api/`);
    console.log(`🛡️ 관리자/보안/데이터베이스 엔진: 온라인 정상 가동`);
    console.log(`====================================================`);
  });

  // Dual-port compatibility: if primary PORT is 5000 (e.g. from .env), also listen on 3000 (Cloudtype default), and vice versa
  const altPort = PORT === 3000 ? 5000 : 3000;
  try {
    const altServer = http.createServer(server.listeners('request')[0]);
    altServer.on('error', () => {}); // Ignore if altPort is in use
    altServer.listen(altPort, '0.0.0.0', () => {
      console.log(`🔄 [Dual-Port] 호환 포트 http://0.0.0.0:${altPort} 동시 수신 대기 중`);
    });
  } catch (e) {}
}

module.exports = server;
