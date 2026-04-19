mod usage;

use std::time::Duration;
use tauri::{Emitter, Manager};

#[tauri::command]
fn get_usage(range: String) -> usage::Usage {
    usage::compute_usage(&range)
}

#[tauri::command]
fn set_theme(window: tauri::Window, theme: String) {
    let theme = match theme.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        _ => None,
    };
    let _ = window.set_theme(theme);
}

fn spawn_file_watcher(app_handle: tauri::AppHandle) {
    let Some(home) = dirs::home_dir() else { return };
    let projects_dir = home.join(".claude").join("projects");
    if !projects_dir.exists() {
        return;
    }

    std::thread::spawn(move || {
        use notify::{RecursiveMode, Watcher};
        use notify_debouncer_full::new_debouncer;

        let (tx, rx) = std::sync::mpsc::channel();
        let mut debouncer = match new_debouncer(Duration::from_millis(500), None, tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("file watcher init failed: {e}");
                return;
            }
        };
        if let Err(e) = debouncer
            .watcher()
            .watch(&projects_dir, RecursiveMode::Recursive)
        {
            eprintln!("file watcher watch failed: {e}");
            return;
        }

        for res in rx {
            if res.is_ok() {
                let _ = app_handle.emit("usage-changed", ());
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
                let window = app.get_webview_window("main").expect("main window");
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::Active),
                    Some(20.0),
                )
                .expect("apply vibrancy");
            }
            spawn_file_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_usage, set_theme])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
