import {
  AppError,
  ElevenLabsAgents,
  parseAgentId,
  parseConfig,
  type AgentEntry,
  type CredentialProvider,
} from "@lexi/core";
import { useState, type KeyboardEvent, type SyntheticEvent } from "react";
import type { LoadedSettings } from "./hooks.ts";
import { credentials, deleteApiKey, httpFetch, saveApiKey, saveSettings } from "./platform.ts";

interface SettingsProps {
  settings: LoadedSettings;
  onSaved: () => void;
  /** Absent when settings are required before the app can be used. */
  onClose?: () => void;
}

const messageFor = (err: unknown, fallback: string) =>
  err instanceof AppError ? err.message : `${fallback}: ${String(err)}`;

export function Settings({ settings, onSaved, onClose }: SettingsProps) {
  const [agents, setAgents] = useState<AgentEntry[]>(() => [...(settings.agents ?? [])]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [agentNote, setAgentNote] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [contextTurns, setContextTurns] = useState(settings.contextTurns);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsKey = !settings.keySaved && apiKey.trim() === "";

  /** The key typed here (not saved yet) or the saved one, for looking up agent names. */
  const lookupCredentials: CredentialProvider = {
    get: async (name) => apiKey.trim() || (await credentials.get(name)),
  };

  /**
   * Checks the agent typed into the add row with ElevenLabs and fills in its name if none
   * was typed. Returns null (with a note) if it can't be added.
   */
  const resolveNewAgent = async (): Promise<AgentEntry | null> => {
    setAgentNote(null);
    let id: string;
    try {
      id = parseAgentId(newId);
    } catch (err) {
      setAgentNote(messageFor(err, "Invalid agent ID"));
      return null;
    }
    if (agents.some((a) => a.id === id)) {
      setAgentNote("That agent is already in the list.");
      return null;
    }

    let name = newName.trim();
    try {
      const info = await new ElevenLabsAgents({
        credentials: lookupCredentials,
        fetch: httpFetch,
      }).getAgent(id);
      if (name === "") name = info.name;
    } catch (err) {
      if (err instanceof AppError && err.code === "agent-not-found") {
        setAgentNote("ElevenLabs couldn't find that agent. Check the ID.");
        return null;
      }
      // Without a key, or if the lookup fails, add it anyway; a name can be typed later.
      if (name === "") {
        setAgentNote(
          err instanceof AppError && err.code === "missing-api-key"
            ? "Added. Enter your API key to look up agent names, or type a name."
            : `Added, but couldn't get its name from ElevenLabs. ${messageFor(err, "Lookup failed")}`,
        );
      }
    }
    return { id, name };
  };

  const add = async () => {
    setAdding(true);
    try {
      const agent = await resolveNewAgent();
      if (agent) {
        setAgents((list) => [...list, agent]);
        setNewId("");
        setNewName("");
      }
    } finally {
      setAdding(false);
    }
  };

  // Enter in the add row adds the agent instead of saving the form.
  const addOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!adding && newId.trim() !== "") void add();
    }
  };

  const rename = (id: string, name: string) => {
    setAgents((list) => list.map((a) => (a.id === id ? { ...a, name } : a)));
  };

  const remove = (id: string) => {
    setAgents((list) => list.filter((a) => a.id !== id));
  };

  const save = async (e: SyntheticEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      // An agent typed into the add row but not added yet is added on save.
      let list = agents;
      if (newId.trim() !== "") {
        const agent = await resolveNewAgent();
        if (!agent) return;
        list = [...agents, agent];
        setAgents(list);
        setNewId("");
        setNewName("");
      }
      const config = parseConfig({
        agents: list,
        ...(settings.activeAgentId ? { activeAgentId: settings.activeAgentId } : {}),
        contextTurns,
        volume: settings.volume,
      });
      if (apiKey.trim() !== "") await saveApiKey(apiKey);
      await saveSettings({ agents: config.agents, contextTurns: config.contextTurns });
      setApiKey("");
      onSaved();
    } catch (err) {
      setMessage(messageFor(err, "Couldn't save settings"));
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
        {!onClose && <p className="hint">Connect Lexi to your ElevenLabs agents to get started.</p>}

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
          <small>Stored in your device's secure credential store, never in a file.</small>
        </label>
        {settings.keySaved && (
          <button type="button" className="link-button" onClick={() => void removeKey()}>
            Remove saved key
          </button>
        )}

        <fieldset className="agents">
          <legend>Agents</legend>
          {agents.length > 0 && (
            <ul className="agent-list">
              {agents.map((agent) => (
                <li key={agent.id} className="agent-row">
                  <input
                    value={agent.name}
                    onChange={(e) => {
                      rename(agent.id, e.target.value);
                    }}
                    placeholder={agent.id}
                    maxLength={100}
                    aria-label={`Name for ${agent.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      remove(agent.id);
                    }}
                    aria-label={`Delete ${agent.name || agent.id}`}
                  >
                    Delete
                  </button>
                  <small className="agent-id">{agent.id}</small>
                </li>
              ))}
            </ul>
          )}

          <div className="agent-add">
            <input
              value={newId}
              onChange={(e) => {
                setNewId(e.target.value);
              }}
              onKeyDown={addOnEnter}
              placeholder="agent_..."
              aria-label="New agent ID"
              autoComplete="off"
              spellCheck={false}
            />
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
              }}
              onKeyDown={addOnEnter}
              placeholder="Name (optional)"
              aria-label="New agent name"
              maxLength={100}
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={adding || newId.trim() === ""}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {agentNote && (
            <small className="agent-note" role="status">
              {agentNote}
            </small>
          )}
          <small>
            Agent IDs are on each agent's page in the ElevenLabs dashboard. Leave the name empty to
            use the agent's name from ElevenLabs.
          </small>
        </fieldset>

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

        <button type="submit" className="primary" disabled={saving || adding || needsKey}>
          {saving ? "Saving…" : "Save"}
        </button>
        {needsKey && <small>An API key is required.</small>}
      </form>
    </div>
  );
}
