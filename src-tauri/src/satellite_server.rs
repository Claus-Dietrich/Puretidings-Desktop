// PureTidings Desktop - Satellite Extension Local Server & Bridge

#[cfg(not(target_os = "android"))]
mod desktop_impl {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::RwLock;
    use std::thread;
    use tauri::{AppHandle, Manager, Emitter};
    use tiny_http::{Server, Response, Header, Method, StatusCode};
    use serde_json::Value;

    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;

    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    static SATELLITE_STATE_DATA: RwLock<Option<String>> = RwLock::new(None);
    static SATELLITE_TOTAL_UNREAD: AtomicUsize = AtomicUsize::new(0);

    #[tauri::command]
    pub fn update_satellite_state(state_json: String, total_unread: usize) -> Result<(), String> {
        SATELLITE_TOTAL_UNREAD.store(total_unread, Ordering::Relaxed);
        if let Ok(mut lock) = SATELLITE_STATE_DATA.write() {
            *lock = Some(state_json);
        }
        Ok(())
    }

    #[tauri::command]
    pub fn register_deep_link_protocol() -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get current executable path: {}", e))?;
            let cmd = format!("\"{}\" \"%1\"", exe_path.to_string_lossy());

            let _ = std::process::Command::new("reg")
                .args(["add", "HKCU\\Software\\Classes\\puretidings", "/ve", "/d", "URL:PureTidings Protocol", "/f"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            let _ = std::process::Command::new("reg")
                .args(["add", "HKCU\\Software\\Classes\\puretidings", "/v", "URL Protocol", "/d", "", "/f"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            let _ = std::process::Command::new("reg")
                .args(["add", "HKCU\\Software\\Classes\\puretidings\\shell\\open\\command", "/ve", "/d", &cmd, "/f"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        Ok(())
    }

    #[tauri::command]
    pub fn get_satellite_status() -> Result<Value, String> {
        let unread = SATELLITE_TOTAL_UNREAD.load(Ordering::Relaxed);
        Ok(serde_json::json!({
            "running": true,
            "port": 41789,
            "totalUnread": unread
        }))
    }

    #[tauri::command]
    pub fn prepare_satellite_extension(app: AppHandle) -> Result<String, String> {
        let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir());
        let target_dir = app_data_dir.join("satellite-extension");
        let _ = std::fs::create_dir_all(&target_dir);

        // Find candidate source directory
        let mut candidates = Vec::new();
        if let Ok(res_dir) = app.path().resource_dir() {
            candidates.push(res_dir.join("satellite-extension"));
        }
        candidates.push(std::path::PathBuf::from("satellite-extension"));
        candidates.push(std::path::PathBuf::from("../satellite-extension"));
        candidates.push(std::path::PathBuf::from("../puretidings-extension-satellite"));
        candidates.push(std::path::PathBuf::from("../../puretidings-extension-satellite"));
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("satellite-extension"));
            candidates.push(cwd.join("../puretidings-extension-satellite"));
        }

        let mut found_src = None;
        for c in candidates {
            if c.exists() && c.join("manifest.json").exists() {
                found_src = Some(c);
                break;
            }
        }

        if let Some(src) = found_src {
            // Copy files from src to target_dir
            if let Ok(entries) = std::fs::read_dir(&src) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(fname) = path.file_name() {
                            let dest = target_dir.join(fname);
                            let _ = std::fs::copy(&path, &dest);
                        }
                    }
                }
            }
        }

        // Open target folder in OS file manager (Explorer on Windows, Finder on macOS, xdg-open on Linux)
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("explorer")
                .arg(&target_dir)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open")
                .arg(&target_dir)
                .spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("xdg-open")
                .arg(&target_dir)
                .spawn();
        }

        Ok(target_dir.to_string_lossy().to_string())
    }

    #[tauri::command]
    pub fn open_browser_extensions_page() -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            // Silently launch Chrome directly without triggering the Windows store prompt
            let _ = std::process::Command::new("cmd")
                .args(["/c", "start", "chrome", "chrome://extensions"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open")
                .args(["-a", "Google Chrome", "chrome://extensions"])
                .spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("google-chrome")
                .arg("chrome://extensions")
                .spawn();
        }
        Ok(())
    }

    fn build_cors_headers() -> Vec<Header> {
        vec![
            Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type, Authorization, x-satellite-token"[..]).unwrap(),
            Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap(),
        ]
    }

    fn focus_desktop_window(app: &AppHandle) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }

    pub fn start_satellite_server(app: AppHandle) {
        thread::spawn(move || {
            let server = match Server::http("127.0.0.1:41789") {
                Ok(s) => {
                    println!("[PureTidings Satellite Server] Listening on http://127.0.0.1:41789");
                    s
                }
                Err(e) => {
                    eprintln!("[PureTidings Satellite Server] Failed to bind to 127.0.0.1:41789: {}", e);
                    return;
                }
            };

            for mut request in server.incoming_requests() {
                let url_path = request.url().to_string();
                let method = request.method().clone();

                // Handle CORS Preflight
                if method == Method::Options {
                    let mut resp = Response::empty(StatusCode(200));
                    for h in build_cors_headers() {
                        resp.add_header(h);
                    }
                    let _ = request.respond(resp);
                    continue;
                }

                let path = url_path.split('?').next().unwrap_or(&url_path);

                match (method, path) {
                    (Method::Get, "/api/status") => {
                        let unread = SATELLITE_TOTAL_UNREAD.load(Ordering::Relaxed);
                        let body = serde_json::json!({
                            "ok": true,
                            "version": env!("CARGO_PKG_VERSION"),
                            "totalUnread": unread,
                            "appRunning": true
                        }).to_string();

                        let mut resp = Response::from_string(body);
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }

                    (Method::Get, "/api/data") => {
                        let data_str = {
                            if let Ok(lock) = SATELLITE_STATE_DATA.read() {
                                lock.clone()
                            } else {
                                None
                            }
                        };

                        let body = data_str.unwrap_or_else(|| {
                            serde_json::json!({
                                "feedTree": [],
                                "allPosts": {},
                                "unreadCounts": {},
                                "readLinks": [],
                                "favoritedLinks": [],
                                "rules": [],
                                "darkMode": true
                            }).to_string()
                        });

                        let mut resp = Response::from_string(body);
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }

                    (Method::Post, "/api/mark-read") => {
                        let mut body_str = String::new();
                        let _ = request.as_reader().read_to_string(&mut body_str);

                        let _ = app.emit("satellite_mark_read", body_str.clone());

                        let unread = SATELLITE_TOTAL_UNREAD.load(Ordering::Relaxed);
                        let resp_body = serde_json::json!({
                            "success": true,
                            "totalUnread": unread
                        }).to_string();

                        let mut resp = Response::from_string(resp_body);
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }

                    (Method::Post, "/api/open-article") => {
                        let mut body_str = String::new();
                        let _ = request.as_reader().read_to_string(&mut body_str);

                        focus_desktop_window(&app);
                        let _ = app.emit("satellite_open_article", body_str);

                        let mut resp = Response::from_string(serde_json::json!({ "success": true }).to_string());
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }

                    (Method::Post, "/api/open-feed") => {
                        let mut body_str = String::new();
                        let _ = request.as_reader().read_to_string(&mut body_str);

                        focus_desktop_window(&app);
                        let _ = app.emit("satellite_open_feed", body_str);

                        let mut resp = Response::from_string(serde_json::json!({ "success": true }).to_string());
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }

                    (Method::Post, "/api/refresh") => {
                        let mut body_str = String::new();
                        let _ = request.as_reader().read_to_string(&mut body_str);

                        let _ = app.emit("satellite_refresh", body_str);

                        let unread = SATELLITE_TOTAL_UNREAD.load(Ordering::Relaxed);
                        let resp_body = serde_json::json!({
                            "success": true,
                            "totalUnread": unread
                        }).to_string();

                        let mut resp = Response::from_string(resp_body);
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }

                    (Method::Post, "/api/add-feed") => {
                        let mut body_str = String::new();
                        let _ = request.as_reader().read_to_string(&mut body_str);

                        let _ = app.emit("satellite_add_feed", body_str);

                        let mut resp = Response::from_string(serde_json::json!({ "success": true }).to_string());
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }

                    (Method::Post, "/api/open-settings") => {
                        focus_desktop_window(&app);
                        let _ = app.emit("satellite_open_settings", ());

                        let mut resp = Response::from_string(serde_json::json!({ "success": true }).to_string());
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }

                    _ => {
                        let mut resp = Response::from_string(serde_json::json!({ "error": "Not Found" }).to_string());
                        resp = resp.with_status_code(StatusCode(404));
                        for h in build_cors_headers() {
                            resp.add_header(h);
                        }
                        let _ = request.respond(resp);
                    }
                }
            }
        });
    }
}

#[cfg(not(target_os = "android"))]
pub use desktop_impl::*;

#[cfg(target_os = "android")]
use serde_json::Value;

#[cfg(target_os = "android")]
#[tauri::command]
pub fn update_satellite_state(_state_json: String, _total_unread: usize) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn register_deep_link_protocol() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn get_satellite_status() -> Result<Value, String> {
    Ok(serde_json::json!({
        "running": false,
        "port": 41789,
        "totalUnread": 0,
        "android": true
    }))
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn prepare_satellite_extension(_app: tauri::AppHandle) -> Result<String, String> {
    Ok(String::new())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn open_browser_extensions_page() -> Result<(), String> {
    Ok(())
}
