import { z } from "zod";
import type { AgentCredential, Mode } from "../agent/types.ts";
import { AppError } from "../errors.ts";

/** Where the app keeps secrets (OS keychain). Core never stores them. */
export interface CredentialProvider {
  get(name: "elevenlabs"): Promise<string | undefined>;
}

/** The subset of `fetch` core needs. The app passes the Tauri HTTP plugin's fetch (no CORS). */
export type FetchLike = (
  url: string,
  init: { method: "GET"; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface AgentAuth {
  credentialsFor(mode: Mode, signal?: AbortSignal): Promise<AgentCredential>;
}

const tokenResponse = z.object({ token: z.string().min(1) });
const signedUrlResponse = z.object({ signed_url: z.string().min(1) });

/** Exchanges the ElevenLabs API key for a short-lived credential for a private agent. */
export class ElevenLabsAuth implements AgentAuth {
  readonly #agentId: string;
  readonly #credentials: CredentialProvider;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;

  constructor(options: {
    agentId: string;
    credentials: CredentialProvider;
    fetch: FetchLike;
    baseUrl?: string;
  }) {
    this.#agentId = options.agentId;
    this.#credentials = options.credentials;
    this.#fetch = options.fetch;
    this.#baseUrl = options.baseUrl ?? "https://api.elevenlabs.io";
  }

  async credentialsFor(mode: Mode, signal?: AbortSignal): Promise<AgentCredential> {
    const apiKey = await this.#credentials.get("elevenlabs");
    if (!apiKey) {
      throw new AppError("missing-api-key", "No ElevenLabs API key is set.");
    }

    const id = encodeURIComponent(this.#agentId);
    const path =
      mode === "voice"
        ? `/v1/convai/conversation/token?agent_id=${id}`
        : `/v1/convai/conversation/get-signed-url?agent_id=${id}`;

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.#fetch(this.#baseUrl + path, {
        method: "GET",
        headers: { "xi-api-key": apiKey },
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      throw AppError.from(err, "network");
    }

    if (!response.ok) {
      throw errorForStatus(response.status, await safeText(response));
    }

    const body = await response.json();
    if (mode === "voice") {
      const parsed = tokenResponse.safeParse(body);
      if (!parsed.success) throw new AppError("unknown", "ElevenLabs returned no token.");
      return { kind: "conversation-token", token: parsed.data.token };
    }
    const parsed = signedUrlResponse.safeParse(body);
    if (!parsed.success) throw new AppError("unknown", "ElevenLabs returned no signed URL.");
    return { kind: "signed-url", url: parsed.data.signed_url };
  }
}

function errorForStatus(status: number, body: string): AppError {
  const detail = body ? ` ${body.slice(0, 200)}` : "";
  if (status === 401 || status === 403) {
    return new AppError("auth-failed", `ElevenLabs rejected the API key (HTTP ${String(status)}).${detail}`);
  }
  if (status === 404) {
    return new AppError("agent-not-found", `ElevenLabs couldn't find the agent (HTTP 404).${detail}`);
  }
  return new AppError("network", `ElevenLabs request failed (HTTP ${String(status)}).${detail}`);
}

async function safeText(response: { text(): Promise<string> }): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
