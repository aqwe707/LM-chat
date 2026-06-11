use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use actix_multipart::Multipart;
use flate2::write::DeflateEncoder;
use futures_util::StreamExt;
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

// ── Config ──
#[derive(Debug, Serialize, Deserialize, Clone)]
struct LmStudioConfig {
    host: String,
    port: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ChatConfig {
    #[serde(rename = "systemPrompt")]
    system_prompt: String,
    temperature: f64,
    #[serde(rename = "maxTokens")]
    max_tokens: u32,
    #[serde(rename = "maxHistory")]
    max_history: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Config {
    port: u16,
    passcode: String,
    lmstudio: LmStudioConfig,
    chat: ChatConfig,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            port: 8080,
            passcode: "123456".into(),
            lmstudio: LmStudioConfig { host: "localhost".into(), port: 1234 },
            chat: ChatConfig {
                system_prompt: "You are a helpful assistant. Respond concisely.".into(),
                temperature: 0.7,
                max_tokens: 65536,
                max_history: 20,
            },
        }
    }
}

// ── Session ──
struct Session {
    history: Vec<serde_json::Value>,
}

struct AppState {
    config: Config,
    sessions: Mutex<HashMap<String, Session>>,
}

fn load_config() -> Config {
    fs::read_to_string("config.json")
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| {
            let cfg = Config::default();
            let _ = fs::write("config.json", serde_json::to_string_pretty(&cfg).unwrap());
            cfg
        })
}

// ── PNG generator (pure Rust) ──
fn create_png(w: u32, h: u32, r: u8, g: u8, b: u8) -> Vec<u8> {
    let mut raw = Vec::with_capacity(((w * 3 + 1) * h) as usize);
    for _y in 0..h {
        raw.push(0); // filter
        for _x in 0..w { raw.push(r); raw.push(g); raw.push(b); }
    }
    let mut comp = Vec::new();
    {
        let mut enc = DeflateEncoder::new(&mut comp, flate2::Compression::best());
        enc.write_all(&raw).unwrap();
    }
    let mut result: Vec<u8> = vec![137, 80, 78, 71, 13, 10, 26, 10]; // PNG sig
    let crc32 = |buf: &[u8]| -> u32 { let mut c: u32 = 0xFFFFFFFF; for &b in buf { c ^= b as u32; for _ in 0..8 { c = (c >> 1) ^ (c & 1).wrapping_mul(0xEDB88320); } } !c };
    let chunk = |name: &[u8], data: &[u8]| -> Vec<u8> {
        let mut c = vec![];
        c.extend(&(data.len() as u32).to_be_bytes());
        c.extend(name);
        c.extend(data);
        let crc = crc32(&c[4..]).to_be_bytes();
        c.extend(&crc);
        c
    };
    let mut ihdr = vec![0u8; 13];
    ihdr[0..4].copy_from_slice(&w.to_be_bytes());
    ihdr[4..8].copy_from_slice(&h.to_be_bytes());
    ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
    result.extend(&chunk(b"IHDR", &ihdr));
    result.extend(&chunk(b"IDAT", &comp));
    result.extend(&chunk(b"IEND", &[]));
    result
}

// ── Chat API ──
async fn chat(
    state: web::Data<AppState>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let passcode = body.get("passcode").and_then(|v| v.as_str()).unwrap_or("");
    if passcode != state.config.passcode {
        return HttpResponse::Forbidden().json(serde_json::json!({"error": "wrong password"}));
    }

    let msg = body.get("message").and_then(|v| v.as_str()).unwrap_or("");
    let sid = body.get("sessionId").and_then(|v| v.as_str()).unwrap_or("default");
    let model = body.get("model").and_then(|v| v.as_str());
    let images = body.get("images").and_then(|v| v.as_array());
    let system_prompt = body.get("systemPrompt").and_then(|v| v.as_str()).unwrap_or(&state.config.chat.system_prompt);

    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.entry(sid.to_string()).or_insert_with(|| Session {
        history: vec![serde_json::json!({"role": "system", "content": system_prompt})],
    });

    // Build user content
    let user_content: serde_json::Value;
    if let Some(imgs) = images {
        if !imgs.is_empty() {
            let mut content: Vec<serde_json::Value> = vec![
                serde_json::json!({"type": "text", "text": if msg.is_empty() { "Describe this image" } else { msg }})
            ];
            for img in imgs {
                if let Some(url) = img.as_str() {
                    content.push(serde_json::json!({"type": "image_url", "image_url": {"url": url}}));
                }
            }
            user_content = serde_json::json!(content);
        } else if !msg.is_empty() {
            user_content = serde_json::Value::String(msg.to_string());
        } else {
            return HttpResponse::BadRequest().json(serde_json::json!({"error": "empty"}));
        }
    } else if !msg.is_empty() {
        user_content = serde_json::Value::String(msg.to_string());
    } else {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "empty"}));
    }

    session.history.push(serde_json::json!({"role": "user", "content": user_content}));
    if session.history.len() > state.config.chat.max_history + 1 {
        let sys = session.history[0].clone();
        let tail = session.history.split_off(session.history.len() - state.config.chat.max_history);
        session.history = vec![sys];
        session.history.extend(tail);
    }

    let mut req_body = serde_json::json!({
        "messages": session.history,
        "temperature": state.config.chat.temperature,
        "max_tokens": state.config.chat.max_tokens,
        "stream": false,
    });
    if let Some(m) = model { req_body["model"] = serde_json::Value::String(m.to_string()); }

    let client = awc::Client::default();
    let url = format!("http://{}:{}/v1/chat/completions", state.config.lmstudio.host, state.config.lmstudio.port);
    match client.post(&url)
        .insert_header(("Content-Type", "application/json"))
        .timeout(std::time::Duration::from_secs(120))
        .send_body(serde_json::to_string(&req_body).unwrap_or_default())
        .await {
        Ok(mut resp) => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let reply = body["choices"][0]["message"]["content"].as_str().unwrap_or("[parse error]").to_string();
            session.history.push(serde_json::json!({"role": "assistant", "content": reply}));
            // 保存到磁盘（图片只存标记，不存base64）
            let msgs: Vec<SavedMsg> = session.history.iter().filter_map(|m| {
                let role = m["role"].as_str().unwrap_or("").to_string();
                let content = if let Some(s) = m["content"].as_str() { s.to_string() }
                    else if m["content"].is_array() {
                        // 多模态消息：提取文本部分
                        let text = m["content"].as_array().unwrap().iter()
                            .find(|c| c["type"] == "text")
                            .and_then(|c| c["text"].as_str())
                            .unwrap_or("[图片]");
                        text.to_string()
                    } else { serde_json::to_string(&m["content"]).unwrap_or_default() };
                Some(SavedMsg { role, content, images: None })
            }).collect();
            let first_user = msgs.iter().find(|m| m.role == "user").map(|m| m.content.chars().take(20).collect::<String>()).unwrap_or_else(|| "新对话".to_string());
            let last_bot = msgs.iter().rev().find(|m| m.role == "assistant").map(|m| m.content.chars().take(30).collect::<String>()).unwrap_or_default();
            save_session(sid, &first_user, &last_bot, &msgs);
            HttpResponse::Ok().json(serde_json::json!({"reply": reply}))
        }
        Err(e) => HttpResponse::Ok().json(serde_json::json!({"reply": format!("[LM Studio error] {}", e)})),
    }
}

async fn verify(state: web::Data<AppState>, body: web::Json<serde_json::Value>) -> HttpResponse {
    let ok = body.get("passcode").and_then(|v| v.as_str()) == Some(&state.config.passcode);
    HttpResponse::Ok().json(serde_json::json!({"ok": ok}))
}

async fn models(state: web::Data<AppState>) -> HttpResponse {
    let client = awc::Client::default();
    let url = format!("http://{}:{}/v1/models", state.config.lmstudio.host, state.config.lmstudio.port);
    match client.get(&url).timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(mut resp) => {
            let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::json!({"data": []}));
            HttpResponse::Ok().json(body)
        }
        Err(_) => HttpResponse::Ok().json(serde_json::json!({"data": []})),
    }
}

async fn reset(state: web::Data<AppState>, body: web::Json<serde_json::Value>) -> HttpResponse {
    if body.get("passcode").and_then(|v| v.as_str()) != Some(&state.config.passcode) {
        return HttpResponse::Forbidden().json(serde_json::json!({"error": "wrong password"}));
    }
    let sid = body.get("sessionId").and_then(|v| v.as_str()).unwrap_or("default");
    state.sessions.lock().unwrap().remove(sid);
    HttpResponse::Ok().json(serde_json::json!({"ok": true}))
}

// ── File sharing ──
async fn share_page() -> HttpResponse {
    HttpResponse::Ok().content_type("text/html; charset=utf-8").body(include_str!("../share.html"))
}

async fn list_files() -> HttpResponse {
    let dir = PathBuf::from("共享文件");
    let _ = fs::create_dir_all(&dir);
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let meta = entry.metadata().unwrap();
            files.push(serde_json::json!({
                "name": entry.file_name().to_string_lossy(),
                "size": meta.len(),
                "time": meta.modified().map(|t| format!("{:?}", t)).unwrap_or_default(),
            }));
        }
    }
    HttpResponse::Ok().json(files)
}

async fn upload(mut payload: Multipart) -> HttpResponse {
    let dir = PathBuf::from("共享文件");
    let _ = fs::create_dir_all(&dir);
    let mut saved = Vec::new();
    while let Ok(Some(mut field)) = payload.try_next().await {
        let fname = field.content_disposition().and_then(|cd| cd.get_filename().map(|s| s.to_string())).unwrap_or_else(|| "file".to_string());
        let ext = std::path::Path::new(&fname).extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        let new_name = format!("{}{}", Uuid::new_v4(), ext);
        let path = dir.join(&new_name);
        let mut data = Vec::new();
        while let Some(Ok(bytes)) = field.next().await {
            data.extend_from_slice(&bytes);
        }
        fs::write(&path, &data).unwrap();
        saved.push(new_name);
    }
    HttpResponse::Ok().json(serde_json::json!({"ok": true, "files": saved}))
}

async fn download(req: HttpRequest) -> HttpResponse {
    let name = req.match_info().get("name").unwrap_or("");
    let path = PathBuf::from("共享文件").join(name);
    if path.exists() {
        let file = actix_files::NamedFile::open(path).unwrap();
        file.into_response(&req)
    } else {
        HttpResponse::NotFound().finish()
    }
}

async fn delete_file(req: HttpRequest) -> HttpResponse {
    let name = req.match_info().get("name").unwrap_or("");
    let path = PathBuf::from("共享文件").join(name);
    if path.exists() { let _ = fs::remove_file(&path); }
    HttpResponse::Ok().json(serde_json::json!({"ok": true}))
}

// ── 对话记录 API ──
async fn list_sessions_api() -> HttpResponse {
    HttpResponse::Ok().json(list_sessions())
}

async fn load_session_api(req: HttpRequest) -> HttpResponse {
    let sid = req.match_info().get("sid").unwrap_or("");
    match load_session(sid) {
        Some(s) => HttpResponse::Ok().json(s),
        None => HttpResponse::Ok().json(serde_json::json!({"id":"","messages":[]})),
    }
}

async fn delete_session_api(req: HttpRequest) -> HttpResponse {
    let sid = req.match_info().get("sid").unwrap_or("");
    delete_session_file(sid);
    HttpResponse::Ok().json(serde_json::json!({"ok": true}))
}

// ── Main page ──
async fn index() -> HttpResponse {
    HttpResponse::Ok().content_type("text/html; charset=utf-8").body(include_str!("../chat.html"))
}

// ── PWA ──
async fn icon() -> HttpResponse {
    let png = create_png(192, 192, 0, 113, 227);
    HttpResponse::Ok().content_type("image/png").body(png)
}

async fn manifest() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "name": "LM Chat", "short_name": "LM Chat",
        "start_url": "/", "display": "standalone",
        "background_color": "#f5f5f7", "theme_color": "#f5f5f7",
        "icons": [{"src": "/icon.png", "sizes": "192x192", "type": "image/png"}]
    }))
}

fn get_ips() -> (Vec<String>, Vec<String>) {
    let mut ipv4 = Vec::new();
    let mut ipv6 = Vec::new();
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in interfaces {
            match ip {
                std::net::IpAddr::V4(a) => {
                    let s = a.to_string();
                    if !a.is_loopback() && !s.starts_with("169.254.") { ipv4.push(s); }
                }
                std::net::IpAddr::V6(a) => {
                    let s = a.to_string();
                    if !s.starts_with("fe80") && (a.segments()[0] & 0xFE00 == 0x2000) {
                        ipv6.push(s);
                    }
                }
            }
        }
    }
    (ipv4, ipv6)
}

// ── 服务端对话存储 ──
const CONV_DIR: &str = "聊天记录";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SavedMsg { role: String, content: String, images: Option<Vec<String>> }

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SavedSession {
    id: String,
    name: String,
    preview: String,
    time: u64,
    messages: Vec<SavedMsg>,
}

fn save_session(sid: &str, name: &str, preview: &str, messages: &[SavedMsg]) {
    let _ = fs::create_dir_all(CONV_DIR);
    let session = SavedSession {
        id: sid.to_string(), name: name.to_string(), preview: preview.to_string(),
        time: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
        messages: messages.to_vec(),
    };
    let path = format!("{}/{}.json", CONV_DIR, sid);
    let _ = fs::write(&path, serde_json::to_string(&session).unwrap_or_default());
}

fn load_session(sid: &str) -> Option<SavedSession> {
    let path = format!("{}/{}.json", CONV_DIR, sid);
    fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok())
}

fn list_sessions() -> Vec<SavedSession> {
    let _ = fs::create_dir_all(CONV_DIR);
    let mut sessions: Vec<SavedSession> = Vec::new();
    if let Ok(entries) = fs::read_dir(CONV_DIR) {
        for entry in entries.flatten() {
            if entry.path().extension().map(|e| e == "json").unwrap_or(false) {
                if let Some(s) = fs::read_to_string(entry.path()).ok().and_then(|s| serde_json::from_str(&s).ok()) {
                    sessions.push(s);
                }
            }
        }
    }
    sessions.sort_by(|a, b| b.time.cmp(&a.time));
    sessions
}

fn delete_session_file(sid: &str) {
    let path = format!("{}/{}.json", CONV_DIR, sid);
    let _ = fs::remove_file(&path);
}

async fn check_lm_studio(host: &str, port: u16) -> bool {
    let client = awc::Client::default();
    let url = format!("http://{}:{}/v1/models", host, port);
    client.get(&url).timeout(std::time::Duration::from_secs(3)).send().await.is_ok()
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let config = load_config();
    // 确保必要文件夹存在
    let _ = fs::create_dir_all("共享文件");
    let state = web::Data::new(AppState {
        config: config.clone(),
        sessions: Mutex::new(HashMap::new()),
    });

    let (ipv4, ipv6) = get_ips();
    let lm_ok = check_lm_studio(&config.lmstudio.host, config.lmstudio.port).await;

    println!("========================================");
    println!("  LM Chat Server (Rust)");
    println!("========================================");
    println!();
    println!("  Local:    http://localhost:{}", config.port);
    if !ipv4.is_empty() { println!("  ── LAN (IPv4) ──"); for ip in &ipv4 { println!("  http://{}:{}", ip, config.port); } }
    if !ipv6.is_empty() { println!("  ── LAN (IPv6) ──"); for ip in &ipv6 { println!("  http://[{}]:{}", ip, config.port); } }
    println!("  ───────────────────");
    println!("  Password: {}", config.passcode);
    println!();
    println!("  LM Studio: {}:{}  {}", config.lmstudio.host, config.lmstudio.port,
        if lm_ok { "✓ 已连接" } else { "✗ 未连接！请启动 LM Studio" });
    println!("  IPv6 直连: {}", if !ipv6.is_empty() { "已启用 (需路由器放行入站)" } else { "未检测到公网 IPv6" });
    println!("  温度: {}  MaxTokens: {}", config.chat.temperature, config.chat.max_tokens);
    println!("  文件共享: ./共享文件/ (已就绪)");
    println!("  聊天记录: ./聊天记录/ (服务端存储)");
    println!();

    HttpServer::new(move || {
        let json_cfg = web::JsonConfig::default().limit(100 * 1024 * 1024); // 100MB
        App::new()
            .app_data(json_cfg)
            .app_data(state.clone())
            .route("/", web::get().to(index))
            .route("/share", web::get().to(share_page))
            .route("/api/chat", web::post().to(chat))
            .route("/api/verify", web::post().to(verify))
            .route("/api/models", web::get().to(models))
            .route("/api/reset", web::post().to(reset))
            .route("/api/files", web::get().to(list_files))
            .route("/api/upload", web::post().to(upload))
            .route("/api/download/{name}", web::get().to(download))
            .route("/api/files/{name}", web::delete().to(delete_file))
            .route("/api/sessions", web::get().to(list_sessions_api))
            .route("/api/sessions/{sid}", web::delete().to(delete_session_api))
            .route("/api/sessions/{sid}", web::get().to(load_session_api))
            .route("/icon.png", web::get().to(icon))
            .route("/manifest.json", web::get().to(manifest))
    })
    .bind(format!("0.0.0.0:{}", config.port))?
    .bind(format!("[::]:{}", config.port))?
    .run()
    .await
}
