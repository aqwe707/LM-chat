// LM Chat Proxy Server
// Serves modified chat.html and proxies API calls to lm-chat.exe
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PROXY_PORT = 8080;
const BACKEND_PORT = 8081;
const BACKEND_HOST = 'localhost';
const ROOT_DIR = __dirname;

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function getMime(ext) { return MIME[ext] || 'application/octet-stream'; }

// Try to read local config for password display
let passcode = '';
let configPort = 8081;
try {
  const cfg = fs.readFileSync(path.join(ROOT_DIR, 'config.json'), 'utf8');
  const pc = cfg.match(/"passcode"\s*:\s*"([^"]*)"/);
  if (pc) passcode = pc[1];
  const pt = cfg.match(/"port"\s*:\s*(\d+)/);
  if (pt) configPort = parseInt(pt[1]);
} catch(e) {}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API requests → proxy to lm-chat.exe
  if (pathname.startsWith('/api/')) {
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: pathname + (parsed.search || ''),
      method: req.method,
      headers: { ...req.headers, host: BACKEND_HOST + ':' + BACKEND_PORT },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Copy response headers
      const headers = { ...proxyRes.headers };
      headers['access-control-allow-origin'] = '*';
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Backend unavailable: ' + e.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // File requests
  let filePath = pathname === '/' ? 'chat.html' : pathname.slice(1);
  // Security: prevent directory traversal
  filePath = path.normalize(filePath).replace(/^(\.\.(\/|\\))+/, '');
  const fullPath = path.join(ROOT_DIR, filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // Try www/ subdirectory
      const wwwPath = path.join(ROOT_DIR, 'android-capacitor', 'www', filePath);
      fs.readFile(wwwPath, (err2, data2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
          return;
        }
        const ext = path.extname(wwwPath).toLowerCase();
        res.writeHead(200, { 'Content-Type': getMime(ext) });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': getMime(ext) });
    res.end(data);
  });
});

// Get local IPs for display
const os = require('os');
const ifaces = os.networkInterfaces();
const localIPs = [];
for (const name of Object.keys(ifaces)) {
  for (const iface of ifaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      localIPs.push(iface.address);
    }
  }
}

server.listen(PROXY_PORT, '::', () => {
  console.log('=====================================');
  console.log('     LM Chat - 局域网 AI 聊天');
  console.log('=====================================');
  console.log('');
  if (!passcode) {
    console.log('  密码状态: \x1b[33m未设置密码（无需密码即可访问）\x1b[0m');
  } else {
    console.log('  密码状态: \x1b[32m已设置密码\x1b[0m');
    console.log('  访问密码: \x1b[32m' + passcode + '\x1b[0m');
  }
  console.log('');
  console.log('  访问地址:');
  console.log('  本机:   \x1b[33mhttp://localhost:' + PROXY_PORT + '\x1b[0m');
  for (const ip of localIPs) {
    console.log('  局域网: \x1b[33mhttp://' + ip + ':' + PROXY_PORT + '\x1b[0m');
  }
  console.log('');
  console.log('  手机访问: 在手机浏览器打开上面的局域网地址');
  console.log('  密码为空则直接点解锁即可进入');
  console.log('');
  console.log('  按 Ctrl+C 停止服务器');
  console.log('=====================================');
});