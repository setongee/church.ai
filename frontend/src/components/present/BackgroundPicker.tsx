"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Play, X } from "lucide-react";
import { BACKGROUND_PRESETS, listMedia, mediaSrc, type Background, type MediaItem } from "@/lib/present";
import { btnGhost, Modal } from "./ui";

const same = (a?: Background | null, b?: Background | null) => !!a && !!b && a.type === b.type && a.value === b.value;

// The thumbnail for a background (colour, gradient, picture or video).
export function BackgroundThumb({ bg, className = "" }: { bg: Background; className?: string }) {
  if (bg.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaSrc(bg.value)} alt="" className={`object-cover ${className}`} />;
  }
  if (bg.type === "video") return <video src={`${mediaSrc(bg.value)}#t=0.1`} muted playsInline preload="metadata" className={`object-cover ${className}`} />;
  return <span className={`block ${className}`} style={{ background: bg.value }} />;
}

function PickerModal({ value, onPick, onClose }: { value?: Background | null; onPick: (b: Background | null) => void; onClose: () => void }) {
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  useEffect(() => {
    listMedia().then(setMedia).catch(() => setMedia([]));
  }, []);
  const asBg = (m: MediaItem): Background => (m.type === "video" ? { type: "video", value: m.url } : { type: "image", value: m.url });

  const pick = (b: Background | null) => {
    onPick(b);
    onClose();
  };

  return (
    <Modal title="Choose a background" onClose={onClose} wide>
      <div className="space-y-5">
        <button onClick={() => pick(null)} className={`${btnGhost} w-full justify-start ${!value ? "border-orange-300 text-orange-700" : ""}`}>
          <X size={15} /> No background of its own — use the screen background
        </button>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Colors &amp; gradients</h3>
          <div className="flex flex-wrap gap-2.5">
            {BACKGROUND_PRESETS.map((p) => (
              <button key={p.name} onClick={() => pick(p.bg)} title={p.name} aria-label={p.name} className="group w-20 text-left">
                <span className={`block aspect-[3/2] overflow-hidden rounded-lg border-2 ${same(value, p.bg) ? "border-orange-500" : "border-transparent group-hover:border-neutral-300"}`} style={{ background: p.bg.value }} />
                <span className="mt-0.5 block truncate text-[11px] text-neutral-500">{p.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Your pictures, GIFs &amp; videos</h3>
          {media === null && <p className="py-4 text-sm text-neutral-400">Loading…</p>}
          {media?.length === 0 && <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">Nothing uploaded yet — add some in the Media or Backgrounds tab.</p>}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {media?.map((m) => {
              const bg = asBg(m);
              return (
                <button key={m._id} onClick={() => pick(bg)} className="group text-left">
                  <span className={`relative block aspect-video overflow-hidden rounded-lg border-2 bg-neutral-100 ${same(value, bg) ? "border-orange-500" : "border-transparent group-hover:border-neutral-300"}`}>
                    <BackgroundThumb bg={bg} className="h-full w-full" />
                    {m.type === "video" && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-[#ffffff]">
                          <Play size={13} fill="currentColor" />
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-xs text-neutral-500">{m.name || "Untitled"}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}

// "Background: [preview] Choose… / Remove" row for editors.
export function BackgroundField({ value, onChange, label = "Background", hint }: { value?: Background | null; onChange: (b: Background | null) => void; label?: string; hint?: { set: string; unset: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="flex items-center gap-3">
        <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
          {value ? <BackgroundThumb bg={value} className="h-full w-full" /> : <ImageIcon size={18} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-neutral-300" />}
        </span>
        <button type="button" onClick={() => setOpen(true)} className={btnGhost}>
          {value ? "Change" : "Choose a background"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-sm font-medium text-neutral-500 hover:text-red-600">
            Remove
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-neutral-400">{value ? (hint?.set ?? "Shown behind this slide instead of the screen background.") : (hint?.unset ?? "Uses the screen background.")}</p>
      {open && <PickerModal value={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}
