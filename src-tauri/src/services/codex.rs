use crate::codex_client::{CodexClient, LocalProcess};
use crate::protocol::CodexConfig;
use super::ssh::SshProcess;
use crate::state::CodexState;
use crate::utils::codex_discovery::discover_codex_command;
use std::process::Command;
use tauri::{AppHandle, State};

// Note: Frontend now properly extracts raw session IDs before calling backend
// so we no longer need complex ID normalization

pub async fn start_codex_session(
    app: AppHandle,
    state: State<'_, CodexState>,
    session_id: String,
    config: CodexConfig,
) -> Result<(), String> {
    log::debug!("Starting session with ID: {}", session_id);

    {
        let sessions = state.sessions.lock().await;
        if sessions.contains_key(&session_id) {
            log::debug!("Session {} already exists, skipping", session_id);
            return Ok(());
        }
    }

    let handle = if config
        .connection
        .as_ref()
        .map(|c| c.connection_type.as_str() == "ssh")
        .unwrap_or(false)
    {
        SshProcess::spawn(&config).map_err(|e| format!("Failed to start Codex session: {}", e))?
    } else {
        LocalProcess::spawn(&config)
            .await
            .map_err(|e| format!("Failed to start Codex session: {}", e))?
    };

    let codex_client = CodexClient::new(&app, session_id.clone(), config, handle)
        .await
        .map_err(|e| format!("Failed to start Codex session: {}", e))?;

    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), codex_client);
        log::debug!("Session {} stored successfully", session_id);
        log::debug!("Total sessions now: {}", sessions.len());
        log::debug!("All session keys: {:?}", sessions.keys().collect::<Vec<_>>());
    }
    Ok(())
}

pub async fn send_message(
    state: State<'_, CodexState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(client) = sessions.get_mut(&session_id) {
        client
            .send_user_input(message)
            .await
            .map_err(|e| format!("Failed to send message: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

pub async fn approve_execution(
    state: State<'_, CodexState>,
    session_id: String,
    approval_id: String,
    approved: bool,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(client) = sessions.get_mut(&session_id) {
        client
            .send_exec_approval(approval_id, approved)
            .await
            .map_err(|e| format!("Failed to send approval: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

pub async fn stop_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let stored_sessions: Vec<String> = sessions.keys().cloned().collect();

    log::debug!("Attempting to interrupt session: {}", session_id);
    log::debug!("Currently stored sessions: {:?}", stored_sessions);

    if let Some(client) = sessions.get(&session_id) {
        log::debug!("Found session, sending interrupt: {}", session_id);
        client
            .interrupt()
            .await
            .map_err(|e| format!("Failed to interrupt session: {}", e))?;
        Ok(())
    } else {
        log::debug!("Session not found: {}", session_id);
        Err("Session not found".to_string())
    }
}

pub async fn pause_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let stored_sessions: Vec<String> = sessions.keys().cloned().collect();

    log::debug!("Attempting to pause session: {}", session_id);
    log::debug!("Currently stored sessions: {:?}", stored_sessions);

    if let Some(client) = sessions.get(&session_id) {
        log::debug!("Found session, sending interrupt (pause): {}", session_id);
        client
            .interrupt()
            .await
            .map_err(|e| format!("Failed to pause session: {}", e))?;
        Ok(())
    } else {
        log::debug!("Session not found: {}", session_id);
        Err("Session not found".to_string())
    }
}

pub async fn close_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(mut client) = sessions.remove(&session_id) {
        client
            .close_session()
            .await
            .map_err(|e| format!("Failed to close session: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

pub async fn get_running_sessions(state: State<'_, CodexState>) -> Result<Vec<String>, String> {
    let sessions = state.sessions.lock().await;
    let session_keys: Vec<String> = sessions.keys().cloned().collect();

    // Debug log to see what sessions are actually stored
    log::debug!("get_running_sessions called - stored sessions: {:?}", session_keys);

    Ok(session_keys)
}

pub async fn check_codex_version() -> Result<String, String> {
    let path = match discover_codex_command() {
        Some(p) => p.to_string_lossy().to_string(),
        None => "codex".to_string(),
    };

    let output = Command::new(&path)
        .arg("-V")
        .output()
        .map_err(|e| format!("Failed to execute codex binary: {}", e))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(version)
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("Codex binary returned error: {}", err_msg))
    }
}
