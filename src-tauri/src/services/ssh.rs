use crate::codex_client::ProcessHandle;
use crate::protocol::CodexConfig;
use anyhow::{anyhow, Result};
#[cfg(target_os = "macos")]
use std::process::Stdio;
#[cfg(target_os = "macos")]
use tokio::process::Command;

pub struct SshProcess;

impl SshProcess {
    #[cfg(target_os = "macos")]
    pub fn spawn(config: &CodexConfig) -> Result<ProcessHandle> {
        let conn = config
            .connection
            .as_ref()
            .ok_or_else(|| anyhow!("missing connection config"))?;
        let target = if conn.user.is_empty() {
            conn.host.clone()
        } else {
            format!("{}@{}", conn.user, conn.host)
        };
        let mut cmd = Command::new("/usr/bin/ssh");
        cmd.arg("-T").arg(target).arg("codex").arg("proto");
        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let stdin = child.stdin.take().ok_or_else(|| anyhow!("stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("stdout"))?;
        Ok(ProcessHandle {
            child,
            stdin,
            stdout,
        })
    }

    #[cfg(not(target_os = "macos"))]
    pub fn spawn(_config: &CodexConfig) -> Result<ProcessHandle> {
        Err(anyhow!("platform not supported"))
    }
}
