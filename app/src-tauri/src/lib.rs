use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use ordis_process::ClaudeProcess;
use serde::Serialize;
use tauri::{Emitter, State};
use tokio::sync::Mutex;

struct AppState {
    /// Active claude processes keyed by pane_id
    processes: Arc<Mutex<HashMap<String, ClaudeProcess>>>,
    /// Session IDs keyed by pane_id
    session_ids: Arc<Mutex<HashMap<String, String>>>,
    cwd: Arc<Mutex<PathBuf>>,
    skip_permissions: Arc<Mutex<bool>>,
}

/// Wrapper so frontend can route events to the correct pane
#[derive(Clone, Serialize)]
struct PaneEvent {
    pane_id: String,
    event: ordis_protocol::ClaudeEvent,
}

#[tauri::command]
async fn send_message(
    pane_id: String,
    message: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let cwd = state.cwd.lock().await.clone();
    let session_id = state.session_ids.lock().await.get(&pane_id).cloned();
    let skip_permissions = *state.skip_permissions.lock().await;

    let process = ClaudeProcess::spawn(&message, &cwd, session_id.as_deref(), skip_permissions)
        .map_err(|e| e.to_string())?;

    {
        let mut procs = state.processes.lock().await;
        procs.insert(pane_id.clone(), process);
    }

    let processes_ref = state.processes.clone();
    let session_ids_ref = state.session_ids.clone();
    let pid = pane_id.clone();

    tauri::async_runtime::spawn(async move {
        loop {
            let event = {
                let mut procs = processes_ref.lock().await;
                match procs.get_mut(&pid) {
                    Some(p) => p.next_event().await,
                    None => break,
                }
            };

            match event {
                Some(evt) => {
                    if let ordis_protocol::ClaudeEvent::Result(ref result) = evt {
                        let mut sids = session_ids_ref.lock().await;
                        sids.insert(pid.clone(), result.session_id.clone());
                    }
                    let _ = app.emit(
                        "claude-event",
                        &PaneEvent {
                            pane_id: pid.clone(),
                            event: evt,
                        },
                    );
                }
                None => {
                    let mut procs = processes_ref.lock().await;
                    procs.remove(&pid);
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_generation(pane_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut procs = state.processes.lock().await;
    if let Some(ref mut process) = procs.get_mut(&pane_id) {
        process.kill().map_err(|e| e.to_string())?;
        procs.remove(&pane_id);
    }
    Ok(())
}

#[tauri::command]
async fn get_session_id(
    pane_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    Ok(state.session_ids.lock().await.get(&pane_id).cloned())
}

#[tauri::command]
async fn new_session(pane_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.session_ids.lock().await.remove(&pane_id);
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
            processes: Arc::new(Mutex::new(HashMap::new())),
            session_ids: Arc::new(Mutex::new(HashMap::new())),
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
