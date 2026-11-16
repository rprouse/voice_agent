import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/index.ts";

describe("parseConfig", () => {
  it("fills in defaults", () => {
    expect(parseConfig({ agentId: "agent_abc123" })).toEqual({
      agentId: "agent_abc123",
      volume: 0.5,
      contextTurns: 20,
    });
  });

  it("trims the agent ID", () => {
    expect(parseConfig({ agentId: "  agent_abc  " }).agentId).toBe("agent_abc");
  });

  it.each([
    [{}, "agentId"],
    [{ agentId: "not-an-agent" }, "agentId"],
    [{ agentId: "agent_abc", volume: 2 }, "volume"],
    [{ agentId: "agent_abc", contextTurns: 1.5 }, "contextTurns"],
  ])("rejects %j with a message naming %s", (input, field) => {
    expect(() => parseConfig(input)).toThrow(expect.objectContaining({ code: "invalid-config" }));
    expect(() => parseConfig(input)).toThrow(new RegExp(field));
  });
});
