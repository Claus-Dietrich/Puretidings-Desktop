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

#[tauri::command]
fn show_native_notification(title: String, message: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let safe_title = title.replace('\'', "''").replace('\"', "\\\"");
        let safe_msg = message.replace('\'', "''").replace('\"', "\\\"");
        let script = format!(
            "$Title = '{}'; $Message = '{}'; \
            try {{ \
                [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; \
                $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \
                $textNodes = $template.GetElementsByTagName('text'); \
                $textNodes.Item(0).AppendChild($template.CreateTextNode($Title)) | Out-Null; \
                $textNodes.Item(1).AppendChild($template.CreateTextNode($Message)) | Out-Null; \
                $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe'); \
                $toast = [Windows.UI.Notifications.ToastNotification]::new($template); \
                $notifier.Show($toast); \
            }} catch {{ \
                Add-Type -AssemblyName System.Windows.Forms; \
                $notify = New-Object System.Windows.Forms.NotifyIcon; \
                $notify.Icon = [System.Drawing.SystemIcons]::Information; \
                $notify.BalloonTipTitle = $Title; \
                $notify.BalloonTipText = $Message; \
                $notify.Visible = $True; \
                $notify.ShowBalloonTip(7000); \
                Start-Sleep -Seconds 2; \
                $notify.Dispose(); \
            }}",
            safe_title, safe_msg
        );
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("notify-send")
            .args([&title, &message])
            .spawn();
    }
    Ok(())
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
            show_native_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
