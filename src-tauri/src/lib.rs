mod codex_client;
mod commands;
mod config;
mod filesystem;
mod protocol;
mod services;
mod state;
mod utils;

use commands::{
    approve_execution, check_codex_version, close_session, delete_session_file,
    get_latest_session_id, get_running_sessions, get_session_files, load_sessions_from_disk,
    pause_session, read_history_file, read_session_file, send_message, start_codex_session,
    stop_session, test_ssh_connection,
};
use config::{
    add_mcp_server, add_or_update_model_provider, add_or_update_profile, delete_mcp_server,
    delete_profile, get_profile_config, get_project_name, get_provider_config, read_codex_config,
    read_mcp_servers, read_model_providers, read_profiles, update_profile_model,
};
use filesystem::{
    directory_ops::{get_default_directories, read_directory},
    file_analysis::calculate_file_tokens,
    file_io::{read_file, write_file},
    file_parsers::{csv::read_csv_content, pdf::read_pdf_content, xlsx::read_xlsx_content},
    git_diff::get_git_file_diff,
    git_status::get_git_status,
};
use state::CodexState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ctx = tauri::generate_context!();
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("logs".to_string()),
                    },
                ))
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(CodexState::new())
        .invoke_handler(tauri::generate_handler![
            start_codex_session,
            send_message,
            approve_execution,
            stop_session,
            pause_session,
            close_session,
            get_running_sessions,
            load_sessions_from_disk,
            delete_session_file,
            get_latest_session_id,
            get_session_files,
            read_session_file,
            read_history_file,
            check_codex_version,
            test_ssh_connection,
            read_directory,
            get_default_directories,
            calculate_file_tokens,
            read_file,
            write_file,
            read_pdf_content,
            read_csv_content,
            read_xlsx_content,
            get_git_file_diff,
            get_git_status,
            read_codex_config,
            get_project_name,
            read_mcp_servers,
            add_mcp_server,
            delete_mcp_server,
            read_model_providers,
            read_profiles,
            get_provider_config,
            get_profile_config,
            update_profile_model,
            add_or_update_profile,
            delete_profile,
            add_or_update_model_provider,
        ])
        .run(ctx)
        .expect("error while running tauri application");
}
