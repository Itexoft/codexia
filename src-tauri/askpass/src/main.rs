use std::env;
fn main() {
    if let Ok(p) = env::var("APP_SSH_PASS") { print!("{p}"); }
}
