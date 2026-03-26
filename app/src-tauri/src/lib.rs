use std::path::PathBuf;
use std::sync::Mutex;

use tauri::State;

struct AppState {
    cwd: Mutex<PathBuf>,
}

#[tauri::command]
fn get_cwd(state: State<'_, AppState>) -> Result<String, String> {
    let cwd = state.cwd.lock().map_err(|e| e.to_string())?;
    Ok(cwd.to_string_lossy().to_string())
}

#[tauri::command]
fn set_cwd(cwd: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = PathBuf::from(&cwd);
    if !path.is_dir() {
        return Err(format!("Not a directory: {cwd}"));
    }
    let mut current = state.cwd.lock().map_err(|e| e.to_string())?;
    *current = path;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .manage(AppState {
            cwd: Mutex::new({
                let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
                if cwd.as_os_str() == "/" {
                    dirs::home_dir().unwrap_or(cwd)
                } else {
                    cwd
                }
            }),
        })
        .invoke_handler(tauri::generate_handler![get_cwd, set_cwd,])
        .run(tauri::generate_context!())
        .expect("error while running Ordis");
}
