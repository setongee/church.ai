"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_PX, MIN_PX, pxOf, scaleOfPx } from "@/lib/present";

const STEP = 4;

// The text size in pixels (on the 1920x1080 screen): - / + step it, or type an exact number. It is a fixed size and
// never changes with how much text a slide has.
export function FontSizeControl({ scale, onChange, size = 15, iconBtn }: { scale: number; onChange: (scale: number) => void; size?: number; iconBtn: string }) {
  const px = pxOf(scale);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) onChange(scaleOfPx(n));
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Text size in pixels">
      <button type="button" onClick={() => onChange(scaleOfPx(px - STEP))} disabled={px <= MIN_PX} aria-label="Smaller text" title="Smaller text" className={iconBtn}>
        <Minus size={size} />
      </button>
      <input
        key={px}
        type="number"
        inputMode="numeric"
        min={MIN_PX}
        max={MAX_PX}
        step={STEP}
        defaultValue={px}
        aria-label="Text size in pixels"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
        className="w-14 rounded-md border border-neutral-200 bg-white px-1 py-1 text-center text-xs font-semibold tabular-nums text-neutral-700 outline-none focus:border-orange-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-[11px] font-medium text-neutral-400">px</span>
      <button type="button" onClick={() => onChange(scaleOfPx(px + STEP))} disabled={px >= MAX_PX} aria-label="Bigger text" title="Bigger text" className={iconBtn}>
        <Plus size={size} />
      </button>
    </div>
  );
}
