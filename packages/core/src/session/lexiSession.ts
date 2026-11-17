import type {
  AgentActivity,
  AgentConnection,
  AgentTransport,
  DisconnectReason,
  Mode,
  TransportHandlers,
} from "../agent/types.ts";
import type { AgentAuth } from "../auth/agentAuth.ts";
import type { AppConfig } from "../config/schema.ts";
import { AppError } from "../errors.ts";
import { TypedEmitter } from "../events.ts";
import { buildContext, type TranscriptEntry } from "./transcript.ts";

export type ConnectionState = "idle" | "connecting" | "connected";

export interface SessionState {
  readonly connection: ConnectionState;
  /** Mode of the open (or opening) conversation; null when idle. */
  readonly mode: Mode | null;
  readonly muted: boolean;
}

export type SessionEvents = {
  state: (state: SessionState) => void;
  /** A new array on every change; entries are immutable. */
  transcript: (entries: readonly TranscriptEntry[]) => void;
  "voice:activity": (activity: AgentActivity) => void;
  error: (error: AppError) => void;
};

interface ActiveConversation {
  readonly generation: number;
  readonly mode: Mode;
  readonly connection: AgentConnection;
}

interface PendingConversation {
  readonly generation: number;
  readonly mode: Mode;
  readonly promise: Promise<ActiveConversation | null>;
}

/**
 * One continuous conversation with Lexi across any number of ElevenLabs conversations.
 * Typing opens a text conversation on demand; voice is started and stopped explicitly.
 * The transcript lives here, and each new ElevenLabs conversation is primed with it.
 */
export class LexiSession extends TypedEmitter<SessionEvents> {
  readonly #auth: AgentAuth;
  readonly #transport: AgentTransport;
  readonly #contextTurns: number;
  readonly #now: () => number;

  #entries: readonly TranscriptEntry[] = [];
  #state: SessionState = { connection: "idle", mode: null, muted: false };
  #volume: number;
  #nextId = 1;

  /** Bumped whenever a conversation ends or a new one starts; stale callbacks are ignored. */
  #generation = 0;
  #active: ActiveConversation | null = null;
  #pending: PendingConversation | null = null;

  /** Agent replies being streamed: response id -> transcript entry id. */
  readonly #responseEntries = new Map<string, string>();
  /** Last entry built from streamed parts that a final message hasn't confirmed yet. */
  #unconfirmedPartEntry: string | null = null;
  /** Texts typed during a voice conversation, in case the agent echoes them back. */
  #typedInVoice: string[] = [];

  constructor(options: {
    auth: AgentAuth;
    transport: AgentTransport;
    config: Pick<AppConfig, "contextTurns" | "volume">;
    now?: () => number;
  }) {
    super();
    this.#auth = options.auth;
    this.#transport = options.transport;
    this.#contextTurns = options.config.contextTurns;
    this.#volume = options.config.volume;
    this.#now = options.now ?? Date.now;
  }

  get transcript(): readonly TranscriptEntry[] {
    return this.#entries;
  }

  get state(): SessionState {
    return this.#state;
  }

  /** Sends a typed message, opening a text conversation if none is open. */
  async send(text: string): Promise<void> {
    const message = text.trim();
    if (message === "") return;

    const history = this.#entries;
    const mode = this.#active?.mode ?? this.#pending?.mode ?? "text";
    const entry = this.#append({ role: "user", text: message, mode, status: "final" });

    const conversation = this.#active ?? (await this.#open(mode, history));
    if (!conversation) {
      this.#patch(entry.id, { status: "failed" });
      return;
    }
    if (conversation.mode === "voice") this.#typedInVoice.push(message);
    conversation.connection.sendText(message);
  }

  /** Starts talking. Any open text conversation is closed first. */
  async startVoice(): Promise<void> {
    if (this.#active?.mode === "voice" || this.#pending?.mode === "voice") return;
    await this.#closeConversation();
    await this.#open("voice", this.#entries);
  }

  async stopVoice(): Promise<void> {
    const mode = this.#active?.mode ?? this.#pending?.mode;
    if (mode === "voice") await this.#closeConversation();
  }

  setMuted(muted: boolean): void {
    this.#setState({ muted });
    if (this.#active?.mode === "voice") this.#active.connection.setMuted(muted);
  }

  setVolume(volume: number): void {
    this.#volume = Math.min(1, Math.max(0, volume));
    if (this.#active?.mode === "voice") this.#active.connection.setVolume(this.#volume);
  }

  /** Ends any conversation and clears the transcript. */
  async reset(): Promise<void> {
    await this.#closeConversation();
    this.#responseEntries.clear();
    this.#entries = [];
    this.emit("transcript", this.#entries);
  }

  /** Ends any conversation, keeping the transcript. */
  async close(): Promise<void> {
    await this.#closeConversation();
  }

  // --- conversation lifecycle ---

  #open(mode: Mode, history: readonly TranscriptEntry[]): Promise<ActiveConversation | null> {
    if (this.#pending) return this.#pending.promise;

    const generation = ++this.#generation;
    this.#setState({ connection: "connecting", mode });

    const context = buildContext(history, this.#contextTurns);
    // Only a fresh voice conversation opens with the agent's greeting. When the user starts
    // by typing, or there's earlier context to continue, the agent waits for the user.
    const greet = mode === "voice" && context === null;

    const promise = (async (): Promise<ActiveConversation | null> => {
      let connection: AgentConnection | null = null;
      try {
        const credential = await this.#auth.credentialsFor(mode);
        if (generation !== this.#generation) return null;

        connection = await this.#transport.connect({
          mode,
          credential,
          greet,
          handlers: this.#handlers(generation, mode),
        });
        if (generation !== this.#generation) {
          // Cancelled (stopVoice/reset) while connecting.
          await endQuietly(connection);
          return null;
        }

        if (mode === "voice") {
          connection.setVolume(this.#volume);
          // Conversations start unmuted. Only touch the mic when the user has muted: unmuting
          // a just-connected WebRTC conversation re-acquires the microphone, which on Android
          // reconfigures audio and can kill the agent's audio output.
          if (this.#state.muted) connection.setMuted(true);
        }
        if (context) connection.sendContext(context);

        const conversation: ActiveConversation = { generation, mode, connection };
        this.#active = conversation;
        this.#setState({ connection: "connected", mode });
        return conversation;
      } catch (err) {
        // Don't leave a half-set-up conversation running.
        if (connection) await endQuietly(connection);
        if (generation === this.#generation) {
          this.#setState({ connection: "idle", mode: null });
          this.emit("error", AppError.from(err));
        }
        return null;
      } finally {
        if (this.#pending?.generation === generation) this.#pending = null;
      }
    })();

    this.#pending = { generation, mode, promise };
    return promise;
  }

  async #closeConversation(): Promise<void> {
    const active = this.#active;
    const wasBusy = active !== null || this.#pending !== null;
    this.#generation++;
    this.#active = null;
    this.#pending = null;
    this.#settle();
    if (wasBusy) this.#setState({ connection: "idle", mode: null });
    if (active) await endQuietly(active.connection);
  }

  /** Conversation ended from the other side or by an error. */
  #onDisconnected(reason: DisconnectReason): void {
    this.#generation++;
    this.#active = null;
    this.#pending = null;
    this.#settle();
    this.#setState({ connection: "idle", mode: null });
    if (reason.by === "error") {
      this.emit("error", new AppError("disconnected", reason.message));
    }
    // An agent-side end is normal (idle timeout, end of call); the next message reconnects.
  }

  /** Finalises anything still streaming and forgets per-conversation bookkeeping. */
  #settle(): void {
    for (const entry of this.#entries) {
      if (entry.status === "streaming") this.#patch(entry.id, { status: "final" });
    }
    this.#unconfirmedPartEntry = null;
    this.#typedInVoice = [];
  }

  #handlers(generation: number, mode: Mode): TransportHandlers {
    const current = () => generation === this.#generation;
    return {
      onMessage: ({ role, text, responseId }) => {
        if (!current()) return;
        if (role === "user") this.#onUserMessage(text, mode);
        else this.#onAgentMessage(text, mode, responseId);
      },
      onAgentPart: ({ type, text, responseId }) => {
        if (!current()) return;
        this.#onAgentPart(type, text, mode, responseId);
      },
      onActivity: (activity) => {
        if (current()) this.emit("voice:activity", activity);
      },
      onDisconnect: (reason) => {
        if (current()) this.#onDisconnected(reason);
      },
      onError: (message) => {
        if (current()) this.emit("error", new AppError("unknown", message));
      },
    };
  }

  // --- transcript updates from the agent ---

  #onUserMessage(text: string, mode: Mode): void {
    // Typed messages are already in the transcript. Only spoken ones are new.
    if (mode === "text") return;
    const echoed = this.#typedInVoice.indexOf(text.trim());
    if (echoed !== -1) {
      this.#typedInVoice.splice(echoed, 1);
      return;
    }
    this.#append({ role: "user", text, mode, status: "final" });
  }

  #onAgentPart(
    type: "start" | "delta" | "stop",
    text: string,
    mode: Mode,
    responseId?: string,
  ): void {
    let id = this.#entryForResponse(responseId);
    if (!id && !responseId && type !== "start") {
      // Parts without a response id continue the reply that is currently streaming.
      const current = this.#unconfirmedPartEntry;
      if (current && this.#find(current)?.status === "streaming") id = current;
    }
    if (!id) {
      if (type === "stop" && text === "") return;
      id = this.#append({ role: "agent", text: "", mode, status: "streaming" }).id;
      if (responseId) this.#responseEntries.set(responseId, id);
      this.#unconfirmedPartEntry = id;
    }
    const entry = this.#find(id);
    if (!entry) return;
    this.#patch(id, {
      text: entry.text + text,
      status: type === "stop" ? "final" : "streaming",
    });
  }

  #onAgentMessage(text: string, mode: Mode, responseId?: string): void {
    const id = this.#entryForResponse(responseId) ?? this.#unconfirmedPartEntry;
    this.#unconfirmedPartEntry = null;
    if (id && this.#find(id)) {
      // The final message is authoritative over the streamed parts.
      this.#patch(id, { text, status: "final" });
      return;
    }
    this.#append({ role: "agent", text, mode, status: "final" });
  }

  #entryForResponse(responseId?: string): string | undefined {
    return responseId ? this.#responseEntries.get(responseId) : undefined;
  }

  // --- immutable transcript and state helpers ---

  #append(fields: Omit<TranscriptEntry, "id" | "at">): TranscriptEntry {
    const entry: TranscriptEntry = { ...fields, id: `e${String(this.#nextId++)}`, at: this.#now() };
    this.#entries = [...this.#entries, entry];
    this.emit("transcript", this.#entries);
    return entry;
  }

  #patch(id: string, fields: Partial<Pick<TranscriptEntry, "text" | "status">>): void {
    this.#entries = this.#entries.map((e) => (e.id === id ? { ...e, ...fields } : e));
    this.emit("transcript", this.#entries);
  }

  #find(id: string): TranscriptEntry | undefined {
    return this.#entries.find((e) => e.id === id);
  }

  #setState(fields: Partial<SessionState>): void {
    this.#state = { ...this.#state, ...fields };
    this.emit("state", this.#state);
  }
}

async function endQuietly(connection: AgentConnection): Promise<void> {
  try {
    await connection.end();
  } catch {
    // Already closed; nothing to do.
  }
}
