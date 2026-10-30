'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Brand, SavedTemplate, SessionDetail } from '@/lib/types';
import { SIZE_PRESETS } from '../editor/constants';
import { buildContent } from '../editor/dataFields';
import { renderThumb, type TemplateContent } from '../editor/templates/engine';
import { cx } from '../editor/ui';
import { SOURCES, collectItems, templateChoices, type CarouselSource } from './generate';

// Instagram carousels run from 4:5 (portrait) to 1.91:1 (landscape).
const IG_SIZES = SIZE_PRESETS.filter((p) => ['ig-portrait', 'square', 'landscape', 'wide'].includes(p.key));

export interface OptionsState {
  source: CarouselSource;
  count: number;
  cover: boolean;
  closing: boolean;
  bodyId: string;
  coverId: string;
  sizeKey: string;
}

export const DEFAULT_OPTIONS: OptionsState = { source: 'keyPoints', count: 5, cover: true, closing: true, bodyId: '', coverId: '', sizeKey: 'ig-portrait' };

type Option = ReturnType<typeof templateChoices>[number];

// Works out the template and size the options point at (falling back to sensible defaults).
export function resolveOptions(state: OptionsState, saved: SavedTemplate[]) {
  const bodyOptions = templateChoices(saved, ['quote']);
  const coverOptions = templateChoices(saved, ['title', 'quote']);
  const body = bodyOptions.find((t) => t.id === state.bodyId) ?? bodyOptions[0];
  const coverT = coverOptions.find((t) => t.id === state.coverId) ?? coverOptions.find((t) => t.choice.kind === 'builtin' && t.choice.template.kind === 'title') ?? body;
  // A saved template only exists at the sizes it was tuned for, so those are the sizes on offer.
  const sizes = IG_SIZES.filter((p) => [body, state.cover ? coverT : null].every((t) => !t || !t.sizes || t.sizes.some((s) => s.w === p.width && s.h === p.height)));
  const size = sizes.find((p) => p.key === state.sizeKey) ?? sizes[0];
  return { bodyOptions, coverOptions, body, coverT, sizes, size };
}

const thumbCache = new Map<string, string>();
const field = 'text-xs font-medium text-neutral-600';

// Built-in templates are drawn once with the session's own text so the choice is a real preview;
// saved templates show the thumbnail saved with them.
function TemplatePicker({ options, value, onChange, size, content }: { options: Option[]; value?: string; onChange: (id: string) => void; size: { w: number; h: number }; content: TemplateContent }) {
  const [, setTick] = useState(0);
  const sampleKey = `${content.quote}|${content.title}|${content.author}`;
  const ids = options.map((o) => o.id).join(',');

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const o of options) {
        if (!alive) return;
        if (o.choice.kind !== 'builtin') continue;
        const key = `${o.id}|${size.w}x${size.h}|${sampleKey}`;
        if (thumbCache.has(key)) continue;
        try {
          thumbCache.set(key, await renderThumb(o.choice.template, size, content, 240));
          if (alive) setTick((t) => t + 1);
        } catch {
          thumbCache.set(key, '');
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, size.w, size.h, sampleKey]);

  const thumbOf = (o: Option) => {
    if (o.choice.kind === 'builtin') return thumbCache.get(`${o.id}|${size.w}x${size.h}|${sampleKey}`) || '';
    const s = o.choice.saved;
    return s.variants?.find((v) => v.width === size.w && v.height === size.h)?.thumb || s.thumb || '';
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {options.map((o) => {
        const url = thumbOf(o);
        const selected = o.id === value;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} title={o.name} className={cx('overflow-hidden rounded-lg border text-left transition', selected ? 'border-neutral-900 ring-2 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-400')}>
            <span className="grid place-items-center bg-neutral-100" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={o.name} className="h-full w-full object-cover" />
              ) : (
                <span className="h-4 w-4 animate-pulse rounded-full bg-neutral-300" />
              )}
            </span>
            <span className={cx('block truncate px-1.5 py-1 text-[10px]', selected ? 'font-semibold text-neutral-900' : 'text-neutral-600')}>{o.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// Everything that decides how a carousel is generated: content, number of slides, templates, size.
// Used both when creating a carousel and when changing its settings later.
export function CarouselOptions({ state, onChange, saved, detail, brand }: { state: OptionsState; onChange: (patch: Partial<OptionsState>) => void; saved: SavedTemplate[]; detail: SessionDetail | null; brand: Brand | null }) {
  const r = useMemo(() => resolveOptions(state, saved), [state, saved]);
  const [tab, setTab] = useState<'slide' | 'cover'>('slide');
  // The cover tab only exists while there is a cover slide.
  const activeTab = tab === 'cover' && state.cover ? 'cover' : 'slide';
  const available = detail ? collectItems(detail, state.source).length : 0;
  const thumbSize = r.size ? { w: r.size.width, h: r.size.height } : { w: 1080, h: 1350 };

  const samples = useMemo(() => {
    if (!detail) return null;
    const first = collectItems(detail, state.source)[0] || 'Praising God ahead of time changes the atmosphere.';
    const base = buildContent({ text: '' } as never, detail.session, brand);
    const title = detail.session.summary?.topics?.[0] || detail.session.title;
    return { body: { ...base, quote: first, points: [first] }, cover: { ...base, title, quote: title } };
  }, [detail, brand, state.source]);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">What goes on the slides</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <button key={s.key} type="button" onClick={() => onChange({ source: s.key })} className={cx('rounded-xl border px-3 py-2 text-left', state.source === s.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:border-neutral-400')}>
              <span className="block text-sm font-medium">{s.label}</span>
              <span className={cx('block text-[11px]', state.source === s.key ? 'text-neutral-300' : 'text-neutral-500')}>{s.hint}</span>
            </button>
          ))}
        </div>
        <label className={cx('mt-3 block', field)}>
          <span className="flex justify-between">Content slides <span className="tabular-nums text-neutral-900">{state.count}{detail ? ` (${available} available)` : ''}</span></span>
          <input type="range" min={1} max={8} value={state.count} onChange={(e) => onChange({ count: Number(e.target.value) })} className="mt-2 w-full accent-neutral-900" />
        </label>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-700">
          <label className="flex items-center gap-2"><input type="checkbox" checked={state.cover} onChange={(e) => onChange({ cover: e.target.checked })} className="accent-neutral-900" /> Cover slide (message title)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={state.closing} onChange={(e) => onChange({ closing: e.target.checked })} className="accent-neutral-900" /> Closing slide</label>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-1 border-b border-neutral-200" role="tablist" aria-label="Templates">
          {([['slide', 'Slide template', r.body?.name], ...(state.cover ? [['cover', 'Cover template', r.coverT?.name]] : [])] as [string, string, string | undefined][]).map(([k, label, current]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={activeTab === k}
              onClick={() => setTab(k as 'slide' | 'cover')}
              className={cx('-mb-px border-b-2 px-3 py-2 text-left text-sm font-medium', activeTab === k ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800')}
            >
              {label}
              {current && <span className="block max-w-[11rem] truncate text-[11px] font-normal text-neutral-400">{current}</span>}
            </button>
          ))}
        </div>
        {samples && activeTab === 'slide' && <TemplatePicker options={r.bodyOptions} value={r.body?.id} onChange={(id) => onChange({ bodyId: id })} size={thumbSize} content={samples.body} />}
        {samples && activeTab === 'cover' && <TemplatePicker options={r.coverOptions} value={r.coverT?.id} onChange={(id) => onChange({ coverId: id })} size={thumbSize} content={samples.cover} />}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Size (all slides share it)</p>
        {r.sizes.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">The chosen templates have no version for an Instagram carousel size in common. Pick different templates, or save one of them at 1080×1350.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {r.sizes.map((p) => (
              <button key={p.key} type="button" onClick={() => onChange({ sizeKey: p.key })} className={cx('rounded-lg border px-3 py-1.5 text-xs font-medium', r.size?.key === p.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}>
                {p.label} · {p.width}×{p.height}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
