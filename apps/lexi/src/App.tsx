import { useState } from "react";
import { Chat } from "./Chat.tsx";
import { useLexiSession, useNativeVoice, useSessionState, useSettings } from "./hooks.ts";
import { saveSettings } from "./platform.ts";
import { Settings } from "./Settings.tsx";

export function App() {
  const { settings, reload } = useSettings();
  const session = useLexiSession(settings?.session ?? null);
  // Here rather than in Chat, so voice keeps its native support while Settings is open.
  useNativeVoice(useSessionState(session));
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolume] = useState<number | null>(null);

  if (!settings) {
    return <div className="app loading">Loading…</div>;
  }

  if (!session || !settings.keySaved || showSettings) {
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
      key={settings.session?.agentId}
      session={session}
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
