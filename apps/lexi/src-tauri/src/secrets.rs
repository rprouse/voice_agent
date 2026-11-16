//! Secrets (the ElevenLabs API key) in the OS credential store via keyring-core.
//! Windows: Credential Manager. Android (Stage 2) will register its own store.

use keyring_core::{Entry, Error};

const SERVICE: &str = "dev.lexi.app";
/// Only these names can be read or written from the webview.
const ALLOWED: &[&str] = &["elevenlabs"];

/// Registers the platform credential store. Call once before any command runs.
pub fn init() {
    #[cfg(target_os = "windows")]
    match windows_native_keyring_store::Store::new() {
        Ok(store) => keyring_core::set_default_store(store),
        Err(err) => eprintln!("Credential store unavailable: {err}"),
    }
}

fn entry(name: &str) -> Result<Entry, String> {
    if !ALLOWED.contains(&name) {
        return Err(format!("Unknown secret: {name}"));
    }
    Entry::new(SERVICE, name).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_secret(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn set_secret(name: String, value: String) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("Secret is empty".into());
    }
    entry(&name)?
        .set_password(value)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_secret(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}
