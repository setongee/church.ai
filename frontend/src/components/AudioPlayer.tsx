"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const BAR_COUNT = 120;
const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

// Placeholder shape shown while real peaks load, or if the file can't be decoded (e.g. CORS).
function fallbackPeaks(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) | 0;
    return ((h >>> 0) % 1000) / 1000;
  };
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const envelope = 0.55 + 0.35 * Math.sin((i / BAR_COUNT) * Math.PI * 3);
    return Math.max(0.12, Math.min(1, envelope * (0.4 + rand() * 0.6)));
  });
}

export function AudioPlayer({ src, title }: { src: string; title?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const placeholder = useMemo(() => fallbackPeaks(src), [src]);
  const bars = peaks ?? placeholder;

  // Decode the file once to get real waveform peaks.
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(buf);
        ctx.close();
        const data = decoded.getChannelData(0);
        const block = Math.floor(data.length / BAR_COUNT);
        const out: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          const start = i * block;
          // Sample a subset of each block; plenty for a 120-bar display.
          const step = Math.max(1, Math.floor(block / 200));
          let n = 0;
          for (let j = 0; j < block; j += step) {
            sum += data[start + j] * data[start + j];
            n++;
          }
          out.push(Math.sqrt(sum / Math.max(1, n)));
        }
        const max = Math.max(...out, 0.0001);
        if (!cancelled) setPeaks(out.map((v) => Math.max(0.08, Math.min(1, (v / max) ** 0.8))));
      } catch {
        // keep placeholder
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function seekFromEvent(e: React.PointerEvent | React.MouseEvent) {
    const a = audioRef.current;
    const el = waveRef.current;
    if (!a || !el || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(a.currentTime);
  }

  function skip(delta: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.min(duration, Math.max(0, a.currentTime + delta));
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }

  const progress = duration ? current / duration : 0;

  return (
    <div className="rounded-2xl bg-neutral-900 p-4 text-white sm:p-5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white transition hover:scale-105 active:scale-95"
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          {title && <p className="mb-1 truncate text-xs font-medium text-neutral-400">{title}</p>}
          <div
            ref={waveRef}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekFromEvent(e);
            }}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHover(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
              if (e.buttons === 1) seekFromEvent(e);
            }}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") skip(5);
              else if (e.key === "ArrowLeft") skip(-5);
              else if (e.key === " ") {
                e.preventDefault();
                toggle();
              }
            }}
            className="relative flex h-14 cursor-pointer touch-none items-center gap-[2px] outline-none"
          >
            {bars.map((v, i) => {
              const played = (i + 0.5) / bars.length <= progress;
              const hovered = hover !== null && (i + 0.5) / bars.length <= hover && !played;
              return (
                <span
                  key={i}
                  className={`flex-1 rounded-full transition-colors duration-150 ${
                    played ? "bg-orange-500" : hovered ? "bg-neutral-500" : "bg-neutral-700"
                  } ${peaks ? "" : "animate-pulse"}`}
                  style={{ height: `${Math.round(v * 100)}%` }}
                />
              );
            })}
            {hover !== null && duration > 0 && (
              <span
                className="pointer-events-none absolute -top-5 -translate-x-1/2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-200"
                style={{ left: `${hover * 100}%` }}
              >
                {formatTime(hover * duration)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between pl-16 text-xs tabular-nums text-neutral-400">
        <span>
          {formatTime(current)} <span className="text-neutral-600">/</span> {formatTime(duration)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => skip(-15)}
            className="rounded-md px-2 py-1 hover:bg-neutral-800 hover:text-white"
            aria-label="Back 15 seconds"
          >
            −15s
          </button>
          <button
            type="button"
            onClick={() => skip(15)}
            className="rounded-md px-2 py-1 hover:bg-neutral-800 hover:text-white"
            aria-label="Forward 15 seconds"
          >
            +15s
          </button>
          <button
            type="button"
            onClick={cycleSpeed}
            className="w-12 rounded-md bg-neutral-800 px-2 py-1 font-medium text-neutral-200 hover:bg-neutral-700"
            aria-label="Playback speed"
          >
            {SPEEDS[speedIdx]}x
          </button>
        </div>
      </div>
    </div>
  );
}
