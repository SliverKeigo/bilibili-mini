use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter,
};
// use tauri_plugin_positioner::{Position, WindowExt}; // Disable plugin positioning
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use reqwest::header::{USER_AGENT, REFERER};

const BILI_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[tauri::command]
async fn fetch_bili_video_info(bvid: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.bilibili.com/x/web-interface/view?bvid={}", bvid);
    
    let res = client.get(&url)
        .header(USER_AGENT, BILI_USER_AGENT)
        .header(REFERER, format!("https://www.bilibili.com/video/{}", bvid))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn fetch_bili_play_url(bvid: String, cid: u64) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    // qn=16 (64k), fnval=16 (dash)
    let url = format!("https://api.bilibili.com/x/player/playurl?bvid={}&cid={}&qn=16&fnval=16&fnver=0", bvid, cid);
    
    let res = client.get(&url)
        .header(USER_AGENT, BILI_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn fetch_bili_search(keyword: String, page: u64) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword={}&page={}", urlencoding::encode(&keyword), page);
    
    let res = client.get(&url)
        .header(USER_AGENT, BILI_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

// Proxy the audio stream content to bypass Referer check in frontend
#[tauri::command]
async fn fetch_audio_stream(url: String) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    
    let res = client.get(&url)
        .header(USER_AGENT, BILI_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

// Proxy image to bypass Referer check
#[tauri::command]
async fn fetch_image(url: String) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    
    let res = client.get(&url)
        .header(USER_AGENT, BILI_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            fetch_bili_video_info,
            fetch_bili_play_url,
            fetch_bili_search,
            fetch_audio_stream,
            fetch_image
        ])
        .setup(|app| {
            // Register global shortcuts
            let app_handle = app.handle().clone();
            
            // Cmd+Shift+Space: Play/Pause
            if let Ok(shortcut) = "CommandOrControl+Shift+Space".parse::<Shortcut>() {
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle.emit("global-shortcut", "play-pause");
                });
            }
            
            // Cmd+Shift+Right: Next
            if let Ok(shortcut) = "CommandOrControl+Shift+Right".parse::<Shortcut>() {
                let app_handle_next = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle_next.emit("global-shortcut", "next");
                });
            }
            
            // Cmd+Shift+Left: Previous
            if let Ok(shortcut) = "CommandOrControl+Shift+Left".parse::<Shortcut>() {
                let app_handle_prev = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = app_handle_prev.emit("global-shortcut", "prev");
                });
            }
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::with_id("tray")
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            // FORCE RESET: Always move to position and show, regardless of current state
                            if let Some(monitor) = window.current_monitor().unwrap() {
                                let screen_size = monitor.size();
                                let window_size = window.outer_size().unwrap();
                                
                                let x = screen_size.width as i32 - window_size.width as i32 - 120;
                                let y = 32;
                                
                                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                            }
                            
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.set_always_on_top(true);
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
