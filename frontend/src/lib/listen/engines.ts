import { getSocket } from "../socket";
import { startPcmCapture, toInt16, type PcmCapture } from "./audioCapture";

export type EngineId = "server" | "device";

// What every speech engine reports back.
export interface EngineHooks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onReady: () => void; // the mic is open and words will start flowing
  onError: (message: string, fatal?: boolean) => void;
  onProgress?: (pct: number, label: string) => void; // the one-off model download
}
export interface RunningEngine {
  stop: () => void;
}

export const isElectron = () => typeof navigator !== "undefined" && /Electron\//.test(navigator.userAgent);

// ---- 1. the server (Deepgram) ---------------------------------------------------------------------------------------

export function startServerEngine(opts: { deviceId?: string } & EngineHooks): RunningEngine {
  const socket = getSocket();
  if (!socket.connected) socket.connect();
  let capture: PcmCapture | null = null;
  let open = false;
  let stopped = false;
  const timeout = setTimeout(() => !open && !stopped && opts.onError("The server didn’t answer. Check your connection and try again.", true), 9000);

  const onReady = async () => {
    if (stopped) return;
    try {
      capture = await startPcmCapture({
        deviceId: opts.deviceId,
        onChunk: (f) => {
          if (open && !stopped) socket.emit("listen:audio", toInt16(f).buffer);
        },
      });
      if (stopped) return capture.stop();
      open = true;
      clearTimeout(timeout);
      opts.onReady();
    } catch (err) {
      opts.onError(micMessage(err), true);
    }
  };
  const onTranscript = (m: { text: string; isFinal: boolean }) => opts.onTranscript(m.text, m.isFinal);
  const onError = (m: { message: string }) => opts.onError(m.message, true);
  const onDisconnect = () => !stopped && opts.onError("The connection to the server was lost.", true);
  socket.on("listen:ready", onReady);
  socket.on("listen:transcript", onTranscript);
  socket.on("listen:error", onError);
  socket.on("disconnect", onDisconnect);
  socket.emit("listen:start", { sampleRate: 16000 });

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timeout);
      capture?.stop();
      socket.emit("listen:stop");
      socket.off("listen:ready", onReady);
      socket.off("listen:transcript", onTranscript);
      socket.off("listen:error", onError);
      socket.off("disconnect", onDisconnect);
    },
  };
}

// ---- 2. on this device (Vosk, in the browser) -----------------------------------------------------------------------

// One-off downloads (the speech engine's script and a ~40 MB English model) come from public CDNs the first time and
// are kept in the browser's cache, so after that it works with no internet at all. Override the model with
// NEXT_PUBLIC_VOSK_MODEL_URL if you host it yourself.
const VOSK_SCRIPT = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
const VOSK_MODEL = process.env.NEXT_PUBLIC_VOSK_MODEL_URL || "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";
const CACHE = "fafc-listen-v1";

interface VoskRec {
  on: (ev: string, cb: (m: { result: { text?: string; partial?: string } }) => void) => void;
  acceptWaveformFloat: (pcm: Float32Array, rate: number) => void;
  remove: () => void;
}
interface VoskModel {
  KaldiRecognizer: new (rate: number) => VoskRec;
}
let modelPromise: Promise<VoskModel> | null = null;

async function cached(url: string, onProgress?: (pct: number) => void): Promise<Blob> {
  const cache = "caches" in window ? await caches.open(CACHE) : null;
  const hit = await cache?.match(url);
  if (hit) return hit.blob();
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn’t download the speech model (${res.status}).`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress?.(Math.min(99, Math.round((got / total) * 100)));
  }
  const blob = new Blob(parts as BlobPart[]);
  await cache?.put(url, new Response(blob)).catch(() => {});
  return blob;
}

async function loadVoskModel(hooks: Pick<EngineHooks, "onProgress">): Promise<VoskModel> {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    hooks.onProgress?.(1, "Downloading the speech engine…");
    const scriptBlob = await cached(VOSK_SCRIPT);
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = URL.createObjectURL(scriptBlob);
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Couldn’t load the on-device speech engine."));
      document.head.appendChild(s);
    });
    const Vosk = (window as unknown as { Vosk: { createModel: (url: string) => Promise<VoskModel> } }).Vosk;
    const modelBlob = await cached(VOSK_MODEL, (p) => hooks.onProgress?.(p, "Downloading the English model (one time, about 40 MB)…"));
    hooks.onProgress?.(99, "Starting the speech engine…");
    return Vosk.createModel(URL.createObjectURL(modelBlob));
  })().catch((e) => {
    modelPromise = null;
    throw e;
  });
  return modelPromise;
}

export function startDeviceEngine(opts: { deviceId?: string } & EngineHooks): RunningEngine {
  let stopped = false;
  let capture: PcmCapture | null = null;
  let rec: VoskRec | null = null;
  (async () => {
    try {
      const model = await loadVoskModel(opts);
      if (stopped) return;
      rec = new model.KaldiRecognizer(16000);
      rec.on("partialresult", (m) => m.result.partial && opts.onTranscript(m.result.partial, false));
      rec.on("result", (m) => m.result.text && opts.onTranscript(m.result.text, true));
      capture = await startPcmCapture({ deviceId: opts.deviceId, onChunk: (f) => !stopped && rec?.acceptWaveformFloat(f, 16000) });
      if (stopped) return capture.stop();
      opts.onReady();
    } catch (err) {
      opts.onError(err instanceof Error && !/Permission|NotAllowed|NotFound/.test(err.name) ? err.message : micMessage(err), true);
    }
  })();
  return {
    stop: () => {
      stopped = true;
      capture?.stop();
      try {
        rec?.remove();
      } catch {}
    },
  };
}

export function micMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was blocked. Allow the microphone for this site and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "That microphone wasn’t found. Pick another in the Listen settings.";
  return "Couldn’t open the microphone.";
}
