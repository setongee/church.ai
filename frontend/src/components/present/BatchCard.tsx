"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { PresentState, ScriptureBatch } from "@/lib/present";

// Where the batch is: the index of the verse that's live right now, or -1 if none of them is.
export function batchIndex(batch: ScriptureBatch, state: PresentState): number {
  if (state.mode !== "live" || state.slide?.kind !== "scripture") return -1;
  const ref = state.slide.reference;
  return batch.slides.findIndex((s) => s.reference === ref);
}

// Sits between Preview and Live when several verses are selected. The arrows (or the ← → keys) walk from the
// lowest selected verse to the highest and put each one live the moment you move.
export function BatchCard({ batch, state, onStep, onOpen }: { batch: ScriptureBatch; state: PresentState; onStep: (dir: 1 | -1) => void; onOpen: () => void }) {
  const at = batchIndex(batch, state);
  const n = batch.slides.length;
  const verse = (i: number) => batch.slides[i].reference.split(":").pop();
  return (
    <div className="rounded-2xl bg-white p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Batch</span>
        <span className="truncate text-xs text-neutral-400">
          {batch.label} · {batch.version}
        </span>
      </div>
      <div className="flex items-center gap-1.5 rounded-xl bg-neutral-50 p-1.5">
        <button onClick={() => onStep(-1)} disabled={at <= 0 && at !== -1} aria-label="Previous verse (←)" title="Previous verse (←)" className="rounded-lg p-2.5 text-neutral-600 hover:bg-white hover:text-orange-600 disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-sm font-semibold text-neutral-800">{at >= 0 ? `Verse ${verse(at)} is live` : "Press → to start"}</p>
          <p className="text-[11px] text-neutral-400">
            {at >= 0 ? `${at + 1} of ${n}` : `${n} verses · ${verse(0)}–${verse(n - 1)}`}
          </p>
        </div>
        <button onClick={() => onStep(1)} disabled={at === n - 1} aria-label="Next verse (→)" title="Next verse (→)" className="rounded-lg p-2.5 text-neutral-600 hover:bg-white hover:text-orange-600 disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
        <button onClick={onOpen} aria-label="View full size" title="View all verses full size" className="rounded-lg p-2.5 text-neutral-500 hover:bg-white hover:text-orange-600">
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {batch.slides.map((s, i) => (
          <span key={s.reference} className={`h-1.5 flex-1 rounded-full ${i === at ? "bg-orange-500" : "bg-neutral-200"}`} style={{ minWidth: 6 }} />
        ))}
      </div>
    </div>
  );
}

// Every verse of the batch as a card on a big overlay. Click one and it goes live straight away.
export function BatchModal({ batch, state, onPick, onClose }: { batch: ScriptureBatch; state: PresentState; onPick: (i: number) => void; onClose: () => void }) {
  const at = batchIndex(batch, state);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-neutral-950/95 p-6 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          {batch.label} <span className="ml-2 text-sm font-medium text-neutral-400">{batch.version} · click a verse to put it live</span>
        </h2>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-neutral-300 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min gap-4 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {batch.slides.map((s, i) => (
          <button key={s.reference} onClick={() => onPick(i)} className={`rounded-2xl p-5 text-left transition ${i === at ? "bg-orange-600 text-[#ffffff] ring-4 ring-orange-300/40" : "bg-white text-neutral-800 hover:bg-orange-50"}`}>
            <span className={`mb-2 flex items-center justify-between text-sm font-bold ${i === at ? "text-[#ffffff]" : "text-orange-700"}`}>
              {s.reference}
              {i === at && <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] uppercase tracking-wider">Live</span>}
            </span>
            <span className="block text-lg leading-relaxed">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
