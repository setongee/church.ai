"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";
import type { Background, PresentQuote, Slideshow, SlideshowInput } from "@/lib/present";
import { BackgroundField, BackgroundThumb } from "./BackgroundPicker";
import { btnGhost, btnPrimary, Field, inputCls, Modal } from "./ui";

export type ShowDraftQuote = { key: string; text: string; attribution: string; background: Background | null };

export interface ShowDraft {
  id?: string;
  name: string;
  seconds: number;
  loop: boolean;
  closing: { enabled: boolean; text: string; subtext: string; background: Background | null };
  background: Background | null;
  quotes: ShowDraftQuote[];
}

export const newDraft = (quotes: ShowDraftQuote[]): ShowDraft => ({
  name: "",
  seconds: 8,
  loop: false,
  closing: { enabled: false, text: "Thank you", subtext: "", background: null },
  background: null,
  quotes,
});

export const draftFromShow = (s: Slideshow): ShowDraft => ({
  id: s._id,
  name: s.name,
  seconds: s.seconds,
  loop: s.loop,
  closing: { enabled: s.closing.enabled, text: s.closing.text, subtext: s.closing.subtext, background: s.closing.background ?? null },
  background: s.background ?? null,
  quotes: s.quotes.map((q, i) => ({ key: `${s._id}-${i}`, text: q.text, attribution: q.attribution, background: q.background ?? null })),
});

export const toInput = (d: ShowDraft): SlideshowInput => ({
  name: d.name.trim(),
  seconds: d.seconds,
  loop: d.loop,
  closing: d.closing,
  background: d.background,
  quotes: d.quotes.map(({ text, attribution, background }) => ({ text, attribution, background })),
});

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-2.5 text-left">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-orange-600" : "bg-neutral-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span className="text-sm font-medium text-neutral-800">{label}</span>
    </button>
  );
}

// Build or edit a quote slide show: which quotes, in what order, how long each stays, whether it loops,
// and an optional closing slide.
export function SlideshowEditor({ initial, library, saving, error, onSave, onClose }: { initial: ShowDraft; library: PresentQuote[]; saving: boolean; error: string; onSave: (d: ShowDraft) => void; onClose: () => void }) {
  const [d, setD] = useState(initial);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const move = (from: number, to: number) =>
    setD((cur) => {
      if (from === to || to < 0 || to >= cur.quotes.length) return cur;
      const quotes = [...cur.quotes];
      quotes.splice(to, 0, quotes.splice(from, 1)[0]);
      return { ...cur, quotes };
    });

  const total = d.quotes.length + (d.closing.enabled && (d.closing.text.trim() || d.closing.subtext.trim()) ? 1 : 0);
  const length = total * d.seconds;
  const canSave = d.name.trim() && d.quotes.length > 0;

  return (
    <Modal title={d.id ? "Edit slide show" : "New slide show"} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="Name">
            <input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Welcome loop, Offering quotes" className={inputCls} />
          </Field>
          <Field label="Seconds each">
            <input type="number" min={2} max={600} value={d.seconds} onChange={(e) => setD({ ...d, seconds: Math.max(2, Math.min(600, Number(e.target.value) || 2)) })} className={inputCls} />
          </Field>
        </div>

        <Switch on={d.loop} onChange={(loop) => setD((cur) => ({ ...cur, loop }))} label="Loop — start over when it reaches the end" />

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Slides · {total} ({length >= 60 ? `${Math.floor(length / 60)}m ${length % 60}s` : `${length}s`} per pass)</h3>
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50">
              <Plus size={13} /> Add from my quotes
            </button>
          </div>
          <div className="space-y-1.5">
            {d.quotes.map((q, i) => (
              <div
                key={q.key}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(i);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                onDrop={() => {
                  if (drag !== null) move(drag, i);
                  setDrag(null);
                  setOver(null);
                }}
                className={`flex items-center gap-2 rounded-xl border bg-white py-2 pl-1.5 pr-2 ${over === i && drag !== null && drag !== i ? "border-orange-400" : "border-neutral-100"} ${drag === i ? "opacity-40" : ""}`}
              >
                <GripVertical size={16} className="shrink-0 cursor-grab text-neutral-300" />
                <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-neutral-400">{i + 1}</span>
                {q.background && <BackgroundThumb bg={q.background} className="h-8 w-12 shrink-0 rounded-md" />}
                <p className="min-w-0 flex-1 truncate text-sm text-neutral-800" title={q.text}>
                  {q.text}
                  {q.attribution && <span className="text-neutral-400"> — {q.attribution}</span>}
                </p>
                <button onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up" className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => move(i, i + 1)} disabled={i === d.quotes.length - 1} aria-label="Move down" className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30">
                  <ArrowDown size={14} />
                </button>
                <button onClick={() => setD({ ...d, quotes: d.quotes.filter((x) => x.key !== q.key) })} aria-label="Remove" className="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                  <X size={14} />
                </button>
              </div>
            ))}
            {d.quotes.length === 0 && <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">No quotes yet — add some from your library.</p>}
            {d.closing.enabled && (d.closing.text.trim() || d.closing.subtext.trim()) && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-orange-200 bg-orange-50/40 py-2 pl-3 pr-3">
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700">Closing</span>
                <p className="min-w-0 flex-1 truncate text-sm text-neutral-700">{[d.closing.text, d.closing.subtext].filter(Boolean).join(" — ")}</p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-xl bg-neutral-50/50 p-4">
          <Switch on={d.closing.enabled} onChange={(enabled) => setD((cur) => ({ ...cur, closing: { ...cur.closing, enabled } }))} label="Add a closing slide at the end" />
          {d.closing.enabled && (
            <div className="space-y-3 pt-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Closing title">
                  <input value={d.closing.text} onChange={(e) => setD({ ...d, closing: { ...d.closing, text: e.target.value } })} placeholder="e.g. Thank you" className={inputCls} />
                </Field>
                <Field label="Smaller line (optional)">
                  <input value={d.closing.subtext} onChange={(e) => setD({ ...d, closing: { ...d.closing, subtext: e.target.value } })} placeholder="e.g. See you next Sunday" className={inputCls} />
                </Field>
              </div>
              <BackgroundField value={d.closing.background} onChange={(background) => setD({ ...d, closing: { ...d.closing, background } })} />
            </div>
          )}
        </section>

        <section className="rounded-xl bg-neutral-50/50 p-4">
          <BackgroundField value={d.background} onChange={(background) => setD({ ...d, background })} />
          <p className="mt-1 text-xs text-neutral-400">Used behind every quote that doesn’t have a background of its own.</p>
        </section>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button onClick={() => onSave(d)} disabled={!canSave || saving} className={btnPrimary}>
            {saving ? "Saving…" : "Save slide show"}
          </button>
        </div>
      </div>

      {adding && (
        <Modal title="Add quotes" onClose={() => setAdding(false)}>
          <div className="space-y-3">
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {library.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">Your quote library is empty.</p>}
              {library.map((q) => {
                const on = picked.has(q._id);
                return (
                  <button
                    key={q._id}
                    onClick={() =>
                      setPicked((cur) => {
                        const n = new Set(cur);
                        if (n.has(q._id)) n.delete(q._id);
                        else n.add(q._id);
                        return n;
                      })
                    }
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${on ? "border-orange-300 bg-orange-50" : "border-neutral-100 hover:bg-neutral-50"}`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${on ? "border-orange-600 bg-orange-600 text-[#ffffff]" : "border-neutral-300"}`}>{on ? "✓" : ""}</span>
                    <span className="min-w-0 text-sm text-neutral-800">
                      {q.text}
                      {q.attribution && <span className="block text-xs text-neutral-400">— {q.attribution}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className={btnGhost}>
                Cancel
              </button>
              <button
                disabled={picked.size === 0}
                onClick={() => {
                  const add = library.filter((q) => picked.has(q._id)).map((q) => ({ key: `lib-${q._id}-${Date.now()}`, text: q.text, attribution: q.attribution, background: q.background ?? null }));
                  setD((cur) => ({ ...cur, quotes: [...cur.quotes, ...add] }));
                  setPicked(new Set());
                  setAdding(false);
                }}
                className={btnPrimary}
              >
                Add {picked.size || ""} to show
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
