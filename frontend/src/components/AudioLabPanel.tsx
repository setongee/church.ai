"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Clapperboard, Download, FileText, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import {
  assetUrl,
  audioMergeDownloadUrl,
  createReelFromAudioMerge,
  deleteAudioMerge,
  generateAudioMerge,
  getAudioLabSuggestions,
  type LabTopic,
  getAudioMerge,
  listAudioMerges,
  updateAudioMerge,
} from "@/lib/api";
import type { AudioMerge, AudioMergeSegment, AudioMergeStyle } from "@/lib/types";
import { AudioPlayer } from "./AudioPlayer";
import { AudioTranscriptModal } from "./AudioTranscriptModal";

const STYLES: { key: AudioMergeStyle; label: string; hint: string }[] = [
  { key: "viral", label: "Viral cut", hint: "Opens with the strongest hook, builds, lands on a payoff" },
  { key: "story", label: "Topic story", hint: "Everything on the topic, told as one clear arc" },
  { key: "highlights", label: "Best moments", hint: "Strongest moments, kept in the order spoken" },
];

const KIND_LABEL: Record<LabTopic["kind"], string> = {
  topic: "Topic",
  moment: "Moment",
  story: "Story",
  scripture: "Scripture",
  declaration: "Declaration",
};

const ROLE_COLOR: Record<string, string> = {
  hook: "bg-orange-100 text-orange-700",
  payoff: "bg-green-100 text-green-700",
  close: "bg-green-100 text-green-700",
  proof: "bg-blue-100 text-blue-700",
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const inFlight = (m?: AudioMerge | null) => !!m && ["planning", "reviewing", "rendering"].includes(m.status);

// Audio Lab for one session: describe what you want, and the AI reads the whole message, picks
// the parts that really speak to it and stitches them into one audio.
export function AudioLabPanel({ sessionId, hasAudio = true, onOpenMerged }: { sessionId: string; hasAudio?: boolean; onOpenMerged?: () => void }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<AudioMergeStyle>("viral");
  const [targetSec, setTargetSec] = useState(60);
  const [history, setHistory] = useState<AudioMerge[]>([]);
  const [current, setCurrent] = useState<AudioMerge | null>(null);
  const [draft, setDraft] = useState<AudioMergeSegment[] | null>(null);
  const [busy, setBusy] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [error, setError] = useState("");
  const loaded = useRef(false);
  // Ideas the AI spotted in this message (null = still reading it).
  const [ideas, setIdeas] = useState<LabTopic[] | null>(null);

  const loadIdeas = useCallback(
    (refresh = false) => {
      setIdeas(null);
      getAudioLabSuggestions(sessionId, refresh)
        .then((r) => setIdeas(r.topics))
        .catch(() => setIdeas([]));
    },
    [sessionId],
  );

  useEffect(() => {
    if (hasAudio) loadIdeas();
  }, [hasAudio, loadIdeas]);

  const refreshHistory = useCallback(() => listAudioMerges(sessionId).then(setHistory).catch(() => {}), [sessionId]);

  useEffect(() => {
    listAudioMerges(sessionId)
      .then((list) => {
        setHistory(list);
        if (!loaded.current && list[0]) setCurrent(list[0]);
        loaded.current = true;
      })
      .catch(() => {});
  }, [sessionId]);

  // Follow a cut that is still being made.
  useEffect(() => {
    if (!current || !inFlight(current)) return;
    const t = setInterval(() => {
      getAudioMerge(current._id)
        .then((fresh) => {
          setCurrent(fresh);
          if (!inFlight(fresh)) {
            setDraft(null);
            refreshHistory();
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [current, refreshHistory]);

  async function build() {
    setError("");
    setBusy("build");
    try {
      const m = await generateAudioMerge(sessionId, { prompt: prompt.trim(), style, targetSec });
      setCurrent(m);
      setDraft(null);
      setHistory((h) => [m, ...h]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    } finally {
      setBusy("");
    }
  }

  const segments = draft ?? current?.segments ?? [];
  const edited = draft !== null;
  const draftTotal = segments.reduce((s, x) => s + (x.endSec - x.startSec), 0);

  function move(i: number, d: -1 | 1) {
    const next = [...segments];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  }

  async function restitch() {
    if (!current || !draft) return;
    setError("");
    setBusy("restitch");
    try {
      const m = await updateAudioMerge(current._id, { segments: draft.map((s) => ({ _id: s._id })) });
      setCurrent(m);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not re-stitch");
    } finally {
      setBusy("");
    }
  }

  async function makeReel() {
    if (!current) return;
    setError("");
    setBusy("reel");
    try {
      const { sessionId: sid } = await createReelFromAudioMerge(current._id);
      // Already on the session page: just switch tab (a router push to the same page would leave
      // this button waiting forever). From the Audio Lab page, go to the session's Merged tab.
      if (onOpenMerged) onOpenMerged();
      else router.push(`/sessions/${sid}?tab=merged`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the reel");
    } finally {
      setBusy("");
    }
  }

  async function remove(m: AudioMerge) {
    if (!confirm(`Delete "${m.title || "this cut"}"?`)) return;
    try {
      await deleteAudioMerge(m._id);
      setHistory((h) => h.filter((x) => x._id !== m._id));
      if (current?._id === m._id) {
        setCurrent(null);
        setDraft(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  if (!hasAudio) {
    return <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">This session has no audio yet. Upload audio or wait for the recording to finish processing.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* ------------------------------------------------ brief */}
      <section className="space-y-5 rounded-2xl bg-white p-5">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">What should this audio be about?</h2>
          <p className="mt-1 text-xs text-neutral-500">The AI reads the whole message and picks the parts that truly speak to it, not just where a word was used.</p>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="e.g. Tell me the parts where the preacher spoke on the goodness of God"
          className="w-full resize-y rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-500"
        />
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Spotted in this message</p>
            <button type="button" onClick={() => loadIdeas(true)} disabled={ideas === null} title="Look again" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40">
              <RefreshCw size={13} className={ideas === null ? "animate-spin" : ""} />
            </button>
          </div>
          {ideas === null ? (
            <div className="space-y-1.5" aria-label="Reading the message">
              {[78, 62, 88, 70].map((w) => (
                <div key={w} className="h-7 animate-pulse rounded-full bg-neutral-100" style={{ width: `${w}%` }} />
              ))}
              <p className="text-[11px] text-neutral-400">Reading the message for its strongest themes…</p>
            </div>
          ) : ideas.length === 0 ? (
            <p className="text-[11px] text-neutral-400">No suggestions this time. Describe what you want below, or leave it empty to find the most powerful moments.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ideas.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  title={t.prompt}
                  onClick={() => setPrompt(t.prompt)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs ${prompt === t.prompt ? "border-orange-500 bg-orange-50 text-orange-800" : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"}`}
                >
                  <span className="rounded bg-neutral-100 px-1 text-[9px] font-semibold uppercase text-neutral-500">{KIND_LABEL[t.kind]}</span>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="-mt-2 text-[11px] text-neutral-400">Pick one, edit it, or write your own. Leave it empty to find the most powerful moments.</p>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Style</p>
          <div className="grid gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStyle(s.key)}
                className={`rounded-xl border px-3 py-2 text-left ${style === s.key ? "border-orange-500 bg-orange-50" : "border-neutral-200 hover:bg-neutral-50"}`}
              >
                <span className="block text-sm font-medium text-neutral-900">{s.label}</span>
                <span className="block text-xs text-neutral-500">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Length</p>
            <span className="text-sm font-medium text-neutral-900">{targetSec >= 60 ? `${Math.floor(targetSec / 60)}:${String(targetSec % 60).padStart(2, "0")}` : `${targetSec}s`}</span>
          </div>
          <input type="range" min={15} max={300} step={5} value={targetSec} onChange={(e) => setTargetSec(Number(e.target.value))} className="mt-2 w-full accent-orange-500" />
          <div className="mt-1 flex justify-between text-[11px] text-neutral-400">
            <span>15s</span>
            <span>5 min</span>
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="button"
          onClick={build}
          disabled={busy === "build" || inFlight(current)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          <Sparkles size={16} /> {inFlight(current) ? "Working…" : "Build the audio"}
        </button>
        <p className="text-center text-[11px] text-neutral-400">Takes about a minute: it reads, plans, reviews its own cut, then stitches.</p>

        {history.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Earlier cuts</p>
            <ul className="space-y-1">
              {history.map((m) => (
                <li key={m._id} className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 ${current?._id === m._id ? "border-neutral-900" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  <button type="button" onClick={() => { setCurrent(m); setDraft(null); }} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-neutral-900">{m.title || (m.status === "error" ? "Failed" : "Working…")}</span>
                    <span className="block truncate text-[11px] text-neutral-500">{m.prompt || "Best moments"} · {m.durationSec ? mmss(m.durationSec) : m.status}</span>
                  </button>
                  <button type="button" aria-label="Delete" onClick={() => remove(m)} className="rounded p-1 text-neutral-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ result */}
      <section className="min-w-0">
        {!current && (
          <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-10 text-center">
            <Sparkles className="text-orange-500" />
            <p className="mt-3 text-sm font-medium text-neutral-800">Your stitched audio shows up here</p>
            <p className="mt-1 max-w-sm text-xs text-neutral-500">Describe a theme, pick a style and length, and the Audio Lab will cut and join the right parts of the message into one audio you can download or turn into a reel.</p>
          </div>
        )}

        {current && inFlight(current) && (
          <div className="rounded-2xl bg-white p-8 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-neutral-200 border-t-orange-500" />
            <p className="mt-4 text-sm font-medium text-neutral-900">{current.stage || "Working…"}</p>
            <p className="mt-1 text-xs text-neutral-500">{current.prompt ? `“${current.prompt}”` : "Finding the most powerful moments"}</p>
          </div>
        )}

        {current?.status === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="text-sm font-semibold text-red-800">This cut didn&apos;t work out</p>
            <p className="mt-1 text-sm text-red-700">{current.error}</p>
          </div>
        )}

        {showTranscript && current && <AudioTranscriptModal mergeId={current._id} onClose={() => setShowTranscript(false)} />}

        {current?.status === "done" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-neutral-900">{current.title}</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {current.durationSec ? mmss(current.durationSec) : ""} · {current.segments.length} pieces
                    {current.prompt ? ` · “${current.prompt}”` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={audioMergeDownloadUrl(current._id)} className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700">
                    <Download size={15} /> Download MP3
                  </a>
                  {!edited && (
                    <button type="button" onClick={() => setShowTranscript(true)} className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                      <FileText size={15} /> Transcript
                    </button>
                  )}
                  <button type="button" onClick={makeReel} disabled={busy === "reel"} className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50">
                    <Clapperboard size={15} /> {busy === "reel" ? "Creating…" : "Create merged reel"}
                  </button>
                </div>
              </div>
              {current.audioUrl && !edited && (
                <div className="mt-4">
                  <AudioPlayer key={current.audioUrl} src={assetUrl(current.audioUrl)} />
                </div>
              )}
              {current.summary && <p className="mt-4 text-sm leading-relaxed text-neutral-700">{current.summary}</p>}
              {current.review && (
                <details className="mt-3 text-xs text-neutral-500">
                  <summary className="cursor-pointer font-medium text-neutral-600">How the AI checked this cut</summary>
                  <p className="mt-1.5 leading-relaxed">{current.review}</p>
                </details>
              )}
            </div>

            <div className="rounded-2xl bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-neutral-900">The pieces, in play order</h4>
                {edited && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">{mmss(draftTotal)} total</span>
                    <button type="button" onClick={() => setDraft(null)} className="text-xs text-neutral-500 underline">
                      Undo
                    </button>
                    <button type="button" onClick={restitch} disabled={busy === "restitch"} className="rounded-full bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                      {busy === "restitch" ? "Stitching…" : "Re-stitch audio"}
                    </button>
                  </div>
                )}
              </div>
              <ol className="mt-3 space-y-2.5">
                {segments.map((s, i) => (
                  <li key={s._id} className="rounded-xl border border-neutral-200 p-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-neutral-900">{s.headline || "Moment"}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${ROLE_COLOR[s.role] ?? "bg-neutral-100 text-neutral-600"}`}>{s.role}</span>
                          <span className="text-[11px] tabular-nums text-neutral-400">
                            {mmss(s.startSec)}–{mmss(s.endSec)} · {Math.round(s.endSec - s.startSec)}s
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-snug text-neutral-600">{s.text}</p>
                        {s.why && <p className="mt-1 text-xs italic text-neutral-400">{s.why}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30">
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" aria-label="Move down" disabled={i === segments.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30">
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" aria-label="Remove piece" disabled={segments.length <= 1} onClick={() => setDraft(segments.filter((_, k) => k !== i))} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
