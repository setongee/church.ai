"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveCustomReel } from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  RecapReelEngine,
  formatTime,
  loadReelFonts,
  outroCount,
  type AudioInfo,
  type Grade,
  type Pace,
  type RenderResult,
  type ReelSettings,
  type Timeline,
} from "@/lib/recapReel/engine";
import { Field, Slider } from "@/components/reels/ui";

const SECTION_COLOR: Record<string, string> = {
  intro: "bg-blue-700",
  montage: "bg-blue-500",
  word: "bg-violet-500",
  outro: "bg-orange-500",
  end: "bg-neutral-600",
};

const inputCls =
  "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none";
const fileCls =
  "block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200";
const card = "rounded-2xl bg-white p-5";

type Phase = "idle" | "preview" | "render";
type Tab = "media" | "word" | "music" | "brand";
const TABS: [Tab, string][] = [
  ["media", "Videos & photos"],
  ["word", "The word"],
  ["music", "Music & sound"],
  ["brand", "Branding & closing"],
];

export function RecapReelStudio({ onSaved }: { onSaved?: () => void }) {
  const qc = useQueryClient();
  const [engine] = useState(() => new RecapReelEngine());
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [tab, setTab] = useState<Tab>("media");
  const [title, setTitle] = useState("");
  const [s, setS] = useState<ReelSettings>(DEFAULT_SETTINGS);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [msgInfo, setMsgInfo] = useState<AudioInfo | null>(null);
  const [musicInfo, setMusicInfo] = useState<AudioInfo | null>(null);
  const [logo, setLogo] = useState<{ url: string; name: string } | null>(null);
  const [loading, setLoading] = useState<"" | "media" | "message" | "music">("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [playhead, setPlayhead] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; data: RenderResult; durationSec: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof ReelSettings>(k: K, v: ReelSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  function scheduleRefresh() {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      const next = await engine.refresh();
      setTl(next);
    }, 150);
  }

  useEffect(() => {
    if (canvasRef.current) engine.attach(canvasRef.current);
    loadReelFonts().catch(() => setError("Couldn't load the reel fonts - text may look off."));
    return () => {
      clearTimeout(refreshTimer.current);
      engine.dispose();
    };
  }, [engine]);

  // Settings changes feed the engine and repaint the preview still.
  useEffect(() => {
    engine.setSettings(s);
    scheduleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  // Free the finished video's object URL when it is replaced or the studio closes.
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  /* ---------------- inputs ---------------- */

  async function addMedia(files: FileList | File[] | null) {
    if (!files) return;
    setError("");
    setLoading("media");
    for (const f of Array.from(files)) {
      if (!(f.type.startsWith("video") || f.type.startsWith("image") || /\.(mov|mp4|heic|jpe?g|png|webm)$/i.test(f.name))) continue;
      const p = engine.addMedia(f);
      bump();
      await p;
      bump();
    }
    setLoading("");
    scheduleRefresh();
  }

  async function pickMessage(f: File | null) {
    setError("");
    if (!f) {
      await engine.setMessage(null);
      setMsgInfo(null);
      scheduleRefresh();
      return;
    }
    setLoading("message");
    try {
      const info = await engine.setMessage(f);
      if (info) {
        setMsgInfo(info);
        const start = info.start ?? 0;
        setS((p) => ({ ...p, msgStart: start, msgLen: Math.max(1, Math.min(20, Math.floor(info.duration - start))) }));
      }
    } catch {
      setError(`Couldn't read "${f.name}" as audio. Try an MP3, M4A or WAV.`);
    }
    setLoading("");
  }

  async function pickMusic(f: File | null) {
    setError("");
    if (!f) {
      await engine.setMusic(null);
      setMusicInfo(null);
      scheduleRefresh();
      return;
    }
    setLoading("music");
    try {
      const info = await engine.setMusic(f);
      if (info) {
        setMusicInfo(info);
        setS((p) => ({ ...p, bpm: Number((info.bpm ?? p.bpm).toFixed(1)), musicStart: Number((info.offset ?? 0).toFixed(2)) }));
      }
    } catch {
      setError(`Couldn't read "${f.name}" as audio. Try an MP3, M4A or WAV.`);
    }
    setLoading("");
  }

  async function pickLogo(f: File | null) {
    const url = await engine.setLogo(f).catch(() => null);
    setLogo(f && url ? { url, name: f.name } : null);
    scheduleRefresh();
  }

  /* ---------------- preview / render ---------------- */

  async function run(record: boolean) {
    if (phase !== "idle") {
      engine.stop();
      return;
    }
    setError("");
    setSaved(false);
    if (record) setResult(null);
    setPhase(record ? "render" : "preview");
    try {
      const out = await engine.play(record, {
        onStatus: setStatus,
        onProgress: (t, total) => setPlayhead(Math.min(1, Math.max(0, t / total))),
      });
      if (out) {
        const total = engine.TL?.total ?? 0;
        setResult({ url: URL.createObjectURL(out.blob), data: out, durationSec: total });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while rendering.");
    }
    setPhase("idle");
    setStatus("");
    setPlayhead(0);
    scheduleRefresh();
  }

  function fileName(ext: string) {
    const base = (title.trim() || "recap-reel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${base || "recap-reel"}.${ext}`;
  }

  function download() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = fileName(result.data.ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    setError("");
    try {
      await saveCustomReel({
        title: title.trim() || "Recap Reel",
        template: "recap-reel",
        video: result.data.blob,
        ext: result.data.ext,
        durationSec: result.durationSec,
        settings: {
          msgTitle: s.msgTitle,
          minister: s.minister,
          handle: s.handle,
          outroText: s.outroText,
          grade: s.grade,
          pace: s.pace,
          res: s.res,
          bpm: s.bpm,
        },
      });
      await qc.invalidateQueries({ queryKey: ["reel-library"] });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the reel.");
    }
    setSaving(false);
  }

  /* ---------------- view ---------------- */

  const media = engine.media;
  const nOut = outroCount(media.length);
  const canMake = !!tl && loading === "";
  const busy = phase !== "idle";
  const secs: { sec: string; dur: number }[] = [];
  tl?.segs.forEach((g) => {
    const last = secs[secs.length - 1];
    if (last && last.sec === g.sec) last.dur += g.dur;
    else secs.push({ sec: g.sec, dur: g.dur });
  });

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <div className={card}>
          <label className="block text-sm font-medium text-neutral-700">
            Reel title <span className="font-normal text-neutral-400">(for My reels)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday Service Recap" maxLength={80} className={inputCls} />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium ${tab === id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
            >
              {label}
              {id === "media" && media.length > 0 && <span className="ml-1.5 opacity-60">{media.length}</span>}
              {id === "word" && msgInfo && <span className="ml-1.5 opacity-60">✓</span>}
              {id === "music" && musicInfo && <span className="ml-1.5 opacity-60">✓</span>}
            </button>
          ))}
        </div>

        <div className={`${card} ${tab === "media" ? "" : "hidden"}`}>
          <Field
            title="Videos & photos"
            hint="The first item is the opening hero shot (stage or speaker works best). The last two are the outro: smiles and waves. Everything between drives the beat montage and the word section. Aim for 10–25 items."
          >
            <label
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 hover:border-neutral-900 hover:text-neutral-800"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void addMedia(e.dataTransfer.files);
              }}
            >
              {loading === "media" ? "Reading your files…" : "Click to add, or drop videos and photos here"}
              <input type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => { void addMedia(e.target.files); e.target.value = ""; }} />
            </label>
            {media.length > 0 && (
              <ul className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
                {media.map((m, i) => {
                  const role = i === 0 ? "intro" : i >= media.length - nOut ? "outro" : m.type === "image" ? "photo" : "clip";
                  return (
                    <li key={m.id} className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-neutral-900">
                      {m.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.thumbUrl} alt={m.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-[10px] text-neutral-400">{m.ok === false ? "" : "…"}</div>
                      )}
                      <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${role === "intro" ? "bg-blue-600 text-white" : role === "outro" ? "bg-orange-500 text-white" : "bg-black/60 text-white"}`}>
                        {role}
                      </span>
                      {m.type === "video" && m.ok && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{m.dur.toFixed(1)}s</span>}
                      {m.ok === false && <p className="absolute inset-x-0 bottom-0 bg-red-600/90 p-1 text-[10px] leading-tight text-white">{m.err}</p>}
                      <div className="absolute inset-x-0 top-6 flex justify-center gap-1 opacity-0 transition group-hover:opacity-100">
                        {([["◀", "Move earlier", () => engine.moveMedia(m.id, -1)], ["✕", "Remove", () => engine.removeMedia(m.id)], ["▶", "Move later", () => engine.moveMedia(m.id, 1)]] as const).map(([label, hint, fn]) => (
                          <button key={hint} title={hint} onClick={() => { fn(); bump(); scheduleRefresh(); }} className="grid h-6 w-6 place-items-center rounded bg-black/70 text-[10px] text-white hover:bg-black">
                            {label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Field>
        </div>

        <div className={`${card} ${tab === "word" ? "" : "hidden"}`}>
          <Field title="The word (message audio)" hint="An MP3 clip from the sermon. It plays over slow-motion shots while the music ducks underneath. Optional.">
            <input type="file" accept="audio/*" className={fileCls} onChange={(e) => { void pickMessage(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            {loading === "message" && <p className="mt-2 text-xs text-neutral-500">Reading the audio…</p>}
            {msgInfo && (
              <p className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                ♪ <span className="truncate font-medium">{msgInfo.name}</span> · {msgInfo.duration.toFixed(1)}s
                <button onClick={() => void pickMessage(null)} className="ml-auto text-neutral-400 hover:text-red-600">Remove</button>
              </p>
            )}
            {msgInfo && (
              <div className="mt-4 space-y-3">
                <Slider label="Start at" value={s.msgStart} min={0} max={Math.max(1, Math.floor((msgInfo.duration - 3) * 10) / 10)} step={0.1} onChange={(v) => set("msgStart", v)} format={(v) => `${v.toFixed(1)}s`} />
                <Slider label="Length" value={s.msgLen} min={5} max={Math.max(6, Math.min(60, Math.ceil(msgInfo.duration - s.msgStart)))} step={0.5} onChange={(v) => set("msgLen", v)} format={(v) => `${v}s`} />
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700">
                Label
                <input value={s.wordLabel} onChange={(e) => set("wordLabel", e.target.value)} className={inputCls} />
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Minister
                <input value={s.minister} onChange={(e) => set("minister", e.target.value)} placeholder="Pastor Jane Doe" className={inputCls} />
              </label>
              <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
                Message title
                <input value={s.msgTitle} onChange={(e) => set("msgTitle", e.target.value)} placeholder="Grace for the Race" className={inputCls} />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={s.showWave} onChange={(e) => set("showWave", e.target.checked)} className="accent-neutral-900" /> Show voice waveform during the word
            </label>
          </Field>
        </div>

        <div className={`${card} ${tab === "music" ? "" : "hidden"}`}>
          <Field title="Music & sound design" hint="Cuts lock to the track's beat. With no track, a built-in gospel-pop beat is generated for you.">
            <input type="file" accept="audio/*" className={fileCls} onChange={(e) => { void pickMusic(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            {loading === "music" && <p className="mt-2 text-xs text-neutral-500">Detecting tempo…</p>}
            {musicInfo && (
              <p className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                ♪ <span className="truncate font-medium">{musicInfo.name}</span> · {musicInfo.duration.toFixed(0)}s · {(musicInfo.bpm ?? 0).toFixed(0)} BPM
                <button onClick={() => void pickMusic(null)} className="ml-auto text-neutral-400 hover:text-red-600">Remove</button>
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700">
                Tempo (BPM)
                <input type="number" min={60} max={180} step={0.1} value={s.bpm} onChange={(e) => set("bpm", Number(e.target.value))} className={inputCls} />
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Start music at (s)
                <input type="number" min={0} step={0.1} value={s.musicStart} onChange={(e) => set("musicStart", Number(e.target.value))} className={inputCls} />
              </label>
            </div>
            <div className="mt-4 space-y-3">
              <Slider label="Music level" value={s.musicVol} min={0} max={1} step={0.01} onChange={(v) => set("musicVol", v)} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Sound effects" value={s.sfxVol} min={0} max={1} step={0.01} onChange={(v) => set("sfxVol", v)} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Voice level" value={s.voiceVol} min={0} max={1.5} step={0.01} onChange={(v) => set("voiceVol", v)} format={(v) => `${Math.round(v * 100)}%`} />
            </div>
          </Field>
        </div>

        <div className={`${card} ${tab === "brand" ? "" : "hidden"}`}>
          <Field title="Branding & closing screen">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700">
                Social handle
                <input value={s.handle} onChange={(e) => set("handle", e.target.value)} className={inputCls} />
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Outro text
                <input value={s.outroText} onChange={(e) => set("outroText", e.target.value)} className={inputCls} />
              </label>
              <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
                Closing screen details <span className="font-normal text-neutral-400">(one per line)</span>
                <textarea value={s.details} onChange={(e) => set("details", e.target.value)} rows={4} className={inputCls} />
              </label>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-neutral-700">Logo <span className="font-normal text-neutral-400">(PNG, optional)</span></p>
              <input type="file" accept="image/*" className={`mt-1 ${fileCls}`} onChange={(e) => { void pickLogo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              {logo && (
                <p className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.url} alt="" className="h-7 w-7 object-contain" />
                  <span className="truncate font-medium">{logo.name}</span>
                  <button onClick={() => void pickLogo(null)} className="ml-auto text-neutral-400 hover:text-red-600">Remove</button>
                </p>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium text-neutral-700">
                Colour grade
                <select value={s.grade} onChange={(e) => set("grade", e.target.value as Grade)} className={inputCls}>
                  <option value="cool">Stage blue</option>
                  <option value="warm">Golden warm</option>
                  <option value="film">Film contrast</option>
                  <option value="none">Natural</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Cut pace
                <select value={s.pace} onChange={(e) => set("pace", e.target.value as Pace)} className={inputCls}>
                  <option value="standard">Standard</option>
                  <option value="calm">Calm</option>
                  <option value="fast">Fast (every beat)</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Export size
                <select value={s.res} onChange={(e) => set("res", Number(e.target.value) as 720 | 1080)} className={inputCls}>
                  <option value={1080}>1080 × 1920 (HD)</option>
                  <option value={720}>720 × 1280 (faster)</option>
                </select>
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={s.showWm} onChange={(e) => set("showWm", e.target.checked)} className="accent-neutral-900" /> Show handle watermark on the video
            </label>
          </Field>
        </div>
      </div>

      {/* preview + actions */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-3xl bg-neutral-900 shadow-lg">
          <canvas ref={canvasRef} width={720} height={1280} className="h-full w-full" />
          {!tl && (
            <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-neutral-400">
              Add a few clips or photos to see the preview.
            </div>
          )}
        </div>

        <div>
          <div className="relative flex h-6 overflow-hidden rounded-md bg-neutral-200 text-[10px] font-medium text-white">
            {secs.map((x, i) => (
              <div key={i} style={{ flex: x.dur }} className={`grid place-items-center ${SECTION_COLOR[x.sec]}`}>
                {x.dur > 2.5 ? x.sec : ""}
              </div>
            ))}
            {busy && <span className="absolute top-0 h-full w-0.5 bg-white shadow" style={{ left: `${playhead * 100}%` }} />}
          </div>
          <div className="mt-1 flex justify-between font-mono text-xs text-neutral-500">
            <span>{formatTime(playhead * (tl?.total ?? 0))}</span>
            <span>{formatTime(tl?.total ?? 0)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void run(false)}
            disabled={!canMake || phase === "render"}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40"
          >
            {phase === "preview" ? "■ Stop" : "▶ Preview"}
          </button>
          <button
            onClick={() => void run(true)}
            disabled={!canMake || phase === "preview"}
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {phase === "render" ? "■ Stop" : "● Render video"}
          </button>
        </div>

        {phase === "render" && (
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full bg-neutral-900" style={{ width: `${playhead * 100}%` }} />
          </div>
        )}
        {(status || phase === "render") && (
          <p className="text-xs text-neutral-500">
            {status || `Rendering… ${Math.round(playhead * 100)}% - keep this tab open and visible.`}
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {result && (
          <div className="space-y-3 rounded-2xl bg-white p-4">
            <video src={result.url} controls playsInline className="mx-auto max-h-[420px] w-full rounded-xl bg-black object-contain" />
            <p className="text-xs text-neutral-500">
              {(result.data.blob.size / 1e6).toFixed(1)} MB {result.data.ext.toUpperCase()}
              {result.data.ext === "webm" && " - this browser saves WebM; use Safari or Chrome 126+ for MP4."}
            </p>
            <div className="flex flex-wrap gap-2">
              {saved ? (
                <button onClick={onSaved} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                  Saved ✓ View in My reels
                </button>
              ) : (
                <button onClick={() => void save()} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                  {saving ? "Saving…" : "Save to My reels"}
                </button>
              )}
              <button onClick={download} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
                Download
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
