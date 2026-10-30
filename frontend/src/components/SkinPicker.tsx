"use client";

import { Check } from "lucide-react";
import { SKINS, useSkin } from "@/lib/skins";

// Tiles for choosing your own skin (the look of the whole app): a mini picture of page, card and accent. Until one is
// picked, Ember (the default look) shows as selected.
export function SkinPicker({ compact = false }: { compact?: boolean }) {
  const { skin: chosen, setSkin } = useSkin();
  const skin = chosen || SKINS[0].id;
  const tile = (on: boolean) => `relative overflow-hidden rounded-xl border text-left transition ${on ? "border-orange-400 ring-2 ring-orange-500/20" : "border-neutral-200 hover:border-neutral-300"}`;
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`} role="radiogroup" aria-label="Skin">
      {SKINS.map((s) => (
        <button key={s.id} role="radio" aria-checked={skin === s.id} onClick={() => setSkin(s.id)} title={s.blurb} className={tile(skin === s.id)}>
          <span className="relative block h-12" style={{ background: s.swatch[0] }}>
            <span className="absolute inset-x-2 bottom-0 top-3 rounded-t-md" style={{ background: s.swatch[1] }} />
            <span className="absolute left-3.5 top-5 h-1.5 w-8 rounded-full" style={{ background: s.swatch[2] }} />
            <span className="absolute left-3.5 top-8 h-1 w-12 rounded-full bg-black/10" />
            <span className="absolute bottom-0 right-3 h-3 w-6 rounded-t-md" style={{ background: s.swatch[2] }} />
          </span>
          <span className="block truncate px-2 py-1.5 text-xs font-semibold text-neutral-800">{s.name}</span>
          {skin === s.id && <Check size={14} className="absolute right-1.5 top-1.5" style={{ color: s.swatch[2] }} />}
        </button>
      ))}
    </div>
  );
}
