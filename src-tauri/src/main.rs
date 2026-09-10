// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, CACHE_CONTROL};
use std::time::Duration;

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
    if !status.is_success() {
        return Err(format!("HTTP Error {}", status));
    }

    let text = res.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;
    Ok(text)
}

#[tauri::command]
fn open_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_url, post_url, open_browser])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
