import { z } from "zod";
import { AppError } from "../errors.ts";

export const appConfigSchema = z.object({
  /** ElevenLabs agent ID, e.g. `agent_...`. */
  agentId: z
    .string()
    .trim()
    .regex(/^agent_[A-Za-z0-9]+$/, "Agent IDs look like agent_..."),
  /** Output volume for Lexi's voice, 0 to 1. */
  volume: z.number().min(0).max(1).default(0.5),
  /** How many recent transcript entries to pass to a new conversation as context. */
  contextTurns: z.number().int().min(0).max(100).default(20),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type AppConfigInput = z.input<typeof appConfigSchema>;

/** Validates settings from storage or the UI, filling in defaults. */
export function parseConfig(input: unknown): AppConfig {
  const result = appConfigSchema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");
    throw new AppError("invalid-config", `Invalid settings: ${detail}`, { cause: result.error });
  }
  return result.data;
}
