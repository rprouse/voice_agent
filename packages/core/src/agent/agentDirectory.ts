import { z } from "zod";
import { elevenLabsGet, type ElevenLabsClientOptions } from "../auth/elevenLabsHttp.ts";
import { AppError } from "../errors.ts";

export interface AgentInfo {
  readonly id: string;
  readonly name: string;
}

const agentResponse = z.object({ agent_id: z.string(), name: z.string().nullish() });

/** Looks up agents on the ElevenLabs account, e.g. to name an agent added by ID. */
export class ElevenLabsAgents {
  readonly #client: ElevenLabsClientOptions;

  constructor(options: ElevenLabsClientOptions) {
    this.#client = options;
  }

  async getAgent(agentId: string, signal?: AbortSignal): Promise<AgentInfo> {
    const body = await elevenLabsGet(
      this.#client,
      `/v1/convai/agents/${encodeURIComponent(agentId)}`,
      signal,
    );
    const parsed = agentResponse.safeParse(body);
    if (!parsed.success) throw new AppError("unknown", "ElevenLabs returned no agent details.");
    return { id: parsed.data.agent_id, name: parsed.data.name?.trim() ?? "" };
  }
}
