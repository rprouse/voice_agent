import {
  activeAgent,
  AppError,
  ElevenLabsAuth,
  ElevenLabsTransport,
  LexiSession,
  parseConfig,
  type AgentActivity,
  type AgentEntry,
  type SessionState,
  type TranscriptEntry,
} from "@lexi/core";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  credentials,
  hasApiKey,
  httpFetch,
  loadSettings,
  saveSettings,
  startNativeVoice,
  stopNativeVoice,
} from "./platform.ts";

// --- Settings ---

export interface LoadedSettings {
  /** Null until at least one valid agent has been saved. */
  readonly agents: readonly AgentEntry[] | null;
  /** The agent chosen in chat, if it's still configured; null when there are no agents. */
  readonly activeAgentId: string | null;
  readonly contextTurns: number;
  readonly volume: number;
  readonly keySaved: boolean;
}

const DEFAULT_CONTEXT_TURNS = 20;
const DEFAULT_VOLUME = 0.5;

async function readSettings(): Promise<LoadedSettings> {
  const [stored, keySaved] = await Promise.all([loadSettings(), hasApiKey()]);
  try {
    const config = parseConfig(stored);
    return {
      agents: config.agents,
      activeAgentId: activeAgent(config).id,
      contextTurns: config.contextTurns,
      volume: config.volume,
      keySaved,
    };
  } catch {
    // No valid agents yet: Settings will be shown.
    return {
      agents: null,
      activeAgentId: null,
      contextTurns: DEFAULT_CONTEXT_TURNS,
      volume: DEFAULT_VOLUME,
      keySaved,
    };
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<LoadedSettings | null>(null);

  const reload = useCallback(async () => {
    const next = await readSettings();
    setSettings(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readSettings().then((next) => {
      if (!cancelled) setSettings(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Switches the chat to another configured agent and remembers the choice. */
  const selectAgent = useCallback((agentId: string) => {
    setSettings((previous) =>
      previous?.agents?.some((a) => a.id === agentId)
        ? { ...previous, activeAgentId: agentId }
        : previous,
    );
    saveSettings({ activeAgentId: agentId }).catch((err: unknown) => {
      console.warn("Couldn't save the selected agent", err);
    });
  }, []);

  return { settings, reload, selectAgent };
}

// --- Session ---

/** One LexiSession per agent ID, created on first use. */
class SessionPool {
  readonly #sessions = new Map<string, LexiSession>();
  readonly #contextTurns: number;

  constructor(contextTurns: number) {
    this.#contextTurns = contextTurns;
  }

  get(agentId: string): LexiSession {
    let session = this.#sessions.get(agentId);
    if (!session) {
      session = new LexiSession({
        auth: new ElevenLabsAuth({ agentId, credentials, fetch: httpFetch }),
        transport: new ElevenLabsTransport(),
        config: { contextTurns: this.#contextTurns, volume: DEFAULT_VOLUME },
      });
      this.#sessions.set(agentId, session);
    }
    return session;
  }

  /** Closes and forgets the sessions of agents that are no longer configured. */
  retain(agentIds: ReadonlySet<string>): void {
    for (const [id, session] of this.#sessions) {
      if (!agentIds.has(id)) {
        void session.close();
        this.#sessions.delete(id);
      }
    }
  }

  closeAll(): void {
    for (const session of this.#sessions.values()) void session.close();
  }
}

/**
 * The session for the active agent. Each agent keeps its own session while the app runs,
 * so its transcript survives switching between agents. Switching away ends the previous
 * agent's conversation.
 */
export function useAgentSession(
  agents: readonly AgentEntry[] | null,
  activeAgentId: string | null,
  contextTurns: number,
): LexiSession | null {
  // New sessions when the context setting changes.
  const pool = useMemo(() => new SessionPool(contextTurns), [contextTurns]);
  useEffect(
    () => () => {
      pool.closeAll();
    },
    [pool],
  );

  const agentIds = agents?.map((a) => a.id).join(" ") ?? "";
  useEffect(() => {
    pool.retain(new Set(agentIds.split(" ")));
  }, [pool, agentIds]);

  const session = useMemo(
    () => (activeAgentId ? pool.get(activeAgentId) : null),
    [pool, activeAgentId],
  );

  // Ends the conversation (keeping the transcript) when switching to another agent.
  useEffect(
    () => () => {
      void session?.close();
    },
    [session],
  );

  return session;
}

const noTranscript: readonly TranscriptEntry[] = [];
const idleState: SessionState = { connection: "idle", mode: null, muted: false };
const noop = () => undefined;

export function useTranscript(session: LexiSession | null): readonly TranscriptEntry[] {
  const subscribe = useCallback(
    (onChange: () => void) => session?.on("transcript", onChange) ?? noop,
    [session],
  );
  return useSyncExternalStore(subscribe, () => session?.transcript ?? noTranscript);
}

export function useSessionState(session: LexiSession | null): SessionState {
  const subscribe = useCallback(
    (onChange: () => void) => session?.on("state", onChange) ?? noop,
    [session],
  );
  return useSyncExternalStore(subscribe, () => session?.state ?? idleState);
}

export function useVoiceActivity(session: LexiSession | null): AgentActivity | null {
  const [activity, setActivity] = useState<AgentActivity | null>(null);
  useEffect(() => {
    if (!session) return;
    const offActivity = session.on("voice:activity", setActivity);
    const offState = session.on("state", (state) => {
      if (state.mode !== "voice") setActivity(null);
    });
    return () => {
      offActivity();
      offState();
    };
  }, [session]);
  return activity;
}

/**
 * Turns the native voice layer on while a voice conversation is connecting or connected,
 * and off when it ends. Native failures are logged, not shown: voice still works without them.
 */
export function useNativeVoice(state: SessionState): void {
  const voiceActive = state.mode === "voice" && state.connection !== "idle";
  useEffect(() => {
    if (!voiceActive) return;
    startNativeVoice().catch((err: unknown) => {
      console.warn("Native voice start failed", err);
    });
    return () => {
      stopNativeVoice().catch((err: unknown) => {
        console.warn("Native voice stop failed", err);
      });
    };
  }, [voiceActive]);
}

export function useSessionError(session: LexiSession | null) {
  const [error, setError] = useState<AppError | null>(null);
  useEffect(() => {
    if (!session) return;
    return session.on("error", setError);
  }, [session]);
  const dismiss = useCallback(() => {
    setError(null);
  }, []);
  return { error, dismiss };
}
