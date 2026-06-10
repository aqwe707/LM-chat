/**
 * LM Chat Server - Mobile Web UI for LM Studio
 *
 * Usage:  node server.js
 * Config: config.json
 */

const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');

// Read config
let config;
try { config = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'config.json'), 'utf8')); }
catch { config = { port: 8080, passcode: '123456', lmstudio: { host: 'localhost', port: 1234 }, chat: { systemPrompt: 'You are a helpful assistant.', temperature: 0.7, maxTokens: 65536, maxHistory: 20 } }; }

const { port, passcode, lmstudio, chat } = config;

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const sessions = new Map();

function getHistory(sid) {
  if (!sessions.has(sid)) sessions.set(sid, [{ role: 'system', content: chat.systemPrompt }]);
  return sessions.get(sid);
}

// API: Chat
app.post('/api/chat', (req, res) => {
  const { message, images, sessionId, passcode: pw, model } = req.body;
  if (pw !== passcode) return res.status(403).json({ error: 'wrong password' });

  const history = getHistory(sessionId);
  let userContent;
  if (images && images.length) {
    userContent = [{ type: 'text', text: message || 'Describe this image' }];
    images.forEach(img => userContent.push({ type: 'image_url', image_url: { url: img } }));
  } else if (message) {
    userContent = message;
  } else {
    return res.status(400).json({ error: 'empty' });
  }

  history.push({ role: 'user', content: userContent });
  if (history.length > chat.maxHistory + 1) {
    const sys = history[0];
    sessions.set(sessionId, [sys, ...history.slice(-chat.maxHistory)]);
  }

  const reqBody = { messages: sessions.get(sessionId), temperature: chat.temperature, max_tokens: chat.maxTokens, stream: false };
  if (model) reqBody.model = model;
  const payload = JSON.stringify(reqBody);

  const apiReq = http.request({
    hostname: lmstudio.host, port: lmstudio.port, path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    timeout: 120000,
  }, (apiRes) => {
    let data = ''; apiRes.on('data', c => data += c);
    apiRes.on('end', () => {
      try {
        const reply = JSON.parse(data).choices[0].message.content;
        history.push({ role: 'assistant', content: reply });
        res.json({ reply });
      } catch (e) { res.json({ reply: '[parse error]' }); }
    });
  });
  apiReq.on('error', e => res.json({ reply: `[LM Studio error] ${e.message}` }));
  apiReq.on('timeout', () => { apiReq.destroy(); res.json({ reply: '[timeout]' }); });
  apiReq.write(payload); apiReq.end();
});

// API: Verify password
app.post('/api/verify', (req, res) => {
  res.json({ ok: req.body.passcode === passcode });
});

// API: Model list
app.get('/api/models', (req, res) => {
  http.get({ hostname: lmstudio.host, port: lmstudio.port, path: '/v1/models', timeout: 5000 }, (apiRes) => {
    let data = ''; apiRes.on('data', c => data += c);
    apiRes.on('end', () => { try { res.json(JSON.parse(data)); } catch { res.json({ data: [] }); } });
  }).on('error', () => res.json({ data: [] }));
});

// API: Reset conversation
app.post('/api/reset', (req, res) => {
  if (req.body.passcode !== passcode) return res.status(403).json({ error: 'wrong password' });
  sessions.delete(req.body.sessionId);
  res.json({ ok: true });
});

// PWA icon (pure JS PNG generator)
function createPNG(w, h, r, g, b) {
  const { deflateSync } = require('zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  }
  const compressed = deflateSync(raw);
  const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0); } return (c ^ 0xFFFFFFFF) >>> 0; };
  const ch = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const cd = Buffer.concat([Buffer.from(type, 'ascii'), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(cd), 0); return Buffer.concat([l, Buffer.from(type, 'ascii'), data, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ihdr), ch('IDAT', compressed), ch('IEND', Buffer.alloc(0))]);
}

app.get('/icon.png', (req, res) => { res.type('png'); res.send(createPNG(192, 192, 0, 113, 227)); });
app.get('/manifest.json', (req, res) => { res.json({ name: 'LM Chat', short_name: 'LM Chat', start_url: '/', display: 'standalone', background_color: '#f5f5f7', theme_color: '#f5f5f7', icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }] }); });

// ── 文件共享 ──
const multer = require('multer');
const fs = require('fs');
const shareDir = path.join(__dirname, '共享文件');
if (!fs.existsSync(shareDir)) fs.mkdirSync(shareDir, { recursive: true });
const upload = multer({ dest: shareDir, limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

app.get('/share', (req, res) => { res.sendFile(path.join(__dirname, 'share.html')); });

app.get('/api/files', (req, res) => {
  const files = fs.readdirSync(shareDir).map(name => { const s = fs.statSync(path.join(shareDir, name)); return { name, size: s.size, time: s.mtime }; });
  res.json(files);
});

app.post('/api/upload', upload.array('files', 10), (req, res) => {
  const saved = (req.files || []).map(f => { const ext = path.extname(f.originalname); const newName = f.filename + ext; fs.renameSync(f.path, path.join(shareDir, newName)); return newName; });
  res.json({ ok: true, files: saved });
});

app.get('/api/download/:name', (req, res) => {
  const filePath = path.join(shareDir, req.params.name);
  if (fs.existsSync(filePath)) res.download(filePath);
  else res.status(404).end();
});

app.delete('/api/files/:name', (req, res) => {
  const filePath = path.join(shareDir, req.params.name);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ ok: true }); }
  else res.status(404).json({ ok: false });
});

// Chat page
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'chat.html')); });

// Startup
function getIPs() {
  const nets = os.networkInterfaces();
  const result = { ipv4: [], ipv6: [] };
  for (const name of Object.keys(nets)) {
    for (const addr of nets[name]) {
      if (addr.internal) continue;
      if (addr.family === 'IPv4') result.ipv4.push(addr.address);
      if (addr.family === 'IPv6' && !addr.address.startsWith('fe80')) result.ipv6.push(addr.address);
    }
  }
  return result;
}

app.listen(port, () => {
  const ips = getIPs();
  console.log('========================================');
  console.log('  LM Chat Server');
  console.log('========================================');
  console.log('');
  console.log('  Local:    http://localhost:' + port);
  if (ips.ipv4.length) ips.ipv4.forEach(ip => console.log('  LAN:      http://' + ip + ':' + port));
  console.log('  Password: ' + passcode);
  console.log('');
  console.log('  LM Studio: ' + lmstudio.host + ':' + lmstudio.port);
  console.log('  Temp: ' + chat.temperature + '  MaxTokens: ' + chat.maxTokens);
  console.log('');
});
