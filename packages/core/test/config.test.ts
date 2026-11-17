import { describe, expect, it } from "vitest";
import { activeAgent, agentLabel, parseAgentId, parseConfig } from "../src/index.ts";

describe("parseConfig", () => {
  it("fills in defaults", () => {
    expect(parseConfig({ agents: [{ id: "agent_abc123" }] })).toEqual({
      agents: [{ id: "agent_abc123", name: "" }],
      volume: 0.5,
      contextTurns: 20,
    });
  });

  it("trims agent IDs and names", () => {
    const config = parseConfig({ agents: [{ id: "  agent_abc  ", name: "  Lexi " }] });
    expect(config.agents).toEqual([{ id: "agent_abc", name: "Lexi" }]);
  });

  it("keeps the active agent and the agent order", () => {
    const config = parseConfig({
      agents: [{ id: "agent_b" }, { id: "agent_a" }],
      activeAgentId: "agent_a",
    });
    expect(config.agents.map((a) => a.id)).toEqual(["agent_b", "agent_a"]);
    expect(config.activeAgentId).toBe("agent_a");
  });

  it("migrates the single agentId from older settings", () => {
    expect(parseConfig({ agentId: "agent_old", volume: 0.3 })).toEqual({
      agents: [{ id: "agent_old", name: "" }],
      volume: 0.3,
      contextTurns: 20,
    });
  });

  it("prefers agents over a leftover agentId", () => {
    const config = parseConfig({ agentId: "agent_old", agents: [{ id: "agent_new" }] });
    expect(config.agents).toEqual([{ id: "agent_new", name: "" }]);
    expect(config).not.toHaveProperty("agentId");
  });

  it.each([
    [{}, "agents"],
    [{ agents: [] }, "agents"],
    [{ agents: [{ id: "not-an-agent" }] }, "agents.0.id"],
    [{ agents: [{ id: "agent_a" }, { id: "agent_a" }] }, "once"],
    [{ agents: [{ id: "agent_a", name: "x".repeat(101) }] }, "agents.0.name"],
    [{ agentId: "not-an-agent" }, "agents.0.id"],
    [{ agents: [{ id: "agent_abc" }], volume: 2 }, "volume"],
    [{ agents: [{ id: "agent_abc" }], contextTurns: 1.5 }, "contextTurns"],
  ])("rejects %j with a message naming %s", (input, field) => {
    expect(() => parseConfig(input)).toThrow(expect.objectContaining({ code: "invalid-config" }));
    expect(() => parseConfig(input)).toThrow(new RegExp(field.replace(/\./g, "\\.")));
  });
});

describe("parseAgentId", () => {
  it("trims a valid ID", () => {
    expect(parseAgentId(" agent_abc ")).toBe("agent_abc");
  });

  it("rejects anything else", () => {
    expect(() => parseAgentId("abc")).toThrow(
      expect.objectContaining({ code: "invalid-config", message: "Agent IDs look like agent_..." }),
    );
  });
});

describe("activeAgent", () => {
  const agents = [
    { id: "agent_a", name: "A" },
    { id: "agent_b", name: "" },
  ];

  it("returns the active agent", () => {
    expect(activeAgent({ agents, activeAgentId: "agent_b" }).id).toBe("agent_b");
  });

  it("falls back to the first agent when the active one is gone or unset", () => {
    expect(activeAgent({ agents, activeAgentId: "agent_gone" }).id).toBe("agent_a");
    expect(activeAgent({ agents }).id).toBe("agent_a");
  });

  it("fails without agents", () => {
    expect(() => activeAgent({ agents: [] })).toThrow(
      expect.objectContaining({ code: "invalid-config" }),
    );
  });
});

describe("agentLabel", () => {
  it("uses the name, or the ID when there's no name", () => {
    expect(agentLabel({ id: "agent_a", name: "Lexi" })).toBe("Lexi");
    expect(agentLabel({ id: "agent_a", name: "" })).toBe("agent_a");
  });
});
