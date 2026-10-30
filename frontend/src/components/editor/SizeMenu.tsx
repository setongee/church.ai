'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SIZE_PRESETS } from './constants';
import { Popover, cx } from './ui';

export function SizeMenu({ width, height, onChange }: { width: number; height: number; onChange: (w: number, h: number) => void }) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const current = SIZE_PRESETS.find((p) => p.width === width && p.height === height);
  return (
    <Popover
      className="w-72"
      trigger={(_, toggle) => (
        <button type="button" onClick={toggle} className="flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm hover:bg-neutral-50">
          <span className="font-medium text-neutral-800">{current?.label ?? 'Custom'}</span>
          <span className="hidden text-xs text-neutral-400 sm:inline">
            {width}×{height}
          </span>
          <ChevronDown size={14} className="text-neutral-400" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <ul className="space-y-0.5">
            {SIZE_PRESETS.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p.width, p.height);
                    close();
                  }}
                  className={cx('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-neutral-100', current?.key === p.key && 'bg-neutral-100')}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center">
                    <span className="block rounded-[3px] border-2 border-neutral-400" style={{ width: 28 * Math.min(1, p.width / p.height), height: 28 * Math.min(1, p.height / p.width) }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-900">{p.label}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {p.hint} · {p.width}×{p.height}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Custom size (px)</p>
            <div className="flex items-center gap-2">
              <input type="number" min={256} max={4096} value={w} onChange={(e) => setW(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" aria-label="Width" />
              <span className="text-neutral-400">×</span>
              <input type="number" min={256} max={4096} value={h} onChange={(e) => setH(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" aria-label="Height" />
              <button
                type="button"
                onClick={() => {
                  onChange(Number(w) || width, Number(h) || height);
                  close();
                }}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                Apply
              </button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">Layers keep their place and are re-fitted to the new shape.</p>
          </div>
        </div>
      )}
    </Popover>
  );
}
