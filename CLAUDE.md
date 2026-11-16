# Lexi

Personal AI agent you can type or talk to, built as a Tauri 2 app (Windows desktop now, Android next). Text and voice both go through one ElevenLabs agent. The spec is `docs/voice_agent_cli_spec.md`; Stage 0 findings are in `docs/stage0-results.md`.

## Layout

- `packages/core` (`@lexi/core`): platform-neutral TypeScript. Sessions, transcript, agent transport, auth, typed events and errors. Consumed as source; no build step.
- `apps/lexi`: Tauri 2 + React + Vite app. Imports `@lexi/core` through its public `index.ts` only.
- `spikes/voice`: Stage 0 throwaway spike, kept for reference (including its Android Kotlin bridge). Not part of the workspace; don't change it.

## Rules

- **Core boundary:** `core` must run in a webview and in Vitest. No Node APIs, `process`, `console`, DOM globals, storage, Tauri or React imports in `core`. Inject platform services (fetch, secrets, native audio) through interfaces. ESLint enforces this, and core's tsconfig has `"types": []`.
- **Core never imports from `apps/`.** The UI talks to `core`, never to `@elevenlabs/client` directly.
- **TypeScript strict**, no `any` in `core`'s public API. TypeScript stays on 6.0.x (typescript-eslint doesn't support 7.x yet).
- **Tests are required for `core` changes** (Vitest, in `packages/core/test`). Use fakes for the agent transport and fetch; no network in unit tests.
- **Voice uses WebRTC only.** WebSocket voice echoes on Android (see Stage 0 results). WebSocket is fine for text-only sessions.
- **Secrets** (the ElevenLabs API key) live in the OS keychain via Rust commands, never in config files, logs or localStorage. The repo is public: never commit agent IDs, keys or `.env*` files.
- **Dependencies:** pin exact versions and ask before adding new ones.

## Commands (PowerShell, from the repo root)

```powershell
pnpm install
pnpm test          # core unit tests
pnpm lint
pnpm typecheck
pnpm build         # typecheck + Vite build of the app frontend
pnpm dev           # run the desktop app (tauri dev)
```

## Environment notes (Windows 11)

- Package manager is pnpm 12; shell is PowerShell. Use Windows paths in docs and scripts.
- Rust builds need Visual Studio's "Desktop development with C++" workload. If `cargo` reports `link.exe not found`, the terminal has stale `VCToolsInstallDir`/`VCToolsVersion` variables from before a Visual Studio update: open a new terminal.
- Android SDK is a user-owned copy at `C:\Android\sdk` (`ANDROID_HOME`), NDK via `NDK_HOME`. For phone testing use `pnpm tauri android build --debug --apk --target aarch64` and `adb install -r`; `tauri android dev` didn't load on a physical phone.
