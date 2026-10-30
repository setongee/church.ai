'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2, X } from 'lucide-react';
import { withToken } from '@/lib/auth';
import { assetUrl, createDesignAnimation, deleteDesignAnimation, getDesignAnimation, getDesignEffects, listDesignAnimations, type DesignAnimation, type DesignEffect } from '@/lib/api';
import type { Design } from '@/lib/types';
import { dataUrlToBlob, type DesignCanvas } from './useDesignCanvas';
import { Spinner, cx } from './ui';

const SPEEDS = [
  { label: 'Quick', value: 0.55 },
  { label: 'Normal', value: 0.9 },
  { label: 'Slow', value: 1.5 },
];

// Turns the design on screen into a short looping video: the still version stays as it is, and
// each element animates in with the chosen effect.
export function AnimateDialog({ ed, design, onClose }: { ed: DesignCanvas; design: Design; onClose: () => void }) {
  const [effects, setEffects] = useState<DesignEffect[]>([]);
  const [maxSec, setMaxSec] = useState(8);
  const [effect, setEffect] = useState('rise');
  const [lengthSec, setLengthSec] = useState(6);
  const [speed, setSpeed] = useState(0.9);
  const [stagger, setStagger] = useState(0.4);
  const [loop, setLoop] = useState(true);
  const [bgMotion, setBgMotion] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<DesignAnimation[]>([]);

  const refresh = useCallback(() => listDesignAnimations(design._id).then(setItems).catch(() => {}), [design._id]);

  useEffect(() => {
    getDesignEffects()
      .then((r) => {
        setEffects(r.effects);
        setMaxSec(r.maxSec);
      })
      .catch(() => setError('Could not load the effects.'));
    refresh();
  }, [refresh]);

  const inFlight = items.some((i) => i.status === 'queued' || i.status === 'rendering');
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => {
      items
        .filter((i) => i.status === 'queued' || i.status === 'rendering')
        .forEach((i) =>
          getDesignAnimation(i._id)
            .then((fresh) => setItems((prev) => prev.map((x) => (x._id === fresh._id ? { ...x, ...fresh } : x))))
            .catch(() => {})
        );
    }, 1500);
    return () => clearInterval(t);
  }, [inFlight, items]);

  async function create() {
    setError('');
    setBusy('Preparing the layers…');
    try {
      const cap = await ed.captureLayers();
      if (cap.layers.length === 0) throw new Error('Add some text or elements to the design first - there is nothing to animate yet.');
      setBusy('Uploading…');
      const created = await createDesignAnimation(
        design._id,
        { effect, lengthSec, speed, stagger, loop, bgMotion },
        {
          width: cap.width,
          height: cap.height,
          background: dataUrlToBlob(cap.background),
          layers: cap.layers.map((l) => ({ blob: dataUrlToBlob(l.dataUrl), x: l.x, y: l.y, w: l.w, h: l.h, kind: l.kind, label: l.label })),
        }
      );
      setItems((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the animation');
    } finally {
      setBusy('');
    }
  }

  async function remove(a: DesignAnimation) {
    if (!window.confirm('Delete this animation? The still design is not affected.')) return;
    try {
      await deleteDesignAnimation(a._id);
      setItems((prev) => prev.filter((x) => x._id !== a._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Animate this design</h2>
            <p className="text-xs text-neutral-500">Makes a looping video of up to {maxSec}s. Your still design stays as it is.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Effect</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {effects.map((e) => (
                <button key={e.id} type="button" onClick={() => setEffect(e.id)} className={cx('rounded-xl border px-3 py-2.5 text-left transition', effect === e.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:border-neutral-400')}>
                  <span className="block text-sm font-medium">{e.label}</span>
                  <span className={cx('mt-0.5 block text-[11px] leading-snug', effect === e.id ? 'text-neutral-300' : 'text-neutral-500')}>{e.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-600">
              <span className="flex justify-between">
                Length <span className="tabular-nums text-neutral-900">{lengthSec}s</span>
              </span>
              <input type="range" min={2} max={maxSec} step={0.5} value={lengthSec} onChange={(e) => setLengthSec(Number(e.target.value))} className="mt-2 w-full accent-neutral-900" />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              <span className="flex justify-between">
                Delay between elements <span className="tabular-nums text-neutral-900">{stagger.toFixed(2)}s</span>
              </span>
              <input type="range" min={0} max={1.2} step={0.05} value={stagger} onChange={(e) => setStagger(Number(e.target.value))} className="mt-2 w-full accent-neutral-900" />
            </label>
            <div>
              <p className="text-xs font-medium text-neutral-600">Entrance speed</p>
              <div className="mt-2 flex gap-1.5">
                {SPEEDS.map((s) => (
                  <button key={s.label} type="button" onClick={() => setSpeed(s.value)} className={cx('flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium', speed === s.value ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2.5 text-sm text-neutral-700">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="h-4 w-4 accent-neutral-900" />
                Loop smoothly <span className="text-xs text-neutral-400">(elements leave at the end)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={bgMotion} onChange={(e) => setBgMotion(e.target.checked)} className="h-4 w-4 accent-neutral-900" />
                Slow drift on the background
              </label>
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={create} disabled={Boolean(busy) || !ed.ready} className="flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {busy ? (
              <>
                <Spinner /> {busy}
              </>
            ) : (
              'Create animation'
            )}
          </button>

          {items.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Animated versions</p>
              <ul className="grid gap-4 sm:grid-cols-2">
                {items.map((a) => (
                  <li key={a._id} className="overflow-hidden rounded-xl border border-neutral-200">
                    <div className="relative bg-neutral-900" style={{ aspectRatio: `${ed.size.w} / ${ed.size.h}` }}>
                      {a.status === 'done' && a.videoUrl ? (
                        <video src={assetUrl(a.videoUrl)} autoPlay loop muted playsInline controls className="h-full w-full object-contain" />
                      ) : a.status === 'error' ? (
                        <p className="grid h-full place-items-center px-4 text-center text-xs text-red-300">{a.error || 'Render failed'}</p>
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-neutral-300">
                          <span className="flex items-center gap-2">
                            <Spinner /> {a.status === 'queued' ? 'Waiting…' : `Rendering ${a.progress}%`}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-neutral-600">
                      <span className="truncate">
                        {effects.find((e) => e.id === a.effect)?.label ?? a.effect} · {a.lengthSec}s
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {a.status === 'done' && a.videoUrl && (
                          <span className="flex items-center gap-0.5" title="Download as">
                            <Download size={14} className="mr-0.5 text-neutral-400" />
                            {(['mp4', 'gif', 'webm'] as const).map((f) => (
                              <a
                                key={f}
                                href={withToken(assetUrl(`/api/designs/animations/${a._id}/download?format=${f}`))}
                                className="rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase text-neutral-700 hover:bg-neutral-100"
                                title={f === 'gif' ? 'GIF (first download takes a few seconds to convert)' : `Download ${f.toUpperCase()}`}
                              >
                                {f}
                              </a>
                            ))}
                          </span>
                        )}
                        <button type="button" onClick={() => remove(a)} className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete animation">
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
