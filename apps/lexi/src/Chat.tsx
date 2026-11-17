import type { LexiSession, TranscriptEntry } from "@lexi/core";
import { useEffect, useRef, useState, type SyntheticEvent, type KeyboardEvent } from "react";
import { errorText } from "./errorText.ts";
import { useSessionError, useSessionState, useTranscript, useVoiceActivity } from "./hooks.ts";

interface ChatProps {
  session: LexiSession;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onOpenSettings: () => void;
}

export function Chat({ session, volume, onVolumeChange, onOpenSettings }: ChatProps) {
  const transcript = useTranscript(session);
  const state = useSessionState(session);
  const activity = useVoiceActivity(session);
  const { error, dismiss } = useSessionError(session);

  useEffect(() => {
    session.setVolume(volume);
  }, [session, volume]);

  const voiceOn = state.mode === "voice" && state.connection !== "idle";
  const voiceConnecting = voiceOn && state.connection === "connecting";
  const status =
    state.connection === "connecting"
      ? "Connecting…"
      : voiceOn
        ? activity === "speaking"
          ? "Lexi is speaking"
          : "Listening"
        : state.connection === "connected"
          ? "Connected"
          : "Ready";

  return (
    <div className="app">
      <header className="header">
        <h1>Lexi</h1>
        <span className={`status status-${state.connection}`}>{status}</span>
        <button
          className="icon-button"
          onClick={() => void session.reset()}
          disabled={transcript.length === 0}
          title="New conversation"
        >
          New
        </button>
        <button className="icon-button" onClick={onOpenSettings} title="Settings">
          Settings
        </button>
      </header>

      <Transcript entries={transcript} />

      {error && (
        <div className="error" role="alert">
          <span>{errorText(error)}</span>
          <button className="link-button" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}

      <footer className="footer">
        {voiceOn && (
          <VoiceStatus
            connecting={voiceConnecting}
            speaking={activity === "speaking"}
            muted={state.muted}
          />
        )}
        <div className="voice-bar">
          <button
            className={voiceOn ? "talk talk-on" : "talk"}
            onClick={() => {
              dismiss();
              void (voiceOn ? session.stopVoice() : session.startVoice());
            }}
            // A text conversation that is still connecting can't be interrupted by Talk.
            disabled={state.connection === "connecting" && !voiceOn}
          >
            {voiceConnecting ? "Cancel" : voiceOn ? "Stop talking" : "Talk"}
          </button>
          <button
            onClick={() => {
              session.setMuted(!state.muted);
            }}
            disabled={!voiceOn}
            aria-pressed={state.muted}
          >
            {state.muted ? "Unmute" : "Mute"}
          </button>
          <label className="volume">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                onVolumeChange(Number(e.target.value));
              }}
            />
          </label>
        </div>
        <Composer
          onSend={(text) => {
            dismiss();
            void session.send(text);
          }}
          placeholder={voiceOn ? "Type to Lexi while talking…" : "Message Lexi…"}
        />
      </footer>
    </div>
  );
}

/** Hard-to-miss voice state, so nobody starts talking before Lexi is listening. */
function VoiceStatus({
  connecting,
  speaking,
  muted,
}: {
  connecting: boolean;
  speaking: boolean;
  muted: boolean;
}) {
  const [kind, text] = connecting
    ? (["connecting", "Connecting… wait before you speak"] as const)
    : muted
      ? (["muted", "Muted: Lexi can't hear you"] as const)
      : speaking
        ? (["speaking", "Lexi is speaking"] as const)
        : (["listening", "Listening, go ahead"] as const);
  return (
    <div className={`voice-status voice-status-${kind}`} role="status" aria-live="polite">
      <span className="voice-status-icon" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function Transcript({ entries }: { entries: readonly TranscriptEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <main className="transcript empty">
        <p>Type a message or press Talk to start.</p>
      </main>
    );
  }

  return (
    <main className="transcript" aria-live="polite">
      {entries.map((entry) => (
        <div key={entry.id} className={`bubble bubble-${entry.role} bubble-${entry.status}`}>
          <span className="bubble-text">{entry.text || "…"}</span>
          {entry.mode === "voice" && <span className="bubble-meta">spoken</span>}
          {entry.status === "failed" && <span className="bubble-meta">not sent</span>}
        </div>
      ))}
      <div ref={end} />
    </main>
  );
}

function Composer({
  onSend,
  placeholder,
}: {
  onSend: (text: string) => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");

  const submit = (e?: SyntheticEvent) => {
    e?.preventDefault();
    if (text.trim() === "") return;
    onSend(text);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
        aria-label="Message"
      />
      <button type="submit" className="primary" disabled={text.trim() === ""}>
        Send
      </button>
    </form>
  );
}
