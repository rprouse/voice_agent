// Public API of @lexi/core. Front ends import from here only.
export { TypedEmitter } from "./events.ts";
export { AppError, type AppErrorCode } from "./errors.ts";

export { appConfigSchema, parseConfig, type AppConfig, type AppConfigInput } from "./config/schema.ts";

export {
  ElevenLabsAuth,
  type AgentAuth,
  type CredentialProvider,
  type FetchLike,
} from "./auth/agentAuth.ts";

export type {
  AgentActivity,
  AgentConnection,
  AgentCredential,
  AgentTransport,
  ConnectOptions,
  DisconnectReason,
  Mode,
  TransportHandlers,
} from "./agent/types.ts";
export { ElevenLabsTransport } from "./agent/elevenLabsTransport.ts";

export {
  LexiSession,
  type ConnectionState,
  type SessionEvents,
  type SessionState,
} from "./session/lexiSession.ts";
export {
  buildContext,
  type TranscriptEntry,
  type TranscriptRole,
  type TranscriptStatus,
} from "./session/transcript.ts";
