use std::collections::{HashMap, VecDeque};
use std::ffi::OsString;
use std::io::Read;
use std::sync::{Arc, Mutex};

use portable_pty::{ChildKiller, CommandBuilder, PtySize, native_pty_system};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;

// --- Types ---

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Running,
    Exited(u32),
    Error(String),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub pane_id: String,
    pub pid: u32,
    pub status: SessionStatus,
    pub created_at_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnResult {
    pub pane_id: String,
    pub pid: u32,
}

// --- Internal session state ---

struct PtySession {
    pane_id: String,
    pid: u32,
    created_at: std::time::Instant,
    status: SessionStatus,
    writer: Box<dyn std::io::Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    scrollback: Arc<Mutex<VecDeque<Vec<u8>>>>,
    subscriber: Arc<Mutex<Option<mpsc::UnboundedSender<Vec<u8>>>>>,
    master_resize: Box<dyn portable_pty::MasterPty + Send>,
}

const SCROLLBACK_CAP: usize = 10_000;

// --- Manager ---

pub struct PtySessionManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtySessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

// --- Commands ---

#[tauri::command]
pub async fn pty_spawn(
    pane_id: String,
    cwd: Option<String>,
    env: HashMap<String, String>,
    cols: u16,
    rows: u16,
    app_handle: AppHandle,
) -> Result<SpawnResult, String> {
    let manager = app_handle.state::<PtySessionManager>();

    // Check for duplicate pane_id
    {
        let sessions = manager.sessions.lock().map_err(|e| e.to_string())?;
        if sessions.contains_key(&pane_id) {
            return Err(format!("Session already exists for pane_id: {pane_id}"));
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("/bin/zsh");
    cmd.args(["-l"]);
    if let Some(ref cwd) = cwd {
        cmd.cwd(OsString::from(cwd));
    }
    for (k, v) in &env {
        cmd.env(OsString::from(k), OsString::from(v));
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let pid = child.process_id().unwrap_or(0);
    let killer = child.clone_killer();

    let scrollback: Arc<Mutex<VecDeque<Vec<u8>>>> =
        Arc::new(Mutex::new(VecDeque::with_capacity(SCROLLBACK_CAP)));
    let subscriber: Arc<Mutex<Option<mpsc::UnboundedSender<Vec<u8>>>>> = Arc::new(Mutex::new(None));

    let session = PtySession {
        pane_id: pane_id.clone(),
        pid,
        created_at: std::time::Instant::now(),
        status: SessionStatus::Running,
        writer,
        killer,
        scrollback: Arc::clone(&scrollback),
        subscriber: Arc::clone(&subscriber),
        master_resize: pair.master,
    };

    {
        let mut sessions = manager.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(pane_id.clone(), session);
    }

    // Spawn a blocking reader thread for PTY output.
    // PTY reads are blocking I/O (std::io::Read), so we use a dedicated thread.
    let reader_pane_id = pane_id.clone();
    let reader_scrollback = Arc::clone(&scrollback);
    let reader_subscriber = Arc::clone(&subscriber);
    let reader_app_handle = app_handle.clone();
    let mut child = child;
    std::thread::spawn(move || {
        read_loop(
            reader,
            reader_scrollback,
            reader_subscriber,
            &reader_pane_id,
        );

        // Reader finished (EOF or error) -- check child exit status
        let (status, exit_code) = match child.wait() {
            Ok(es) => (SessionStatus::Exited(es.exit_code()), es.exit_code()),
            Err(e) => (SessionStatus::Error(e.to_string()), 1),
        };

        // Update session status
        let manager = reader_app_handle.state::<PtySessionManager>();
        if let Ok(mut sessions) = manager.sessions.lock()
            && let Some(session) = sessions.get_mut(&reader_pane_id)
        {
            session.status = status;
        }

        // Emit exit event so frontend knows the session ended
        let _ = reader_app_handle.emit(&format!("pty-exit-{reader_pane_id}"), exit_code);
    });

    Ok(SpawnResult { pane_id, pid })
}

fn read_loop(
    mut reader: Box<dyn Read + Send>,
    scrollback: Arc<Mutex<VecDeque<Vec<u8>>>>,
    subscriber: Arc<Mutex<Option<mpsc::UnboundedSender<Vec<u8>>>>>,
    _pane_id: &str,
) {
    let mut buf = vec![0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break, // EOF
            Ok(n) => {
                let chunk = buf[..n].to_vec();

                // Push to scrollback ring buffer
                if let Ok(mut sb) = scrollback.lock() {
                    if sb.len() >= SCROLLBACK_CAP {
                        sb.pop_front();
                    }
                    sb.push_back(chunk.clone());
                }

                // Forward to subscriber if present
                if let Ok(sub) = subscriber.lock()
                    && let Some(tx) = sub.as_ref()
                {
                    let _ = tx.send(chunk);
                }
            }
            Err(_) => break, // Read error, PTY closed
        }
    }
}

#[tauri::command]
pub fn pty_write(
    pane_id: String,
    data: Vec<u8>,
    state: State<'_, PtySessionManager>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&pane_id)
        .ok_or_else(|| format!("No session for pane_id: {pane_id}"))?;
    session.writer.write_all(&data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    pane_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, PtySessionManager>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&pane_id)
        .ok_or_else(|| format!("No session for pane_id: {pane_id}"))?;
    session
        .master_resize
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_kill(pane_id: String, state: State<'_, PtySessionManager>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let mut session = sessions
        .remove(&pane_id)
        .ok_or_else(|| format!("No session for pane_id: {pane_id}"))?;
    session.killer.kill().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_list(state: State<'_, PtySessionManager>) -> Result<Vec<SessionInfo>, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let list = sessions
        .values()
        .map(|s| SessionInfo {
            pane_id: s.pane_id.clone(),
            pid: s.pid,
            status: s.status.clone(),
            created_at_ms: s.created_at.elapsed().as_millis() as u64,
        })
        .collect();
    Ok(list)
}

#[tauri::command]
pub async fn pty_attach(pane_id: String, app_handle: AppHandle) -> Result<Vec<Vec<u8>>, String> {
    let manager = app_handle.state::<PtySessionManager>();
    let (scrollback_data, subscriber_arc) = {
        let sessions = manager.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(&pane_id)
            .ok_or_else(|| format!("No session for pane_id: {pane_id}"))?;

        // Collect current scrollback
        let scrollback_data: Vec<Vec<u8>> = session
            .scrollback
            .lock()
            .map_err(|e| e.to_string())?
            .iter()
            .cloned()
            .collect();

        (scrollback_data, Arc::clone(&session.subscriber))
    };

    // Set up live subscriber that forwards to Tauri events
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();

    {
        let mut sub = subscriber_arc.lock().map_err(|e| e.to_string())?;
        *sub = Some(tx);
    }

    // Spawn a task that reads from the channel and emits Tauri events
    let event_pane_id = pane_id.clone();
    let event_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(data) = rx.recv().await {
            let _ = event_handle.emit(&format!("pty-output-{event_pane_id}"), data);
        }
    });

    Ok(scrollback_data)
}

#[tauri::command]
pub fn pty_detach(pane_id: String, state: State<'_, PtySessionManager>) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&pane_id)
        .ok_or_else(|| format!("No session for pane_id: {pane_id}"))?;

    // Drop the subscriber sender, which will close the channel
    let mut sub = session.subscriber.lock().map_err(|e| e.to_string())?;
    *sub = None;

    Ok(())
}
