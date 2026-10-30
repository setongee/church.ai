"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LayoutPanelLeft } from "lucide-react";
import { PRESENT_LAYOUTS, usePresentLayout, type PresentLayoutId } from "@/lib/presentLayouts";
import { SkinPicker } from "@/components/SkinPicker";

// A tiny picture of each arrangement (the library is the light block, the monitors the dark ones).
export function Diagram({ id }: { id: PresentLayoutId }) {
  const lib = "rounded-[3px] bg-neutral-300";
  const mon = "rounded-[3px] bg-orange-500";
  return (
    <span className="grid h-9 w-14 shrink-0 gap-[3px] rounded-md bg-neutral-100 p-[3px]" style={id === "stage" ? { gridTemplateRows: "1fr 1.6fr" } : { gridTemplateColumns: id === "mirror" ? "1fr 1.8fr" : "1.8fr 1fr" }} aria-hidden>
      {id === "stage" ? (
        <>
          <span className="grid grid-cols-2 gap-[3px]">
            <span className={mon} />
            <span className={mon} />
          </span>
          <span className={lib} />
        </>
      ) : id === "mirror" ? (
        <>
          <span className="grid gap-[3px]">
            <span className={mon} />
            <span className={mon} />
          </span>
          <span className={lib} />
        </>
      ) : (
        <>
          <span className={lib} />
          <span className="grid gap-[3px]">
            <span className={mon} />
            <span className={mon} />
          </span>
        </>
      )}
    </span>
  );
}

// "Layout" in the Present header: pick how the screen is arranged. It is saved on your account.
export function PresentLayoutMenu() {
  const { layout, setLayout } = usePresentLayout();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={box} className="relative hidden lg:block">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="How this screen is arranged, and the look of the whole app" className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:border-orange-300 hover:text-orange-700">
        <LayoutPanelLeft size={16} /> Layout &amp; skin
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 max-h-[min(36rem,calc(100dvh-8rem))] w-[22rem] overflow-y-auto rounded-2xl border border-neutral-100 bg-white p-1.5 shadow-xl">
          <p className="px-3 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-widest text-neutral-400">Presenter layout</p>
          {PRESENT_LAYOUTS.map((l) => (
            <button
              key={l.id}
              role="menuitemradio"
              aria-checked={layout === l.id}
              onClick={() => {
                setLayout(l.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-neutral-50 ${layout === l.id ? "bg-orange-50" : ""}`}
            >
              <Diagram id={l.id} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${layout === l.id ? "text-orange-700" : "text-neutral-900"}`}>{l.label}</span>
                <span className="block text-xs text-neutral-500">{l.hint}</span>
              </span>
              {layout === l.id && <Check size={16} className="shrink-0 text-orange-600" />}
            </button>
          ))}
          <div className="mt-1 border-t border-neutral-100 px-1.5 pb-2 pt-2">
            <p className="px-1.5 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-400">Skin — the whole app</p>
            <SkinPicker compact />
          </div>
          <p className="px-3 pb-2 pt-1 text-[11px] text-neutral-400">Both are saved to your account, so they’re the same on any computer you sign in on.</p>
        </div>
      )}
    </div>
  );
}
