import { describe, expect, it } from "vitest";
import { ElevenLabsAuth, type FetchLike } from "../src/index.ts";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, headers: init.headers });
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

describe("ElevenLabsAuth", () => {
  it("gets a conversation token for voice", async () => {
    const { fetch, calls } = fakeFetch(200, { token: "tok123" });
    const auth = new ElevenLabsAuth({ agentId: "agent_abc", credentials: keyStore("sk_1"), fetch });

    await expect(auth.credentialsFor("voice")).resolves.toEqual({
      kind: "conversation-token",
      token: "tok123",
    });
    expect(calls[0]?.url).toBe("https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent_abc");
    expect(calls[0]?.headers).toEqual({ "xi-api-key": "sk_1" });
  });

  it("gets a signed URL for text", async () => {
    const { fetch, calls } = fakeFetch(200, { signed_url: "wss://signed" });
    const auth = new ElevenLabsAuth({ agentId: "agent_abc", credentials: keyStore("sk_1"), fetch });

    await expect(auth.credentialsFor("text")).resolves.toEqual({ kind: "signed-url", url: "wss://signed" });
    expect(calls[0]?.url).toContain("/v1/convai/conversation/get-signed-url?agent_id=agent_abc");
  });

  it("fails clearly without an API key, without calling the network", async () => {
    const { fetch, calls } = fakeFetch(200, {});
    const auth = new ElevenLabsAuth({ agentId: "agent_abc", credentials: keyStore(undefined), fetch });
    await expect(auth.credentialsFor("voice")).rejects.toMatchObject({ code: "missing-api-key" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [401, "auth-failed"],
    [403, "auth-failed"],
    [404, "agent-not-found"],
    [500, "network"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const { fetch } = fakeFetch(status, "nope");
    const auth = new ElevenLabsAuth({ agentId: "agent_abc", credentials: keyStore("sk"), fetch });
    await expect(auth.credentialsFor("text")).rejects.toMatchObject({ code });
  });

  it("maps a thrown fetch to a network error", async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError("Failed to fetch"));
    const auth = new ElevenLabsAuth({ agentId: "agent_abc", credentials: keyStore("sk"), fetch });
    await expect(auth.credentialsFor("voice")).rejects.toMatchObject({ code: "network" });
  });

  it("rejects a malformed response", async () => {
    const { fetch } = fakeFetch(200, { unexpected: true });
    const auth = new ElevenLabsAuth({ agentId: "agent_abc", credentials: keyStore("sk"), fetch });
    await expect(auth.credentialsFor("voice")).rejects.toMatchObject({ code: "unknown" });
  });
});
