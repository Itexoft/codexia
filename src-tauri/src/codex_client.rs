use anyhow::Result;
use serde_json;
use std::process::Stdio;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command, ChildStdin, ChildStdout};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::config::{read_model_providers, read_profiles};
use crate::protocol::{CodexConfig, Event, InputItem, Op, Submission};
use crate::utils::codex_discovery::discover_codex_command;

pub struct ProcessHandle {
    pub child: Child,
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
}

pub struct LocalProcess;

impl LocalProcess {
    pub async fn spawn(config: &CodexConfig) -> Result<ProcessHandle> {
        let (command, args): (String, Vec<String>) =
            if let Some(configured_path) = &config.codex_path {
                (configured_path.clone(), vec![])
            } else if let Some(path) = discover_codex_command() {
                (path.to_string_lossy().to_string(), vec![])
            } else {
                return Err(anyhow::anyhow!("Could not find codex executable"));
            };

        let mut cmd = Command::new(&command);
        if !args.is_empty() {
            cmd.args(&args);
        }
        cmd.arg("proto");

        let mut env_vars = HashMap::new();

        if let Some(api_key) = &config.api_key {
            if !api_key.is_empty() {
                if let Ok(providers) = read_model_providers().await {
                    let provider_config = providers.get(&config.provider)
                        .or_else(|| providers.get(&config.provider.to_lowercase()));

                    if let Some(provider_config) = provider_config {
                        if !provider_config.env_key.is_empty() {
                            env_vars.insert(provider_config.env_key.clone(), api_key.clone());
                        }
                    }
                } else {
                    let env_var_name = match config.provider.as_str() {
                        "gemini" => "GEMINI_API_KEY",
                        "openai" => "OPENAI_API_KEY",
                        "openrouter" => "OPENROUTER_API_KEY",
                        "ollama" => "OLLAMA_API_KEY",
                        _ => "OPENAI_API_KEY",
                    };
                    env_vars.insert(env_var_name.to_string(), api_key.clone());
                }
            }
        }

        if !config.provider.is_empty() && config.provider != "openai" {
            if let Ok(providers) = read_model_providers().await {
                if let Ok(profiles) = read_profiles().await {
                    let provider_config = providers.get(&config.provider)
                        .or_else(|| providers.get(&config.provider.to_lowercase()));

                    if let Some(provider_config) = provider_config {
                        cmd.arg("-c").arg(format!("model_provider={}", provider_config.name));

                        if !provider_config.base_url.is_empty() {
                            cmd.arg("-c").arg(format!("base_url={}", provider_config.base_url));
                        }

                        let profile = profiles.get(&config.provider)
                            .or_else(|| profiles.get(&config.provider.to_lowercase()));

                        let model_to_use = if let Some(profile) = profile {
                            &profile.model
                        } else {
                            &config.model
                        };

                        if !model_to_use.is_empty() {
                            cmd.arg("-c").arg(format!("model={}", model_to_use));
                        }
                    } else {
                        if config.use_oss {
                            cmd.arg("-c").arg("model_provider=oss");
                        } else {
                            cmd.arg("-c").arg(format!("model_provider={}", config.provider));
                        }

                        if !config.model.is_empty() {
                            cmd.arg("-c").arg(format!("model={}", config.model));
                        }
                    }
                }
            } else {
                if config.use_oss {
                    cmd.arg("-c").arg("model_provider=oss");
                } else {
                    cmd.arg("-c").arg(format!("model_provider={}", config.provider));
                }

                if !config.model.is_empty() {
                    cmd.arg("-c").arg(format!("model={}", config.model));
                }
            }
        } else {
            if config.use_oss {
                cmd.arg("-c").arg("model_provider=oss");
            }

            if !config.model.is_empty() {
                cmd.arg("-c").arg(format!("model={}", config.model));
            }
        }

        if !config.approval_policy.is_empty() {
            cmd.arg("-c").arg(format!("approval_policy={}", config.approval_policy));
        }

        if !config.sandbox_mode.is_empty() {
            let sandbox_config = match config.sandbox_mode.as_str() {
                "read-only" => "sandbox_mode=read-only".to_string(),
                "workspace-write" => "sandbox_mode=workspace-write".to_string(),
                "danger-full-access" => "sandbox_mode=danger-full-access".to_string(),
                _ => "sandbox_mode=workspace-write".to_string(),
            };
            cmd.arg("-c").arg(sandbox_config);
        }

        cmd.arg("-c").arg("show_raw_agent_reasoning=true");

        if !config.working_directory.is_empty() {
            cmd.arg("-c").arg(format!("cwd={}", config.working_directory));
        }

        if let Some(custom_args) = &config.custom_args {
            for arg in custom_args {
                cmd.arg(arg);
            }
        }

        for (key, value) in &env_vars {
            cmd.env(key, value);
        }

        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(&config.working_directory)
            .spawn()?;

        let stdin = child.stdin.take().expect("Failed to open stdin");
        let stdout = child.stdout.take().expect("Failed to open stdout");

        Ok(ProcessHandle { child, stdin, stdout })
    }
}

pub struct CodexClient {
    #[allow(dead_code)]
    app: AppHandle,
    session_id: String,
    process: Option<Child>,
    stdin_tx: Option<mpsc::UnboundedSender<String>>,
    #[allow(dead_code)]
    config: CodexConfig,
}

impl CodexClient {
    pub async fn new(app: &AppHandle, session_id: String, config: CodexConfig, handle: ProcessHandle) -> Result<Self> {
        log::debug!("Creating CodexClient for session: {}", session_id);

        let process = handle.child;
        let stdin = handle.stdin;
        let stdout = handle.stdout;

        let (stdin_tx, mut stdin_rx) = mpsc::unbounded_channel::<String>();

        let mut stdin_writer = stdin;
        tokio::spawn(async move {
            while let Some(line) = stdin_rx.recv().await {
                if stdin_writer.write_all(line.as_bytes()).await.is_err() {
                    break;
                }
                if stdin_writer.write_all(b"\n").await.is_err() {
                    break;
                }
                if stdin_writer.flush().await.is_err() {
                    break;
                }
            }
        });

        let app_clone = app.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(event) = serde_json::from_str::<Event>(&line) {
                    let _ = app_clone.emit("codex-events", &event);
                }
            }
        });

        let client = Self {
            app: app.clone(),
            session_id,
            process: Some(process),
            stdin_tx: Some(stdin_tx),
            config: config.clone(),
        };

        Ok(client)
    }

    async fn send_submission(&self, submission: Submission) -> Result<()> {
        if let Some(stdin_tx) = &self.stdin_tx {
            let json = serde_json::to_string(&submission)?;
            stdin_tx.send(json)?;
        }
        Ok(())
    }

    pub async fn send_user_input(&self, message: String) -> Result<()> {
        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::UserInput {
                items: vec![InputItem::Text { text: message }],
            },
        };

        self.send_submission(submission).await
    }

    pub async fn send_exec_approval(&self, approval_id: String, approved: bool) -> Result<()> {
        let decision = if approved { "allow" } else { "deny" }.to_string();

        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::ExecApproval {
                id: approval_id,
                decision,
            },
        };

        self.send_submission(submission).await
    }

    #[allow(dead_code)]
    pub async fn send_patch_approval(&self, approval_id: String, approved: bool) -> Result<()> {
        let decision = if approved { "allow" } else { "deny" }.to_string();

        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::PatchApproval {
                id: approval_id,
                decision,
            },
        };

        self.send_submission(submission).await
    }

    pub async fn interrupt(&self) -> Result<()> {
        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::Interrupt,
        };

        self.send_submission(submission).await
    }

    pub async fn close_session(&mut self) -> Result<()> {
        log::debug!("Closing session: {}", self.session_id);

        // Send shutdown command to codex (graceful shutdown)
        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::Shutdown,
        };

        if let Err(e) = self.send_submission(submission).await {
            log::error!("Failed to send shutdown command: {}", e);
        }

        // Close stdin channel to signal end of input
        if let Some(stdin_tx) = self.stdin_tx.take() {
            drop(stdin_tx);
            log::debug!("Stdin channel closed");
        }

        // Wait a moment for graceful shutdown, then terminate process if needed
        if let Some(mut process) = self.process.take() {
            if let Some(pid) = process.id() {
                log::debug!("Terminating codex process with PID: {}", pid);
            }

            // Give the process a moment to shutdown gracefully
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            // Check if process is still running, then kill if necessary
            match process.try_wait() {
                Ok(Some(status)) => {
                    log::debug!("Codex process exited with status: {}", status);
                }
                Ok(None) => {
                    // Process still running, kill it
                    log::debug!("Process still running, terminating...");
                    if let Err(e) = process.kill().await {
                        log::error!("Failed to kill codex process: {}", e);
                    } else {
                        log::debug!("Codex process terminated successfully");
                    }
                }
                Err(e) => {
                    log::error!("Error checking process status: {}", e);
                    // Try to kill anyway
                    if let Err(e) = process.kill().await {
                        log::error!("Failed to kill codex process: {}", e);
                    }
                }
            }
        }

        log::debug!("Session {} closed", self.session_id);
        Ok(())
    }
    
    #[allow(dead_code)]
    pub async fn shutdown(&mut self) -> Result<()> {
        self.close_session().await
    }

    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        self.process.is_some() && self.stdin_tx.is_some()
    }
}
