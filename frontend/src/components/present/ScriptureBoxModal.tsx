"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Eye, Play, Trash2 } from "lucide-react";
import { deleteScriptureBox, listScriptureBox, type SavedScripture, type ScheduleItemInput, type Slide } from "@/lib/present";
import { Modal } from "./ui";

const slideOf = (s: SavedScripture): Slide => ({ kind: "scripture", reference: s.reference, version: s.version, text: s.text });

// The scripture box: verses the presenter saved to come back to. Click to preview, double-click or the play
// button to go live.
export function ScriptureBoxModal({ refreshKey, onClose, onStage, onLive, onAdd, onCount }: { refreshKey: number; onClose: () => void; onStage: (s: Slide) => void; onLive: (s: Slide) => void; onAdd: (i: ScheduleItemInput) => void; onCount: (n: number) => void }) {
  const [items, setItems] = useState<SavedScripture[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listScriptureBox()
      .then((l) => {
        setItems(l);
        onCount(l.length);
      })
      .catch((e) => setError(e.message));
  }, [refreshKey, onCount]);

  async function remove(id: string) {
    try {
      await deleteScriptureBox(id);
      setItems((l) => {
        const next = (l ?? []).filter((x) => x._id !== id);
        onCount(next.length);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t remove it");
    }
  }

  return (
    <Modal title="Scripture box" onClose={onClose} wide>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {items === null ? (
        <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          Nothing saved yet. In the Scripture tab, <b>right-click</b> a verse and choose “Add to scripture box”, or press <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">Shift</kbd>+<kbd className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">Enter</kbd> on what you have selected.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it._id} className="group rounded-xl bg-white p-3 hover:border-orange-300" onDoubleClick={() => onLive(slideOf(it))}>
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => onStage(slideOf(it))} className="min-w-0 flex-1 text-left">
                  <span className="text-sm font-bold text-orange-600">
                    {it.reference} <span className="ml-1 text-xs font-medium text-neutral-400">{it.version}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-3 block text-sm leading-relaxed text-neutral-700">{it.text}</span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => onStage(slideOf(it))} title="Preview" aria-label="Preview" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-orange-600">
                    <Eye size={15} />
                  </button>
                  <button onClick={() => onLive(slideOf(it))} title="Go live" aria-label="Go live" className="rounded-lg bg-orange-600 p-2 text-[#ffffff] hover:bg-orange-700">
                    <Play size={14} fill="currentColor" />
                  </button>
                  <button onClick={() => onAdd({ type: "scripture", title: it.reference, subtitle: it.version, slides: [slideOf(it)] })} title="Add to schedule" aria-label="Add to schedule" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-orange-600">
                    <CalendarPlus size={15} />
                  </button>
                  <button onClick={() => remove(it._id)} title="Remove" aria-label="Remove" className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
