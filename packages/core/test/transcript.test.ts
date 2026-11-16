import { describe, expect, it } from "vitest";
import { buildContext, type TranscriptEntry } from "../src/index.ts";

let n = 0;
const entry = (role: "user" | "agent", text: string, status: TranscriptEntry["status"] = "final"): TranscriptEntry => ({
  id: `e${String(++n)}`,
  role,
  text,
  mode: "text",
  status,
  at: n,
});

describe("buildContext", () => {
  it("returns null with no usable entries", () => {
    expect(buildContext([], 10)).toBeNull();
    expect(buildContext([entry("user", "failed", "failed"), entry("agent", "  ")], 10)).toBeNull();
  });

  it("returns null when context is turned off", () => {
    expect(buildContext([entry("user", "hi")], 0)).toBeNull();
  });

  it("lists final entries oldest first, labelling the agent as 'You'", () => {
    const context = buildContext([entry("user", "hi"), entry("agent", "hello")], 10);
    expect(context).toContain("User: hi\nYou: hello");
  });

  it("keeps only the most recent entries", () => {
    const entries = [entry("user", "one"), entry("agent", "two"), entry("user", "three")];
    const context = buildContext(entries, 2) ?? "";
    expect(context).not.toContain("one");
    expect(context).toContain("You: two");
    expect(context).toContain("User: three");
  });

  it("skips streaming and failed entries", () => {
    const entries = [entry("user", "sent"), entry("user", "lost", "failed"), entry("agent", "typing", "streaming")];
    const context = buildContext(entries, 10) ?? "";
    expect(context).toContain("User: sent");
    expect(context).not.toContain("lost");
    expect(context).not.toContain("typing");
  });
});
