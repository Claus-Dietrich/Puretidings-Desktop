// PureTidings Desktop & Mobile Application Library
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, CACHE_CONTROL, ACCEPT, ACCEPT_LANGUAGE};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

mod satellite_server;
use satellite_server::{update_satellite_state, register_deep_link_protocol, get_satellite_status};

#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PureTidingsDesktop/1.0"),
    );
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"),
    );
    headers.insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_static("en-US,en;q=0.9,de;q=0.8"),
    );

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    let status = res.status();
    if !status.is_success() {
        return Err(format!("HTTP Error {}", status));
    }

    let body = res.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;
    Ok(body)
}

#[tauri::command]
async fn post_url(url: String, body: String, user_agent: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(ua) = user_agent {
        if let Ok(val) = HeaderValue::from_str(&ua) {
            req = req.header(USER_AGENT, val);
        }
    }

    let res = req
        .body(body)
        .send()
        .await
        .map_err(|e| format!("POST request failed: {}", e))?;

    let status = res.status();
    let text = res.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;
    if !status.is_success() {
        return Err(format!("HTTP Error {}: {}", status, text));
    }

    Ok(text)
}

#[tauri::command]
fn open_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if let Err(err) = app.opener().open_url(&url, None::<&str>) {
        #[cfg(target_os = "windows")]
        {
            let escaped_url = url.replace('^', "^^").replace('&', "^&");
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", &escaped_url])
                .spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("xdg-open")
                .arg(&url)
                .spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open")
                .arg(&url)
                .spawn();
        }
        #[cfg(target_os = "android")]
        {
            return Err(format!("Failed to open URL on Android: {}", err));
        }
        #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos", target_os = "android")))]
        {
            return Err(err.to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn write_file_text(path: String, contents: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
        }
    }
    std::fs::write(p, contents).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn save_download_file(app: tauri::AppHandle, filename: String, contents: String) -> Result<String, String> {
    use tauri::Manager;
    use std::path::PathBuf;

    let mut candidate_dirs: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "android")]
    {
        // 1. Standard Android public Download directory
        candidate_dirs.push(PathBuf::from("/storage/emulated/0/Download"));
        candidate_dirs.push(PathBuf::from("/sdcard/Download"));
        // 2. PureTidings subfolder inside Download
        candidate_dirs.push(PathBuf::from("/storage/emulated/0/Download/PureTidings"));
        // 3. Public Documents directory
        candidate_dirs.push(PathBuf::from("/storage/emulated/0/Documents"));
        // 4. App-specific external storage directories (accessible by user via file managers)
        candidate_dirs.push(PathBuf::from("/storage/emulated/0/Android/data/com.puretidings.desktop/files/Download"));
        candidate_dirs.push(PathBuf::from("/storage/emulated/0/Android/data/com.puretidings.desktop/files/Documents"));
    }

    if let Ok(dir) = app.path().download_dir() {
        candidate_dirs.push(dir);
    }
    if let Ok(dir) = app.path().document_dir() {
        candidate_dirs.push(dir);
    }
    if let Ok(dir) = app.path().app_data_dir() {
        candidate_dirs.push(dir);
    }

    let mut last_err = String::new();
    for dir in candidate_dirs {
        if !dir.exists() {
            let _ = std::fs::create_dir_all(&dir);
        }
        let target_file = dir.join(&filename);
        match std::fs::write(&target_file, &contents) {
            Ok(_) => return Ok(target_file.to_string_lossy().to_string()),
            Err(e) => {
                last_err = format!("Path {:?}: {}", target_file, e);
            }
        }
    }

    Err(format!("Could not save file to disk. Last error: {}", last_err))
}

#[tauri::command]
fn pick_folder(default_path: Option<String>) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let default_line = if let Some(def) = default_path {
            let clean = def.trim().trim_matches('"').trim_matches('\'').replace('\'', "''");
            format!(
                "if (Test-Path -Path '{0}' -PathType Container) {{ $f.SelectedPath = '{0}'; }} elseif (Test-Path -Path (Split-Path '{0}')) {{ $f.SelectedPath = Split-Path '{0}'; }}",
                clean
            )
        } else {
            String::new()
        };
        let script = format!(
            "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; \
             $f = New-Object System.Windows.Forms.FolderBrowserDialog; \
             $f.Description = 'PureTidings - Select Backup Folder'; \
             $f.ShowNewFolderButton = $true; \
             {} \
             if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ \
                 Write-Output $f.SelectedPath \
             }}",
            default_line
        );
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let output = cmd.output()
            .map_err(|e| format!("Failed to run folder picker: {}", e))?;

        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = default_path;
        let output = std::process::Command::new("zenity")
            .args(["--file-selection", "--directory", "--title=Select Backup Folder"])
            .output();
        if let Ok(out) = output {
            let res = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !res.is_empty() {
                return Ok(Some(res));
            }
        }
        Ok(None)
    }
    #[cfg(target_os = "macos")]
    {
        let default_clause = if let Some(ref def) = default_path {
            let clean = def.trim().replace('"', "\\\"");
            format!("default location POSIX file \"{}\"", clean)
        } else {
            String::new()
        };
        let script = format!(
            "try\nset f to choose folder with prompt \"PureTidings - Select Backup Folder\" {}\nPOSIX path of f\non error\n\"\"\nend try",
            default_clause
        );
        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to run macOS folder picker: {}", e))?;
        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = default_path;
        Ok(None)
    }
}

#[tauri::command]
fn pick_file(default_path: Option<String>, filter_name: Option<String>, filter_ext: Option<String>) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let initial_dir_line = if let Some(ref def) = default_path {
            let clean = def.trim().trim_matches('"').trim_matches('\'').replace('\'', "''");
            format!(
                "if (Test-Path -Path '{0}' -PathType Container) {{ $f.InitialDirectory = '{0}'; }} elseif (Test-Path -Path (Split-Path '{0}')) {{ $f.InitialDirectory = Split-Path '{0}'; }}",
                clean
            )
        } else {
            String::new()
        };
        let fname = filter_name.unwrap_or_else(|| "Backup Files".to_string()).replace('\'', "''");
        let fext = filter_ext.unwrap_or_else(|| "*.*".to_string()).replace('\'', "''");
        let filter_line = format!("$f.Filter = '{0} ({1})|{1}|All Files (*.*)|*.*';", fname, fext);

        let script = format!(
            "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; \
             $f = New-Object System.Windows.Forms.OpenFileDialog; \
             $f.Title = 'PureTidings - Select Backup File'; \
             $f.RestoreDirectory = $true; \
             $f.CheckFileExists = $true; \
             {} \
             {} \
             if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ \
                 Write-Output $f.FileName \
             }}",
            initial_dir_line, filter_line
        );
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let output = cmd.output()
            .map_err(|e| format!("Failed to run file picker: {}", e))?;

        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = (&filter_name, &filter_ext);
        let mut cmd = std::process::Command::new("zenity");
        cmd.args(["--file-selection", "--title=Select Backup File"]);
        if let Some(ref def) = default_path {
            cmd.arg(format!("--filename={}/", def.trim_end_matches('/')));
        }
        let output = cmd.output();
        if let Ok(out) = output {
            let res = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !res.is_empty() {
                return Ok(Some(res));
            }
        }
        Ok(None)
    }
    #[cfg(target_os = "macos")]
    {
        let _ = (&filter_name, &filter_ext);
        let default_clause = if let Some(ref def) = default_path {
            let clean = def.trim().replace('"', "\\\"");
            format!("default location POSIX file \"{}\"", clean)
        } else {
            String::new()
        };
        let script = format!(
            "try\nset f to choose file with prompt \"PureTidings - Select Backup File\" {}\nPOSIX path of f\non error\n\"\"\nend try",
            default_clause
        );
        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to run macOS file picker: {}", e))?;
        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = (default_path, filter_name, filter_ext);
        Ok(None)
    }
}

const APP_ICON_PNG: &[u8] = include_bytes!("../icons/128x128.png");
#[allow(dead_code)]
const APP_ICON_ICO: &[u8] = include_bytes!("../icons/icon.ico");

#[allow(dead_code)]
fn to_base64(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        result.push(CHARSET[(b0 >> 2) as usize] as char);
        result.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARSET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARSET[(b2 & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[tauri::command]
fn show_native_notification(app: tauri::AppHandle, title: String, message: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    #[cfg(target_os = "android")]
    {
        let notif_id = (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() % 1_000_000_000) as i32;

        let builder = app.notification()
            .builder()
            .id(notif_id)
            .channel_id("puretidings_articles")
            .title(&title)
            .body(&message)
            .auto_cancel();

        if let Err(e) = builder.show() {
            eprintln!("[PureTidings] Android notification error with channel puretidings_articles: {:?}", e);
            let _ = app.notification()
                .builder()
                .id(notif_id)
                .title(&title)
                .body(&message)
                .auto_cancel()
                .show();
        }
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app.notification()
            .builder()
            .title(&title)
            .body(&message)
            .show();
    }

    #[cfg(target_os = "windows")]
    {
        let temp_dir = std::env::temp_dir();
        let icon_png_path = temp_dir.join("puretidings-icon.png");
        let icon_ico_path = temp_dir.join("puretidings-icon.ico");
        let _ = std::fs::write(&icon_png_path, APP_ICON_PNG);
        let _ = std::fs::write(&icon_ico_path, APP_ICON_ICO);

        let b64_title = to_base64(title.as_bytes());
        let b64_msg = to_base64(message.as_bytes());
        let icon_png_str = icon_png_path.to_string_lossy().replace('\'', "''");
        let icon_ico_str = icon_ico_path.to_string_lossy().replace('\'', "''");

        let script = format!(
            "$Title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{0}')); \
            $Message = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{1}')); \
            $IconPath = '{2}'; $IconIcoPath = '{3}'; \
            try {{ \
                [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; \
                $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText02); \
                $imageNodes = $template.GetElementsByTagName('image'); \
                if ($imageNodes.Length -gt 0 -and (Test-Path $IconPath)) {{ \
                    $imageNodes.Item(0).SetAttribute('src', $IconPath); \
                }} \
                $textNodes = $template.GetElementsByTagName('text'); \
                $textNodes.Item(0).AppendChild($template.CreateTextNode($Title)) | Out-Null; \
                $textNodes.Item(1).AppendChild($template.CreateTextNode($Message)) | Out-Null; \
                $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe'); \
                $toast = [Windows.UI.Notifications.ToastNotification]::new($template); \
                $notifier.Show($toast); \
            }} catch {{ \
                Add-Type -AssemblyName System.Windows.Forms; \
                $notify = New-Object System.Windows.Forms.NotifyIcon; \
                if (Test-Path $IconIcoPath) {{ \
                    $notify.Icon = New-Object System.Drawing.Icon($IconIcoPath); \
                }} else {{ \
                    $notify.Icon = [System.Drawing.SystemIcons]::Information; \
                }} \
                $notify.BalloonTipTitle = $Title; \
                $notify.BalloonTipText = $Message; \
                $notify.Visible = $True; \
                $notify.ShowBalloonTip(7000); \
                Start-Sleep -Seconds 2; \
                $notify.Dispose(); \
            }}",
            b64_title, b64_msg, icon_png_str, icon_ico_str
        );
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let temp_dir = std::env::temp_dir();
        let icon_png_path = temp_dir.join("puretidings-icon.png");
        let _ = std::fs::write(&icon_png_path, APP_ICON_PNG);
        let _ = std::process::Command::new("notify-send")
            .args(["--icon", icon_png_path.to_string_lossy().as_ref(), &title, &message])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let clean_title = title.replace('\\', "\\\\").replace('"', "\\\"");
        let clean_msg = message.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            "display notification \"{}\" with title \"{}\"",
            clean_msg, clean_title
        );
        let _ = std::process::Command::new("osascript")
            .args(["-e", &script])
            .spawn();
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = (&title, &message);
    }
    Ok(())
}

#[tauri::command]
fn get_autostart() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("reg");
        cmd.args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "PureTidings"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let output = cmd.output();
        if let Ok(out) = output {
            return Ok(out.status.success());
        }
        Ok(false)
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let desktop_file = std::path::PathBuf::from(home).join(".config/autostart/com.puretidings.desktop.desktop");
        Ok(desktop_file.exists())
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let plist_file = std::path::PathBuf::from(home).join("Library/LaunchAgents/com.puretidings.desktop.plist");
        Ok(plist_file.exists())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn set_autostart(enable: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_str = exe_path.to_string_lossy();
        if enable {
            let mut cmd = std::process::Command::new("reg");
            cmd.args([
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "PureTidings",
                "/t",
                "REG_SZ",
                "/d",
                &format!("\"{}\"", exe_str),
                "/f",
            ]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            let cmd_res = cmd.output().map_err(|e| e.to_string())?;
            if !cmd_res.status.success() {
                return Err(String::from_utf8_lossy(&cmd_res.stderr).to_string());
            }
        } else {
            let mut cmd = std::process::Command::new("reg");
            cmd.args([
                "delete",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "PureTidings",
                "/f",
            ]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            let _ = cmd.output();
        }
        return Ok(enable);
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let autostart_dir = std::path::PathBuf::from(home).join(".config/autostart");
        let desktop_file = autostart_dir.join("com.puretidings.desktop.desktop");
        if enable {
            let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
            let _ = std::fs::create_dir_all(&autostart_dir);
            let content = format!(
                "[Desktop Entry]\nType=Application\nName=PureTidings\nExec=\"{}\"\nTerminal=false\nCategories=Office;News;\n",
                exe_path.to_string_lossy()
            );
            std::fs::write(&desktop_file, content).map_err(|e| e.to_string())?;
        } else if desktop_file.exists() {
            let _ = std::fs::remove_file(desktop_file);
        }
        return Ok(enable);
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let launch_agents = std::path::PathBuf::from(home).join("Library/LaunchAgents");
        let plist_file = launch_agents.join("com.puretidings.desktop.plist");
        if enable {
            let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
            let _ = std::fs::create_dir_all(&launch_agents);
            let content = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.puretidings.desktop</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>"#,
                exe_path.to_string_lossy()
            );
            std::fs::write(&plist_file, content).map_err(|e| e.to_string())?;
        } else if plist_file.exists() {
            let _ = std::fs::remove_file(plist_file);
        }
        return Ok(enable);
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = enable;
        Ok(false)
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ImapEmailItem {
    pub uid: u32,
    pub subject: String,
    pub from: String,
    pub date: String,
    pub snippet: String,
    pub content_html: String,
    pub content_text: String,
    pub is_unread: bool,
}

#[tauri::command]
async fn test_imap_connection(
    server: String,
    port: u16,
    username: String,
    password: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let domain = server.trim();
        let tls = native_tls::TlsConnector::builder()
            .build()
            .map_err(|e| format!("TLS Error: {}", e))?;
        let client = imap::connect((domain, port), domain, &tls)
            .map_err(|e| format!("IMAP Connection error: {}", e))?;
        let mut session = client
            .login(&username, &password)
            .map_err(|e| format!("IMAP Login failed: {}", e.0))?;
        let _ = session.logout();
        Ok(format!("Successfully connected to {} as {}", domain, username))
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn list_imap_folders(
    server: String,
    port: u16,
    username: String,
    password: String,
) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let domain = server.trim();
        let tls = native_tls::TlsConnector::builder()
            .build()
            .map_err(|e| format!("TLS Error: {}", e))?;
        let client = imap::connect((domain, port), domain, &tls)
            .map_err(|e| format!("IMAP Connection error: {}", e))?;
        let mut session = client
            .login(&username, &password)
            .map_err(|e| format!("IMAP Login failed: {}", e.0))?;
        let mut mailboxes = session.list(Some(""), Some("*"));
        if mailboxes.is_err() {
            mailboxes = session.list(None, Some("*"));
        }
        if mailboxes.is_err() {
            mailboxes = session.list(Some(""), Some("%"));
        }
        let mailboxes = mailboxes.map_err(|e| format!("Failed to list folders: {}", e))?;
        let mut folder_names = Vec::new();
        for mb in mailboxes.iter() {
            folder_names.push(mb.name().to_string());
        }
        if !folder_names.iter().any(|f| f.eq_ignore_ascii_case("INBOX")) {
            folder_names.insert(0, "INBOX".to_string());
        }
        let _ = session.logout();
        Ok(folder_names)
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn fetch_imap_emails(
    server: String,
    port: u16,
    username: String,
    password: String,
    folder: String,
    limit: u32,
) -> Result<Vec<ImapEmailItem>, String> {
    tokio::task::spawn_blocking(move || {
        let domain = server.trim();
        let tls = native_tls::TlsConnector::builder()
            .build()
            .map_err(|e| format!("TLS Error: {}", e))?;
        let client = imap::connect((domain, port), domain, &tls)
            .map_err(|e| format!("IMAP Connection error: {}", e))?;
        let mut session = client
            .login(&username, &password)
            .map_err(|e| format!("IMAP Login failed: {}", e.0))?;

        let target_folder = if folder.trim().is_empty() { "INBOX" } else { folder.trim() };
        let mailbox = session
            .select(target_folder)
            .map_err(|e| format!("Failed to select folder '{}': {}", target_folder, e))?;

        let total_messages = mailbox.exists;
        if total_messages == 0 {
            let _ = session.logout();
            return Ok(Vec::new());
        }

        let max_fetch = if limit == 0 { 30 } else { limit };
        let start_seq = if total_messages > max_fetch {
            total_messages - max_fetch + 1
        } else {
            1
        };
        let range = format!("{}:{}", start_seq, total_messages);

        let mut messages = session.fetch(&range, "(UID FLAGS BODY.PEEK[])");
        if messages.is_err() {
            messages = session.fetch(&range, "(UID FLAGS BODY[])");
        }
        if messages.is_err() {
            messages = session.fetch(&range, "(UID FLAGS RFC822)");
        }
        let messages = messages.map_err(|e| format!("Failed to fetch messages: {}", e))?;

        let mut items = Vec::new();

        for msg in messages.iter().rev() {
            let uid = msg.uid.unwrap_or(msg.message);
            let flags = msg.flags();
            let is_unread = !flags.iter().any(|f| matches!(f, imap::types::Flag::Seen));

            let body_bytes_opt = msg.body().or_else(|| msg.text()).or_else(|| msg.header());
            if let Some(body_bytes) = body_bytes_opt {
                if let Some(parsed) = mail_parser::MessageParser::default().parse(body_bytes) {
                    let subject = parsed.subject().unwrap_or("(No Subject)").to_string();
                    let from_str = if let Some(addr) = parsed.from().and_then(|a| a.first()) {
                        let name = addr.name.as_deref().unwrap_or("");
                        let email = addr.address.as_deref().unwrap_or("");
                        if !name.is_empty() && !email.is_empty() {
                            format!("{} <{}>", name, email)
                        } else if !email.is_empty() {
                            email.to_string()
                        } else {
                            name.to_string()
                        }
                    } else {
                        "Unknown Sender".to_string()
                    };

                    let date_str = parsed.date().map(|d| d.to_rfc3339()).unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
                    let content_html = parsed.body_html(0).map(|c| c.to_string()).unwrap_or_default();
                    let content_text = parsed.body_text(0).map(|c| c.to_string()).unwrap_or_default();

                    let snippet = parsed.body_preview(280).map(|s| s.to_string()).unwrap_or_else(|| {
                        let raw = if !content_text.is_empty() {
                            content_text.replace('\n', " ")
                        } else {
                            content_html.replace("<[^>]+>", " ")
                        };
                        let s = raw.split_whitespace().collect::<Vec<_>>().join(" ");
                        if s.chars().count() > 280 {
                            let end = s.char_indices().map(|(i, _)| i).nth(280).unwrap_or(s.len());
                            format!("{}...", &s[..end])
                        } else {
                            s
                        }
                    });

                    items.push(ImapEmailItem {
                        uid,
                        subject,
                        from: from_str,
                        date: date_str,
                        snippet,
                        content_html,
                        content_text,
                        is_unread,
                    });
                } else {
                    let raw = String::from_utf8_lossy(body_bytes);
                    let snippet = raw.chars().take(280).collect::<String>();
                    items.push(ImapEmailItem {
                        uid,
                        subject: format!("Email #{}", uid),
                        from: "Email".to_string(),
                        date: chrono::Utc::now().to_rfc3339(),
                        snippet,
                        content_html: String::new(),
                        content_text: raw.into_owned(),
                        is_unread,
                    });
                }
            } else {
                items.push(ImapEmailItem {
                    uid,
                    subject: format!("Email #{}", uid),
                    from: "Email".to_string(),
                    date: chrono::Utc::now().to_rfc3339(),
                    snippet: String::new(),
                    content_html: String::new(),
                    content_text: String::new(),
                    is_unread,
                });
            }
        }

        let _ = session.logout();
        Ok(items)
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn mark_imap_email_read(
    server: String,
    port: u16,
    username: String,
    password: String,
    folder: String,
    uid: u32,
    read: bool,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let domain = server.trim();
        let tls = native_tls::TlsConnector::builder()
            .build()
            .map_err(|e| format!("TLS Error: {}", e))?;
        let client = imap::connect((domain, port), domain, &tls)
            .map_err(|e| format!("IMAP Connection error: {}", e))?;
        let mut session = client
            .login(&username, &password)
            .map_err(|e| format!("IMAP Login failed: {}", e.0))?;

        let target_folder = if folder.trim().is_empty() { "INBOX" } else { folder.trim() };
        session
            .select(target_folder)
            .map_err(|e| format!("Failed to select folder '{}': {}", target_folder, e))?;

        let flag_action = if read { "+FLAGS (\\Seen)" } else { "-FLAGS (\\Seen)" };
        session
            .uid_store(format!("{}", uid), flag_action)
            .map_err(|e| format!("Failed to update flags: {}", e))?;

        let _ = session.logout();
        Ok(())
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

// WebDAV & Nextcloud Cloud Sync Commands
fn get_candidate_endpoints(base_url: &str, username: &str) -> Vec<String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return vec![];
    }
    let full = if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        format!("https://{}", trimmed)
    } else {
        trimmed.to_string()
    };

    let lower = full.to_lowercase();

    // Strip browser web UI paths such as /apps/files/files/268577 or /index.php/...
    let clean_base = if let Some(idx) = lower.find("/apps/") {
        full[..idx].trim_end_matches('/').to_string()
    } else if let Some(idx) = lower.find("/index.php") {
        full[..idx].trim_end_matches('/').to_string()
    } else {
        full.clone()
    };

    let clean_lower = clean_base.to_lowercase();
    let u = username.trim();

    // Extract origin (scheme + host + optional port)
    let origin = if let Ok(parsed) = reqwest::Url::parse(&clean_base) {
        let port_part = parsed.port().map(|p| format!(":{}", p)).unwrap_or_default();
        format!("{}://{}{}", parsed.scheme(), parsed.host_str().unwrap_or_default(), port_part)
    } else {
        clean_base.clone()
    };

    let mut candidates = Vec::new();

    // 1. If user explicitly provided a WebDAV endpoint, prioritize it (normalized with trailing slash)
    if clean_lower.contains("/remote.php/dav/files") || clean_lower.contains("/remote.php/webdav") || clean_lower.ends_with("/webdav") {
        if clean_lower.ends_with("/remote.php/dav/files") && !u.is_empty() {
            candidates.push(format!("{}/{}/", clean_base, u));
        } else if clean_lower.ends_with("/remote.php/dav/files/username") && !u.is_empty() && u.to_lowercase() != "username" {
            let prefix = &clean_base[..clean_base.len() - 8];
            candidates.push(format!("{}{}/", prefix, u));
        } else {
            let with_slash = if clean_base.ends_with('/') { clean_base.clone() } else { format!("{}/", clean_base) };
            candidates.push(with_slash);
        }
    }

    // 2. SabreDAV endpoint with URL-encoded username (required for email logins like user@domain.com)
    if !u.is_empty() {
        if u.contains('@') {
            let encoded_u = u.replace('@', "%40");
            candidates.push(format!("{}/remote.php/dav/files/{}/", origin, encoded_u));
        }
        candidates.push(format!("{}/remote.php/dav/files/{}/", origin, u));
    }

    // 3. Universal Nextcloud WebDAV endpoint (maps to user root via Basic Auth)
    candidates.push(format!("{}/remote.php/webdav/", origin));

    // 4. Generic WebDAV endpoints
    candidates.push(format!("{}/webdav/", origin));
    candidates.push(format!("{}/", origin));

    // Deduplicate while preserving priority order
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::new();
    for c in candidates {
        if !seen.contains(&c) {
            seen.insert(c.clone());
            deduped.push(c);
        }
    }
    deduped
}

static ENDPOINT_CACHE: std::sync::Mutex<Option<std::collections::HashMap<String, String>>> = std::sync::Mutex::new(None);

fn get_cached_endpoint(key: &str) -> Option<String> {
    if let Ok(guard) = ENDPOINT_CACHE.lock() {
        if let Some(map) = guard.as_ref() {
            return map.get(key).cloned();
        }
    }
    None
}

fn set_cached_endpoint(key: String, val: String) {
    if let Ok(mut guard) = ENDPOINT_CACHE.lock() {
        if guard.is_none() {
            *guard = Some(std::collections::HashMap::new());
        }
        if let Some(map) = guard.as_mut() {
            map.insert(key, val);
        }
    }
}

const WEBDAV_USER_AGENT: &str = "PureTidings/1.0 (Windows NT 10.0; Win64; x64)";

fn encode_webdav_path(path: &str) -> String {
    let trimmed = path.trim_start_matches('/');
    trimmed
        .split('/')
        .map(|segment| {
            if segment.contains('%') {
                return segment.to_string();
            }
            let mut encoded = String::new();
            for b in segment.bytes() {
                match b {
                    b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                        encoded.push(b as char);
                    }
                    _ => {
                        encoded.push_str(&format!("%{:02X}", b));
                    }
                }
            }
            encoded
        })
        .collect::<Vec<String>>()
        .join("/")
}

async fn ensure_parent_collection(
    client: &reqwest::Client,
    endpoint: &str,
    remote_path: &str,
    username: &str,
    password: &str,
) {
    let trimmed = remote_path.trim_matches('/');
    if let Some(idx) = trimmed.rfind('/') {
        let parent_path = &trimmed[..idx];
        let segments: Vec<&str> = parent_path.split('/').filter(|s| !s.is_empty()).collect();
        let mut curr = endpoint.trim_end_matches('/').to_string();
        for seg in segments {
            let encoded_seg = encode_webdav_path(seg);
            curr = format!("{}/{}", curr, encoded_seg);
            let mkcol_method = reqwest::Method::from_bytes(b"MKCOL").unwrap_or(reqwest::Method::POST);
            let _ = client
                .request(mkcol_method, format!("{}/", curr))
                .basic_auth(username, Some(password))
                .header(USER_AGENT, WEBDAV_USER_AGENT)
                .send()
                .await;
        }
    }
}

async fn find_working_endpoint(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    password: &str,
) -> Result<String, String> {
    let cache_key = format!("{}|{}", base_url.trim(), username.trim());
    if let Some(cached) = get_cached_endpoint(&cache_key) {
        return Ok(cached);
    }

    if base_url.contains("/remote.php/dav/files/") || base_url.contains("/remote.php/webdav") {
        let direct = base_url.trim().trim_end_matches('/').to_string();
        set_cached_endpoint(cache_key, direct.clone());
        return Ok(direct);
    }

    let candidates = get_candidate_endpoints(base_url, username);
    if candidates.is_empty() {
        return Err("WebDAV server URL is empty.".to_string());
    }

    let origin = if let Ok(parsed) = reqwest::Url::parse(base_url.trim()) {
        let port_part = parsed.port().map(|p| format!(":{}", p)).unwrap_or_default();
        format!("{}://{}{}", parsed.scheme(), parsed.host_str().unwrap_or_default(), port_part)
    } else {
        base_url.trim().trim_end_matches('/').to_string()
    };

    let propfind_method = reqwest::Method::from_bytes(b"PROPFIND").unwrap_or(reqwest::Method::GET);

    let mut auth_error = None;
    let mut last_status = None;

    for candidate in &candidates {
        let req = client
            .request(propfind_method.clone(), candidate)
            .basic_auth(username, Some(password))
            .header("Depth", "0")
            .header(USER_AGENT, WEBDAV_USER_AGENT);

        match req.send().await {
            Ok(res) => {
                let status = res.status();
                let is_html = res.headers()
                    .get("content-type")
                    .and_then(|ct| ct.to_str().ok())
                    .map(|ct| ct.contains("text/html"))
                    .unwrap_or(false);

                if status.as_u16() == 429 {
                    return Err("Nextcloud Brute Force Protection active (HTTP 429 TooManyRequests). Please ask your Nextcloud admin to reset the brute-force counter for your IP in Nextcloud (or wait a few minutes).".to_string());
                }

                if (status.is_success() || status.as_u16() == 207 || status.as_u16() == 200 || status.as_u16() == 204) && !is_html {
                    set_cached_endpoint(cache_key, candidate.clone());
                    return Ok(candidate.clone());
                } else if status.as_u16() == 401 || status.as_u16() == 403 {
                    auth_error = Some(format!(
                        "Authentication failed (HTTP {}). Please check your username and password (or App Password if 2FA is active).",
                        status
                    ));
                } else if status.is_redirection() {
                    if let Some(loc) = res.headers().get(reqwest::header::LOCATION).and_then(|l| l.to_str().ok()) {
                        let full_loc = if loc.starts_with("http://") || loc.starts_with("https://") {
                            loc.to_string()
                        } else if loc.starts_with('/') {
                            format!("{}{}", origin, loc)
                        } else {
                            format!("{}/{}", candidate.trim_end_matches('/'), loc)
                        };
                        if full_loc.contains("/remote.php/dav/files/") || full_loc.contains("/remote.php/webdav/") {
                            set_cached_endpoint(cache_key, full_loc.clone());
                            return Ok(full_loc);
                        }
                    }
                    last_status = Some(status);
                } else {
                    last_status = Some(status);
                }
            }
            Err(_) => {
                last_status = None;
            }
        }
    }

    if let Some(err) = auth_error {
        return Err(err);
    }

    if let Some(st) = last_status {
        Err(format!(
            "Could not connect to Nextcloud / WebDAV endpoint (HTTP {}). Please verify the server URL.",
            st
        ))
    } else {
        Err("Could not find a valid Nextcloud / WebDAV endpoint.".to_string())
    }
}

#[tauri::command]
async fn webdav_test_connection(url: String, username: String, password: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP Client Error: {}", e))?;

    let working_endpoint = find_working_endpoint(&client, &url, &username, &password).await?;
    Ok(working_endpoint)
}

#[tauri::command]
async fn webdav_get_sync_file(url: String, username: String, password: String, remote_path: String) -> Result<Option<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP Client Error: {}", e))?;

    let endpoint = find_working_endpoint(&client, &url, &username, &password).await?;
    let trimmed_endpoint = endpoint.trim_end_matches('/');
    let encoded_path = encode_webdav_path(&remote_path);
    let full_url = format!("{}/{}", trimmed_endpoint, encoded_path);

    let res = client
        .get(&full_url)
        .basic_auth(&username, Some(&password))
        .header(CACHE_CONTROL, "no-store")
        .header(USER_AGENT, WEBDAV_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to WebDAV: {}", e))?;

    let status = res.status();
    if status.as_u16() == 429 {
        return Err("Nextcloud Brute Force Protection active (HTTP 429 TooManyRequests). Please ask your admin to reset the brute-force counter for your IP in Nextcloud.".to_string());
    }
    if status.as_u16() == 404 {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(format!("HTTP Error {} when reading sync file from {}", status, full_url));
    }

    let body = res.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;
    if body.trim().starts_with("<html") || body.trim().starts_with("<!DOCTYPE") {
        if body.contains("Just a moment") || body.contains("cloudflare") {
            return Err("Cloudflare WAF intercepted the connection. Please add a Cloudflare WAF Skip Rule for /remote.php/*.".to_string());
        }
        return Err("Server returned HTML instead of sync JSON file.".to_string());
    }

    Ok(Some(body))
}

#[tauri::command]
async fn webdav_put_sync_file(url: String, username: String, password: String, remote_path: String, content: String) -> Result<bool, String> {
    // Disable automatic redirect following so reqwest doesn't drop the PUT method and body on 301/302 redirects
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| format!("HTTP Client Error: {}", e))?;

    let endpoint = find_working_endpoint(&client, &url, &username, &password).await?;
    let trimmed_endpoint = endpoint.trim_end_matches('/');
    let encoded_path = encode_webdav_path(&remote_path);
    let full_url = format!("{}/{}", trimmed_endpoint, encoded_path);

    // Proactively ensure parent folder(s) exist via MKCOL before uploading
    ensure_parent_collection(&client, trimmed_endpoint, &remote_path, &username, &password).await;

    let mut current_url = full_url;
    let mut last_error = String::new();
    let mut tried_mkcol = false;

    for _ in 0..5 {
        let res = client
            .put(&current_url)
            .basic_auth(&username, Some(&password))
            .header("Content-Type", "application/json; charset=utf-8")
            .header(USER_AGENT, WEBDAV_USER_AGENT)
            .body(content.clone())
            .send()
            .await
            .map_err(|e| format!("Failed to upload to WebDAV: {}", e))?;

        let status = res.status();
        if status.as_u16() == 429 {
            return Err("Nextcloud Brute Force Protection active (HTTP 429 TooManyRequests). Please ask your admin to reset the brute-force counter for your IP in Nextcloud.".to_string());
        }

        let is_html = res.headers()
            .get("content-type")
            .and_then(|ct| ct.to_str().ok())
            .map(|ct| ct.contains("text/html"))
            .unwrap_or(false);

        if is_html {
            let body_preview = res.text().await.unwrap_or_default();
            if body_preview.contains("Just a moment") || body_preview.contains("cloudflare") || body_preview.contains("cf-browser-verification") {
                return Err("Cloudflare WAF / Bot Protection intercepted the upload. Please add a Cloudflare WAF Skip Rule for /remote.php/*.".to_string());
            }
            return Err(format!("Server returned an HTML page (HTTP {}): {}", status, body_preview.chars().take(200).collect::<String>()));
        }

        if status.is_redirection() {
            if let Some(loc) = res.headers().get(reqwest::header::LOCATION).and_then(|l| l.to_str().ok()) {
                current_url = if loc.starts_with("http://") || loc.starts_with("https://") {
                    loc.to_string()
                } else if loc.starts_with('/') {
                    let origin = if let Ok(parsed) = reqwest::Url::parse(&current_url) {
                        format!("{}://{}", parsed.scheme(), parsed.host_str().unwrap_or_default())
                    } else {
                        trimmed_endpoint.to_string()
                    };
                    format!("{}{}", origin, loc)
                } else {
                    format!("{}/{}", trimmed_endpoint, loc)
                };
                continue;
            }
        }

        // If parent directory does not exist (404 Not Found or 409 Conflict), create parent collection(s) and retry
        if (status.as_u16() == 404 || status.as_u16() == 409) && !tried_mkcol {
            tried_mkcol = true;
            ensure_parent_collection(&client, trimmed_endpoint, &remote_path, &username, &password).await;
            continue;
        }

        if status.is_success() || status.as_u16() == 200 || status.as_u16() == 201 || status.as_u16() == 204 {
            return Ok(true);
        } else {
            let err_text = res.text().await.unwrap_or_default();
            let clean_err = format!("HTTP Error {}: {}", status, err_text.chars().take(200).collect::<String>());
            last_error = clean_err;
            break;
        }
    }

    if !last_error.is_empty() {
        Err(last_error)
    } else {
        Err("Failed to upload file to WebDAV: too many redirects.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(not(target_os = "android"))]
            {
                satellite_server::start_satellite_server(app.handle().clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_url,
            post_url,
            open_browser,
            read_file_text,
            write_file_text,
            save_download_file,
            pick_folder,
            pick_file,
            show_native_notification,
            get_autostart,
            set_autostart,
            test_imap_connection,
            list_imap_folders,
            fetch_imap_emails,
            mark_imap_email_read,
            webdav_test_connection,
            webdav_get_sync_file,
            webdav_put_sync_file,
            update_satellite_state,
            register_deep_link_protocol,
            get_satellite_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
