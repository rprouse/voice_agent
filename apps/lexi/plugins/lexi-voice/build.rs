const COMMANDS: &[&str] = &["start_session", "stop_session"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
