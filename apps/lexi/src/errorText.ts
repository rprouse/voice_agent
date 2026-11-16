import type { AppError } from "@lexi/core";

/** How the desktop app words each core error. */
export function errorText(error: AppError): string {
  switch (error.code) {
    case "missing-api-key":
      return "Add your ElevenLabs API key in Settings.";
    case "auth-failed":
      return "ElevenLabs rejected the API key. Check it in Settings.";
    case "agent-not-found":
      return "ElevenLabs couldn't find that agent. Check the agent ID in Settings.";
    case "invalid-config":
      return error.message;
    case "mic-denied":
      return "Lexi can't use the microphone. Check Windows microphone privacy settings.";
    case "network":
      return "Couldn't reach ElevenLabs. Check your connection and try again.";
    case "disconnected":
      return `The conversation dropped: ${error.message}`;
    case "unknown":
      return `Something went wrong: ${error.message}`;
  }
}
