fn main() {
    #[cfg(not(target_os = "macos"))]
    {
        std::fs::create_dir_all("resources").ok();
        std::fs::write("resources/askpass", []).ok();
    }
    #[cfg(target_os = "macos")]
    {
        use std::{env, fs, path::Path, process::Command};
        fs::create_dir_all("resources").ok();
        let target = env::var("TARGET").unwrap();
        Command::new("cargo")
            .args([
                "build",
                "--release",
                "--target",
                &target,
                "--target-dir",
                "target",
                "--manifest-path",
                "askpass/Cargo.toml",
            ])
            .status()
            .unwrap();
        let arm = Path::new("target/aarch64-apple-darwin/release/askpass");
        let x86 = Path::new("target/x86_64-apple-darwin/release/askpass");
        if arm.exists() && x86.exists() {
            Command::new("lipo")
                .args([
                    "-create",
                    "-output",
                    "resources/askpass",
                    arm.to_str().unwrap(),
                    x86.to_str().unwrap(),
                ])
                .status()
                .unwrap();
        } else {
            let src = if arm.exists() { arm } else { x86 };
            fs::copy(src, "resources/askpass").unwrap();
        }
    }
    tauri_build::build();
}
