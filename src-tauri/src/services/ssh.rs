#<<<<<<< codex/integrate-logging-with-file-output
use tokio::process::Command;

pub async fn start_ssh_session(id: String, address: String) -> Result<(), String> {
    log::info!("start {}", id);
    let output = Command::new("ssh").arg(address).arg("exit").output().await;
    match output {
        Ok(o) if o.status.success() => {
            log::info!("ok {}", id);
            Ok(())
        }
        Ok(o) => {
            log::error!("error {} {}", id, String::from_utf8_lossy(&o.stderr));
            Err("ssh failed".into())
        }
        Err(e) => {
            log::error!("error {} {}", id, e);
            Err(e.to_string())
        }
    }
}

pub async fn disconnect_ssh_session(id: String) {
    log::info!("disconnect {}", id);
#=======
use anyhow::{anyhow, Result};
#[cfg(target_os = "macos")]
use std::process::Stdio;
#[cfg(target_os = "macos")]
use tokio::process::Command;
use crate::protocol::CodexConfig;
use crate::codex_client::ProcessHandle;

pub struct SshProcess;

impl SshProcess {
    #[cfg(target_os = "macos")]
    pub fn spawn(config: &CodexConfig) -> Result<ProcessHandle> {
        let conn = config.connection.as_ref().ok_or_else(|| anyhow!("missing connection config"))?;
        let target = if conn.user.is_empty() { conn.host.clone() } else { format!("{}@{}", conn.user, conn.host) };
        let mut cmd = Command::new("/usr/bin/ssh");
        cmd.arg("-T").arg(target).arg("codex").arg("proto");
        let mut child = cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
        let stdin = child.stdin.take().ok_or_else(|| anyhow!("stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("stdout"))?;
        Ok(ProcessHandle { child, stdin, stdout })
    }

    #[cfg(not(target_os = "macos"))]
    pub fn spawn(_config: &CodexConfig) -> Result<ProcessHandle> {
        Err(anyhow!("platform not supported"))
    }
#>>>>>>> main
}
