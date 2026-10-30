'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, FileText, ImageIcon, Camera, Plus, Quote as QuoteIcon, Trash2, Tv } from 'lucide-react';
import { assetUrl, createDesign, deleteDesign, listDesigns, patchDesign } from '@/lib/api';
import type { CarouselSlide, Design, Quote } from '@/lib/types';
import { SIZE_PRESETS } from './constants';
import { Popover, Spinner, cx } from './ui';

export interface CreateDesignInput {
  source: 'blank' | 'quote' | 'post';
  sourceId?: string;
  text?: string;
  title?: string;
  width?: number;
  height?: number;
}

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function DesignCard({ design, onOpen, onDuplicate, onDelete, onTogglePresentation }: { design: Design; onOpen: () => void; onDuplicate: () => void; onDelete: () => void; onTogglePresentation?: () => void }) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <button type="button" onClick={onOpen} className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-neutral-100 p-3" aria-label={`Open ${design.title}`}>
        {design.exportedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(design.exportedImageUrl)} alt={design.title} className="max-h-full max-w-full rounded-md object-contain shadow-md" loading="lazy" />
        ) : (
          <span className="line-clamp-4 max-w-[80%] text-center font-serif text-sm italic text-neutral-500">{design.text || 'Blank design'}</span>
        )}
        {design.presentation && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
            <Tv size={11} /> Presentation
          </span>
        )}
        {design.instagramMediaId && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-pink-600 shadow">
            <Camera size={11} /> Posted
          </span>
        )}
      </button>
      <div className="flex items-start justify-between gap-2 p-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <p className="truncate text-sm font-semibold text-neutral-900">{design.title}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {design.width}×{design.height} · {ago(design.updatedAt)}
          </p>
          {typeof design.session === 'object' && design.session && <p className="mt-0.5 truncate text-[11px] text-neutral-400">{design.session.title}</p>}
        </button>
        <div className="flex shrink-0 gap-0.5">
          {onTogglePresentation && (
            <button
              type="button"
              title={design.presentation ? 'Remove from Present' : 'Use in Present (tag as presentation)'}
              aria-label={design.presentation ? 'Remove presentation tag' : 'Tag as presentation'}
              aria-pressed={!!design.presentation}
              onClick={onTogglePresentation}
              className={cx('rounded-lg p-1.5 hover:bg-orange-50', design.presentation ? 'text-orange-600' : 'text-neutral-400 hover:text-orange-600')}
            >
              <Tv size={15} />
            </button>
          )}
          <button type="button" title="Duplicate" aria-label="Duplicate" onClick={onDuplicate} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <Copy size={15} />
          </button>
          <button type="button" title="Delete" aria-label="Delete" onClick={onDelete} className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SourcePicker({ title, items, onPick, onClose }: { title: string; items: { key: string; text: string; sub?: string }[]; onPick: (key: string) => void; onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 && <li className="p-6 text-center text-sm text-neutral-400">Nothing here yet.</li>}
          {items.map((i) => (
            <li key={i.key}>
              <button type="button" onClick={() => onPick(i.key)} className="w-full rounded-xl p-3 text-left hover:bg-neutral-50">
                {i.sub && <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-900">{i.sub}</span>}
                <span className="line-clamp-3 text-sm text-neutral-800">{i.text}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-neutral-100 p-3">
          <button type="button" onClick={onClose} className="w-full rounded-lg py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function EditorLibrary({
  sessionId,
  quotes,
  carousel,
  onOpen,
  onCreate,
}: {
  sessionId: string;
  quotes: Quote[];
  carousel: CarouselSlide[];
  onOpen: (designId: string) => void;
  onCreate: (input: CreateDesignInput) => Promise<void>;
}) {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [picker, setPicker] = useState<null | 'quote' | 'post'>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listDesigns(sessionId)
      .then(setDesigns)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load designs');
        setDesigns([]);
      });
  }, [sessionId]);

  async function create(input: CreateDesignInput) {
    setBusy(true);
    setError('');
    try {
      await onCreate(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create design');
      setBusy(false);
    }
  }

  async function duplicate(d: Design) {
    try {
      const { design } = await createDesign({ sessionId, copyFrom: d._id });
      setDesigns((list) => [design, ...(list ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate');
    }
  }

  // Tag / untag a design for the Present screen.
  async function togglePresentation(d: Design) {
    try {
      const updated = await patchDesign(d._id, { presentation: !d.presentation });
      setDesigns((list) => (list ?? []).map((x) => (x._id === d._id ? { ...x, presentation: updated.presentation } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the tag');
    }
  }

  async function remove(d: Design) {
    if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return;
    try {
      await deleteDesign(d._id);
      setDesigns((list) => (list ?? []).filter((x) => x._id !== d._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  const startOptions = [
    { key: 'quote', label: 'From a quote', hint: `${quotes.length} available`, icon: QuoteIcon, disabled: quotes.length === 0, onClick: () => setPicker('quote') },
    { key: 'post', label: 'From a post slide', hint: `${carousel.length} available`, icon: FileText, disabled: carousel.length === 0, onClick: () => setPicker('post') },
  ];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Image editor</h2>
          <p className="mt-0.5 max-w-xl text-sm text-neutral-500">
            Turn quotes and posts into shareable graphics. Use the &ldquo;Create with editor&rdquo; button on any quote or post, or start from scratch.
          </p>
        </div>
        <Popover
          align="right"
          className="w-64 p-2"
          trigger={(_, toggle) => (
            <button type="button" onClick={toggle} disabled={busy} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60">
              {busy ? <Spinner /> : <Plus size={16} />} New design
            </button>
          )}
        >
          {(close) => (
            <ul>
              <li>
                <button type="button" onClick={() => { close(); create({ source: 'blank', width: 1080, height: 1350 }); }} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-neutral-100">
                  <ImageIcon size={18} className="text-neutral-500" />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900">Blank design</span>
                    <span className="block text-xs text-neutral-500">Start with an empty canvas</span>
                  </span>
                </button>
              </li>
              {startOptions.map((o) => (
                <li key={o.key}>
                  <button type="button" disabled={o.disabled} onClick={() => { close(); o.onClick(); }} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-neutral-100 disabled:opacity-40">
                    <o.icon size={18} className="text-neutral-500" />
                    <span>
                      <span className="block text-sm font-medium text-neutral-900">{o.label}</span>
                      <span className="block text-xs text-neutral-500">{o.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {designs === null ? (
        <div className="mt-8 flex items-center justify-center gap-2 py-10 text-sm text-neutral-400">
          <Spinner /> Loading designs…
        </div>
      ) : designs.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center">
          <ImageIcon size={32} className="mx-auto text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-700">No designs yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-400">Pick a quote or post to turn into an image, or start with a blank canvas.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {startOptions.map((o) => (
              <button key={o.key} type="button" disabled={o.disabled || busy} onClick={o.onClick} className={cx('flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40')}>
                <o.icon size={16} /> {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((d) => (
            <DesignCard key={d._id} design={d} onOpen={() => onOpen(d._id)} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} onTogglePresentation={() => togglePresentation(d)} />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-400">Sizes available: {SIZE_PRESETS.map((p) => p.label).join(' · ')} · custom.</p>

      {picker === 'quote' && (
        <SourcePicker
          title="Choose a quote"
          items={quotes.map((q) => ({ key: q._id, text: q.text }))}
          onClose={() => setPicker(null)}
          onPick={(key) => {
            const q = quotes.find((x) => x._id === key);
            setPicker(null);
            if (q) create({ source: 'quote', sourceId: q._id, text: q.text });
          }}
        />
      )}
      {picker === 'post' && (
        <SourcePicker
          title="Choose a post slide"
          items={carousel.map((s, i) => ({ key: String(i), sub: `Slide ${i + 1}`, text: `${s.title} — ${s.body}` }))}
          onClose={() => setPicker(null)}
          onPick={(key) => {
            const i = Number(key);
            const s = carousel[i];
            setPicker(null);
            if (s) create({ source: 'post', sourceId: `${sessionId}:${i}`, title: s.title, text: `${s.title}\n\n${s.body}` });
          }}
        />
      )}
    </div>
  );
}
