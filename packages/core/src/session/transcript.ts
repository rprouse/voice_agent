import type { Mode } from "../agent/types.ts";

export type TranscriptRole = "user" | "agent";
export type TranscriptStatus = "streaming" | "final" | "failed";

export interface TranscriptEntry {
  readonly id: string;
  readonly role: TranscriptRole;
  readonly text: string;
  /** Whether the entry was typed/read (text) or spoken/heard (voice). */
  readonly mode: Mode;
  readonly status: TranscriptStatus;
  /** Milliseconds since the epoch. */
  readonly at: number;
}

/**
 * Summarises recent turns for a new ElevenLabs conversation, so switching between text and
 * voice (or reconnecting after a timeout) doesn't lose the thread. Returns null when there
 * is nothing worth sending.
 */
export function buildContext(
  entries: readonly TranscriptEntry[],
  maxEntries: number,
): string | null {
  if (maxEntries <= 0) return null;
  const usable = entries.filter((e) => e.status === "final" && e.text.trim() !== "");
  const recent = usable.slice(-maxEntries);
  if (recent.length === 0) return null;
  const lines = recent.map((e) => `${e.role === "user" ? "User" : "You"}: ${e.text.trim()}`);
  return [
    "This continues an earlier conversation with the same user. Recent turns, oldest first:",
    ...lines,
    "Carry on naturally from here without repeating these back or greeting the user again.",
  ].join("\n");
}
