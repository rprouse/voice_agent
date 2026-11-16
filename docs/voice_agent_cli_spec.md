# Voice Agent CLI — Scaffolding Spec

Nov 14, 2026 · @Rob Prouse

## Overview

Build a Windows command-line AI assistant in TypeScript, starting with plain text chat through OpenRouter and growing into an ElevenLabs voice agent with MCP tools. The scaffold must put all logic in a reusable core package so a desktop UI (likely Electron) can be added later without touching it.

Delivery is staged. Only Stage 1 is built now; the rest shapes the interfaces.

| Stage | Delivers | Build now? |
| --- | --- | --- |
| 1. Text chat | Streaming chat with an OpenRouter model in the terminal | Yes |
| 2. Voice | ElevenLabs Agents conversation with mic input and speaker output, LLM via OpenRouter as a custom LLM | No, design for it |
| 3. Local MCP tools | App acts as MCP client for local servers; tools exposed to the model (text) and to ElevenLabs as client tools (voice) | No, design for it |
| 4. Remote MCP + OAuth | Remote MCP servers via the app's MCP client, with the MCP spec OAuth flow and token storage | No, design for it |

## Tech stack

TypeScript on Node is the choice because ElevenLabs and MCP both ship official TypeScript SDKs, and the same core can later run inside Electron.

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js LTS (22+) | Windows 11 is the only target |
| Language | TypeScript, strict mode, ESM | No `any` in the core's public API |
| Monorepo | pnpm workspaces | npm workspaces acceptable if pnpm is unwanted |
| LLM access | OpenRouter's OpenAI-compatible API via the `openai` npm package with `baseURL` set to OpenRouter | Streaming required |
| CLI framework | `commander` for commands, `@inquirer/prompts` or a readline loop for the chat REPL | Keep the CLI thin |
| Terminal output | `chalk` plus a simple streaming renderer | Markdown rendering optional |
| Validation | `zod` for config and tool schemas | Also used for MCP tool schemas later |
| Voice (Stage 2) | ElevenLabs official JS SDK | Verify current package name and Node support before Stage 2 |
| MCP (Stages 3-4) | `@modelcontextprotocol/sdk` | Includes client OAuth support |
| Tests | Vitest |  |
| Lint/format | ESLint + Prettier |  |

Package names and versions should be checked against npm at scaffold time; this spec was written without verifying them.

## Repository layout

Two workspace packages: `core` holds everything reusable, `cli` only handles terminal input and output. The CLI imports the core through its public `index.ts` and nothing else.

```
voice-agent/
  package.json            # workspace root, scripts: build, dev, test, lint
  pnpm-workspace.yaml
  tsconfig.base.json
  .env.example            # OPENROUTER_API_KEY, ELEVENLABS_API_KEY (later)
  CLAUDE.md               # conventions for Claude Code (see last section)
  packages/
    core/
      src/
        index.ts          # public API only
        session/          # ChatSession, conversation history
        llm/              # LlmProvider interface + OpenRouter implementation
        tools/            # ToolRegistry interface (empty in Stage 1)
        voice/            # placeholder: VoiceSession interface only
        config/           # config loading + zod schema
        events.ts         # typed event emitter definitions
      test/
    cli/
      src/
        index.ts          # commander entry, bin: va
        commands/chat.ts  # REPL loop
        render.ts         # streaming output to the terminal
      test/
```

A future `packages/desktop` (Electron) sits beside `cli` and depends only on `core`.

## Core architecture

The core exposes sessions that emit typed events; front ends subscribe to events and never call providers directly. That one rule is what keeps the CLI and a future desktop app interchangeable.

Key interfaces (names are suggestions; keep the shapes):

```ts
interface LlmProvider {
  streamChat(req: {
    model: string;
    messages: ChatMessage[];
    tools?: ToolDefinition[];          // unused in Stage 1, present for Stage 3
    signal?: AbortSignal;
  }): AsyncIterable<LlmChunk>;         // text deltas, tool-call deltas, finish
}

interface ToolRegistry {
  list(): Promise<ToolDefinition[]>;
  call(name: string, args: unknown, signal?: AbortSignal): Promise<ToolResult>;
}

class ChatSession {
  constructor(opts: { llm: LlmProvider; tools?: ToolRegistry; config: AppConfig });
  send(text: string): Promise<void>;   // emits events while streaming
  cancel(): void;                      // aborts the current response
  reset(): void;
  on<E extends keyof SessionEvents>(e: E, fn: SessionEvents[E]): void;
}

type SessionEvents = {
  'assistant:delta': (text: string) => void;
  'assistant:done': (msg: ChatMessage) => void;
  'tool:call': (call: ToolCall) => void;      // Stage 3
  'tool:result': (res: ToolResult) => void;   // Stage 3
  'error': (err: AppError) => void;
};

interface VoiceSession {                // Stage 2, interface only for now
  start(): Promise<void>;
  stop(): Promise<void>;
  on(...): void;                       // transcript, agent speech, tool calls, state
}
```

Rules:

- No `console.log`, `process.stdout` or `process.exit` in `core`.
- All network calls accept an `AbortSignal` so Ctrl+C cancels a response, not the app.
- Errors are typed (`AppError` with a `code`) so each front end can word them its own way.
- Conversation history lives in `ChatSession`; the provider is stateless.

## Stage 1 scope

Stage 1 is a streaming text chat in the terminal, launched with `va chat`, talking to one OpenRouter model at a time.

In scope:

- `va chat [--model <id>] [--system <file>]` opens a REPL; responses stream token by token.
- Slash commands inside the REPL: `/model <id>`, `/reset`, `/system <file>`, `/help`, `/exit`.
- Ctrl+C during a response cancels it; Ctrl+C at an empty prompt exits.
- `va models [--filter <text>]` lists OpenRouter models (from its models endpoint) with context length and price.
- Conversation history kept in memory for the session; optional `--save <file>` writes the transcript as JSON on exit.
- OpenRouter attribution headers (`HTTP-Referer`, `X-Title`) set from config.
- Clear messages for a missing API key, invalid model, rate limit and network failure.

Out of scope for Stage 1:

- Audio of any kind, ElevenLabs, MCP, OAuth.
- Persistent conversation storage or multiple saved sessions.
- Packaging as a standalone `.exe` (run via `pnpm dev` or `node` for now).

## Later stages

These are not built now, but Stage 1 must not make them hard. Each needs its own spec before work starts.

**Stage 2: voice.** A `VoiceSession` in the core wraps an ElevenLabs Agents conversation. The agent is configured in ElevenLabs to use OpenRouter as a custom LLM (OpenAI-compatible endpoint, OpenRouter key stored as an ElevenLabs secret). The CLI gets `va talk`. Audio capture and playback on Windows is the main risk: prototype mic in and speaker out in a throwaway script first, and test with headphones to avoid echo.

**Stage 3: local MCP tools.** An `McpToolRegistry` implements `ToolRegistry` using the MCP client SDK over stdio, with servers listed in config. In text mode, tools are passed to OpenRouter as function definitions and `ChatSession` runs the tool loop. In voice mode, the same tools are registered with ElevenLabs as client tools and executed locally. One registry, two consumers.

**Stage 4: remote MCP and OAuth.** The same registry adds streamable HTTP transports for remote servers. Authentication uses the MCP SDK's OAuth client support: open the system browser for sign-in, receive the callback on a localhost port, store tokens in Windows Credential Manager (e.g. via `keytar` or an equivalent maintained package), refresh automatically. Tokens never go to ElevenLabs.

Assumptions to verify before each stage: ElevenLabs' current custom-LLM and client-tool behaviour, and whether its built-in MCP support has gained OAuth (which could simplify Stage 4).

## Configuration and secrets

Settings live in one JSON file, secrets in environment variables; the core validates both with zod at startup and fails with a clear message.

- Config file: `%APPDATA%\voice-agent\config.json`, overridable with `--config <path>`. Created with defaults on first run.
- Secrets: `OPENROUTER_API_KEY` (Stage 1), `ELEVENLABS_API_KEY` (Stage 2), read from the environment or a `.env` file in the working directory. Never written to the config file or logs.
- Resolution order: CLI flag, then environment, then config file, then built-in default.

Initial config shape:

```json
{
  "defaultModel": "anthropic/claude-sonnet-4.5",
  "systemPrompt": "You are a concise, helpful assistant.",
  "openRouter": { "appName": "voice-agent", "appUrl": "https://localhost" },
  "mcpServers": {}
}
```

`mcpServers` stays empty in Stage 1 but is in the schema so Stage 3 adds entries, not structure. The default model id is a placeholder; pick a current one from `va models`.

## Testing and acceptance

The core is tested without the network by injecting a fake `LlmProvider`; one opt-in test hits OpenRouter for real.

- Unit tests (Vitest) for `ChatSession`: history handling, streaming events, cancel, reset, error mapping.
- Config tests: defaults, precedence, invalid file, missing key.
- An integration test gated on `OPENROUTER_API_KEY` and `RUN_LIVE=1` that sends one short prompt.
- No CLI end-to-end tests in Stage 1 beyond a smoke test that `va --help` runs.

Stage 1 is done when:

- [ ] `pnpm install && pnpm build && pnpm test` passes on a clean Windows 11 machine.
- [ ] `va chat` streams a reply from the default model in Windows Terminal and PowerShell.
- [ ] `/model` switches models mid-conversation and history carries over.
- [ ] Ctrl+C cancels a long response and the prompt returns.
- [ ] A missing or wrong API key produces a one-line, actionable error, not a stack trace.
- [ ] `packages/core` has no imports from `packages/cli` and no terminal I/O (checked by an ESLint rule).
- [ ] `va models --filter claude` lists matching models.

## Instructions for Claude Code

Hand this spec to Claude Code with the prompt below; it should plan first, then build Stage 1 only.

```markdown
Read SPEC.md. Build Stage 1 only.
1. Propose a plan and the exact package list with current versions; wait for approval.
2. Scaffold the monorepo, tooling, and CLAUDE.md first; make build/test/lint pass on an empty core.
3. Implement config, then LlmProvider (OpenRouter), then ChatSession with tests, then the CLI.
4. Stop after each step, run the tests, and summarise what changed.
Do not implement voice, MCP or OAuth. Do not add dependencies outside the plan without asking.
```

`CLAUDE.md` should record: the core/CLI boundary rule, no terminal I/O in core, strict TypeScript, tests required for core changes, Windows paths and PowerShell as the shell, and pnpm as the package manager.

Open questions:

- Working name for the app and the CLI command (`va` is a placeholder).
- Default OpenRouter model.
- Whether the desktop app will definitely be Electron, or whether Tauri is worth a look (it would change little in the core).
