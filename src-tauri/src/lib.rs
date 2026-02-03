use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter,
};
use tauri_plugin_positioner::{Position, WindowExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
                            // Temporarily disable auto-positioning to fix crash
                            // let _ = window.as_ref().window().move_window(Position::TopRight);
                            
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
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
