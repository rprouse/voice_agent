# Stage 0 voice spike results

Spike: `spikes/voice` (Tauri 2.12, `@elevenlabs/client` 1.36.1). Agent: Lexi, ElevenLabs-hosted LLM (DeepSeek).

## Windows 11 (WebView2 157) — Nov 15, 2026: pass

Mic test, WebRTC and WebSocket conversations, and interrupting the agent all worked as expected. The log wasn't saved, so connect time and memory use were not recorded.

## Android (Galaxy S23 Ultra, Android WebView) — Nov 15, 2026: pass with native additions (WebRTC only)

| Check | Result |
| --- | --- |
| "Test mic" shows a moving level meter | Pass (runtime permission prompt works) |
| WebRTC conversation with headphones | Pass |
| WebSocket conversation with headphones | Pass |
| Echo with the phone speaker | **Fail.** WebSocket: the agent interrupts itself almost at once and stops. WebRTC: the agent hears itself and talks to itself |
| Switching apps mid-conversation (headphones) | **Partial.** Kept speaking and listening for about 10 s, then stopped. The connection survived, and the conversation continued on returning to the app |
| Screen lock | Not tested |

### Analysis

- **Echo:** the ElevenLabs SDK already asks for `echoCancellation`, `noiseSuppression` and `autoGainControl`, so the WebView's echo cancellation is not removing the speaker output. The likely cause is that Android isn't in voice-communication audio mode (`AudioManager.MODE_IN_COMMUNICATION`), which is what turns on the phone's hardware echo cancellation for calls. Native WebRTC apps, including ElevenLabs' React Native SDK, switch to this mode; a WebView does not.
- **Background:** Android pauses the app's audio and timers soon after it leaves the foreground. Keeping a conversation alive needs a foreground service (`FOREGROUND_SERVICE_MICROPHONE`) with a persistent notification. React Native would need the same.
- Both fixes are small native (Kotlin) additions to the Tauri Android project, not a reason to change frameworks yet.

### Round 2 (Kotlin bridge: voice-call audio mode + foreground service)

| Check | Result |
| --- | --- |
| WebRTC, phone speaker, voice-call mode on | Pass, no self-interruption |
| WebRTC, phone speaker, voice-call mode off | Pass (so call mode wasn't the deciding factor; the foreground service was on in both runs) |
| WebRTC, switching apps / screen lock, foreground service on | Pass |
| WebSocket, phone speaker | **Fail**, interrupts itself immediately and the conversation ends. Echo cancellation evidently covers only WebRTC's audio path |
| Volume | Too loud regardless of phone volume settings. WebRTC plays on the voice-call stream, which Samsung's settings screen doesn't expose. **Fixed in round 3:** the volume keys control the call stream during a session, and an in-app slider (SDK `setVolume`) works. Both confirmed on the phone |

**Decision so far:** use WebRTC only on Android. Tauri is viable on mobile with a small native layer (foreground service, audio/volume handling).

### Follow-up in Stage 2 (the real app)

Setting `MODE_IN_COMMUNICATION` and the loudspeaker as communication device from the plugin made Lexi silent (the agent could still hear the user), although routing and volume looked correct in `dumpsys audio`. With the plugin only running the foreground service and pointing the volume keys at the call stream, speaker echo, background and volume all pass on the Galaxy S23 Ultra. The WebView's WebRTC stack manages call audio itself.

### Not recorded

Connection times, and whether a private agent (API key → token) works on Android.

## Build notes

- Rust on Windows needs Visual Studio's "Desktop development with C++" workload (MSVC tools and Windows SDK).
- A terminal opened before a Visual Studio update keeps stale `VCToolsInstallDir`/`VCToolsVersion` variables (set by `VsDevCmd.bat` in the PowerShell profile), and Rust then reports `link.exe not found`. Open a new terminal.
- Android: the Tauri template targets compileSdk 37 and Gradle 9.6.1 (JDK 25 is fine). The NDK is found through `NDK_HOME`.
- Android SDK: a user-owned SDK at `C:\Android\sdk` (not Visual Studio's admin-only copy), so Gradle can install the packages it needs. After changing SDK paths, run `gradlew --stop` and delete `gen/android/.gradle/configuration-cache`.
- `tauri android dev` on a physical phone showed `ERR_CONNECTION_REFUSED` for `http://tauri.localhost/`, even though the phone could reach the Vite server. Not solved; the self-contained `tauri android build --debug --apk` plus `adb install` works.
