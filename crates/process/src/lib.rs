use std::path::Path;

use ordis_protocol::ClaudeEvent;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("failed to spawn claude: {0}")]
    Spawn(#[from] std::io::Error),

    #[error("process not running")]
    NotRunning,
}

pub type Result<T> = std::result::Result<T, Error>;

pub struct ClaudeProcess {
    child: Child,
    events_rx: mpsc::Receiver<ClaudeEvent>,
}

impl ClaudeProcess {
    /// Spawn a new `claude -p` process for a single turn.
    /// If `session_id` is provided, resumes that session.
    pub fn spawn(message: &str, cwd: &Path, session_id: Option<&str>) -> Result<Self> {
        let mut cmd = Command::new("claude");
        cmd.arg("-p")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--include-partial-messages")
            .arg("--dangerously-skip-permissions");

        cmd.arg(message)
            .current_dir(cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        if let Some(sid) = session_id {
            cmd.arg("--resume").arg(sid);
        }

        let mut child = cmd.spawn()?;
        let stdout = child.stdout.take().expect("stdout piped");

        let (tx, rx) = mpsc::channel(256);

        // Spawn a task to read stdout line-by-line and parse NDJSON
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<ClaudeEvent>(&line) {
                    Ok(event) => {
                        if tx.send(event).await.is_err() {
                            break; // receiver dropped
                        }
                    }
                    Err(e) => {
                        eprintln!("ordis: failed to parse event: {e}\n  line: {line}");
                    }
                }
            }
        });

        Ok(Self {
            child,
            events_rx: rx,
        })
    }

    /// Get the next event from the Claude process.
    /// Returns `None` when the process is done and all events have been consumed.
    pub async fn next_event(&mut self) -> Option<ClaudeEvent> {
        self.events_rx.recv().await
    }

    /// Kill the running process.
    pub fn kill(&mut self) -> Result<()> {
        self.child.start_kill().map_err(|_| Error::NotRunning)
    }
}
