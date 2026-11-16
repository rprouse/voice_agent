# Lexi — Personal Voice Agent Spec

Revised Nov 15, 2026 · @Rob Prouse (supersedes the Nov 14 CLI-first scaffolding spec)

## Overview

A personal AI voice agent for Windows desktop and Android/iOS, using ElevenLabs for voice and OpenRouter for LLMs, with MCP tools later. Built in TypeScript as a Tauri 2 app, with all logic in a platform-neutral `core` package.

The app is for one user (the author). Keys are entered in the app's settings and stored in the OS keychain; no backend or token server.

The app and the ElevenLabs agent are both named Lexi.

## Decisions and why

| Decision | Reason |
| --- | --- |
| Tauri 2 instead of Electron + Expo | One web UI for desktop and mobile; uses the system WebView2 instead of bundling Chromium (lower memory, small installer); no separate React Native app to maintain |
| No CLI front end (for now) | Mobile and desktop are the targets; voice in a terminal is the hardest platform (Node has no audio). A thin CLI can be added later because `core` is platform-neutral |
| Platform-neutral `core` | It runs in a webview on desktop and mobile. No Node APIs, filesystem, `process` or `console` in core. Config arrives as a validated object, keys via a `CredentialProvider`, HTTP via an injected `fetch` |
| Own OpenRouter client over `fetch` + `eventsource-parser` (no `openai` package) | Injectable fetch (Tauri HTTP plugin where CORS blocks the webview), and OpenRouter-specific features such as the models endpoint, error metadata and provider routing |
| Typed tiny event emitter, not Node `EventEmitter` | Not available in the webview; `on()` returns an unsubscribe function |
| TypeScript 6.0.x, not 7.x | typescript-eslint supports TypeScript `<6.1` |
| React + Vite for the UI | ElevenLabs ships `@elevenlabs/react` hooks |

## Main risk: voice in a webview on mobile

`@elevenlabs/client` handles mic and speaker inside a browser, so desktop (WebView2) should work. Android WebView needs explicit microphone-permission handling, and a webview app is suspended when the phone locks or the app is backgrounded. Screen-off voice would need a native plugin. Stage 0 proves this before anything else is built.

## Stages

| Stage | Delivers |
| --- | --- |
| 0. Voice spike (time-boxed, throwaway) | A bare Tauri app running an ElevenLabs agent via `@elevenlabs/client`, using an ElevenLabs-hosted LLM (DeepSeek for now). Windows first, then Android. Go/no-go for Tauri on mobile |
| 1. Core + desktop text chat | `packages/core` (config schema, OpenRouter client, `ChatSession`, tests) and `apps/desktop` (Tauri + React + Vite): streaming chat, model picker, settings screen with keys |
| 2. Voice in the app | `VoiceSession` built from the spike; push-to-talk or always-on toggle |
| 3. Local MCP tools | Desktop: stdio servers started through the Tauri shell plugin, with a custom transport for the MCP SDK. Mobile: remote servers only. Tools go to OpenRouter as functions (text) and to ElevenLabs as client tools (voice) — one registry, two consumers |
| 4. Remote MCP + OAuth | MCP SDK OAuth client; browser sign-in redirects back by deep link or localhost callback plugin; tokens in the OS keychain; fetch via the Tauri HTTP plugin (avoids CORS) |

Note: in voice mode the LLM is chosen in the ElevenLabs agent (currently an ElevenLabs-hosted model; OpenRouter as a custom LLM remains an option), and ElevenLabs holds the voice conversation's history. Text and voice will not share history unless it is passed across later.

## Repository layout

```
lexi/
  package.json            # workspace root: build, dev, test, lint
  pnpm-workspace.yaml
  tsconfig.base.json
  CLAUDE.md
  packages/
    core/                 # platform-neutral: no Node, no DOM-only APIs beyond fetch
      src/
        index.ts          # public API only
        session/          # ChatSession, history
        llm/              # LlmProvider + OpenRouter client
        tools/            # ToolRegistry interface
        voice/            # VoiceSession interface
        config/           # zod schema (no file loading)
        events.ts         # typed emitter
      test/
  apps/
    desktop/              # Tauri 2 + React + Vite; also builds Android/iOS
      src/
      src-tauri/
  spikes/
    voice/                # Stage 0, throwaway
```

## Core interfaces (shapes, names may change)

```ts
interface LlmProvider {
  streamChat(req: {
    model: string;
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    signal?: AbortSignal;
  }): AsyncIterable<LlmChunk>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
}

interface CredentialProvider {
  get(name: 'openrouter' | 'elevenlabs'): Promise<string | undefined>;
}

interface ToolRegistry {
  list(): Promise<ToolDefinition[]>;
  call(name: string, args: unknown, signal?: AbortSignal): Promise<ToolResult>;
}

class ChatSession {
  constructor(opts: { llm: LlmProvider; tools?: ToolRegistry; config: AppConfig });
  send(text: string): Promise<void>;
  cancel(): void;
  reset(): void;
  on<E extends keyof SessionEvents>(e: E, fn: SessionEvents[E]): () => void;
}

type SessionEvents = {
  'assistant:start': () => void;
  'assistant:delta': (text: string) => void;
  'assistant:done': (msg: ChatMessage) => void;
  'tool:call': (call: ToolCall) => void;      // keyed by call id
  'tool:result': (res: ToolResult) => void;
  'state': (s: SessionState) => void;
  'error': (err: AppError) => void;
};
```

Rules:

- `core` has no Node APIs, `process`, `console` or filesystem access. Enforced by `"types": []` in its tsconfig and ESLint rules.
- All network calls take an `AbortSignal`.
- Errors are typed (`AppError` with a `code`) so each UI words them its own way.
- History lives in `ChatSession`; the provider is stateless.

## Configuration

Validated with zod in `core`; stored by the app (Tauri store plugin). Keys are kept apart in the OS keychain and never logged.

```json
{
  "defaultModel": "<pick a current model from OpenRouter /models>",
  "systemPrompt": "You are a concise, helpful assistant.",
  "openRouter": { "appName": "lexi", "appUrl": "https://localhost" },
  "mcpServers": {}
}
```

## Tooling (versions checked Nov 15, 2026)

| Package | Version |
| --- | --- |
| Node | 26.x installed; engines `>=24` |
| pnpm | 12.x |
| typescript | 6.0.3 |
| zod | 4.6.7 |
| eventsource-parser | 4.1.3 |
| vitest | 5.1.0 |
| eslint / @eslint/js | 10.15.0 / 10.0.1 |
| typescript-eslint | 8.72.2 |
| prettier / eslint-config-prettier | 3.10.1 / 10.1.8 |
| globals | 17.14.0 |
| @tauri-apps/cli / @tauri-apps/api | 2.12.4 |
| @elevenlabs/client | 1.36.1 |
| @elevenlabs/react | check at install |
| @modelcontextprotocol/sdk | 1.32.2 (Stage 3) |

## Testing

- `core` is tested with Vitest, without the network, using a fake `LlmProvider` and recorded SSE fixtures for the OpenRouter client.
- One live test gated on `OPENROUTER_API_KEY` and `RUN_LIVE=1`.

## Open questions

- Is background or screen-off voice on mobile needed? If so, Tauri needs a native plugin or mobile moves to React Native.
- iOS: needs a paid Apple developer account, or re-signing every 7 days. Android first.
- Should text chat also go through the ElevenLabs agent (the SDK supports text-only conversations) instead of OpenRouter? It would give text and voice one backend, one history and one tool setup, but ties model choice and pricing to ElevenLabs. Decide after Stage 0.
