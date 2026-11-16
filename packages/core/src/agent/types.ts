// The seam between LexiSession and the ElevenLabs SDK. LexiSession depends only on these
// types, so tests can drive it with a fake transport.

export type Mode = "text" | "voice";

/** Short-lived credential for one conversation. Voice uses WebRTC, text uses WebSocket. */
export type AgentCredential =
  | { kind: "conversation-token"; token: string }
  | { kind: "signed-url"; url: string };

export type AgentActivity = "listening" | "speaking";

export type DisconnectReason =
  | { by: "user" }
  | { by: "agent" }
  | { by: "error"; message: string };

export interface TransportHandlers {
  /** A finished message. In voice mode this includes the user's transcribed speech. */
  onMessage(message: { role: "user" | "agent"; text: string; responseId?: string }): void;
  /** Streamed pieces of an agent reply (text mode). */
  onAgentPart(part: { type: "start" | "delta" | "stop"; text: string; responseId?: string }): void;
  onActivity(activity: AgentActivity): void;
  onDisconnect(reason: DisconnectReason): void;
  onError(message: string): void;
}

export interface AgentConnection {
  sendText(text: string): void;
  /** Background information for the agent; doesn't trigger a reply. */
  sendContext(text: string): void;
  /** Voice only; ignored for text conversations. */
  setMuted(muted: boolean): void;
  /** Voice only; ignored for text conversations. */
  setVolume(volume: number): void;
  end(): Promise<void>;
}

export interface AgentTransport {
  connect(options: ConnectOptions): Promise<AgentConnection>;
}

export interface ConnectOptions {
  mode: Mode;
  credential: AgentCredential;
  /**
   * Whether the agent opens with its configured greeting. False sends an empty first message,
   * so the agent waits for the user (needs the agent's "First message" override enabled).
   */
  greet: boolean;
  handlers: TransportHandlers;
}
