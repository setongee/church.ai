"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { audioMergeTranscriptUrl, getAudioMergeTranscript, type MergeTranscript } from "@/lib/api";
import { Modal } from "@/components/present/ui";

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// What is said in a generated cut: the plain transcript, or the same with the time each line starts in the new audio.
export function AudioTranscriptModal({ mergeId, onClose }: { mergeId: string; onClose: () => void }) {
  const [t, setT] = useState<MergeTranscript | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"plain" | "timed">("plain");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getAudioMergeTranscript(mergeId)
      .then(setT)
      .catch((e) => setError(e.message));
  }, [mergeId]);

  const timedText = t ? t.lines.map((l) => `[${clock(l.start)}] ${l.text}`).join("\n") : "";
  const copy = () => {
    if (!t) return;
    void navigator.clipboard?.writeText(tab === "plain" ? t.text : timedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const link = "inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700";

  return (
    <Modal title="Transcript of this cut" onClose={onClose} wide>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!t && !error && <p className="py-10 text-center text-sm text-neutral-400">Reading the transcript…</p>}
      {t && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" className="inline-flex gap-1 rounded-full bg-neutral-100 p-1">
              {(
                [
                  ["plain", "Transcript"],
                  ["timed", "With timestamps"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === k ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={copy} className={link}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {!t.precise && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">This session has no word-by-word timings, so times are per piece and the text is the planner’s excerpt. Generate reels for the session first for exact times.</p>}

          <div className="max-h-[52vh] overflow-y-auto rounded-xl bg-neutral-50 p-5">
            {tab === "plain" ? (
              <div className="space-y-4 text-[15px] leading-relaxed text-neutral-800">
                {t.pieces.map((p) => (
                  <p key={p.index}>{p.text || <span className="text-neutral-400">(no transcript for this piece)</span>}</p>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {t.pieces.map((p) => (
                  <div key={p.index}>
                    {p.headline && <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-orange-600">{p.headline}</p>}
                    <ul className="space-y-1.5">
                      {t.lines
                        .filter((l) => l.piece === p.index)
                        .map((l, i) => (
                          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-neutral-800">
                            <span className="w-12 shrink-0 pt-0.5 font-mono text-xs font-semibold tabular-nums text-neutral-400">{clock(l.start)}</span>
                            <span>{l.text}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500">Download</span>
            <a href={audioMergeTranscriptUrl(mergeId, "txt")} className={link}>
              <Download size={13} /> Transcript (.txt)
            </a>
            <a href={audioMergeTranscriptUrl(mergeId, "timestamped")} className={link}>
              <Download size={13} /> With timestamps (.txt)
            </a>
            <a href={audioMergeTranscriptUrl(mergeId, "srt")} className={link}>
              <Download size={13} /> Subtitles (.srt)
            </a>
            <a href={audioMergeTranscriptUrl(mergeId, "vtt")} className={link}>
              <Download size={13} /> Web captions (.vtt)
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
