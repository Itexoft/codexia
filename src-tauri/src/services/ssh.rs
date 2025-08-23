use crate::codex_client::ProcessHandle;
use crate::protocol::{CodexConfig, ConnectionConfig};
use anyhow::{anyhow, Result};
#[cfg(target_os = "macos")]
use std::process::Stdio;
#[cfg(target_os = "macos")]
use std::time::Duration;
#[cfg(target_os = "macos")]
use tokio::process::Command;
#[cfg(target_os = "macos")]
use tokio::time::timeout;

pub struct SshProcess;

impl SshProcess {
    #[cfg(target_os = "macos")]
    pub fn spawn(config: &CodexConfig) -> Result<ProcessHandle> {
        let conn = config.connection.as_ref().ok_or_else(|| anyhow!("missing connection config"))?;
        let target = if conn.user.is_empty() { conn.host.clone() } else { format!("{}@{}", conn.user, conn.host) };
        let mut cmd = Command::new("/usr/bin/ssh");
        cmd.arg("-T").arg("-o").arg("BatchMode=yes");
        if let Some(port) = conn.port { cmd.arg("-p").arg(port.to_string()); }
        if let Some(key) = &conn.key_path { if !key.is_empty() { cmd.arg("-i").arg(key); } }
        cmd.arg(&target).arg("codex");
        if let Some(args) = &config.custom_args { cmd.args(args); }
        cmd.arg("proto");
        let mut child = cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
        let stdin = child.stdin.take().ok_or_else(|| anyhow!("stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("stdout"))?;
        Ok(ProcessHandle { child, stdin, stdout })
    }

    #[cfg(not(target_os = "macos"))]
    pub fn spawn(_config: &CodexConfig) -> Result<ProcessHandle> {
        Err(anyhow!("not yet implemented"))
    }

    #[cfg(target_os = "macos")]
    pub async fn test_connection(conn: &ConnectionConfig) -> Result<String> {
        let target = if conn.user.is_empty() { conn.host.clone() } else { format!("{}@{}", conn.user, conn.host) };
        let mut cmd = Command::new("/usr/bin/ssh");
        cmd.arg("-T").arg("-o").arg("BatchMode=yes");
        if let Some(port) = conn.port { cmd.arg("-p").arg(port.to_string()); }
        if let Some(key) = &conn.key_path { if !key.is_empty() { cmd.arg("-i").arg(key); } }
        cmd.arg(&target).arg("echo").arg("ok");
        let output = timeout(Duration::from_secs(5), cmd.output()).await.map_err(|_| anyhow!("timeout"))??;
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if s == "ok" { return Ok(s); }
        }
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        if err.to_lowercase().contains("permission denied") {
            Err(anyhow!("permission denied (publickey)"))
        } else {
            Err(anyhow!("host unreachable"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub async fn test_connection(_conn: &ConnectionConfig) -> Result<String> {
        Err(anyhow!("not yet implemented"))
    }
}
