use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

// --- Config ---

#[derive(Deserialize, Default)]
struct Config {
    default_cwd: Option<String>,
    #[serde(default)]
    projects: Vec<ProjectConfig>,
}

#[derive(Deserialize)]
struct ProjectConfig {
    name: String,
    path: String,
}

fn load_config() -> Config {
    let Some(home) = dirs::home_dir() else {
        return Config::default();
    };
    let path = home.join(".ordis").join("config.toml");
    let Ok(contents) = fs::read_to_string(&path) else {
        return Config::default();
    };
    toml::from_str(&contents).unwrap_or_default()
}

fn expand_tilde(raw: &str) -> PathBuf {
    if let Some(rest) = raw.strip_prefix('~')
        && let Some(home) = dirs::home_dir()
    {
        return home.join(rest.strip_prefix('/').unwrap_or(rest));
    }
    PathBuf::from(raw)
}

fn resolve_default_cwd() -> PathBuf {
    let config = load_config();
    if let Some(raw) = config.default_cwd {
        let expanded = expand_tilde(&raw);
        if expanded.is_dir() {
            return expanded;
        }
    }
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

// --- Types ---

#[derive(Serialize, Clone)]
struct Project {
    name: String,
    path: String,
    has_limbo: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    verify: Option<String>,
    #[serde(default)]
    result: Option<String>,
    #[serde(default)]
    outcome: Option<String>,
    #[serde(default)]
    parent: Option<String>,
    status: String,
    #[serde(default)]
    blocked_by: Option<Vec<String>>,
    #[serde(default)]
    owner: Option<String>,
    #[serde(default)]
    notes: Option<Vec<Note>>,
    #[serde(default)]
    created: Option<String>,
    #[serde(default)]
    updated: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Note {
    content: String,
    timestamp: String,
}

#[derive(Serialize, Clone)]
struct TasksChanged {
    project: String,
    tasks: Vec<Task>,
}

// --- State ---

struct AppState {
    cwd: Mutex<PathBuf>,
}

// --- Commands ---

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

#[tauri::command]
fn list_projects() -> Result<Vec<Project>, String> {
    let config = load_config();
    let projects = config
        .projects
        .into_iter()
        .map(|p| {
            let expanded = expand_tilde(&p.path);
            let has_limbo = expanded.join(".limbo").is_dir();
            Project {
                name: p.name,
                path: expanded.to_string_lossy().to_string(),
                has_limbo,
            }
        })
        .collect();
    Ok(projects)
}

fn fetch_tasks_for_project(project_path: &str) -> Result<Vec<Task>, String> {
    let output = Command::new("limbo")
        .args(["list", "--show-all"])
        .current_dir(project_path)
        .output()
        .map_err(|e| format!("Failed to run limbo: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("limbo list failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed == "null" || trimmed.is_empty() {
        return Ok(vec![]);
    }

    serde_json::from_str(trimmed).map_err(|e| format!("Failed to parse limbo output: {e}"))
}

fn run_limbo_mutation(project_path: &str, args: &[String]) -> Result<Vec<Task>, String> {
    let output = Command::new("limbo")
        .args(args)
        .current_dir(project_path)
        .output()
        .map_err(|e| format!("Failed to run limbo: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("limbo command failed: {stderr}"));
    }

    fetch_tasks_for_project(project_path)
}

#[tauri::command]
fn list_tasks(project_path: String) -> Result<Vec<Task>, String> {
    fetch_tasks_for_project(&project_path)
}

#[tauri::command]
fn get_task(project_path: String, task_id: String) -> Result<Task, String> {
    let output = Command::new("limbo")
        .args(["show", &task_id])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run limbo: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("limbo show failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim()).map_err(|e| format!("Failed to parse task: {e}"))
}

#[tauri::command]
fn update_task_status(
    project_path: String,
    task_id: String,
    status: String,
    outcome: Option<String>,
) -> Result<Vec<Task>, String> {
    let mut args = vec!["status".into(), task_id, status];
    if let Some(o) = outcome {
        args.extend(["--outcome".into(), o]);
    }
    run_limbo_mutation(&project_path, &args)
}

#[tauri::command]
fn add_task(
    project_path: String,
    name: String,
    description: Option<String>,
    action: Option<String>,
    verify: Option<String>,
    result: Option<String>,
    parent: Option<String>,
) -> Result<Vec<Task>, String> {
    let mut args: Vec<String> = vec!["add".into(), name];
    if let Some(d) = description {
        args.extend(["--description".into(), d]);
    }
    args.extend(["--action".into(), action.unwrap_or_else(|| "-".into())]);
    args.extend(["--verify".into(), verify.unwrap_or_else(|| "-".into())]);
    args.extend(["--result".into(), result.unwrap_or_else(|| "-".into())]);
    if let Some(p) = parent {
        args.extend(["--parent".into(), p]);
    }
    run_limbo_mutation(&project_path, &args)
}

#[tauri::command]
fn edit_task(
    project_path: String,
    task_id: String,
    name: Option<String>,
    description: Option<String>,
    action: Option<String>,
    verify: Option<String>,
    result: Option<String>,
) -> Result<Vec<Task>, String> {
    let mut args: Vec<String> = vec!["edit".into(), task_id];
    if let Some(n) = name {
        args.extend(["--name".into(), n]);
    }
    if let Some(d) = description {
        args.extend(["--description".into(), d]);
    }
    if let Some(a) = action {
        args.extend(["--action".into(), a]);
    }
    if let Some(v) = verify {
        args.extend(["--verify".into(), v]);
    }
    if let Some(r) = result {
        args.extend(["--result".into(), r]);
    }
    run_limbo_mutation(&project_path, &args)
}

#[tauri::command]
fn add_task_note(
    project_path: String,
    task_id: String,
    message: String,
) -> Result<Vec<Task>, String> {
    let args: Vec<String> = vec!["note".into(), task_id, message];
    run_limbo_mutation(&project_path, &args)
}

#[tauri::command]
fn delete_task(project_path: String, task_id: String) -> Result<Vec<Task>, String> {
    let args: Vec<String> = vec!["delete".into(), task_id];
    run_limbo_mutation(&project_path, &args)
}

// --- Watcher ---

fn watch_tasks(handle: tauri::AppHandle) {
    let mut cache: HashMap<String, String> = HashMap::new();
    loop {
        let config = load_config();
        let projects: Vec<(String, PathBuf)> = config
            .projects
            .into_iter()
            .map(|p| (p.name, expand_tilde(&p.path)))
            .filter(|(_, path)| path.join(".limbo").is_dir())
            .collect();

        for (name, path) in &projects {
            if let Ok(output) = Command::new("limbo")
                .args(["list", "--show-all"])
                .current_dir(path)
                .output()
                && output.status.success()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let had_prev = cache.contains_key(name);
                let changed = cache.get(name) != Some(&stdout);
                cache.insert(name.clone(), stdout.clone());
                if had_prev && changed {
                    let trimmed = stdout.trim();
                    let tasks = if trimmed == "null" || trimmed.is_empty() {
                        vec![]
                    } else {
                        serde_json::from_str(trimmed).unwrap_or_default()
                    };
                    let _ = handle.emit(
                        "tasks-changed",
                        TasksChanged {
                            project: name.clone(),
                            tasks,
                        },
                    );
                }
            }
        }

        std::thread::sleep(Duration::from_secs(2));
    }
}

// --- App ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .manage(AppState {
            cwd: Mutex::new(resolve_default_cwd()),
        })
        .invoke_handler(tauri::generate_handler![
            get_cwd,
            set_cwd,
            list_projects,
            list_tasks,
            get_task,
            update_task_status,
            add_task,
            edit_task,
            add_task_note,
            delete_task,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || watch_tasks(handle));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Ordis");
}
