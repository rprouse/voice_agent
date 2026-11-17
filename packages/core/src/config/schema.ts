import { z } from "zod";
import { AppError } from "../errors.ts";

/** ElevenLabs agent ID, e.g. `agent_...`. */
export const agentIdSchema = z
  .string()
  .trim()
  .regex(/^agent_[A-Za-z0-9]+$/, "Agent IDs look like agent_...");

export const agentEntrySchema = z.object({
  id: agentIdSchema,
  /** Display name; empty means show the ID. */
  name: z.string().trim().max(100).default(""),
});

export const appConfigSchema = z.object({
  /** The ElevenLabs agents Lexi can talk to, in display order. */
  agents: z
    .array(agentEntrySchema)
    .min(1, "Add at least one agent")
    .refine((agents) => new Set(agents.map((a) => a.id)).size === agents.length, {
      message: "Each agent can only be added once",
    }),
  /** The agent chosen in chat; falls back to the first agent. */
  activeAgentId: z.string().optional(),
  /** Output volume for Lexi's voice, 0 to 1. */
  volume: z.number().min(0).max(1).default(0.5),
  /** How many recent transcript entries to pass to a new conversation as context. */
  contextTurns: z.number().int().min(0).max(100).default(20),
});

export type AgentEntry = z.infer<typeof agentEntrySchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type AppConfigInput = z.input<typeof appConfigSchema>;

/** Validates settings from storage or the UI, filling in defaults. */
export function parseConfig(input: unknown): AppConfig {
  const result = appConfigSchema.safeParse(migrate(input));
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");
    throw new AppError("invalid-config", `Invalid settings: ${detail}`, { cause: result.error });
  }
  return result.data;
}

/** Validates a single agent ID, e.g. one typed into Settings. Returns it trimmed. */
export function parseAgentId(input: string): string {
  const result = agentIdSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("invalid-config", result.error.issues[0]?.message ?? "Invalid agent ID", {
      cause: result.error,
    });
  }
  return result.data;
}

/** The agent to use: the active one if it's still in the list, otherwise the first. */
export function activeAgent(config: Pick<AppConfig, "agents" | "activeAgentId">): AgentEntry {
  const first = config.agents[0];
  if (!first) throw new AppError("invalid-config", "No agents are configured.");
  return config.agents.find((a) => a.id === config.activeAgentId) ?? first;
}

/** The name to show for an agent. */
export function agentLabel(agent: AgentEntry): string {
  return agent.name || agent.id;
}

/** Settings saved before multiple agents had a single `agentId`. */
function migrate(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const { agentId, ...rest } = input as Record<string, unknown>;
  if (agentId === undefined || "agents" in rest) return rest;
  return { ...rest, agents: [{ id: agentId }] };
}
