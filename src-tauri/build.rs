fn main() {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        std::fs::create_dir_all("resources").ok();
        for t in ["aarch64-apple-darwin", "x86_64-apple-darwin"] {
            Command::new("cargo").args(["build", "--release", "--target", t, "--manifest-path", "askpass/Cargo.toml"]).status().unwrap();
        }
        Command::new("lipo").args(["-create", "-output", "resources/askpass", "target/aarch64-apple-darwin/release/askpass", "target/x86_64-apple-darwin/release/askpass"]).status().unwrap();
    }
    tauri_build::build();
}
