import { z } from "zod";
import type { AgentCredential, Mode } from "../agent/types.ts";
import { AppError } from "../errors.ts";
import { elevenLabsGet, type ElevenLabsClientOptions } from "./elevenLabsHttp.ts";

export interface AgentAuth {
  credentialsFor(mode: Mode, signal?: AbortSignal): Promise<AgentCredential>;
}

const tokenResponse = z.object({ token: z.string().min(1) });
const signedUrlResponse = z.object({ signed_url: z.string().min(1) });

/** Exchanges the ElevenLabs API key for a short-lived credential for a private agent. */
export class ElevenLabsAuth implements AgentAuth {
  readonly #agentId: string;
  readonly #client: ElevenLabsClientOptions;

  constructor(options: { agentId: string } & ElevenLabsClientOptions) {
    const { agentId, ...client } = options;
    this.#agentId = agentId;
    this.#client = client;
  }

  async credentialsFor(mode: Mode, signal?: AbortSignal): Promise<AgentCredential> {
    const id = encodeURIComponent(this.#agentId);
    const path =
      mode === "voice"
        ? `/v1/convai/conversation/token?agent_id=${id}`
        : `/v1/convai/conversation/get-signed-url?agent_id=${id}`;

    const body = await elevenLabsGet(this.#client, path, signal);
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
