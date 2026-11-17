//! Native support for Lexi's voice conversations.
//!
//! Android: while a voice conversation is active, switches to voice-call audio mode (hardware
//! echo cancellation, loudspeaker unless a headset is connected), points the volume keys at
//! the call stream, and runs a microphone foreground service so the conversation survives
//! switching apps or locking the screen. Other platforms: no-ops.

use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "dev.lexi.voice";

struct LexiVoice<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> LexiVoice<R> {
    #[cfg(target_os = "android")]
    fn call(&self, method: &str) -> Result<(), String> {
        self.handle
            .run_mobile_plugin::<serde::de::IgnoredAny>(method, ())
            .map(|_| ())
            .map_err(|err| err.to_string())
    }

    #[cfg(not(target_os = "android"))]
    fn call(&self, _method: &str) -> Result<(), String> {
        Ok(())
    }
}

#[tauri::command]
fn start_session<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.state::<LexiVoice<R>>().call("startSession")
}

#[tauri::command]
fn stop_session<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.state::<LexiVoice<R>>().call("stopSession")
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("lexi-voice")
        .invoke_handler(tauri::generate_handler![start_session, stop_session])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let voice = LexiVoice {
                handle: api.register_android_plugin(PLUGIN_IDENTIFIER, "VoicePlugin")?,
            };
            #[cfg(not(target_os = "android"))]
            let voice = {
                let _ = api;
                LexiVoice::<R> {
                    _runtime: std::marker::PhantomData,
                }
            };
            app.manage(voice);
            Ok(())
        })
        .build()
}
