import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransportHandlers } from "../src/index.ts";

const sdk = vi.hoisted(() => {
  const conversation = {
    sendUserMessage: vi.fn(),
    sendContextualUpdate: vi.fn(),
    setMicMuted: vi.fn(),
    setVolume: vi.fn(),
    endSession: vi.fn(() => Promise.resolve()),
  };
  return { conversation, startSession: vi.fn(() => Promise.resolve(conversation)) };
});

vi.mock("@elevenlabs/client", () => ({ Conversation: { startSession: sdk.startSession } }));

const { ElevenLabsTransport } = await import("../src/index.ts");

function handlers(): TransportHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onMessage: (m) => calls.push(`message:${m.role}:${m.text}:${m.responseId ?? "-"}`),
    onAgentPart: (p) => calls.push(`part:${p.type}:${p.text}:${p.responseId ?? "-"}`),
    onActivity: (a) => calls.push(`activity:${a}`),
    onDisconnect: (r) => calls.push(`disconnect:${r.by}${r.by === "error" ? `:${r.message}` : ""}`),
    onError: (message) => calls.push(`error:${message}`),
  };
}

// The options object the adapter passed to Conversation.startSession.
function lastOptions(): Record<string, unknown> {
  const call = sdk.startSession.mock.calls.at(-1) as unknown[] | undefined;
  return (call?.[0] ?? {}) as Record<string, unknown>;
}

function callback(name: string): (arg: unknown) => void {
  return lastOptions()[name] as (arg: unknown) => void;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ElevenLabsTransport", () => {
  it("starts voice over WebRTC with the conversation token", async () => {
    await new ElevenLabsTransport().connect({
      mode: "voice",
      credential: { kind: "conversation-token", token: "tok" },
      greet: true,
      handlers: handlers(),
    });
    expect(lastOptions()).toMatchObject({ conversationToken: "tok", connectionType: "webrtc" });
    expect(lastOptions()).not.toHaveProperty("textOnly");
    expect(lastOptions()).not.toHaveProperty("overrides");
  });

  it("suppresses the greeting with an empty first message", async () => {
    await new ElevenLabsTransport().connect({
      mode: "voice",
      credential: { kind: "conversation-token", token: "tok" },
      greet: false,
      handlers: handlers(),
    });
    expect(lastOptions()).toMatchObject({ overrides: { agent: { firstMessage: "" } } });
  });

  it("ignores volume and mute for text conversations", async () => {
    const connection = await new ElevenLabsTransport().connect({
      mode: "text",
      credential: { kind: "signed-url", url: "wss://signed" },
      greet: false,
      handlers: handlers(),
    });
    connection.setVolume(0.4);
    connection.setMuted(true);
    expect(sdk.conversation.setVolume).not.toHaveBeenCalled();
    expect(sdk.conversation.setMicMuted).not.toHaveBeenCalled();
  });

  it("starts text as a text-only WebSocket session with the signed URL", async () => {
    await new ElevenLabsTransport().connect({
      mode: "text",
      credential: { kind: "signed-url", url: "wss://signed" },
      greet: false,
      handlers: handlers(),
    });
    expect(lastOptions()).toMatchObject({
      signedUrl: "wss://signed",
      connectionType: "websocket",
      textOnly: true,
    });
  });

  it("refuses a credential for the wrong mode", async () => {
    await expect(
      new ElevenLabsTransport().connect({
        mode: "voice",
        credential: { kind: "signed-url", url: "wss://signed" },
        greet: true,
        handlers: handlers(),
      }),
    ).rejects.toThrow("conversation token");
    expect(sdk.startSession).not.toHaveBeenCalled();
  });

  it("translates SDK callbacks", async () => {
    const h = handlers();
    await new ElevenLabsTransport().connect({
      mode: "text",
      credential: { kind: "signed-url", url: "wss://signed" },
      greet: false,
      handlers: h,
    });

    callback("onMessage")({ role: "agent", message: "Hi", response_id: "r1", source: "ai", event_id: 1 });
    callback("onAgentChatResponsePart")({ type: "delta", text: "H", event_id: 2 });
    callback("onModeChange")({ mode: "speaking" });
    callback("onDisconnect")({ reason: "error", message: "boom", context: { type: "error" } });
    callback("onDisconnect")({ reason: "agent" });
    callback("onError")("bad");

    expect(h.calls).toEqual([
      "message:agent:Hi:r1",
      "part:delta:H:-",
      "activity:speaking",
      "disconnect:error:boom",
      "disconnect:agent",
      "error:bad",
    ]);
  });

  it("forwards connection calls to the SDK conversation", async () => {
    const connection = await new ElevenLabsTransport().connect({
      mode: "voice",
      credential: { kind: "conversation-token", token: "tok" },
      greet: true,
      handlers: handlers(),
    });
    connection.sendText("hello");
    connection.sendContext("context");
    connection.setMuted(true);
    connection.setVolume(0.3);
    await connection.end();

    expect(sdk.conversation.sendUserMessage).toHaveBeenCalledWith("hello");
    expect(sdk.conversation.sendContextualUpdate).toHaveBeenCalledWith("context");
    expect(sdk.conversation.setMicMuted).toHaveBeenCalledWith(true);
    expect(sdk.conversation.setVolume).toHaveBeenCalledWith({ volume: 0.3 });
    expect(sdk.conversation.endSession).toHaveBeenCalled();
  });

  it.each([
    ["NotAllowedError", "mic-denied"],
    ["NotFoundError", "mic-denied"],
    ["TypeError", "network"],
  ])("maps a %s from startSession to %s", async (name, code) => {
    const err = new Error("failed");
    err.name = name;
    sdk.startSession.mockRejectedValueOnce(err);
    await expect(
      new ElevenLabsTransport().connect({
        mode: "voice",
        credential: { kind: "conversation-token", token: "tok" },
        greet: true,
        handlers: handlers(),
      }),
    ).rejects.toMatchObject({ code });
  });
});
