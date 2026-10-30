"use client";

import { useState } from "react";
import { ChevronDown, LayoutTemplate } from "lucide-react";
import { QUOTE_LAYOUTS, type Background, type PresentState, type PresentStyle, type Slide } from "@/lib/present";
import { Stage } from "./Stage";

const SAMPLE_QUOTE = "Trust Him with today, and He will carry you through tomorrow.";

type Props = { style: PresentStyle; background: Background; onStyle: (p: Partial<PresentStyle>) => void };

// Quote layout choices. Each layout is shown as a live miniature of the real screen.
export function LayoutPicker({ style, background, onStyle }: Props) {
  const [open, setOpen] = useState(true);
  const layouts = QUOTE_LAYOUTS;
  const current = style.quoteLayout || "classic";
  const slide: Slide = { kind: "quote", text: SAMPLE_QUOTE, attribution: "Sample" };
  const state = (over: Partial<PresentStyle>): PresentState => ({ rev: 0, mode: "live", slide, background, alert: null, logoUrl: "", logoKind: "logo", style: { ...style, ...over } });

  return (
    <div className="rounded-xl border border-neutral-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-orange-600">
          <LayoutTemplate size={14} /> Quote layout
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="flex gap-3 overflow-x-auto px-3 pb-3">
          {layouts.map((l) => {
            const on = current === l.id;
            return (
              <button key={l.id} onClick={() => onStyle({ quoteLayout: l.id })} aria-pressed={on} className="group w-40 shrink-0 text-left">
                <span className={`pointer-events-none block overflow-hidden rounded-lg border-2 transition ${on ? "border-orange-500" : "border-transparent group-hover:border-neutral-300"}`}>
                  <Stage state={state({ quoteLayout: l.id })} monitor="preview" />
                </span>
                <span className={`mt-1 block truncate text-xs ${on ? "font-semibold text-orange-600" : "text-neutral-500"}`}>{l.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
