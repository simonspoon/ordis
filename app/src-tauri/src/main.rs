// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{self, IsTerminal, Read};

use clap::{Parser, Subcommand, ValueEnum};

#[derive(Parser)]
#[command(name = "ordis", about = "Desktop interface for Claude Code")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Launch a Claude Code session in a running ordis instance
    Launch {
        /// Working directory for the session (defaults to current directory)
        #[arg(long, default_value = ".")]
        cwd: String,

        /// Agent to use (e.g. "swe-team:tech-lead")
        #[arg(long)]
        agent: Option<String>,

        /// Effort level for the session
        #[arg(long, value_enum)]
        effort: Option<Effort>,

        /// Prompt to send (reads from stdin if not provided and stdin is a pipe)
        #[arg(long)]
        prompt: Option<String>,
    },
}

#[derive(Clone, ValueEnum)]
pub enum Effort {
    Low,
    Medium,
    High,
    Max,
}

impl std::fmt::Display for Effort {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Effort::Low => write!(f, "low"),
            Effort::Medium => write!(f, "medium"),
            Effort::High => write!(f, "high"),
            Effort::Max => write!(f, "max"),
        }
    }
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Launch {
            cwd,
            agent,
            effort,
            prompt,
        }) => {
            // Resolve cwd to absolute path
            let cwd = std::fs::canonicalize(&cwd)
                .unwrap_or_else(|_| std::path::PathBuf::from(&cwd))
                .to_string_lossy()
                .to_string();

            // If no --prompt flag, check if stdin is a pipe
            let prompt = prompt.or_else(|| {
                if io::stdin().is_terminal() {
                    None
                } else {
                    let mut buf = String::new();
                    io::stdin().read_to_string(&mut buf).ok()?;
                    let trimmed = buf.trim().to_string();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed)
                    }
                }
            });

            ordis_lib::launch_client(cwd, agent, effort.map(|e| e.to_string()), prompt);
        }
        None => {
            ordis_lib::run();
        }
    }
}
