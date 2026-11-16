import { AppError, parseConfig } from "@lexi/core";
import { useState, type SyntheticEvent } from "react";
import type { LoadedSettings } from "./hooks.ts";
import { deleteApiKey, saveApiKey, saveSettings } from "./platform.ts";

interface SettingsProps {
  settings: LoadedSettings;
  onSaved: () => void;
  /** Absent when settings are required before the app can be used. */
  onClose?: () => void;
}

export function Settings({ settings, onSaved, onClose }: SettingsProps) {
  const [agentId, setAgentId] = useState(settings.session?.agentId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [contextTurns, setContextTurns] = useState(settings.session?.contextTurns ?? 20);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsKey = !settings.keySaved && apiKey.trim() === "";

  const save = async (e: SyntheticEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const config = parseConfig({ agentId, contextTurns, volume: settings.volume });
      if (apiKey.trim() !== "") await saveApiKey(apiKey);
      await saveSettings({ agentId: config.agentId, contextTurns: config.contextTurns });
      setApiKey("");
      onSaved();
    } catch (err) {
      setMessage(err instanceof AppError ? err.message : `Couldn't save settings: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    setMessage(null);
    try {
      await deleteApiKey();
      onSaved();
    } catch (err) {
      setMessage(`Couldn't remove the key: ${String(err)}`);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Settings</h1>
        {onClose && (
          <button className="icon-button" onClick={onClose}>
            Close
          </button>
        )}
      </header>

      <form className="settings" onSubmit={(e) => void save(e)}>
        {!onClose && <p className="hint">Connect Lexi to your ElevenLabs agent to get started.</p>}

        <label>
          <span>Agent ID</span>
          <input
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
            }}
            placeholder="agent_..."
            autoComplete="off"
            spellCheck={false}
            required
          />
          <small>From the agent's page in the ElevenLabs dashboard.</small>
        </label>

        <label>
          <span>ElevenLabs API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
            }}
            placeholder={settings.keySaved ? "Saved. Enter a new key to replace it." : "sk_..."}
            autoComplete="off"
            spellCheck={false}
          />
          <small>Stored in Windows Credential Manager, never in a file.</small>
        </label>
        {settings.keySaved && (
          <button type="button" className="link-button" onClick={() => void removeKey()}>
            Remove saved key
          </button>
        )}

        <label>
          <span>Context turns</span>
          <input
            type="number"
            min={0}
            max={100}
            value={contextTurns}
            onChange={(e) => {
              setContextTurns(Number(e.target.value));
            }}
          />
          <small>
            Recent messages Lexi is reminded of when a new conversation starts, such as switching
            between typing and talking.
          </small>
        </label>

        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}

        <button type="submit" className="primary" disabled={saving || needsKey}>
          {saving ? "Saving…" : "Save"}
        </button>
        {needsKey && <small>An API key is required.</small>}
      </form>
    </div>
  );
}
