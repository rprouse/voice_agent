import { describe, expect, it } from "vitest";
import { AppError, LexiSession, type SessionState } from "../src/index.ts";
import { FakeAuth, FakeTransport, config, flush } from "./fakes.ts";

function setup() {
  const auth = new FakeAuth();
  const transport = new FakeTransport();
  let clock = 1000;
  const session = new LexiSession({ auth, transport, config, now: () => clock++ });
  const errors: AppError[] = [];
  const states: SessionState[] = [];
  session.on("error", (e) => errors.push(e));
  session.on("state", (s) => states.push(s));
  return { auth, transport, session, errors, states };
}

const texts = (session: LexiSession) => session.transcript.map((e) => `${e.role}:${e.text}`);

describe("LexiSession text", () => {
  it("opens a text conversation on the first message and sends it", async () => {
    const { auth, transport, session, states } = setup();

    await session.send("  Hello Lexi  ");

    expect(auth.requests).toEqual(["text"]);
    expect(transport.last.mode).toBe("text");
    expect(transport.last.texts).toEqual(["Hello Lexi"]);
    expect(transport.last.contexts).toEqual([]); // nothing to prime yet
    expect(transport.last.greet).toBe(false); // the user spoke first
    expect(transport.last.volumes).toEqual([]); // no audio in text conversations
    expect(texts(session)).toEqual(["user:Hello Lexi"]);
    expect(states.map((s) => s.connection)).toEqual(["connecting", "connected"]);
    expect(session.state).toMatchObject({ connection: "connected", mode: "text" });
  });

  it("doesn't touch audio settings on a text conversation", async () => {
    const { transport, session } = setup();
    await session.send("Hi");
    session.setVolume(0.9);
    session.setMuted(true);
    expect(transport.last.volumes).toEqual([]);
    expect(transport.last.mutes).toEqual([]);
  });

  it("ends the conversation and marks the message failed if setup after connecting fails", async () => {
    const { transport, session, errors } = setup();
    await session.send("first");
    transport.last.handlers.onDisconnect({ by: "agent" });
    transport.beforeReturn = (connection) => {
      connection.failContext = true;
    };

    await session.send("second");

    expect(transport.last.ended).toBe(true);
    expect(errors.map((e) => e.message)).toEqual(["context rejected"]);
    expect(session.transcript.at(-1)).toMatchObject({ text: "second", status: "failed" });
    expect(session.state.connection).toBe("idle");
  });

  it("ignores blank messages", async () => {
    const { transport, session } = setup();
    await session.send("   ");
    expect(transport.connections).toHaveLength(0);
    expect(session.transcript).toHaveLength(0);
  });

  it("reuses the open conversation for later messages", async () => {
    const { transport, session } = setup();
    await session.send("one");
    await session.send("two");
    expect(transport.connections).toHaveLength(1);
    expect(transport.last.texts).toEqual(["one", "two"]);
  });

  it("sends messages typed while connecting, in order, over one conversation", async () => {
    const { transport, session } = setup();
    transport.autoConnect = false;

    const first = session.send("first");
    const second = session.send("second");
    await flush();
    transport.release();
    await Promise.all([first, second]);

    expect(transport.connections).toHaveLength(1);
    expect(transport.last.texts).toEqual(["first", "second"]);
  });

  it("builds a streamed reply and lets the final message replace it", async () => {
    const { transport, session } = setup();
    await session.send("Hi");
    const { handlers } = transport.last;

    handlers.onAgentPart({ type: "start", text: "", responseId: "r1" });
    handlers.onAgentPart({ type: "delta", text: "Hel", responseId: "r1" });
    expect(session.transcript.at(-1)).toMatchObject({ text: "Hel", status: "streaming" });
    handlers.onAgentPart({ type: "delta", text: "lo!", responseId: "r1" });
    handlers.onAgentPart({ type: "stop", text: "", responseId: "r1" });
    handlers.onMessage({ role: "agent", text: "Hello!", responseId: "r1" });

    expect(texts(session)).toEqual(["user:Hi", "agent:Hello!"]);
    expect(session.transcript.at(-1)?.status).toBe("final");
  });

  it("matches a final message without a response id to the streamed entry", async () => {
    const { transport, session } = setup();
    await session.send("Hi");
    const { handlers } = transport.last;
    handlers.onAgentPart({ type: "start", text: "" });
    handlers.onAgentPart({ type: "delta", text: "Hey" });
    handlers.onMessage({ role: "agent", text: "Hey there" });
    expect(texts(session)).toEqual(["user:Hi", "agent:Hey there"]);
  });

  it("adds an agent message that arrives without streaming", async () => {
    const { transport, session } = setup();
    await session.send("Hi");
    transport.last.handlers.onMessage({ role: "agent", text: "Hello" });
    expect(texts(session)).toEqual(["user:Hi", "agent:Hello"]);
  });

  it("ignores user echoes in text mode", async () => {
    const { transport, session } = setup();
    await session.send("Hi");
    transport.last.handlers.onMessage({ role: "user", text: "Hi" });
    expect(texts(session)).toEqual(["user:Hi"]);
  });

  it("reconnects after the agent ends an idle conversation and primes the context", async () => {
    const { transport, session, errors } = setup();
    await session.send("My name is Rob");
    transport.last.handlers.onMessage({ role: "agent", text: "Nice to meet you, Rob" });
    transport.last.handlers.onDisconnect({ by: "agent" });
    expect(session.state.connection).toBe("idle");
    expect(errors).toEqual([]);

    await session.send("What's my name?");

    expect(transport.connections).toHaveLength(2);
    const [context] = transport.last.contexts;
    expect(context).toContain("User: My name is Rob");
    expect(context).toContain("You: Nice to meet you, Rob");
    expect(context).not.toContain("What's my name?");
    expect(transport.last.texts).toEqual(["What's my name?"]);
  });

  it("reports a failed connection and marks the message as failed", async () => {
    const { auth, session, errors } = setup();
    auth.failWith = new AppError("missing-api-key", "No key");

    await session.send("Hello");

    expect(errors.map((e) => e.code)).toEqual(["missing-api-key"]);
    expect(session.transcript[0]?.status).toBe("failed");
    expect(session.state).toMatchObject({ connection: "idle", mode: null });
  });

  it("wraps unexpected transport errors as AppError", async () => {
    const { transport, session, errors } = setup();
    transport.failNext = new Error("socket closed");
    await session.send("Hello");
    expect(errors[0]).toBeInstanceOf(AppError);
    expect(errors[0]?.message).toBe("socket closed");
  });

  it("reports an error disconnect", async () => {
    const { transport, session, errors } = setup();
    await session.send("Hello");
    transport.last.handlers.onDisconnect({ by: "error", message: "network lost" });
    expect(errors.map((e) => e.code)).toEqual(["disconnected"]);
    expect(session.state.connection).toBe("idle");
  });

  it("finalises a half-streamed reply when the conversation drops", async () => {
    const { transport, session } = setup();
    await session.send("Hi");
    transport.last.handlers.onAgentPart({ type: "start", text: "" });
    transport.last.handlers.onAgentPart({ type: "delta", text: "Partial" });
    transport.last.handlers.onDisconnect({ by: "agent" });
    expect(session.transcript.at(-1)).toMatchObject({ text: "Partial", status: "final" });
  });
});

describe("LexiSession voice", () => {
  it("closes the text conversation and starts voice with context", async () => {
    const { auth, transport, session } = setup();
    await session.send("Remember the number 7");
    transport.last.handlers.onMessage({ role: "agent", text: "Got it" });
    const textConnection = transport.last;

    await session.startVoice();

    expect(textConnection.ended).toBe(true);
    expect(auth.requests).toEqual(["text", "voice"]);
    expect(transport.last.mode).toBe("voice");
    expect(transport.last.contexts[0]).toContain("User: Remember the number 7");
    expect(transport.last.greet).toBe(false); // continuing, so no greeting
    expect(transport.last.mutes).toEqual([false]);
    expect(session.state).toMatchObject({ connection: "connected", mode: "voice" });
  });

  it("greets when voice starts with an empty transcript", async () => {
    const { transport, session } = setup();
    await session.startVoice();
    expect(transport.last.greet).toBe(true);
    expect(transport.last.contexts).toEqual([]);
  });

  it("doesn't greet again when voice restarts", async () => {
    const { transport, session } = setup();
    await session.startVoice();
    transport.last.handlers.onMessage({ role: "agent", text: "Hi, I'm Lexi" });
    await session.stopVoice();
    await session.startVoice();
    expect(transport.last.greet).toBe(false);
  });

  it("does nothing when voice is already on", async () => {
    const { transport, session } = setup();
    await session.startVoice();
    await session.startVoice();
    expect(transport.connections).toHaveLength(1);
  });

  it("adds spoken user turns and agent replies to the transcript", async () => {
    const { transport, session } = setup();
    await session.startVoice();
    const { handlers } = transport.last;
    handlers.onMessage({ role: "user", text: "What's the weather?" });
    handlers.onMessage({ role: "agent", text: "I can't check that yet." });
    expect(session.transcript.map((e) => `${e.mode}:${e.role}:${e.text}`)).toEqual([
      "voice:user:What's the weather?",
      "voice:agent:I can't check that yet.",
    ]);
  });

  it("sends typed text into an open voice conversation without duplicating its echo", async () => {
    const { transport, session } = setup();
    await session.startVoice();
    await session.send("typed while talking");
    transport.last.handlers.onMessage({ role: "user", text: "typed while talking" });

    expect(transport.connections).toHaveLength(1);
    expect(transport.last.texts).toEqual(["typed while talking"]);
    expect(texts(session)).toEqual(["user:typed while talking"]);
    expect(session.transcript[0]?.mode).toBe("voice");
  });

  it("forwards speaking/listening activity", async () => {
    const { transport, session } = setup();
    const activity: string[] = [];
    session.on("voice:activity", (a) => activity.push(a));
    await session.startVoice();
    transport.last.handlers.onActivity("speaking");
    transport.last.handlers.onActivity("listening");
    expect(activity).toEqual(["speaking", "listening"]);
  });

  it("stops voice and goes idle", async () => {
    const { transport, session } = setup();
    await session.startVoice();
    await session.stopVoice();
    expect(transport.last.ended).toBe(true);
    expect(session.state).toMatchObject({ connection: "idle", mode: null });
  });

  it("cancels a voice conversation that is still connecting", async () => {
    const { transport, session, states } = setup();
    transport.autoConnect = false;
    const starting = session.startVoice();
    await flush();
    await session.stopVoice();
    transport.release();
    await starting;

    expect(transport.last.ended).toBe(true);
    expect(session.state.connection).toBe("idle");
    expect(states.at(-1)?.connection).toBe("idle");
  });

  it("ignores events from a conversation that has ended", async () => {
    const { transport, session } = setup();
    await session.startVoice();
    const old = transport.last;
    await session.stopVoice();
    old.handlers.onMessage({ role: "agent", text: "late" });
    old.handlers.onDisconnect({ by: "error", message: "late error" });
    expect(session.transcript).toHaveLength(0);
  });

  it("applies mute and volume to the open voice conversation", async () => {
    const { transport, session } = setup();
    await session.startVoice();
    session.setMuted(true);
    session.setVolume(1.7);
    expect(transport.last.mutes).toEqual([false, true]);
    expect(transport.last.volumes).toEqual([0.5, 1]);
    expect(session.state.muted).toBe(true);
  });

  it("carries mute and volume into the next voice conversation", async () => {
    const { transport, session } = setup();
    session.setMuted(true);
    session.setVolume(0.2);
    await session.startVoice();
    expect(transport.last.mutes).toEqual([true]);
    expect(transport.last.volumes).toEqual([0.2]);
  });
});

describe("LexiSession reset and close", () => {
  it("reset ends the conversation and clears the transcript", async () => {
    const { transport, session } = setup();
    const snapshots: number[] = [];
    session.on("transcript", (entries) => snapshots.push(entries.length));
    await session.send("Hello");

    await session.reset();

    expect(transport.last.ended).toBe(true);
    expect(session.transcript).toEqual([]);
    expect(snapshots.at(-1)).toBe(0);
  });

  it("close ends the conversation but keeps the transcript", async () => {
    const { transport, session } = setup();
    await session.send("Hello");
    await session.close();
    expect(transport.last.ended).toBe(true);
    expect(texts(session)).toEqual(["user:Hello"]);
  });

  it("emits a new transcript array on every change", async () => {
    const { session } = setup();
    const seen: (readonly unknown[])[] = [];
    session.on("transcript", (entries) => seen.push(entries));
    await session.send("a");
    await session.send("b");
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});
