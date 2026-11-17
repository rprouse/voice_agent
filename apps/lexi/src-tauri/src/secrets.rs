//! Secrets (the ElevenLabs API key) in the OS credential store via keyring-core.
//! Windows: Credential Manager. Android: SharedPreferences encrypted with an Android
//! Keystore key (android-native-keyring-store).

use std::sync::OnceLock;

use keyring_core::{Entry, Error};

const SERVICE: &str = "dev.lexi.app";
/// Only these names can be read or written from the webview.
const ALLOWED: &[&str] = &["elevenlabs"];

/// Registers the platform credential store on first use. On Android this must run after
/// Tauri has initialised the NDK context, so it isn't done at startup.
fn ensure_store() -> Result<(), String> {
    static STORE: OnceLock<Result<(), String>> = OnceLock::new();
    STORE
        .get_or_init(|| {
            #[cfg(target_os = "windows")]
            let store = windows_native_keyring_store::Store::new();
            #[cfg(target_os = "android")]
            let store = android_native_keyring_store::Store::new();
            #[cfg(any(target_os = "windows", target_os = "android"))]
            // The closure lets Arc<Store> coerce to the trait object set_default_store takes.
            #[allow(clippy::redundant_closure)]
            return store
                .map(|store| keyring_core::set_default_store(store))
                .map_err(|err| format!("Credential store unavailable: {err}"));
            #[cfg(not(any(target_os = "windows", target_os = "android")))]
            Err("No credential store for this platform yet".to_string())
        })
        .clone()
}

fn entry(name: &str) -> Result<Entry, String> {
    if !ALLOWED.contains(&name) {
        return Err(format!("Unknown secret: {name}"));
    }
    ensure_store()?;
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
