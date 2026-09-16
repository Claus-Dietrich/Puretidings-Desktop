// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, CACHE_CONTROL, ACCEPT, ACCEPT_LANGUAGE};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
fn open_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let escaped_url = url.replace('^', "^^").replace('&', "^&");
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &escaped_url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
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
    #[cfg(not(target_os = "windows"))]
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
    #[cfg(not(target_os = "windows"))]
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
fn show_native_notification(title: String, message: String) -> Result<(), String> {
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
    Ok(())
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
        let mailboxes = session
            .list(Some(""), Some("*"))
            .or_else(|_| session.list(None, Some("*")))
            .or_else(|_| session.list(Some(""), Some("%")))
            .map_err(|e| format!("Failed to list folders: {}", e))?;
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

        let messages = session
            .fetch(&range, "(UID FLAGS BODY.PEEK[])")
            .or_else(|_| session.fetch(&range, "(UID FLAGS BODY[])"))
            .or_else(|_| session.fetch(&range, "(UID FLAGS RFC822)"))
            .map_err(|e| format!("Failed to fetch messages: {}", e))?;

        let mut items = Vec::new();

        for msg in messages.iter().rev() {
            let uid = msg.uid.unwrap_or(msg.message);
            let flags = msg.flags();
            let is_unread = !flags.iter().any(|f| matches!(f, imap::types::Flag::Seen));

            let body_bytes_opt = msg.body().or_else(|| msg.text());
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fetch_url,
            post_url,
            open_browser,
            read_file_text,
            write_file_text,
            pick_folder,
            pick_file,
            show_native_notification,
            test_imap_connection,
            list_imap_folders,
            fetch_imap_emails,
            mark_imap_email_read
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
