"use client";

import { Eraser } from "lucide-react";
import { HIGHLIGHT_COLORS, type Highlight } from "@/lib/present";
import { highlightSegments } from "./HighlightedText";

// Adds a range, trimming/removing whatever it overlaps.
export function addHighlight(list: Highlight[], add: Highlight): Highlight[] {
  const out: Highlight[] = [];
  for (const h of list) {
    if (h.end <= add.start || h.start >= add.end) out.push(h);
    else {
      if (h.start < add.start) out.push({ ...h, end: add.start });
      if (h.end > add.end) out.push({ ...h, start: add.end });
    }
  }
  out.push(add);
  return out.sort((a, b) => a.start - b.start);
}

// The offset of a point in the selection, in the text this editor shows (each run is one text node).
function offsetOf(node: Node, offset: number, root: HTMLElement): number | null {
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement))?.closest<HTMLElement>("[data-s]");
  if (!el || !root.contains(el)) return null;
  return Number(el.dataset.s) + (node.nodeType === Node.TEXT_NODE ? offset : 0);
}

interface Props {
  label: string;
  text: string;
  highlights: Highlight[];
  color: string;
  onChange: (next: Highlight[]) => void;
}

// A scripture's text you can select with the mouse: whatever you select is highlighted in the chosen colour.
// Click a highlighted word to take that highlight off again.
export function HighlightEditor({ label, text, highlights, color, onChange }: Props) {
  function onMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    const root = e.currentTarget;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const a = offsetOf(r.startContainer, r.startOffset, root);
    const b = offsetOf(r.endContainer, r.endOffset, root);
    if (a === null || b === null) return;
    let start = Math.min(a, b);
    let end = Math.max(a, b);
    // Don't paint the spaces at the edges of a sloppy drag.
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    sel.removeAllRanges();
    if (end > start) onChange(addHighlight(highlights, { start, end, color }));
  }

  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <div onMouseUp={onMouseUp} className="max-h-36 cursor-text select-text overflow-y-auto rounded-lg bg-white p-3 text-[15px] leading-relaxed text-neutral-800">
        {highlightSegments(text, highlights).map((s) =>
          s.color ? (
            <mark
              key={s.start}
              data-s={s.start}
              title="Click to remove this highlight"
              onClick={() => window.getSelection()?.isCollapsed !== false && onChange(highlights.filter((_, i) => i !== s.index))}
              className="cursor-pointer rounded px-0.5 text-neutral-900"
              style={{ background: s.color }}
            >
              {text.slice(s.start, s.end)}
            </mark>
          ) : (
            <span key={s.start} data-s={s.start}>
              {text.slice(s.start, s.end)}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function HighlightColors({ color, onColor, onClear, hasAny }: { color: string; onColor: (c: string) => void; onClear: () => void; hasAny: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {HIGHLIGHT_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onColor(c)} aria-label={`Highlight colour ${c}`} aria-pressed={c === color} className={`h-6 w-6 rounded-full border-2 transition ${c === color ? "scale-110 border-neutral-900" : "border-white shadow-sm ring-1 ring-neutral-200"}`} style={{ background: c }} />
      ))}
      <button type="button" onClick={onClear} disabled={!hasAny} className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-orange-600 disabled:opacity-40">
        <Eraser size={13} /> Clear all
      </button>
    </div>
  );
}
