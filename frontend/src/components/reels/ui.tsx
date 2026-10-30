'use client';

import { useEffect, useRef, useState } from 'react';

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-3 text-sm text-neutral-700">
        <span className="w-36 shrink-0">{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-neutral-900" />
        <span className="w-14 text-right font-mono text-xs text-neutral-500">{format(value)}</span>
      </label>
      {hint && <p className="ml-[9.75rem] mt-0.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

export function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// A 9:16 phone-shaped frame showing a server-rendered still. It re-renders (debounced) whenever
// `watch` changes, which is how the design preview follows edits as they are typed.
export function PreviewFrame({
  load,
  watch,
  children,
  caption,
}: {
  load: () => Promise<string>;
  watch: string;
  children?: React.ReactNode;
  caption?: string;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState('');
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const u = await loadRef.current();
        if (!cancelled) {
          setUrl(u);
          setFailed('');
        }
      } catch (err) {
        if (!cancelled) setFailed(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [watch]);

  return (
    <div>
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-900">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Preview" className={`h-full w-full object-cover transition-opacity ${busy ? 'opacity-60' : ''}`} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-400">{failed || 'Rendering preview…'}</div>
        )}
        {busy && url && <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">updating…</span>}
        {children}
      </div>
      {caption && <p className="mt-2 text-center text-[11px] text-neutral-400">{caption}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-neutral-800">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-neutral-900" />
      <span>
        {children}
        {hint && <span className="block text-xs text-neutral-400">{hint}</span>}
      </span>
    </label>
  );
}
