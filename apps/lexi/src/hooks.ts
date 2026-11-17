import {
  AppError,
  ElevenLabsAuth,
  ElevenLabsTransport,
  LexiSession,
  parseConfig,
  type AgentActivity,
  type SessionState,
  type TranscriptEntry,
} from "@lexi/core";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  credentials,
  hasApiKey,
  httpFetch,
  loadSettings,
  startNativeVoice,
  stopNativeVoice,
} from "./platform.ts";

// --- Settings ---

export interface SessionSettings {
  readonly agentId: string;
  readonly contextTurns: number;
}

export interface LoadedSettings {
  /** Null until a valid agent ID has been saved. */
  readonly session: SessionSettings | null;
  readonly volume: number;
  readonly keySaved: boolean;
}

async function readSettings(): Promise<LoadedSettings> {
  const [stored, keySaved] = await Promise.all([loadSettings(), hasApiKey()]);
  try {
    const config = parseConfig(stored);
    return {
      session: { agentId: config.agentId, contextTurns: config.contextTurns },
      volume: config.volume,
      keySaved,
    };
  } catch {
    // No valid agent ID yet: Settings will be shown.
    return { session: null, volume: 0.5, keySaved };
  }
}

/** Keeps the same session object when nothing changed, so the session isn't recreated. */
function merge(previous: LoadedSettings | null, next: LoadedSettings): LoadedSettings {
  const same =
    previous?.session &&
    next.session &&
    previous.session.agentId === next.session.agentId &&
    previous.session.contextTurns === next.session.contextTurns;
  return same ? { ...next, session: previous.session } : next;
}

export function useSettings() {
  const [settings, setSettings] = useState<LoadedSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readSettings().then((next) => {
      if (!cancelled) setSettings((previous) => merge(previous, next));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    const next = await readSettings();
    setSettings((previous) => merge(previous, next));
  }, []);

  return { settings, reload };
}

// --- Session ---

const DEFAULT_VOLUME = 0.5;

/** One LexiSession per agent ID; closed when settings change or the app unmounts. */
export function useLexiSession(settings: SessionSettings | null): LexiSession | null {
  const session = useMemo(() => {
    if (!settings) return null;
    return new LexiSession({
      auth: new ElevenLabsAuth({ agentId: settings.agentId, credentials, fetch: httpFetch }),
      transport: new ElevenLabsTransport(),
      config: { ...settings, volume: DEFAULT_VOLUME },
    });
  }, [settings]);

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
