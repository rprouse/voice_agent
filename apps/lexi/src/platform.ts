// Tauri implementations of the platform services core asks for.
import type { AppConfigInput, CredentialProvider, FetchLike } from "@lexi/core";
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { load, type Store } from "@tauri-apps/plugin-store";

// --- Secrets: OS credential store via Rust commands (src-tauri/src/secrets.rs) ---

export const credentials: CredentialProvider = {
  async get(name) {
    const value = await invoke<string | null>("get_secret", { name });
    return value ?? undefined;
  },
};

export const saveApiKey = (value: string) =>
  invoke<undefined>("set_secret", { name: "elevenlabs", value });

export const deleteApiKey = () => invoke<undefined>("delete_secret", { name: "elevenlabs" });

export async function hasApiKey(): Promise<boolean> {
  return (await credentials.get("elevenlabs")) !== undefined;
}

// --- Native voice support (plugins/lexi-voice): Android audio routing and keep-alive ---

export const startNativeVoice = () => invoke<undefined>("plugin:lexi-voice|start_session");
export const stopNativeVoice = () => invoke<undefined>("plugin:lexi-voice|stop_session");

// --- HTTP outside the webview (no CORS), restricted to api.elevenlabs.io by capabilities ---

export const httpFetch: FetchLike = (url, init) => tauriFetch(url, init);

// --- Non-secret settings in the app data folder ---

let storePromise: Promise<Store> | null = null;
const settingsStore = () =>
  (storePromise ??= load("settings.json", { autoSave: false, defaults: {} }));

const settingKeys = ["agents", "activeAgentId", "volume", "contextTurns"] as const;

/** Raw stored settings, for parseConfig. Includes `agentId` from before multiple agents. */
export async function loadSettings(): Promise<Record<string, unknown>> {
  const store = await settingsStore();
  const keys = [...settingKeys, "agentId"];
  const values = await Promise.all(keys.map((key) => store.get<unknown>(key)));
  return Object.fromEntries(
    keys.flatMap((key, i) => (values[i] !== undefined ? [[key, values[i]]] : [])),
  );
}

export async function saveSettings(settings: Partial<AppConfigInput>): Promise<void> {
  const store = await settingsStore();
  // Optional keys may be present with an undefined value; skip those.
  for (const [key, value] of Object.entries(settings) as [string, unknown][]) {
    if (value !== undefined) await store.set(key, value);
  }
  // The agent list replaces the single agent ID older versions stored.
  if (settings.agents !== undefined) await store.delete("agentId");
  await store.save();
}
