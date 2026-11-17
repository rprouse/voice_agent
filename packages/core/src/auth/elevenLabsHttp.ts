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

export interface ElevenLabsClientOptions {
  credentials: CredentialProvider;
  fetch: FetchLike;
  baseUrl?: string;
}

export const DEFAULT_BASE_URL = "https://api.elevenlabs.io";

/** GETs an ElevenLabs API path with the stored API key, mapping failures to AppErrors. */
export async function elevenLabsGet(
  options: ElevenLabsClientOptions,
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const apiKey = await options.credentials.get("elevenlabs");
  if (!apiKey) {
    throw new AppError("missing-api-key", "No ElevenLabs API key is set.");
  }

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await options.fetch((options.baseUrl ?? DEFAULT_BASE_URL) + path, {
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
  return response.json();
}

function errorForStatus(status: number, body: string): AppError {
  const detail = body ? ` ${body.slice(0, 200)}` : "";
  if (status === 401 || status === 403) {
    return new AppError(
      "auth-failed",
      `ElevenLabs rejected the API key (HTTP ${String(status)}).${detail}`,
    );
  }
  if (status === 404) {
    return new AppError(
      "agent-not-found",
      `ElevenLabs couldn't find the agent (HTTP 404).${detail}`,
    );
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
