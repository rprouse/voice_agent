# Lexi — Personal Voice Agent Spec

Revised Nov 15, 2026 · @Rob Prouse (supersedes the Nov 14 CLI-first scaffolding spec)

## Overview

Lexi is a personal AI agent you can type or talk to, on Windows desktop and Android (iOS later). Both text and voice go through one ElevenLabs agent, also named Lexi, whose LLM is chosen in the ElevenLabs dashboard (currently an ElevenLabs-hosted model). MCP tools come later. Built in TypeScript as a Tauri 2 app, with the logic in a platform-neutral `core` package.

The app is for one user (the author). The ElevenLabs agent has authentication on; the app holds an ElevenLabs API key in the OS keychain and exchanges it for short-lived conversation credentials. No backend or token server.

Stage 0 proved voice works in a Tauri webview on Windows and Android: see [stage0-results.md](stage0-results.md).

## Decisions and why

| Decision | Reason |
| --- | --- |
| Tauri 2 instead of Electron + Expo | One web UI for desktop and mobile; uses the system WebView2 instead of bundling Chromium; no separate React Native app. Proven in Stage 0 |
| ElevenLabs agent for both text and voice (OpenRouter dropped for now) | One backend, one agent configuration (prompt, LLM, tools) for both modes. The SDK supports text-only sessions with streamed replies. Model choice and pricing are tied to ElevenLabs; OpenRouter can come back as the agent's custom LLM without app changes |
| WebRTC for voice, WebSocket only for text | WebSocket voice echoed on the Android speaker in Stage 0; WebRTC passed |
| Transcript lives in `core` | Each ElevenLabs conversation is separate (text session, voice session, reconnect after a timeout). Core keeps one transcript and primes each new conversation with recent context (`sendContextualUpdate`), so switching modes doesn't lose the thread |
| Platform-neutral `core` (no Node, no Tauri) | Runs in the webview on desktop and mobile and is testable in Vitest. Platform services (secrets, HTTP without CORS, Android audio) are injected |
| Native Android layer (`apps/lexi/plugins/lexi-voice`) | A local Tauri plugin: a microphone foreground service keeps voice running in the background, and the volume keys control the call stream WebRTC plays on. It does not change the audio mode or output device: the WebView manages call audio and echo cancellation. `MainActivity` turns off WebView's autoplay gesture requirement, without which Lexi's voice was intermittently silent |
| Secrets via the Rust `keyring` crate | Windows Credential Manager on desktop through two small Tauri commands; Android Keystore in Stage 2. No third-party Tauri plugin |
| Typed tiny event emitter, not Node `EventEmitter` | Not available in the webview; `on()` returns an unsubscribe function |
| TypeScript 6.0.x, not 7.x | typescript-eslint supports TypeScript `<6.1` |
| React + Vite for the UI, without `@elevenlabs/react` | The UI talks to `core`, never to the SDK directly |

## Stages

| Stage | Delivers |
| --- | --- |
| 0. Voice spike | Done. Tauri + `@elevenlabs/client` on Windows and Android |
| 1. Core + desktop app | `packages/core` (session, transcript, auth, typed events, tests) and `apps/lexi` (Tauri + React): type or talk to Lexi, switch modes without losing context, settings for agent ID and API key (Credential Manager), volume |
| 2. Android | The same app on Android: native layer from the spike as a Tauri plugin, Keystore secrets, mobile layout |
| 3. Local MCP tools | Desktop: stdio MCP servers started via the Tauri shell plugin; their tools registered with the agent as ElevenLabs client tools, so they work in both text and voice. Mobile: remote servers only |
| 4. Remote MCP + OAuth | MCP SDK OAuth client; browser sign-in returns by deep link or localhost callback; tokens in the OS keychain. Compare with ElevenLabs' built-in server-side MCP support first |

## Repository layout

```
voice_agent/
  package.json            # workspace root: build, dev, test, lint, typecheck
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.js
  CLAUDE.md
  packages/
    core/                 # platform-neutral TypeScript, consumed as source
      src/
        index.ts          # public API only
        session/          # LexiSession, transcript, context priming
        agent/            # AgentTransport interface + ElevenLabs adapter
        auth/             # credential exchange (API key -> token / signed URL)
        config/           # zod schema
        errors.ts         # AppError with codes
        events.ts         # typed emitter
      test/
  apps/
    lexi/                 # Tauri 2 + React + Vite; desktop now, Android in Stage 2
      src/
      src-tauri/
  spikes/
    voice/                # Stage 0, kept for reference
```

## Core interfaces (shapes, names may change)

```ts
type Mode = 'text' | 'voice';

interface CredentialProvider {
  get(name: 'elevenlabs'): Promise<string | undefined>;
}

// Exchanges the API key for a conversation credential (token for WebRTC voice,
// signed URL for WebSocket text). Uses an injected fetch (Tauri HTTP plugin).
interface AgentAuth {
  credentialsFor(mode: Mode, signal?: AbortSignal): Promise<AgentCredential>;
}

// Thin seam over @elevenlabs/client so the session is testable with a fake.
interface AgentTransport {
  connect(opts: { mode: Mode; credential: AgentCredential; handlers: TransportHandlers }): Promise<AgentConnection>;
}

interface AgentConnection {
  sendText(text: string): void;
  sendContext(text: string): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  end(): Promise<void>;
}

class LexiSession {
  constructor(opts: { auth: AgentAuth; transport: AgentTransport; config: AppConfig });
  readonly transcript: readonly TranscriptEntry[];
  send(text: string): Promise<void>;     // starts a text conversation if none is open
  startVoice(): Promise<void>;
  stopVoice(): Promise<void>;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  reset(): Promise<void>;                // ends any conversation, clears the transcript
  on<E extends keyof SessionEvents>(e: E, fn: SessionEvents[E]): () => void;
}

type SessionEvents = {
  'state': (s: { connection: 'idle' | 'connecting' | 'connected'; mode: Mode | null }) => void;
  'transcript': (entries: readonly TranscriptEntry[]) => void;   // includes streaming partials
  'voice:activity': (a: 'listening' | 'speaking') => void;
  'error': (err: AppError) => void;
};
```

Rules:

- `core` has no Node APIs, Tauri imports, `process`, `console` or filesystem access. Enforced by `"types": []` in its tsconfig and ESLint rules.
- Network calls take an `AbortSignal`.
- Errors are typed (`AppError` with a `code`, e.g. `missing-api-key`, `auth-failed`, `mic-denied`, `network`, `disconnected`) so the UI words them its own way.
- The transcript lives in `LexiSession`; ElevenLabs conversations are disposable.

## Configuration

Validated with zod in `core`; stored by the app with the Tauri store plugin. The API key is kept apart in the OS keychain and never logged.

```json
{
  "agentId": "agent_...",
  "volume": 0.5,
  "contextTurns": 20
}
```

## Tooling (versions checked Nov 15, 2026)

| Package | Version |
| --- | --- |
| Node | 26.x installed; engines `>=24` |
| pnpm | 12.x |
| typescript | 6.0.3 |
| zod | 4.6.7 |
| vitest | 5.1.0 |
| eslint / @eslint/js | 10.15.0 / 10.0.1 |
| typescript-eslint | 8.72.2 |
| eslint-plugin-react-hooks | 7.1.1 |
| prettier / eslint-config-prettier | 3.10.1 / 10.1.8 |
| globals | 17.14.0 |
| react / react-dom | 19.3.x |
| vite / @vitejs/plugin-react | 8.3.8 / 6.3.0 |
| @tauri-apps/cli / @tauri-apps/api | 2.12.4 |
| @tauri-apps/plugin-http / plugin-store | 2.9.0 / 2.5.1 |
| keyring (Rust crate) | 4.2.0 |
| @elevenlabs/client | 1.36.1 |
| @modelcontextprotocol/sdk | 1.32.2 (Stage 3) |

## Testing

- `core` is tested with Vitest using a fake `AgentTransport` and fake `fetch`: transcript handling, streaming partials, context priming, mode switching, reconnect after disconnect, error mapping.
- The app gets a build check and a manual test checklist per stage; voice can't be tested automatically.

## Open questions

- Agent overrides: the "First message" override must be allowed (Security → Overrides); Lexi sends an empty first message when continuing a conversation. Text-only sessions didn't need an override in testing so far. Setup steps are in the README.
- ElevenLabs ends idle conversations; how long a text session can sit idle decides how often core reconnects and re-primes context.
- iOS needs a paid Apple developer account, or re-signing every 7 days. Android first.
- Windows speaker echo not yet tested (Stage 0 used headphones).
