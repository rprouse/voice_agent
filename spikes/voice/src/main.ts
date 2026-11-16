// Stage 0 voice spike: throwaway code to prove ElevenLabs voice works inside a Tauri webview.
import { Conversation, type Mode, type Status } from "@elevenlabs/client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

type ActiveConversation = Awaited<ReturnType<typeof Conversation.startSession>>;
type ConnType = "webrtc" | "websocket";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const agentIdEl = $<HTMLInputElement>("agent-id");
const apiKeyEl = $<HTMLInputElement>("api-key");
const connTypeEl = $<HTMLSelectElement>("conn-type");
const startBtn = $<HTMLButtonElement>("start");
const stopBtn = $<HTMLButtonElement>("stop");
const muteBtn = $<HTMLButtonElement>("mute");
const micTestBtn = $<HTMLButtonElement>("mic-test");
const levelEl = $<HTMLMeterElement>("level");
const statusEl = $<HTMLParagraphElement>("status");
const transcriptEl = $<HTMLDivElement>("transcript");
const logEl = $<HTMLPreElement>("log");

// Spike only: remember inputs between runs. The real app stores keys in the OS keychain.
const STORE = { agentId: "spike.agentId", apiKey: "spike.apiKey", conn: "spike.conn" };
const load = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
agentIdEl.value = load(STORE.agentId) || (import.meta.env.VITE_LEXI_AGENT_ID ?? "");
apiKeyEl.value = load(STORE.apiKey);
connTypeEl.value = load(STORE.conn) || "webrtc";

function log(msg: string, data?: unknown) {
  const time = new Date().toISOString().slice(11, 23);
  const extra = data === undefined ? "" : " " + (typeof data === "string" ? data : JSON.stringify(data));
  logEl.textContent += `${time} ${msg}${extra}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function addTranscript(role: string, text: string) {
  const p = document.createElement("p");
  p.className = role;
  const b = document.createElement("b");
  b.textContent = role === "user" ? "You: " : "Agent: ";
  p.append(b, text);
  transcriptEl.append(p);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

const setStatus = (text: string) => (statusEl.textContent = text);
const errorText = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

// Environment facts that decide whether voice can work in this webview.
log("userAgent", navigator.userAgent);
log("isSecureContext", String(window.isSecureContext));
log("getUserMedia", String(!!navigator.mediaDevices?.getUserMedia));
log("RTCPeerConnection", String(typeof RTCPeerConnection !== "undefined"));
log("AudioWorklet", String(typeof AudioWorkletNode !== "undefined"));

// --- Mic test, independent of ElevenLabs ---
let micTest: { stream: MediaStream; ctx: AudioContext; raf: number } | null = null;

async function toggleMicTest() {
  if (micTest) {
    cancelAnimationFrame(micTest.raf);
    micTest.stream.getTracks().forEach((t) => t.stop());
    await micTest.ctx.close();
    micTest = null;
    levelEl.value = 0;
    micTestBtn.textContent = "Test mic";
    log("mic test stopped");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];
    log("mic granted", { label: track?.label, settings: track?.getSettings() });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      levelEl.value = peak;
      if (micTest) micTest.raf = requestAnimationFrame(tick);
    };
    micTest = { stream, ctx, raf: requestAnimationFrame(tick) };
    micTestBtn.textContent = "Stop mic test";
  } catch (err) {
    log("mic error", errorText(err));
    setStatus(`Mic error: ${errorText(err)}`);
  }
}

// --- ElevenLabs conversation ---
let conversation: ActiveConversation | null = null;
let muted = false;

async function getAuth(agentId: string, apiKey: string, conn: ConnType) {
  if (!apiKey) {
    return conn === "webrtc"
      ? { agentId, connectionType: "webrtc" as const }
      : { agentId, connectionType: "websocket" as const };
  }
  // Private agent: swap the API key for a short-lived credential. The Tauri HTTP plugin
  // makes the request outside the webview, so CORS does not apply.
  const base = "https://api.elevenlabs.io/v1/convai/conversation";
  const id = encodeURIComponent(agentId);
  const url = conn === "webrtc" ? `${base}/token?agent_id=${id}` : `${base}/get-signed-url?agent_id=${id}`;
  const res = await tauriFetch(url, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) throw new Error(`ElevenLabs auth failed: HTTP ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { token?: string; signed_url?: string };
  if (conn === "webrtc") {
    if (!body.token) throw new Error("No token in ElevenLabs response");
    return { conversationToken: body.token, connectionType: "webrtc" as const };
  }
  if (!body.signed_url) throw new Error("No signed_url in ElevenLabs response");
  return { signedUrl: body.signed_url, connectionType: "websocket" as const };
}

async function start() {
  const agentId = agentIdEl.value.trim();
  const apiKey = apiKeyEl.value.trim();
  const conn = connTypeEl.value as ConnType;
  if (!agentId) {
    setStatus("Enter an agent ID");
    return;
  }
  save(STORE.agentId, agentId);
  save(STORE.apiKey, apiKey);
  save(STORE.conn, conn);

  startBtn.disabled = true;
  setStatus("Connecting…");
  const t0 = performance.now();
  try {
    const auth = await getAuth(agentId, apiKey, conn);
    log("starting session", { conn, private: !!apiKey });
    conversation = await Conversation.startSession({
      ...auth,
      onConnect: ({ conversationId }) =>
        log("connected", { conversationId, ms: Math.round(performance.now() - t0) }),
      onDisconnect: (details) => {
        log("disconnected", details);
        reset();
      },
      onError: (message, context) => {
        log("error", { message, context });
        setStatus(`Error: ${message}`);
      },
      onStatusChange: ({ status }: { status: Status }) => {
        log("status", status);
        setStatus(status);
      },
      onModeChange: ({ mode }: { mode: Mode }) =>
        setStatus(mode === "speaking" ? "Agent speaking…" : "Listening…"),
      onMessage: ({ role, message }) => addTranscript(role, message),
      onInterruption: () => log("interrupted"),
    });
    stopBtn.disabled = false;
    muteBtn.disabled = false;
  } catch (err) {
    log("start failed", errorText(err));
    setStatus(`Start failed: ${errorText(err)}`);
    reset();
  }
}

async function stop() {
  stopBtn.disabled = true;
  await conversation?.endSession();
  reset();
}

function reset() {
  conversation = null;
  muted = false;
  muteBtn.textContent = "Mute";
  startBtn.disabled = false;
  stopBtn.disabled = true;
  muteBtn.disabled = true;
}

function toggleMute() {
  if (!conversation) return;
  muted = !muted;
  conversation.setMicMuted(muted);
  muteBtn.textContent = muted ? "Unmute" : "Mute";
}

micTestBtn.addEventListener("click", () => void toggleMicTest());
startBtn.addEventListener("click", () => void start());
stopBtn.addEventListener("click", () => void stop());
muteBtn.addEventListener("click", toggleMute);
$<HTMLButtonElement>("copy-log").addEventListener(
  "click",
  () => void navigator.clipboard.writeText(logEl.textContent ?? ""),
);
