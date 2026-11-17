// Public API of @lexi/core. Front ends import from here only.
export { TypedEmitter } from "./events.ts";
export { AppError, type AppErrorCode } from "./errors.ts";

export {
  activeAgent,
  agentLabel,
  appConfigSchema,
  parseAgentId,
  parseConfig,
  type AgentEntry,
  type AppConfig,
  type AppConfigInput,
} from "./config/schema.ts";

export { ElevenLabsAuth, type AgentAuth } from "./auth/agentAuth.ts";
export type {
  CredentialProvider,
  ElevenLabsClientOptions,
  FetchLike,
} from "./auth/elevenLabsHttp.ts";
export { ElevenLabsAgents, type AgentInfo } from "./agent/agentDirectory.ts";

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
