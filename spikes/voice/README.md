# Stage 0 voice spike (throwaway)

Proves whether ElevenLabs voice works inside a Tauri webview on Windows and Android. Not production code. Delete it once Stage 2 exists.

## Run

```powershell
pnpm install
pnpm tauri dev               # Windows
pnpm tauri android init      # once
pnpm tauri android dev       # Android device or emulator (USB debugging on)
```

Enter an agent ID. Add an ElevenLabs API key only if the agent has authentication turned on. The key is kept in the webview's localStorage, which is acceptable for a spike only.

## Go/no-go checklist

Record the results in `docs/stage0-results.md`.

| Check | Windows | Android |
| --- | --- | --- |
| "Test mic" shows a moving level meter | | |
| WebRTC conversation: agent hears you and replies aloud | | |
| WebSocket conversation works | | |
| Private agent (API key → token) works | | |
| Time from Start to "connected" (from the log) | | |
| Barge-in: interrupting the agent stops its speech | | |
| Echo with speakers (no headphones) | | |
| Conversation survives switching apps or locking the screen | n/a | |
| Idle memory use of the app (Task Manager / Android Studio profiler) | | |
