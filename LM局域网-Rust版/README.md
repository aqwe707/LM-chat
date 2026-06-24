# LM Chat - 局域网 AI 聊天服务

基于 Rust 开发的本地局域网 AI 聊天服务，通过 Web 界面与本地 LM Studio 模型交互。

## 功能特性

- **多会话管理** — 支持创建、切换、删除多个对话会话
- **图片 + 文本混合发送** — 支持上传图片，与模型进行多模态对话
- **自定义系统提示词** — 每个会话可独立设置 System Prompt
- **局域网文件共享** — 上传、下载、删除文件，方便团队成员共享资源
- **移动端适配** — 响应式设计，手机/平板可直接访问使用
- **密码保护** — 访问服务需要输入密码

## 快速开始

### 1. 前置条件

- 安装 [LM Studio](https://lmstudio.ai/) 并确保其在 localhost:1234 上运行
- 确保本地防火墙允许 8080 端口入站连接

### 2. 配置

编辑 config.json：

`json
{
  "port": 8080,
  "passcode": "your-password-here",
  "lmstudio": {
    "host": "localhost",
    "port": 1234
  },
  "chat": {
    "systemPrompt": "你是一个有用的AI助手，请用中文回答。回答简洁准确。",
    "temperature": 0.7,
    "maxTokens": 65536,
    "maxHistory": 20
  }
}
`

### 3. 启动服务

双击运行 lm-chat.exe，终端会显示局域网访问地址：

`
Local:    http://localhost:8080
LAN:      http://192.168.x.x:8080
Password: your-password
`

### 4. 访问

在手机或电脑浏览器中打开显示的地址，输入密码即可开始聊天。

### 5. 关闭服务

双击运行 关闭.bat 即可停止服务。

## 文件说明

| 文件 | 说明 |
|------|------|
| lm-chat.exe | Rust 编译的服务端程序 |
| config.json | 配置文件（端口、密码、模型参数） |
| chat.html | 聊天前端页面 |
| share.html | 文件共享页面 |
| 共享文件/ | 文件共享目录 |
| 聊天记录/ | 对话记录（服务端 JSON 存储） |
| 关闭.bat | 停止服务脚本 |

## 使用提示

1. **LM Studio 必须提前启动** — 服务启动时会尝试连接 LM Studio，如果未连接会在终端显示警告
2. **局域网访问** — 同一 WiFi 下的设备可以通过显示的局域网 IP 访问
3. **图片大小** — 建议单张图片不超过 5MB，过大的图片会显著增加响应时间
4. **历史记录** — 每个会话最多保留 20 条历史消息，超出会自动截断

## 技术栈

- **后端**: Rust（编译为单个可执行文件）
- **前端**: 原生 HTML + CSS + JavaScript（无框架依赖）
- **AI 后端**: LM Studio（OpenAI 兼容 API）

## 已知问题

- 需要 LM Studio 先于本服务启动
- 不支持 HTTPS（局域网使用建议注意网络安全）

## License

个人项目，仅供学习研究使用。