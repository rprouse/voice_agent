import { useState } from "react";
import { Chat } from "./Chat.tsx";
import { useAgentAudioGuard } from "./audioGuard.ts";
import { useAgentSession, useNativeVoice, useSessionState, useSettings } from "./hooks.ts";
import { saveSettings } from "./platform.ts";
import { Settings } from "./Settings.tsx";

export function App() {
  const { settings, reload, selectAgent } = useSettings();
  const session = useAgentSession(
    settings?.agents ?? null,
    settings?.activeAgentId ?? null,
    settings?.contextTurns ?? 20,
  );
  // Here rather than in Chat, so voice keeps its native support while Settings is open.
  const sessionState = useSessionState(session);
  useNativeVoice(sessionState);
  useAgentAudioGuard(sessionState);
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolume] = useState<number | null>(null);

  if (!settings) {
    return <div className="app loading">Loading…</div>;
  }

  const agent = settings.agents?.find((a) => a.id === settings.activeAgentId);
  if (!session || !settings.agents || !agent || !settings.keySaved || showSettings) {
    const required = !session || !settings.keySaved;
    return (
      <Settings
        settings={settings}
        onSaved={() => {
          void reload().then(() => {
            setShowSettings(false);
          });
        }}
        {...(required
          ? {}
          : {
              onClose: () => {
                setShowSettings(false);
              },
            })}
      />
    );
  }

  const currentVolume = volume ?? settings.volume;
  return (
    <Chat
      key={agent.id}
      session={session}
      agents={settings.agents}
      agent={agent}
      onSelectAgent={selectAgent}
      volume={currentVolume}
      onVolumeChange={(value) => {
        setVolume(value);
        void saveSettings({ volume: value });
      }}
      onOpenSettings={() => {
        setShowSettings(true);
      }}
    />
  );
}
