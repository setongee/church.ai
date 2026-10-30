"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

// A roomy dialog for the reports: a sticky header, generous padding and a scrolling body.
export function Dialog({ eyebrow, title, subtitle, actions, onClose, children }: { eyebrow?: string; title: string; subtitle?: string; actions?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="my-auto w-full max-w-5xl overflow-hidden rounded-3xl bg-white">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4 sm:gap-6 sm:px-8 sm:py-6">
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-widest text-orange-600">{eyebrow}</p>}
            <h2 className="text-xl font-semibold leading-snug tracking-tight text-neutral-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button onClick={onClose} aria-label="Close" className="rounded-full p-2.5 text-neutral-500 hover:bg-neutral-100">
              <X size={20} />
            </button>
          </div>
        </header>
        <div className="space-y-8 px-5 py-6 sm:space-y-10 sm:px-8 sm:py-8">{children}</div>
      </div>
    </div>
  );
}

// A titled block of the report.
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
