"use client";

import { RANGES, type RangeId } from "@/lib/analytics";

// The time filter used by every analytics view.
export function RangeChips({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return (
    <div role="group" aria-label="Time period" className="inline-flex flex-wrap gap-1 rounded-full bg-neutral-100 p-1">
      {RANGES.map((r) => (
        <button key={r.id} onClick={() => onChange(r.id)} aria-pressed={value === r.id} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${value === r.id ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

const KEY = "analytics-range";
export function savedRange(): RangeId {
  try {
    const v = localStorage.getItem(KEY) as RangeId | null;
    if (v && RANGES.some((r) => r.id === v)) return v;
  } catch {}
  return "30d";
}
export function saveRange(r: RangeId) {
  try {
    localStorage.setItem(KEY, r);
  } catch {}
}
