import { Conversation, type DisconnectionDetails } from "@elevenlabs/client";
import { AppError } from "../errors.ts";
import type {
  AgentConnection,
  AgentCredential,
  AgentTransport,
  ConnectOptions,
  DisconnectReason,
} from "./types.ts";

type SdkConversation = Awaited<ReturnType<typeof Conversation.startSession>>;
type SdkOptions = Parameters<typeof Conversation.startSession>[0];

/** AgentTransport backed by @elevenlabs/client. Voice uses WebRTC; text is WebSocket text-only. */
export class ElevenLabsTransport implements AgentTransport {
  async connect(options: ConnectOptions): Promise<AgentConnection> {
    const { mode, credential, greet, handlers } = options;

    const callbacks = {
      onMessage: ({ role, message, response_id }: { role: "user" | "agent"; message: string; response_id?: string }) => {
        handlers.onMessage({ role, text: message, ...(response_id ? { responseId: response_id } : {}) });
      },
      onAgentChatResponsePart: (part: { type: "start" | "delta" | "stop"; text: string; response_id?: string }) => {
        handlers.onAgentPart({
          type: part.type,
          text: part.text,
          ...(part.response_id ? { responseId: part.response_id } : {}),
        });
      },
      onModeChange: ({ mode: activity }: { mode: "speaking" | "listening" }) => {
        handlers.onActivity(activity);
      },
      onDisconnect: (details: DisconnectionDetails) => {
        handlers.onDisconnect(toDisconnectReason(details));
      },
      onError: (message: string) => {
        handlers.onError(message);
      },
    };

    // An empty first message makes the agent wait for the user instead of greeting.
    const overrides = greet ? {} : { overrides: { agent: { firstMessage: "" } } };
    const sessionOptions: SdkOptions =
      mode === "voice"
        ? { ...voiceAuth(credential), connectionType: "webrtc", ...overrides, ...callbacks }
        : {
            ...textAuth(credential),
            connectionType: "websocket",
            textOnly: true,
            ...overrides,
            ...callbacks,
          };

    let conversation: SdkConversation;
    try {
      conversation = await Conversation.startSession(sessionOptions);
    } catch (err) {
      throw mapStartError(err);
    }

    return {
      sendText: (text) => {
        conversation.sendUserMessage(text);
      },
      sendContext: (text) => {
        conversation.sendContextualUpdate(text);
      },
      // Text-only conversations have no audio; the SDK throws if these are called.
      setMuted: (muted) => {
        if (mode === "voice") conversation.setMicMuted(muted);
      },
      setVolume: (volume) => {
        if (mode === "voice") conversation.setVolume({ volume });
      },
      end: () => conversation.endSession(),
    };
  }
}

function voiceAuth(credential: AgentCredential) {
  if (credential.kind !== "conversation-token") {
    throw new AppError("unknown", "Voice needs a conversation token.");
  }
  return { conversationToken: credential.token };
}

function textAuth(credential: AgentCredential) {
  if (credential.kind !== "signed-url") {
    throw new AppError("unknown", "Text needs a signed URL.");
  }
  return { signedUrl: credential.url };
}

function toDisconnectReason(details: DisconnectionDetails): DisconnectReason {
  switch (details.reason) {
    case "user":
      return { by: "user" };
    case "agent":
      return { by: "agent" };
    case "error":
      return { by: "error", message: details.message };
  }
}

export function mapStartError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new AppError("mic-denied", "Microphone access was denied.", { cause: err });
  }
  if (name === "NotFoundError") {
    return new AppError("mic-denied", "No microphone was found.", { cause: err });
  }
  return AppError.from(err, "network");
}
