"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Ear, Eye, Monitor, Quote, Sparkles, Trash2, X } from "lucide-react";
import { accept, clearRecent, dismiss, setHeardOpen, useListen, type Suggestion } from "@/lib/listen/store";
import { SOURCE_THEME } from "./ListenSuggestions";

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 10 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

// Three kinds of catch, colour-coded everywhere: HEARD (orange) = the preacher named the reference ("John 3:16");
// DETECTED (violet) = their exact words matched a verse ("the joy of the Lord is your strength"); AI MATCH (teal) = the
// AI recognised a verse said in their own words (a paraphrase).
type Kind = "heard" | "detected" | "ai";
const kindOf = (s: Suggestion): Kind => (s.source === "paraphrase" ? "ai" : s.source === "quote" ? "detected" : "heard");
type Filter = "all" | Kind;

// "Heard" beside the Scripture Box: what Listen has caught - the ones waiting for a decision, and everything it heard
// recently - each one a click away from the screen. (The floating cards still ask the moment something is heard.)
export function HeardButton() {
  const L = useListen();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const waiting = L.suggestions.filter((s) => !s.auto);
  // Everything it caught is also in the recent list, so the ones waiting for you are listed once, above it.
  const waitingIds = new Set(waiting.map((s) => s.id));
  const earlier = L.recent.filter((r) => !waitingIds.has(r.id));
  const count = waiting.length + earlier.length;
  const pass = (s: Suggestion) => filter === "all" || kindOf(s) === filter;
  const numOf = (k: Kind) => [...waiting, ...earlier.map((r) => r.suggestion)].filter((s) => kindOf(s) === k).length;

  useEffect(() => {
    setHeardOpen(open);
    return () => setHeardOpen(false);
  }, [open]);

  // Opens under the button (the library panel clips overflow, so the list is drawn on the page itself).
  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(r.left, window.innerWidth - 560 - 12)) });
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  const Tag = ({ s }: { s: Suggestion }) => {
    const k = kindOf(s);
    const th = SOURCE_THEME[k];
    const Icon = k === "ai" ? Sparkles : k === "detected" ? Quote : BookOpen;
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ffffff]" style={{ background: th.accent }}>
        <Icon size={10} /> {th.chip}
      </span>
    );
  };
  const btnBase = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold";

  const Row = ({ s, recent, at }: { s: Suggestion; recent?: boolean; at?: number }) => {
    const th = SOURCE_THEME[kindOf(s)];
    return (
      <div className="border-b border-neutral-100 py-3 pl-4 pr-5 last:border-0" style={{ borderLeft: `4px solid ${th.accent}` }}>
        <div className="flex flex-wrap items-center gap-2">
          <Tag s={s} />
          <span className="text-base font-semibold text-neutral-900">{s.label}</span>
          {s.version && <span className="text-xs text-neutral-400">{s.version}</span>}
          {recent && at !== undefined && <span className="ml-auto text-xs text-neutral-400">{ago(at)}{s.auto ? " · shown automatically" : ""}</span>}
        </div>
        {kindOf(s) !== "heard" && s.heard && <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-400">You said: “…{s.heard.split(" ").slice(-14).join(" ")}”</p>}
        <p className="mt-1 line-clamp-3 text-sm leading-snug text-neutral-600">{s.text ? `“${s.text}”` : "Looking up the verse…"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={() => void accept(s.id, "live")} disabled={!s.text} className={`${btnBase} text-[#ffffff] disabled:opacity-50`} style={{ background: th.accent }}>
            <Monitor size={13} /> Put on screen
          </button>
          <button onClick={() => void accept(s.id, "stage")} disabled={!s.text} className={`${btnBase} bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50`}>
            <Eye size={13} /> Preview
          </button>
          {!recent && (
            <button onClick={() => dismiss(s.id)} className={`${btnBase} text-neutral-500 hover:bg-neutral-100`}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  };

  const waitingShown = waiting.filter(pass);
  const recentShown = earlier.filter((r) => pass(r.suggestion));

  return (
    <>
      <button ref={btn} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Scriptures Listen has heard, detected or recognised" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-orange-600">
        <Ear size={14} /> Heard
        {count > 0 && <span className="rounded-full px-1.5 text-[10px] font-bold text-[#ffffff]" style={{ background: waiting.some((s) => kindOf(s) === "heard") || !waiting.length ? SOURCE_THEME.heard.accent : SOURCE_THEME[kindOf(waiting[0])].accent }}>{count}</span>}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70]" onMouseDown={() => setOpen(false)}>
            <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Heard scriptures" className="absolute flex max-h-[min(42rem,calc(100dvh-7rem))] w-[35rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-2xl" style={{ top: pos.top, left: pos.left }}>
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h2 className="text-base font-semibold text-neutral-900">Scriptures heard</h2>
                <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                  <X size={18} />
                </button>
              </div>

              {/* The key: two kinds of catch, and a way to show just one */}
              <div className="grid grid-cols-4 gap-1.5 px-4 pb-3">
                {(
                  [
                    ["all", "All", count, "#404040", "Everything caught"],
                    ["heard", "Heard", numOf("heard"), SOURCE_THEME.heard.accent, "They named the reference"],
                    ["detected", "Detected", numOf("detected"), SOURCE_THEME.detected.accent, "Their exact words matched a verse"],
                    ["ai", "AI match", numOf("ai"), SOURCE_THEME.ai.accent, "The AI recognised their own words"],
                  ] as const
                ).map(([id, label, n, color, hint]) => (
                  <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} title={hint} className={`rounded-xl border px-3 py-2 text-left transition ${filter === id ? "border-transparent text-[#ffffff]" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`} style={filter === id ? { background: color } : undefined}>
                    <span className="block text-sm font-semibold">
                      {label} <span className={filter === id ? "opacity-80" : "text-neutral-400"}>{n}</span>
                    </span>
                    <span className={`block text-[11px] leading-tight ${filter === id ? "opacity-90" : "text-neutral-400"}`}>{hint}</span>
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100 pb-2">
                {count === 0 && <p className="px-5 pb-8 pt-5 text-sm text-neutral-400">{L.status === "listening" ? "Nothing yet — scriptures the preacher mentions, or quotes it recognises, will show up here." : "Turn on Listen (top right) and the scriptures the preacher mentions, or quotes it recognises, will show up here."}</p>}
                {count > 0 && waitingShown.length === 0 && recentShown.length === 0 && <p className="px-5 py-8 text-sm text-neutral-400">None of that kind yet.</p>}

                {waitingShown.length > 0 && (
                  <>
                    <p className="px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Waiting for you</p>
                    {waitingShown.map((s) => (
                      <Row key={s.id} s={s} />
                    ))}
                  </>
                )}

                {recentShown.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-5 pb-1 pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Earlier</p>
                      <button onClick={clearRecent} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-red-600">
                        <Trash2 size={12} /> Clear
                      </button>
                    </div>
                    {recentShown.map((r) => (
                      <Row key={r.id} s={r.suggestion} recent at={r.at} />
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
