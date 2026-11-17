# Lexi Voice Agent

An AI agent I can type or talk to, as a desktop app and on my phone.

Lexi is a Tauri 2 app (Windows now, Android next). Both text and voice go through one [ElevenLabs Agents](https://elevenlabs.io/docs/eleven-agents/overview) agent, so the agent's prompt, LLM and tools are configured in one place. See [docs/voice_agent_cli_spec.md](docs/voice_agent_cli_spec.md) for the design.

## ElevenLabs agent setup

Lexi needs an ElevenLabs agent and an API key. Set the agent up once in the [ElevenLabs dashboard](https://elevenlabs.io/app/agents):

1. **Create the agent.** Agents → Create agent → Blank. Give it a name and a system prompt.
2. **Choose the LLM** on the agent's settings. Any ElevenLabs-hosted model works. To use OpenRouter instead, choose **Custom LLM** with server URL `https://openrouter.ai/api/v1`, an OpenRouter model ID (e.g. `anthropic/claude-haiku-5.5`) and your OpenRouter key stored as an ElevenLabs secret. Lexi needs no changes either way.
3. **Turn on authentication** under **Security**. Without it, anyone who learns the agent ID can hold conversations on your account. Lexi uses your API key to get a short-lived token for each conversation.
4. **Allow overrides** under **Security → Overrides**:
   - **First message**: required. Lexi suppresses the greeting when continuing a conversation (switching between typing and talking, or reconnecting). Without this, conversations fail with `Override for field 'first_message' is not allowed by config`.
   - If an error mentions another field (such as text-only mode), allow that override too.
5. **Save** the agent and copy its **agent ID** (`agent_...`).
6. **Create an API key** under Developers → API keys. If you restrict its permissions, it needs access to ElevenLabs Agents.

Keep agent IDs and the API key out of the repository (it's public). Lexi stores the key in Windows Credential Manager and the agent IDs in its app data folder.

You can set up more than one agent this way and switch between them in Lexi. Repeat steps 1 to 5 for each; one API key covers them all.

## Running Lexi

Prerequisites on Windows 11:

- Node.js 24 or later, and pnpm 12 (`npm i -g pnpm@12`)
- Rust (via rustup) and Visual Studio's **Desktop development with C++** workload (MSVC tools and Windows SDK)
- WebView2, which ships with Windows 11

```powershell
pnpm install
pnpm dev
```

On first run Lexi opens **Settings**: enter the API key and one or more agent IDs, then Save. Lexi fills in each agent's name from ElevenLabs unless you type one. With more than one agent, pick who to talk to from the menu at the top of the chat; each agent keeps its own conversation while Lexi is open. Type a message, or press **Talk** to speak. Voice uses WebRTC; use headphones if Lexi hears herself through your speakers.

## Development

```powershell
pnpm test        # core unit tests (Vitest)
pnpm lint        # ESLint, including the core platform-neutral boundary
pnpm typecheck
pnpm build       # frontend build
pnpm format      # Prettier
```

- `packages/core`: platform-neutral TypeScript (sessions, transcript, auth, ElevenLabs transport).
- `apps/lexi`: the Tauri + React app.
- `spikes/voice`: the Stage 0 voice spike, including the Android native audio and background-service code. Results are in [docs/stage0-results.md](docs/stage0-results.md).

Project conventions for contributors and coding agents are in [CLAUDE.md](CLAUDE.md).
