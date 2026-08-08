const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const BAIDU_API = 'https://top.baidu.com/api/board?platform=pc&tab=realtime';
const BING_API = 'https://www.bing.com/HPImageArchive.aspx?format=js&mkt=zh-CN';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

let hotCache = { data: null, time: 0 };
const CACHE_TTL = 5 * 60 * 1000;

function fetchBaiduHot() {
  return new Promise((resolve, reject) => {
    const req = https.get(BAIDU_API, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error('baidu status ' + res.statusCode));
        return;
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function fetchBingImage(idx) {
  return new Promise((resolve, reject) => {
    const apiUrl = BING_API + '&idx=' + idx + '&n=1';
    const req = https.get(apiUrl, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error('bing status ' + res.statusCode));
        return;
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.images && data.images[0] && data.images[0].url) {
            resolve({ url: 'https://www.bing.com' + data.images[0].url, copyright: data.images[0].copyright || '' });
          } else {
            reject(new Error('unexpected bing response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/hot') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const send = (code, body, type) => {
      res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8' });
      res.end(body);
    };
    if (hotCache.data && Date.now() - hotCache.time < CACHE_TTL) {
      send(200, hotCache.data);
      return;
    }
    fetchBaiduHot()
      .then((body) => {
        hotCache = { data: body, time: Date.now() };
        send(200, body);
      })
      .catch((err) => {
        if (hotCache.data) send(200, hotCache.data);
        else send(502, JSON.stringify({ success: false, message: 'hot feed unavailable' }));
      });
    return;
  }

  if (url.pathname === '/api/bing') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const idx = Math.floor(Math.random() * 8);
    fetchBingImage(idx)
      .then((data) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      })
      .catch((err) => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  let filePath = decodeURIComponent(url.pathname);
  if (filePath === '/') filePath = '/index.html';
  filePath = path.join(ROOT, filePath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('幸福海导航 running at http://localhost:' + PORT);
});
