use crate::protocol::{CodexConfig, ConnectionConfig};
use crate::services::{codex, session, ssh};
use crate::state::CodexState;
use tauri::{AppHandle, State};
use std::fs;

// Re-export types for external use
pub use crate::services::session::Conversation;

#[tauri::command]
pub async fn load_sessions_from_disk() -> Result<Vec<Conversation>, String> {
    session::load_sessions_from_disk().await
}

#[tauri::command]
pub async fn start_codex_session(
    app: AppHandle,
    state: State<'_, CodexState>,
    session_id: String,
    config: CodexConfig,
) -> Result<(), String> {
    log::info!("Starting codex session: {}", session_id);
    codex::start_codex_session(app, state, session_id, config).await
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, CodexState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    codex::send_message(state, session_id, message).await
}

#[tauri::command]
pub async fn approve_execution(
    state: State<'_, CodexState>,
    session_id: String,
    approval_id: String,
    approved: bool,
) -> Result<(), String> {
    codex::approve_execution(state, session_id, approval_id, approved).await
}

#[tauri::command]
pub async fn stop_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    codex::stop_session(state, session_id).await
}

#[tauri::command]
pub async fn pause_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    codex::pause_session(state, session_id).await
}

#[tauri::command]
pub async fn close_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    codex::close_session(state, session_id).await
}

#[tauri::command]
pub async fn get_running_sessions(state: State<'_, CodexState>) -> Result<Vec<String>, String> {
    codex::get_running_sessions(state).await
}

#[tauri::command]
pub async fn check_codex_version() -> Result<String, String> {
    codex::check_codex_version().await
}

#[tauri::command]
pub async fn test_ssh_connection(conn: ConnectionConfig) -> Result<String, String> {
    ssh::SshProcess::test_connection(&conn)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session_file(file_path: String) -> Result<(), String> {
    session::delete_session_file(file_path).await
}

#[tauri::command]
pub async fn get_latest_session_id() -> Result<Option<String>, String> {
    session::get_latest_session_id().await
}

#[tauri::command]
pub async fn get_session_files() -> Result<Vec<String>, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let sessions_dir = home.join(".codex").join("sessions");
    
    if !sessions_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut session_files = Vec::new();
    
    // Walk through year/month/day directories
    if let Ok(entries) = fs::read_dir(&sessions_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                let year_path = entry.path();
                if let Ok(month_entries) = fs::read_dir(&year_path) {
                    for month_entry in month_entries.flatten() {
                        if month_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                            let month_path = month_entry.path();
                            if let Ok(day_entries) = fs::read_dir(&month_path) {
                                for day_entry in day_entries.flatten() {
                                    if day_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                                        let day_path = day_entry.path();
                                        if let Ok(file_entries) = fs::read_dir(&day_path) {
                                            for file_entry in file_entries.flatten() {
                                                if let Some(filename) = file_entry.file_name().to_str() {
                                                    if filename.ends_with(".jsonl") {
                                                        session_files.push(file_entry.path().to_string_lossy().to_string());
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
            }
        }
    }
    
    Ok(session_files)
}

#[tauri::command]
pub async fn read_session_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read session file: {}", e))
}

#[tauri::command]
pub async fn read_history_file() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let history_path = home.join(".codex").join("history.jsonl");
    
    if !history_path.exists() {
        return Ok(String::new());
    }
    
    fs::read_to_string(&history_path).map_err(|e| format!("Failed to read history file: {}", e))
}
