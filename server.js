/**
 * LM Chat Server — 将 LM Studio 本地 API 暴露为网页聊天
 * 
 * 使用:  node server.js
 * 配置:  config.json
 */

const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');

// 读配置
let config;
try { config = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'config.json'), 'utf8')); }
catch { config = { port: 8080, passcode: '123456', lmstudio: { host: 'localhost', port: 1234 }, chat: { systemPrompt: '你是一个有用的AI助手。', temperature: 0.7, maxTokens: 4096, maxHistory: 20 } }; }

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

// ── API: 聊天 ──
app.post('/api/chat', (req, res) => {
  const { message, images, sessionId, passcode: pw, model } = req.body;
  if (pw !== passcode) return res.status(403).json({ error: '密码错误' });

  const history = getHistory(sessionId);
  let userContent;
  if (images && images.length) {
    userContent = [{ type: 'text', text: message || '描述这张图片' }];
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
      } catch (e) { res.json({ reply: '[解析错误]' }); }
    });
  });
  apiReq.on('error', e => res.json({ reply: `[LM Studio 错误] ${e.message}` }));
  apiReq.on('timeout', () => { apiReq.destroy(); res.json({ reply: '[超时]' }); });
  apiReq.write(payload); apiReq.end();
});

// ── API: 验证密码 ──
app.post('/api/verify', (req, res) => {
  res.json({ ok: req.body.passcode === passcode });
});

// ── API: 模型列表 ──
app.get('/api/models', (req, res) => {
  http.get({ hostname: lmstudio.host, port: lmstudio.port, path: '/v1/models', timeout: 5000 }, (apiRes) => {
    let data = ''; apiRes.on('data', c => data += c);
    apiRes.on('end', () => { try { res.json(JSON.parse(data)); } catch { res.json({ data: [] }); } });
  }).on('error', () => res.json({ data: [] }));
});

// ── API: 重置对话 ──
app.post('/api/reset', (req, res) => {
  if (req.body.passcode !== passcode) return res.status(403).json({ error: '密码错误' });
  sessions.delete(req.body.sessionId);
  res.json({ ok: true });
});

// ── PWA 图标 (纯 JS 生成 PNG) ──
function createPNG(w, h, r, g, b) {
  const { deflateSync } = require('zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const c = deflateSync(raw);
  const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0); } return (c ^ 0xFFFFFFFF) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const cd = Buffer.concat([Buffer.from(t, 'ascii'), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(cd), 0); return Buffer.concat([l, Buffer.from(t, 'ascii'), d, cr]); };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', (() => { const b = Buffer.alloc(13); b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = 2; return b; })()), ch('IDAT', c), ch('IEND', Buffer.alloc(0))]);
}

app.get('/icon.png', (req, res) => { res.type('png'); res.send(createPNG(192, 192, 0, 113, 227)); });
app.get('/manifest.json', (req, res) => { res.json({ name: 'LM Chat', short_name: 'LM Chat', start_url: '/', display: 'standalone', background_color: '#f5f5f7', theme_color: '#f5f5f7', icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }] }); });

// ── 聊天页面 ──
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'chat.html')); });

// ── 启动 ──
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
  console.log('╔══════════════════════════════════╗');
  console.log('║        LM Chat Server           ║');
  console.log('╚══════════════════════════════════╝');
  console.log('');
  console.log('  本地:    http://localhost:' + port);
  if (ips.ipv4.length) ips.ipv4.forEach(ip => console.log('  局域网:  http://' + ip + ':' + port));
  console.log('  密码:    ' + passcode);
  console.log('');
  console.log('  LM Studio: ' + lmstudio.host + ':' + lmstudio.port);
  console.log('  温度: ' + chat.temperature + '  最大Token: ' + chat.maxTokens);
  console.log('');
});
