import type {
  AgentAuth,
  AgentConnection,
  AgentCredential,
  AgentTransport,
  AppConfig,
  ConnectOptions,
  Mode,
  TransportHandlers,
} from "../src/index.ts";

export const config: AppConfig = { agentId: "agent_test", volume: 0.5, contextTurns: 20 };

export class FakeConnection implements AgentConnection {
  readonly texts: string[] = [];
  readonly contexts: string[] = [];
  readonly volumes: number[] = [];
  readonly mutes: boolean[] = [];
  ended = false;
  failContext = false;

  constructor(
    readonly mode: Mode,
    readonly greet: boolean,
    readonly handlers: TransportHandlers,
  ) {}

  sendText(text: string) {
    this.texts.push(text);
  }
  sendContext(text: string) {
    if (this.failContext) throw new Error("context rejected");
    this.contexts.push(text);
  }
  setMuted(muted: boolean) {
    this.mutes.push(muted);
  }
  setVolume(volume: number) {
    this.volumes.push(volume);
  }
  end() {
    this.ended = true;
    return Promise.resolve();
  }
}

/** Each connect() waits until the test calls `release()` unless `autoConnect` is on. */
export class FakeTransport implements AgentTransport {
  readonly connections: FakeConnection[] = [];
  readonly credentials: AgentCredential[] = [];
  autoConnect = true;
  failNext: Error | null = null;
  /** Applied to the next connection before it is returned. */
  beforeReturn: ((connection: FakeConnection) => void) | null = null;
  #waiting: (() => void)[] = [];

  async connect(options: ConnectOptions): Promise<AgentConnection> {
    this.credentials.push(options.credential);
    if (!this.autoConnect) {
      await new Promise<void>((resolve) => this.#waiting.push(resolve));
    }
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    const connection = new FakeConnection(options.mode, options.greet, options.handlers);
    this.beforeReturn?.(connection);
    this.beforeReturn = null;
    this.connections.push(connection);
    return connection;
  }

  release() {
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const resolve of waiting) resolve();
  }

  get last(): FakeConnection {
    const connection = this.connections.at(-1);
    if (!connection) throw new Error("No connection yet");
    return connection;
  }
}

export class FakeAuth implements AgentAuth {
  readonly requests: Mode[] = [];
  failWith: Error | null = null;

  credentialsFor(mode: Mode): Promise<AgentCredential> {
    this.requests.push(mode);
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve(
      mode === "voice"
        ? { kind: "conversation-token", token: "tok" }
        : { kind: "signed-url", url: "wss://example/signed" },
    );
  }
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
