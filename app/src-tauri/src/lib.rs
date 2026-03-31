use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use tauri_plugin_notification::NotificationExt;

// --- Config ---

#[derive(Deserialize, Default)]
struct Config {
    default_cwd: Option<String>,
    #[serde(default)]
    projects: Vec<ProjectConfig>,
    #[serde(default)]
    profiles: Vec<ProfileConfig>,
    #[serde(default)]
    templates: Vec<TemplateConfig>,
}

#[derive(Deserialize)]
struct ProjectConfig {
    name: String,
    path: String,
}

#[derive(Deserialize, Clone)]
struct ProfileConfig {
    name: String,
    cwd: Option<String>,
    agent: Option<String>,
    prompt: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
struct TemplateConfig {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    verify: Option<String>,
    #[serde(default)]
    result: Option<String>,
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitInfo {
    branch: String,
    dirty: bool,
    ahead: u32,
    behind: u32,
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

#[tauri::command]
fn block_task(
    project_path: String,
    blocker_id: String,
    blocked_id: String,
) -> Result<Vec<Task>, String> {
    let args: Vec<String> = vec!["block".into(), blocker_id, blocked_id];
    run_limbo_mutation(&project_path, &args)
}

#[tauri::command]
fn unblock_task(
    project_path: String,
    blocker_id: String,
    blocked_id: String,
) -> Result<Vec<Task>, String> {
    let args: Vec<String> = vec!["unblock".into(), blocker_id, blocked_id];
    run_limbo_mutation(&project_path, &args)
}

// --- Git ---

#[tauri::command]
fn get_git_info(path: String) -> Result<Option<GitInfo>, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Ok(None);
    }

    // Check if path is inside a git repo
    let branch_output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&dir)
        .output();

    let branch = match branch_output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => return Ok(None),
    };

    // Dirty status
    let dirty = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&dir)
        .output()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false);

    // Ahead/behind
    let (ahead, behind) = Command::new("git")
        .args(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
        .current_dir(&dir)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let parts: Vec<&str> = s.split('\t').collect();
            if parts.len() == 2 {
                Some((
                    parts[0].parse::<u32>().unwrap_or(0),
                    parts[1].parse::<u32>().unwrap_or(0),
                ))
            } else {
                None
            }
        })
        .unwrap_or((0, 0));

    Ok(Some(GitInfo {
        branch,
        dirty,
        ahead,
        behind,
    }))
}

// --- Profiles ---

#[derive(Serialize, Clone)]
struct Profile {
    name: String,
    cwd: Option<String>,
    agent: Option<String>,
    prompt: Option<String>,
}

#[tauri::command]
fn list_profiles() -> Vec<Profile> {
    let config = load_config();
    config
        .profiles
        .into_iter()
        .map(|p| Profile {
            name: p.name,
            cwd: p
                .cwd
                .map(|c| expand_tilde(&c).to_string_lossy().to_string()),
            agent: p.agent,
            prompt: p.prompt,
        })
        .collect()
}

// --- Templates ---

#[derive(Serialize, Clone)]
struct TaskTemplate {
    name: String,
    description: Option<String>,
    action: Option<String>,
    verify: Option<String>,
    result: Option<String>,
}

#[tauri::command]
fn list_templates() -> Vec<TaskTemplate> {
    let config = load_config();
    config
        .templates
        .into_iter()
        .map(|t| TaskTemplate {
            name: t.name,
            description: t.description,
            action: t.action,
            verify: t.verify,
            result: t.result,
        })
        .collect()
}

// --- Agents ---

#[tauri::command]
fn list_agents() -> Vec<String> {
    let mut agents = Vec::new();

    // Scan ~/.claude/agents/ for .md files
    if let Some(home) = dirs::home_dir() {
        let agents_dir = home.join(".claude").join("agents");
        if let Ok(entries) = fs::read_dir(&agents_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|e| e == "md")
                    && let Some(stem) = path.file_stem()
                {
                    agents.push(stem.to_string_lossy().to_string());
                }
            }
        }

        // Also scan plugin agents (swe-team latest version)
        let plugins_dir = home.join(".claude").join("plugins").join("cache");
        if let Ok(orgs) = fs::read_dir(&plugins_dir) {
            for org in orgs.flatten() {
                if let Ok(plugins) = fs::read_dir(org.path()) {
                    for plugin in plugins.flatten() {
                        // Find highest version directory
                        if let Ok(versions) = fs::read_dir(plugin.path()) {
                            let mut version_dirs: Vec<_> =
                                versions.flatten().filter(|e| e.path().is_dir()).collect();
                            version_dirs.sort_by_key(|b| std::cmp::Reverse(b.file_name()));
                            if let Some(latest) = version_dirs.first() {
                                let agents_path = latest.path().join("agents");
                                if let Ok(agent_files) = fs::read_dir(&agents_path) {
                                    let plugin_name = plugin.file_name();
                                    let prefix = plugin_name.to_string_lossy();
                                    for af in agent_files.flatten() {
                                        let p = af.path();
                                        if p.extension().is_some_and(|e| e == "md")
                                            && let Some(stem) = p.file_stem()
                                        {
                                            agents.push(format!(
                                                "{}:{}",
                                                prefix,
                                                stem.to_string_lossy()
                                            ));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    agents.sort();
    agents.dedup();
    agents
}

// --- File I/O ---

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileContent {
    content: String,
    size: u64,
    extension: String,
    viewer_type: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
    name: String,
    is_dir: bool,
    is_file: bool,
    size: u64,
    extension: String,
}

fn detect_viewer_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        // Code files
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "c" | "cpp" | "h" | "hpp" | "java"
        | "rb" | "swift" | "kt" | "sh" | "bash" | "zsh" | "fish" | "ps1" | "toml" | "yaml"
        | "yml" | "json" | "xml" | "html" | "css" | "scss" | "sass" | "less" | "sql" | "lua"
        | "r" | "php" | "pl" | "ex" | "exs" | "erl" | "hs" | "ml" | "clj" | "scala" | "zig"
        | "nim" | "v" | "d" | "cs" | "fs" | "vue" | "svelte" | "astro" | "tf" | "hcl" | "nix"
        | "dockerfile" | "makefile" | "cmake" | "gradle" | "lock" | "conf" | "cfg" | "ini"
        | "env" | "txt" | "log" | "csv" => "code",
        // Markdown
        "md" | "mdx" | "markdown" => "markdown",
        // Images
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "svg" | "webp" | "ico" | "avif" => "image",
        // PDF
        "pdf" => "pdf",
        // Diff/Patch
        "diff" | "patch" => "diff",
        // Default to code for unknown text files
        _ => "code",
    }
}

fn is_likely_binary(data: &[u8]) -> bool {
    // Check first 8KB for null bytes (common binary indicator)
    let check_len = data.len().min(8192);
    data[..check_len].contains(&0)
}

#[tauri::command]
fn read_file(path: String) -> Result<FileContent, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err(format!("Not a file: {path}"));
    }

    let metadata = fs::metadata(&file_path).map_err(|e| format!("Cannot read metadata: {e}"))?;
    let size = metadata.len();

    // 5MB limit
    if size > 5 * 1024 * 1024 {
        return Err(format!("File too large: {} bytes (limit: 5MB)", size));
    }

    let ext = file_path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();

    let viewer_type = detect_viewer_type(&ext).to_string();

    // For images, return base64-encoded content
    if viewer_type == "image" {
        use std::io::Read;
        let mut file = fs::File::open(&file_path).map_err(|e| format!("Cannot open file: {e}"))?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)
            .map_err(|e| format!("Cannot read file: {e}"))?;

        let mime = match ext.to_lowercase().as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "bmp" => "image/bmp",
            "svg" => "image/svg+xml",
            "webp" => "image/webp",
            "ico" => "image/x-icon",
            "avif" => "image/avif",
            _ => "application/octet-stream",
        };

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        return Ok(FileContent {
            content: format!("data:{mime};base64,{b64}"),
            size,
            extension: ext,
            viewer_type,
        });
    }

    // For PDF, return base64-encoded content
    if viewer_type == "pdf" {
        use std::io::Read;
        let mut file = fs::File::open(&file_path).map_err(|e| format!("Cannot open file: {e}"))?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)
            .map_err(|e| format!("Cannot read file: {e}"))?;

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        return Ok(FileContent {
            content: format!("data:application/pdf;base64,{b64}"),
            size,
            extension: ext,
            viewer_type,
        });
    }

    // Text files
    let raw = fs::read(&file_path).map_err(|e| format!("Cannot read file: {e}"))?;
    if is_likely_binary(&raw) {
        return Err("File appears to be binary".to_string());
    }

    let content = String::from_utf8(raw).map_err(|_| "File is not valid UTF-8".to_string())?;

    Ok(FileContent {
        content,
        size,
        extension: ext,
        viewer_type,
    })
}

#[tauri::command]
fn snapshot_file(path: String) -> Result<FileContent, String> {
    // Reuse read_file logic — returns file content for caching pre-edit state
    read_file(path)
}

#[tauri::command]
fn compute_diff(
    old_content: String,
    new_content: String,
    file_path: String,
) -> Result<String, String> {
    use similar::TextDiff;

    // Sanitize file_path — strip newlines to prevent header injection
    let safe_path = file_path.replace(['\n', '\r'], "");

    let diff = TextDiff::from_lines(&old_content, &new_content);
    let mut output = String::new();

    // Unified diff header
    output.push_str(&format!("--- a/{}\n", safe_path));
    output.push_str(&format!("+++ b/{}\n", safe_path));

    for hunk in diff.unified_diff().context_radius(3).iter_hunks() {
        output.push_str(&format!("{}", hunk));
    }

    Ok(output)
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let dir_path = PathBuf::from(&path);
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let entries = fs::read_dir(&dir_path).map_err(|e| format!("Cannot read directory: {e}"))?;
    let mut result: Vec<DirEntry> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let is_dir = path.is_dir();
        let is_file = path.is_file();
        let size = path.metadata().map(|m| m.len()).unwrap_or(0);
        let extension = path
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();

        result.push(DirEntry {
            name,
            is_dir,
            is_file,
            size,
            extension,
        });
    }

    // Sort: directories first, then alphabetically
    result.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(result)
}

#[tauri::command]
fn detect_file_type(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    let ext = file_path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(detect_viewer_type(&ext).to_string())
}

#[tauri::command]
fn get_git_diff(path: String, file_path: Option<String>) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let mut args = vec!["diff".to_string()];
    if let Some(fp) = file_path {
        args.push("--".to_string());
        args.push(fp);
    }

    let output = Command::new("git")
        .args(&args)
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("Failed to run git diff: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// --- Claude Settings ---

fn claude_settings_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("settings.json"))
}

#[tauri::command]
fn read_claude_settings() -> Result<String, String> {
    let path = claude_settings_path().ok_or("Could not resolve home directory")?;
    if !path.exists() {
        return Ok("{}".to_string());
    }
    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {e}"))?;
    // Validate it's valid JSON
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("Settings file is not valid JSON: {e}"))?;
    Ok(contents)
}

#[tauri::command]
fn write_claude_settings(data: String) -> Result<(), String> {
    // Validate the incoming data is valid JSON
    serde_json::from_str::<serde_json::Value>(&data).map_err(|e| format!("Invalid JSON: {e}"))?;
    let path = claude_settings_path().ok_or("Could not resolve home directory")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create .claude dir: {e}"))?;
    }
    fs::write(&path, &data).map_err(|e| format!("Failed to write settings: {e}"))
}

#[tauri::command]
fn read_project_settings(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path)
        .join(".claude")
        .join("settings.json");
    if !path.exists() {
        return Ok("{}".to_string());
    }
    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read project settings: {e}"))?;
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("Project settings file is not valid JSON: {e}"))?;
    Ok(contents)
}

#[tauri::command]
fn write_project_settings(project_path: String, data: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&data).map_err(|e| format!("Invalid JSON: {e}"))?;
    let path = PathBuf::from(&project_path)
        .join(".claude")
        .join("settings.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create .claude dir: {e}"))?;
    }
    fs::write(&path, &data).map_err(|e| format!("Failed to write project settings: {e}"))
}

// --- CLAUDE.md ---

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ClaudeMdFile {
    path: String,
    scope: String,
    exists: bool,
}

#[tauri::command]
fn list_claude_md_files(project_path: Option<String>) -> Result<Vec<ClaudeMdFile>, String> {
    let mut files = Vec::new();

    // Global: ~/.claude/CLAUDE.md
    if let Some(home) = dirs::home_dir() {
        let global_path = home.join(".claude").join("CLAUDE.md");
        files.push(ClaudeMdFile {
            path: global_path.to_string_lossy().to_string(),
            scope: "global".to_string(),
            exists: global_path.is_file(),
        });
    }

    // Project-level paths
    if let Some(ref proj) = project_path {
        let proj_dir = expand_tilde(proj);

        // <project>/CLAUDE.md
        let project_root = proj_dir.join("CLAUDE.md");
        files.push(ClaudeMdFile {
            path: project_root.to_string_lossy().to_string(),
            scope: "project".to_string(),
            exists: project_root.is_file(),
        });

        // <project>/.claude/CLAUDE.md
        let project_dot = proj_dir.join(".claude").join("CLAUDE.md");
        files.push(ClaudeMdFile {
            path: project_dot.to_string_lossy().to_string(),
            scope: "project-dot-claude".to_string(),
            exists: project_dot.is_file(),
        });
    }

    Ok(files)
}

#[tauri::command]
fn read_claude_md(path: String) -> Result<String, String> {
    let file_path = expand_tilde(&path);
    if !file_path.is_file() {
        return Ok(String::new());
    }
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read CLAUDE.md: {e}"))
}

#[tauri::command]
fn write_claude_md(path: String, content: String) -> Result<(), String> {
    let file_path = expand_tilde(&path);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {e}"))?;
    }
    fs::write(&file_path, &content).map_err(|e| format!("Failed to write CLAUDE.md: {e}"))
}

// --- Permission Profiles ---

#[derive(Deserialize, Serialize, Clone, Default)]
struct PermissionProfileConfig {
    name: String,
    #[serde(default)]
    allow: Vec<String>,
    #[serde(default)]
    deny: Vec<String>,
    #[serde(default)]
    default_mode: Option<String>,
}

#[derive(Deserialize, Default)]
#[allow(dead_code)]
struct ConfigWithProfiles {
    #[serde(default)]
    default_cwd: Option<String>,
    #[serde(default)]
    projects: Vec<ProjectConfig>,
    #[serde(default)]
    profiles: Vec<ProfileConfig>,
    #[serde(default)]
    templates: Vec<TemplateConfig>,
    #[serde(default)]
    permission_profiles: Vec<PermissionProfileConfig>,
}

fn load_config_with_profiles() -> ConfigWithProfiles {
    let Some(home) = dirs::home_dir() else {
        return ConfigWithProfiles::default();
    };
    let path = home.join(".ordis").join("config.toml");
    let Ok(contents) = fs::read_to_string(&path) else {
        return ConfigWithProfiles::default();
    };
    toml::from_str(&contents).unwrap_or_default()
}

fn config_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".ordis").join("config.toml"))
        .ok_or_else(|| "Could not resolve home directory".to_string())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PermissionProfile {
    name: String,
    allow: Vec<String>,
    deny: Vec<String>,
    default_mode: Option<String>,
}

#[tauri::command]
fn list_permission_profiles() -> Result<Vec<PermissionProfile>, String> {
    let config = load_config_with_profiles();
    Ok(config
        .permission_profiles
        .into_iter()
        .map(|p| PermissionProfile {
            name: p.name,
            allow: p.allow,
            deny: p.deny,
            default_mode: p.default_mode,
        })
        .collect())
}

#[tauri::command]
fn save_permission_profiles(profiles_json: String) -> Result<(), String> {
    let profiles: Vec<PermissionProfileConfig> =
        serde_json::from_str(&profiles_json).map_err(|e| format!("Invalid JSON: {e}"))?;

    let path = config_path()?;
    let contents = fs::read_to_string(&path).unwrap_or_default();

    // Parse existing config, update permission_profiles section, rewrite
    let mut doc: toml::Table =
        toml::from_str(&contents).map_err(|e| format!("Failed to parse config: {e}"))?;

    // Convert profiles to toml array
    let toml_profiles: Vec<toml::Value> = profiles
        .into_iter()
        .map(|p| {
            let mut table = toml::Table::new();
            table.insert("name".into(), toml::Value::String(p.name));
            table.insert(
                "allow".into(),
                toml::Value::Array(p.allow.into_iter().map(toml::Value::String).collect()),
            );
            table.insert(
                "deny".into(),
                toml::Value::Array(p.deny.into_iter().map(toml::Value::String).collect()),
            );
            if let Some(mode) = p.default_mode {
                table.insert("default_mode".into(), toml::Value::String(mode));
            }
            toml::Value::Table(table)
        })
        .collect();

    doc.insert(
        "permission_profiles".into(),
        toml::Value::Array(toml_profiles),
    );

    let output = toml::to_string_pretty(&doc).map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&path, output).map_err(|e| format!("Failed to write config: {e}"))
}

#[tauri::command]
fn apply_permission_profile(profile_name: String) -> Result<(), String> {
    let config = load_config_with_profiles();
    let profile = config
        .permission_profiles
        .into_iter()
        .find(|p| p.name == profile_name)
        .ok_or_else(|| format!("Profile '{}' not found", profile_name))?;

    // Read current claude settings
    let settings_path = claude_settings_path().ok_or("Could not resolve home directory")?;
    let raw = if settings_path.exists() {
        fs::read_to_string(&settings_path).map_err(|e| format!("Failed to read settings: {e}"))?
    } else {
        "{}".to_string()
    };

    let mut settings: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Invalid settings JSON: {e}"))?;

    // Merge permissions from profile
    let perms = settings
        .as_object_mut()
        .ok_or("Settings is not a JSON object")?
        .entry("permissions")
        .or_insert_with(|| serde_json::json!({}));

    let perms_obj = perms
        .as_object_mut()
        .ok_or("permissions is not a JSON object")?;

    perms_obj.insert("allow".into(), serde_json::json!(profile.allow));
    perms_obj.insert("deny".into(), serde_json::json!(profile.deny));
    if let Some(mode) = profile.default_mode {
        perms_obj.insert("defaultMode".into(), serde_json::json!(mode));
    }

    let output = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;

    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create .claude dir: {e}"))?;
    }
    fs::write(&settings_path, output).map_err(|e| format!("Failed to write settings: {e}"))
}

// --- Startup Checks ---

#[derive(Serialize, Clone)]
struct StartupChecks {
    limbo_available: bool,
    config_error: Option<String>,
}

#[tauri::command]
fn check_startup() -> StartupChecks {
    // Check limbo availability
    let limbo_available = Command::new("limbo")
        .arg("--version")
        .output()
        .is_ok_and(|o| o.status.success());

    // Check config validation
    let config_error = (|| {
        let home = dirs::home_dir()?;
        let path = home.join(".ordis").join("config.toml");
        let contents = fs::read_to_string(&path).ok()?;
        match toml::from_str::<Config>(&contents) {
            Ok(_) => None,
            Err(e) => Some(format!("config.toml: {e}")),
        }
    })();

    StartupChecks {
        limbo_available,
        config_error,
    }
}

// --- Session Persistence ---

fn session_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".ordis").join("session.json"))
}

#[tauri::command]
fn save_session(data: String) -> Result<(), String> {
    let path = session_path().ok_or("Could not resolve home directory")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create .ordis dir: {e}"))?;
    }
    fs::write(&path, &data).map_err(|e| format!("Failed to save session: {e}"))
}

#[tauri::command]
fn load_session() -> Result<Option<String>, String> {
    let path = session_path().ok_or("Could not resolve home directory")?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path).map_err(|e| format!("Failed to read session: {e}"))?;
    Ok(Some(contents))
}

// --- Workspaces ---

fn workspaces_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".ordis").join("workspaces"))
}

#[tauri::command]
fn list_workspaces() -> Result<Vec<String>, String> {
    let dir = workspaces_dir().ok_or("Could not resolve home directory")?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut names = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read workspaces dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "json")
            && let Some(stem) = path.file_stem()
        {
            names.push(stem.to_string_lossy().to_string());
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
fn save_workspace(name: String, data: String) -> Result<(), String> {
    let dir = workspaces_dir().ok_or("Could not resolve home directory")?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create workspaces dir: {e}"))?;
    let path = dir.join(format!("{name}.json"));
    fs::write(&path, &data).map_err(|e| format!("Failed to save workspace: {e}"))
}

#[tauri::command]
fn load_workspace(name: String) -> Result<Option<String>, String> {
    let dir = workspaces_dir().ok_or("Could not resolve home directory")?;
    let path = dir.join(format!("{name}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read workspace: {e}"))?;
    Ok(Some(contents))
}

#[tauri::command]
fn delete_workspace(name: String) -> Result<(), String> {
    let dir = workspaces_dir().ok_or("Could not resolve home directory")?;
    let path = dir.join(format!("{name}.json"));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete workspace: {e}"))?;
    }
    Ok(())
}

// --- Watcher ---

fn parse_tasks_from_json(json: &str) -> Vec<Task> {
    let trimmed = json.trim();
    if trimmed == "null" || trimmed.is_empty() {
        return vec![];
    }
    serde_json::from_str(trimmed).unwrap_or_default()
}

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

                if had_prev && changed {
                    // Parse old and new task lists to detect status changes
                    let old_tasks = parse_tasks_from_json(cache.get(name).unwrap());
                    let new_tasks = parse_tasks_from_json(&stdout);

                    // Build a map of old task statuses for comparison
                    let old_status: HashMap<String, String> = old_tasks
                        .iter()
                        .map(|t| (t.id.clone(), t.status.clone()))
                        .collect();

                    // Send notifications for tasks whose status changed
                    for task in &new_tasks {
                        if let Some(prev_status) = old_status.get(&task.id)
                            && prev_status != &task.status
                        {
                            let title = if task.status == "done" {
                                "Task Completed"
                            } else {
                                "Task Status Changed"
                            };
                            let body = format!("{}: {} ({})", task.id, task.name, task.status);
                            let _ = handle
                                .notification()
                                .builder()
                                .title(title)
                                .body(body)
                                .show();
                        }
                    }

                    let _ = handle.emit(
                        "tasks-changed",
                        TasksChanged {
                            project: name.clone(),
                            tasks: new_tasks,
                        },
                    );
                }

                cache.insert(name.clone(), stdout);
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
        .plugin(tauri_plugin_notification::init())
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
            block_task,
            unblock_task,
            save_session,
            load_session,
            check_startup,
            get_git_info,
            list_agents,
            list_profiles,
            list_templates,
            list_workspaces,
            save_workspace,
            load_workspace,
            delete_workspace,
            read_file,
            snapshot_file,
            compute_diff,
            list_directory,
            detect_file_type,
            get_git_diff,
            read_claude_settings,
            write_claude_settings,
            read_project_settings,
            write_project_settings,
            list_claude_md_files,
            read_claude_md,
            write_claude_md,
            list_permission_profiles,
            save_permission_profiles,
            apply_permission_profile,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || watch_tasks(handle));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Ordis");
}
