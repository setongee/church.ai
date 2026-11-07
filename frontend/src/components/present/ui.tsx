"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useCloseGuard } from "@/components/CloseGuard";

export const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50";

// `guard` makes closing ask first when the form inside has been changed (see CloseGuard): turn it on for anything a
// person types into and would be sorry to lose. Leave it off for pickers, confirmations and viewers.
export function Modal({ title, onClose, children, wide, guard }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; guard?: boolean }) {
  const { bindPanel, request, escape, dialog, onClickCapture } = useCloseGuard(onClose, { enabled: Boolean(guard) });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && escape();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [escape]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && request()}>
      <div ref={bindPanel} onClickCapture={onClickCapture} className={`sheet-anim flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none rounded-t-2xl border border-neutral-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[90vh] sm:rounded-2xl sm:pb-0 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-300 sm:hidden" />
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          <button onClick={request} aria-label="Close" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
      {dialog}
    </div>
  );
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">{icon}</div>
      <p className="text-sm font-semibold text-neutral-800">{title}</p>
      {children && <div className="max-w-sm text-sm text-neutral-500">{children}</div>}
    </div>
  );
}
