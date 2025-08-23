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
}
