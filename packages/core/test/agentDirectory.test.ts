import { describe, expect, it } from "vitest";
import { ElevenLabsAgents, type FetchLike } from "../src/index.ts";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; headers: Record<string, string>; signal?: AbortSignal }[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, headers: init.headers, ...(init.signal ? { signal: init.signal } : {}) });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    });
  };
  return { fetch, calls };
}

const keyStore = (key: string | undefined) => ({ get: () => Promise.resolve(key) });

describe("ElevenLabsAgents", () => {
  it("gets an agent's name", async () => {
    const { fetch, calls } = fakeFetch(200, {
      agent_id: "agent_abc",
      name: " Lexi ",
      conversation_config: {},
    });
    const agents = new ElevenLabsAgents({ credentials: keyStore("sk_1"), fetch });
    const signal = new AbortController().signal;

    await expect(agents.getAgent("agent_abc", signal)).resolves.toEqual({
      id: "agent_abc",
      name: "Lexi",
    });
    expect(calls[0]?.url).toBe("https://api.elevenlabs.io/v1/convai/agents/agent_abc");
    expect(calls[0]?.headers).toEqual({ "xi-api-key": "sk_1" });
    expect(calls[0]?.signal).toBe(signal);
  });

  it("returns an empty name when the agent has none", async () => {
    const { fetch } = fakeFetch(200, { agent_id: "agent_abc", name: null });
    const agents = new ElevenLabsAgents({ credentials: keyStore("sk"), fetch });
    await expect(agents.getAgent("agent_abc")).resolves.toEqual({ id: "agent_abc", name: "" });
  });

  it("encodes the agent ID into the path", async () => {
    const { fetch, calls } = fakeFetch(200, { agent_id: "x", name: "x" });
    const agents = new ElevenLabsAgents({ credentials: keyStore("sk"), fetch });
    await agents.getAgent("a/b?c");
    expect(calls[0]?.url).toBe("https://api.elevenlabs.io/v1/convai/agents/a%2Fb%3Fc");
  });

  it("fails without an API key, without calling the network", async () => {
    const { fetch, calls } = fakeFetch(200, {});
    const agents = new ElevenLabsAgents({ credentials: keyStore(undefined), fetch });
    await expect(agents.getAgent("agent_abc")).rejects.toMatchObject({ code: "missing-api-key" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [401, "auth-failed"],
    [404, "agent-not-found"],
    [500, "network"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const { fetch } = fakeFetch(status, "nope");
    const agents = new ElevenLabsAgents({ credentials: keyStore("sk"), fetch });
    await expect(agents.getAgent("agent_abc")).rejects.toMatchObject({ code });
  });

  it("rejects a malformed response", async () => {
    const { fetch } = fakeFetch(200, { unexpected: true });
    const agents = new ElevenLabsAgents({ credentials: keyStore("sk"), fetch });
    await expect(agents.getAgent("agent_abc")).rejects.toMatchObject({ code: "unknown" });
  });
});
