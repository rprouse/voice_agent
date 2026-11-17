import type { SessionState } from "@lexi/core";
import { useEffect } from "react";

const MAX_RECOVERIES = 5;
const REATTACH_DELAY_MS = 150;

/**
 * Recovers Lexi's voice when Android drops the WebView's audio output.
 *
 * On Samsung devices (seen on a Galaxy S23 Ultra) the WebView's audio goes through a shared
 * low-latency AAudio (MMAP) output. While a conversation connects, the SDK opens and closes
 * several audio streams; Android sometimes tears down the shared output and disconnects the
 * others ("AAUDIO_SERVICE_EVENT_DISCONNECTED", then "The AudioContext encountered an error from
 * the audio device"). If that hits the WebRTC renderer, the agent's <audio> element pauses and
 * Lexi is silent: her audio still arrives but is never rendered.
 *
 * Chrome renders remote WebRTC audio through one shared renderer, so play() or a second
 * <audio> element reuses the broken output. Detaching the stream from the element and
 * reattaching it lets the renderer be rebuilt on a fresh output.
 */
export function useAgentAudioGuard(state: SessionState): void {
  const connected = state.mode === "voice" && state.connection === "connected";

  useEffect(() => {
    if (!connected) return;
    let reported = false;
    let recoveries = 0;
    const recovering = new WeakSet<HTMLAudioElement>();

    const recover = (audio: HTMLAudioElement) => {
      const stream = audio.srcObject;
      if (!stream) return;
      recoveries++;
      recovering.add(audio);
      console.warn(
        `Lexi audio: agent audio paused; reattaching (attempt ${String(recoveries)})`,
        JSON.stringify(describe(audio)),
      );
      audio.srcObject = null;
      setTimeout(() => {
        audio.srcObject = stream;
        audio
          .play()
          .then(() => {
            console.info("Lexi audio: playback resumed", JSON.stringify(describe(audio)));
          })
          .catch((err: unknown) => {
            console.warn("Lexi audio: play() after reattach failed", errorName(err));
          })
          .finally(() => {
            recovering.delete(audio);
          });
      }, REATTACH_DELAY_MS);
    };

    const check = () => {
      const elements = [...document.querySelectorAll("audio")].filter(
        (a) => a.srcObject || recovering.has(a),
      );
      if (!reported && elements.length > 0) {
        reported = true;
        console.info("Lexi audio elements", JSON.stringify(elements.map(describe)));
      }
      for (const audio of elements) {
        if (!audio.paused || recovering.has(audio)) continue;
        if (recoveries >= MAX_RECOVERIES) {
          console.warn("Lexi audio: still paused after recovery attempts; giving up");
          continue;
        }
        recover(audio);
      }
    };

    const timer = setInterval(check, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [connected]);
}

function describe(audio: HTMLAudioElement) {
  return {
    paused: audio.paused,
    readyState: audio.readyState,
    muted: audio.muted,
    volume: audio.volume,
  };
}

function errorName(err: unknown) {
  return err instanceof Error ? err.name : String(err);
}
