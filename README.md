# LM Chat — Mobile Web UI for LM Studio

Access your local LLM from any phone or tablet on the same WiFi. No cloud, no third-party services, no setup wizard.

> Now you can enjoy your local LLM from bed. 😄
> 现在你可以在床上享受你的本地大模型了，哈哈。

![screenshot](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)
![node](https://img.shields.io/badge/node-18%2B-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **Mobile-first** — designed for phone screens, 44px+ touch targets
- **Multimodal** — send images to vision-capable models (Gemma, LLaVA, etc.)
- **Multi-session** — switch between conversations, history saved in browser
- **Model switcher** — automatically detects loaded models from LM Studio
- **One dependency** — only `express`, installs in seconds
- **Config file** — change password, temperature, token limit in `config.json`

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [LM Studio](https://lmstudio.ai) with a model loaded and Local Server enabled (port 1234)

### Run
```bash
# Windows — double click:
启动.bat

# macOS / Linux:
node server.js
```

Then open `http://localhost:8080` on your computer, or use the LAN address shown in the terminal on your phone.

### Phone Access
Connect your phone to the same WiFi, then open the LAN address displayed in the terminal (e.g., `http://192.168.1.5:8080`). On iOS Safari or Android Chrome, "Add to Home Screen" to use as an app.

## Configuration

Edit `config.json`:

```json
{
  "port": 8080,
  "passcode": "your-password-here",
  "lmstudio": {
    "host": "localhost",
    "port": 1234
  },
  "chat": {
    "systemPrompt": "You are a helpful assistant.",
    "temperature": 0.7,
    "maxTokens": 65536,
    "maxHistory": 20
  }
}
```

| Setting | Description |
|---------|-------------|
| `port` | Web server port |
| `passcode` | Login password (change it!) |
| `lmstudio.host` | LM Studio API address |
| `lmstudio.port` | LM Studio API port |
| `chat.temperature` | 0-2, higher = more random |
| `chat.maxTokens` | Max output length per reply |
| `chat.maxHistory` | Conversation turns to remember |

## How It Works

```
Phone (browser) ──WiFi──→ Node.js Server :8080 ──→ LM Studio :1234 ──→ Local LLM
```

The Node.js server proxies chat requests to LM Studio's OpenAI-compatible API. The web UI handles authentication, image upload, and session management entirely in the browser.

## Project Structure

```
├── 启动.bat          # Windows launcher
├── server.js         # Express backend
├── 聊天界面.html      # Chat UI (mobile-first)
├── 配置.json         # Configuration
├── 说明.md           # Chinese docs
├── package.json
└── LICENSE
```

## License

MIT
