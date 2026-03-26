use std::path::PathBuf;
use std::sync::Arc;

use ordis_process::ClaudeProcess;
use tauri::{Emitter, State};
use tokio::sync::Mutex;

struct AppState {
    session_id: Arc<Mutex<Option<String>>>,
    active_process: Arc<Mutex<Option<ClaudeProcess>>>,
    cwd: Arc<Mutex<PathBuf>>,
    skip_permissions: Arc<Mutex<bool>>,
}

#[tauri::command]
async fn send_message(
    message: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let cwd = state.cwd.lock().await.clone();
    let session_id = state.session_id.lock().await.clone();
    let skip_permissions = *state.skip_permissions.lock().await;

    let process = ClaudeProcess::spawn(&message, &cwd, session_id.as_deref(), skip_permissions)
        .map_err(|e| e.to_string())?;

    {
        let mut active = state.active_process.lock().await;
        *active = Some(process);
    }

    let process_ref = state.active_process.clone();
    let session_id_ref = state.session_id.clone();

    tauri::async_runtime::spawn(async move {
        loop {
            let event = {
                let mut proc = process_ref.lock().await;
                match proc.as_mut() {
                    Some(p) => p.next_event().await,
                    None => break,
                }
            };

            match event {
                Some(evt) => {
                    if let ordis_protocol::ClaudeEvent::Result(ref result) = evt {
                        let mut sid = session_id_ref.lock().await;
                        *sid = Some(result.session_id.clone());
                    }
                    let _ = app.emit("claude-event", &evt);
                }
                None => {
                    // Process finished
                    let mut proc = process_ref.lock().await;
                    *proc = None;
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_generation(state: State<'_, AppState>) -> Result<(), String> {
    let mut proc = state.active_process.lock().await;
    if let Some(ref mut process) = *proc {
        process.kill().map_err(|e| e.to_string())?;
        *proc = None;
    }
    Ok(())
}

#[tauri::command]
async fn get_session_id(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.session_id.lock().await.clone())
}

#[tauri::command]
async fn new_session(state: State<'_, AppState>) -> Result<(), String> {
    let mut sid = state.session_id.lock().await;
    *sid = None;
    Ok(())
}

#[tauri::command]
async fn get_cwd(state: State<'_, AppState>) -> Result<String, String> {
    let cwd = state.cwd.lock().await;
    Ok(cwd.to_string_lossy().to_string())
}

#[tauri::command]
async fn set_cwd(cwd: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = PathBuf::from(&cwd);
    if !path.is_dir() {
        return Err(format!("Not a directory: {cwd}"));
    }
    let mut current = state.cwd.lock().await;
    *current = path;
    Ok(())
}

#[tauri::command]
async fn set_skip_permissions(enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    let mut sp = state.skip_permissions.lock().await;
    *sp = enabled;
    Ok(())
}

#[tauri::command]
async fn get_skip_permissions(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(*state.skip_permissions.lock().await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            session_id: Arc::new(Mutex::new(None)),
            active_process: Arc::new(Mutex::new(None)),
            skip_permissions: Arc::new(Mutex::new(false)),
            cwd: Arc::new(Mutex::new(
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")),
            )),
        })
        .invoke_handler(tauri::generate_handler![
            send_message,
            stop_generation,
            get_session_id,
            new_session,
            get_cwd,
            set_cwd,
            set_skip_permissions,
            get_skip_permissions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ordis");
}
