"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play, Send, Trash2 } from "lucide-react";

export const MAX_VOICE_SECONDS = 180;
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// ---- recording ---------------------------------------------------------------------------------------------------

const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));

// Takes over the composer while recording: a live timer and waveform, with Cancel and Send. Starts recording as soon
// as it appears (the click that opened it counts as the user gesture the browser wants).
export function VoiceRecorder({ onSend, onCancel, onError }: { onSend: (blob: Blob) => Promise<void> | void; onCancel: () => void; onError: (message: string) => void }) {
  const [sec, setSec] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(40).fill(0.06));
  const [phase, setPhase] = useState<"starting" | "recording" | "stopped" | "sending">("starting");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const blob = useRef<Blob | null>(null);
  const dead = useRef(false);

  const stopTracks = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const stop = useCallback(() => {
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
    stopTracks();
  }, [stopTracks]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let level: ReturnType<typeof setInterval> | undefined;
    let ctx: AudioContext | undefined;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (dead.current) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const mime = pickMime();
        const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        rec.current = r;
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.onstop = () => {
          blob.current = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
          if (!dead.current) setPhase("stopped");
        };
        r.start(250);
        started.current = Date.now();
        setPhase("recording");
        // The live waveform: loudness sampled a dozen times a second, scrolling left.
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        level = setInterval(() => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          const rms = Math.sqrt(sum / buf.length);
          setBars((b) => [...b.slice(1), Math.min(1, 0.06 + rms * 3.2)]);
        }, 80);
        timer = setInterval(() => {
          const t = (Date.now() - started.current) / 1000;
          setSec(Math.min(t, MAX_VOICE_SECONDS));
          if (t >= MAX_VOICE_SECONDS) {
            clearInterval(timer);
            stop();
          }
        }, 200);
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        onError(denied ? "Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again." : e instanceof Error && e.message === "unsupported" ? "This browser can’t record voice notes." : "Couldn’t start the microphone.");
        onCancel();
      }
    })();
    return () => {
      dead.current = true;
      clearInterval(timer);
      clearInterval(level);
      void ctx?.close().catch(() => {});
      const r = rec.current;
      if (r && r.state !== "inactive") r.stop();
      stopTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (phase === "recording") {
      // Wait for the recorder to hand over its last chunk before assembling the file.
      await new Promise<void>((resolve) => {
        const r = rec.current;
        if (!r || r.state === "inactive") return resolve();
        const prev = r.onstop;
        r.onstop = (e) => {
          prev?.call(r, e);
          resolve();
        };
        stop();
      });
    }
    const b = blob.current;
    if (!b || (Date.now() - started.current) / 1000 < 0.6 || b.size < 800) {
      onError("That was too short — hold on a little longer.");
      return onCancel();
    }
    setPhase("sending");
    try {
      await onSend(b);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn’t send the voice note");
    }
    onCancel();
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2" role="status" aria-label="Recording a voice note">
      <button onClick={onCancel} disabled={phase === "sending"} aria-label="Cancel recording" title="Cancel" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-red-600">
        <Trash2 size={18} />
      </button>
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {phase === "recording" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${phase === "recording" ? "bg-red-500" : "bg-neutral-400"}`} />
      </span>
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-neutral-800">{clock(sec)}</span>
      <div className="flex h-9 min-w-0 flex-1 items-center gap-[2px]" aria-hidden>
        {bars.map((v, i) => (
          <span key={i} className="w-[3px] flex-1 rounded-full bg-orange-500" style={{ height: `${Math.max(8, v * 100)}%`, opacity: 0.35 + (i / bars.length) * 0.65 }} />
        ))}
      </div>
      {sec >= MAX_VOICE_SECONDS && <span className="hidden text-xs font-medium text-orange-700 sm:inline">3:00 limit</span>}
      <button onClick={() => void send()} disabled={phase === "starting" || phase === "sending"} aria-label="Send voice note" title="Send" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange-600 text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
        <Send size={17} />
      </button>
    </div>
  );
}

export function MicButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label="Record a voice note" title="Voice note" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-600 text-[#ffffff] hover:bg-orange-700 disabled:opacity-40">
      <Mic size={18} />
    </button>
  );
}

// ---- playing -----------------------------------------------------------------------------------------------------

let current: HTMLAudioElement | null = null; // only one voice note plays at a time
const SPEEDS = [1, 1.5, 2];

const barsFor = (seed: string, n = 36) => {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    v = Math.max(0.18, Math.min(1, v + ((h % 1000) / 1000 - 0.5) * 0.9));
    out.push(v);
  }
  return out;
};

export function VoicePlayer({ src, durationSec, seed, mine }: { src: string; durationSec: number; seed: string; mine?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const bars = useMemo(() => barsFor(seed), [seed]);
  const [loaded, setLoaded] = useState(0); // the file's own length, if the message didn't carry one
  const total = durationSec || loaded;
  const progress = total ? Math.min(1, pos / total) : 0;

  useEffect(() => {
    const a = audio.current;
    return () => {
      if (a && current === a) current = null;
      a?.pause();
    };
  }, []);

  async function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (current && current !== a) current.pause();
      current = a;
      a.playbackRate = speed;
      await a.play().catch(() => {});
    } else a.pause();
  }
  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  }
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audio.current;
    if (!a || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total;
    setPos(a.currentTime);
  }

  return (
    <div className={`inline-flex w-72 max-w-full items-center gap-3 rounded-2xl px-3 py-2.5 ${mine ? "bg-orange-50" : "bg-neutral-100"}`}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLoaded(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), setPos(0))}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
      />
      <button onClick={() => void toggle()} aria-label={playing ? "Pause voice note" : "Play voice note"} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange-600 text-[#ffffff] hover:bg-orange-700">
        {playing ? <Pause size={17} /> : <Play size={17} className="translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <div onClick={seek} role="slider" aria-label="Voice note position" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(pos)} className="flex h-8 cursor-pointer items-center gap-[2px]">
          {bars.map((v, i) => (
            <span key={i} className={`w-[3px] flex-1 rounded-full ${i / bars.length < progress ? "bg-orange-600" : "bg-orange-300"}`} style={{ height: `${v * 100}%` }} />
          ))}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums text-neutral-500">
          <span>{clock(playing || pos > 0 ? pos : total)}</span>
          <button onClick={cycleSpeed} className="rounded-full bg-white/70 px-1.5 py-px font-semibold text-neutral-600 hover:text-orange-700" aria-label={`Playback speed ${speed}x`}>
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
