# LM Chat Android APK

将 LM Chat 打包为 Android 应用的构建目录。

## 前置条件

1. **JDK 17+** — [下载 Adoptium](https://adoptium.net/)
2. **Android SDK** — 通过 Android Studio 安装，或设置 `ANDROID_HOME`
3. **Node.js 18+** — [下载 Node.js](https://nodejs.org/)
4. **npm** — 随 Node.js 一起安装

## 一键构建（Windows）

```powershell
cd D:\Desktop\codec\LM局域网-Rust版\android-capacitor
.\build-apk.ps1
```

## 手动构建步骤

```powershell
# 1. 进入项目目录
cd D:\Desktop\codec\LM局域网-Rust版\android-capacitor

# 2. 安装依赖
npm install

# 3. 同步 Web 资源到 Android
npx cap sync android

# 4. 构建 APK
cd android
.\gradlew.bat assembleDebug

# 5. APK 位置
# android\app\build\outputs\apk\debug\app-debug.apk
```

## 安装到手机

```powershell
# 通过 USB 调试安装
adb install android\app\build\outputs\apk\debug\app-debug.apk

# 或直接传输 APK 文件到手机安装
```

## 使用方式

1. 在电脑上启动 `lm-chat.exe`
2. 查看终端显示的局域网 IP（如 `192.168.1.100:8080`）
3. 手机上打开 LM Chat App
4. 输入电脑的 IP 地址，点击连接
5. 开始聊天！

## 项目结构

```
android-capacitor/
├── www/                    # Web 前端资源
│   ├── index.html          # 连接入口页
│   ├── share.html          # 文件共享页
│   ├── manifest.json       # PWA manifest
│   ├── icon-192.png        # 192x192 图标
│   └── icon-512.png        # 512x512 图标
├── android/                # Android 原生项目
│   ├── app/
│   │   └── src/main/
│   │       ├── java/com/lmchat/app/MainActivity.java
│   │       ├── AndroidManifest.xml
│   │       └── res/
│   ├── build.gradle
│   ├── gradle/wrapper/
│   └── gradlew.bat
├── capacitor.config.json   # Capacitor 配置
├── package.json
├── build-apk.ps1           # 一键构建脚本
└── README.md
```

## 注意事项

- 手机和电脑必须在**同一局域网**下
- 确保电脑防火墙允许 8080 端口入站
- 首次连接需要在手机 App 中输入服务器的 IP 地址
- `config.json` 中的 `passcode` 字段需在电脑端设置后，在 App 中输入密码