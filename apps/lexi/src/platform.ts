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

// --- HTTP outside the webview (no CORS), restricted to api.elevenlabs.io by capabilities ---

export const httpFetch: FetchLike = (url, init) => tauriFetch(url, init);

// --- Non-secret settings in the app data folder ---

let storePromise: Promise<Store> | null = null;
const settingsStore = () =>
  (storePromise ??= load("settings.json", { autoSave: false, defaults: {} }));

export async function loadSettings(): Promise<Partial<AppConfigInput>> {
  const store = await settingsStore();
  const [agentId, volume, contextTurns] = await Promise.all([
    store.get<string>("agentId"),
    store.get<number>("volume"),
    store.get<number>("contextTurns"),
  ]);
  return {
    ...(agentId !== undefined ? { agentId } : {}),
    ...(volume !== undefined ? { volume } : {}),
    ...(contextTurns !== undefined ? { contextTurns } : {}),
  };
}

export async function saveSettings(settings: Partial<AppConfigInput>): Promise<void> {
  const store = await settingsStore();
  // Optional keys may be present with an undefined value; skip those.
  for (const [key, value] of Object.entries(settings) as [string, unknown][]) {
    if (value !== undefined) await store.set(key, value);
  }
  await store.save();
}
