"use client";

import { Layers, Search } from "lucide-react";
import { inputCls } from "./ui";

// Shared bits for the "My library | From the app" views used by Media, Backgrounds, Prayers and Quotes.

export type SourceView = "library" | "app";

// Quotes also have a slide shows view.
export type QuotesView = SourceView | "shows";

export function ViewTabs<T extends string = SourceView>({ value, onChange, libraryLabel = "My library", extra = [] }: { value: T; onChange: (v: T) => void; libraryLabel?: string; extra?: { id: T; label: string }[] }) {
  const tab = (on: boolean) => `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`;
  return (
    <div className="flex shrink-0 gap-0.5 rounded-xl bg-neutral-100 p-1" role="tablist">
      <button role="tab" aria-selected={value === "library"} onClick={() => onChange("library" as T)} className={tab(value === "library")}>
        {libraryLabel}
      </button>
      {extra.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={tab(value === t.id)}>
          {t.label}
        </button>
      ))}
      <button role="tab" aria-selected={value === "app"} onClick={() => onChange("app" as T)} className={tab(value === "app")} title="Things the rest of the app has made — quote graphics, designs, reels, notes…">
        <Layers size={12} /> From the app
      </button>
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${o.id === value ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-52 flex-1 sm:max-w-xs">
      <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} h-9 pl-9`} />
    </div>
  );
}
