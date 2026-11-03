'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { addCarouselMedia, createCarouselPost, getBrand, getService, getSession, listCarouselPosts, listSavedTemplates, listServices } from '@/lib/api';
import type { Brand, CarouselPost, SavedTemplate, Service, Session, SessionDetail } from '@/lib/types';
import { Spinner, cx } from '../editor/ui';
import { SIZE_PRESETS } from '../editor/constants';
import { CarouselOptions, DEFAULT_OPTIONS, resolveOptions, type OptionsState } from './CarouselOptions';
import { collectItems, generateCarousel, type CarouselSource } from './generate';

// Shapes for a carousel built from scratch. Instagram carousels take 4:5 to 1.91:1; 9:16 is for a Reel slideshow.
const BLANK_SHAPES = SIZE_PRESETS.filter((p) => ['ig-portrait', 'square', 'wide', 'story'].includes(p.key));

const field = 'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500';

export function NewCarouselDialog({ initialSessionId, onClose, onCreated }: { initialSessionId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState(initialSessionId ?? '');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [recipes, setRecipes] = useState<CarouselPost[]>([]);

  // 'service' builds slides from a session; 'blank' starts empty (optionally with your own pictures and videos).
  const [mode, setMode] = useState<'service' | 'blank'>('service');
  const [blankName, setBlankName] = useState('');
  const [blankShape, setBlankShape] = useState('ig-portrait');
  const [blankFiles, setBlankFiles] = useState<File[]>([]);
  const filePick = useRef<HTMLInputElement>(null);
  const [opts, setOpts] = useState<OptionsState>(DEFAULT_OPTIONS);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listServices(), getBrand().catch(() => null), listSavedTemplates().catch(() => []), listCarouselPosts({ recipes: true }).catch(() => [])]).then(([s, b, t, r]) => {
      setServices(s);
      setBrand(b);
      setSaved(t);
      setRecipes(r);
    });
  }, []);
  useEffect(() => {
    if (!initialSessionId) return;
    getSession(initialSessionId).then((d) => {
      const svc = d.session.service;
      setServiceId(typeof svc === 'object' ? svc._id : svc);
    }).catch(() => {});
  }, [initialSessionId]);
  useEffect(() => {
    if (!serviceId) return;
    getService(serviceId).then((d) => setSessions(d.sessions)).catch(() => setSessions([]));
  }, [serviceId]);
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    getSession(sessionId).then((d) => alive && setDetail(d)).catch(() => alive && setError('Could not load that session.'));
    return () => {
      alive = false;
    };
  }, [sessionId]);

  const r = useMemo(() => resolveOptions(opts, saved), [opts, saved]);
  const { body, coverT, size } = r;
  const { source, count, cover, closing } = opts;
  const available = detail ? collectItems(detail, source).length : 0;
  const bodyCount = Math.min(count, available, 8);
  const total = bodyCount + (cover ? 1 : 0) + (closing ? 1 : 0);
  const busy = progress !== null;

  function applyRecipe(id: string) {
    const rc = recipes.find((x) => x._id === id)?.recipe;
    if (!rc) return;
    setOpts((o) => ({ ...o, source: rc.source as CarouselSource, count: rc.count, cover: rc.cover, closing: rc.closing, bodyId: rc.templateId || o.bodyId, coverId: rc.coverTemplateId || o.coverId }));
  }

  async function createBlank() {
    const shape = BLANK_SHAPES.find((p) => p.key === blankShape) ?? BLANK_SHAPES[0];
    const files = blankFiles.slice(0, 10);
    setError('');
    setProgress({ done: 0, total: files.length + 1 });
    try {
      const post = await createCarouselPost({ title: blankName.trim() || 'Untitled carousel', width: shape.width, height: shape.height });
      for (const [i, f] of files.entries()) {
        setProgress({ done: i + 1, total: files.length + 1 });
        await addCarouselMedia(post._id, f);
      }
      onCreated(post._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the carousel');
      setProgress(null);
    }
  }

  async function create() {
    if (!detail || !body || !coverT || !size) return;
    setError('');
    setProgress({ done: 0, total });
    try {
      const id = await generateCarousel({
        detail,
        brand,
        source,
        count,
        cover,
        closing,
        size: { w: size.width, h: size.height },
        body: body.choice,
        coverChoice: coverT.choice,
        templateId: body.id,
        coverTemplateId: coverT.id,
        onProgress: (done, t) => setProgress({ done, total: t }),
      });
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the carousel');
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">New carousel</h2>
            <p className="text-xs text-neutral-500">{mode === 'service' ? 'Builds every slide for you. You can edit each one afterwards.' : 'Start empty and add your own pictures, videos and designs.'}</p>
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div role="tablist" aria-label="How to start" className="mx-5 mt-4 grid grid-cols-2 gap-1 rounded-full bg-neutral-100 p-1 text-sm font-medium">
          {([['service', 'From a service'], ['blank', 'Blank carousel']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} disabled={busy} onClick={() => setMode(k)} className={cx('rounded-full px-4 py-1.5 transition', mode === k ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800')}>{l}</button>
          ))}
        </div>

        {mode === 'blank' ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <label className="block text-xs font-medium text-neutral-600">
              Name
              <input className={cx(field, 'mt-1')} value={blankName} onChange={(e) => setBlankName(e.target.value)} placeholder="e.g. Youth night highlights" maxLength={120} />
            </label>
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-600">Shape</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BLANK_SHAPES.map((p) => (
                  <button key={p.key} type="button" onClick={() => setBlankShape(p.key)} aria-pressed={blankShape === p.key} className={cx('rounded-xl border px-3 py-2 text-left text-xs', blankShape === p.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}>
                    <span className="block font-semibold">{p.label}</span>
                    <span className={cx('block', blankShape === p.key ? 'text-neutral-300' : 'text-neutral-500')}>{p.hint}</span>
                  </button>
                ))}
              </div>
              {blankShape === 'story' && <p className="mt-2 text-xs text-amber-700">9:16 can’t be posted as a swipeable carousel. It works as a Reel slideshow (you choose that when you publish).</p>}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-600">Pictures and videos (optional, up to 10)</p>
              <input ref={filePick} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { setBlankFiles(Array.from(e.target.files ?? []).slice(0, 10)); e.target.value = ''; }} />
              <button type="button" onClick={() => filePick.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-6 text-sm font-medium text-neutral-600 hover:border-neutral-500">
                <ImagePlus size={18} /> {blankFiles.length ? `${blankFiles.length} file${blankFiles.length === 1 ? '' : 's'} chosen — click to change` : 'Choose files'}
              </button>
              {blankFiles.length > 0 && <p className="mt-1.5 truncate text-xs text-neutral-500">{blankFiles.map((f) => f.name).join(', ')}</p>}
              <p className="mt-1.5 text-xs text-neutral-400">You can add more, reorder them, or add designs after.</p>
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>
        ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {recipes.length > 0 && (
            <label className="block text-xs font-medium text-neutral-600">
              Start from a saved recipe
              <select className={cx(field, 'mt-1')} defaultValue="" onChange={(e) => applyRecipe(e.target.value)}>
                <option value="">— none —</option>
                {recipes.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.title} ({r.recipe?.count} slides)
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-600">
              Service
              <select className={cx(field, 'mt-1')} value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSessionId(''); setDetail(null); }}>
                <option value="">Choose a service…</option>
                {services.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Session
              <select className={cx(field, 'mt-1')} value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!serviceId}>
                <option value="">Choose a session…</option>
                {sessions.map((s) => (
                  <option key={s._id} value={s._id}>{s.title} — {s.preacher}</option>
                ))}
              </select>
            </label>
          </div>

          <CarouselOptions state={opts} onChange={(p) => setOpts((o) => ({ ...o, ...p }))} saved={saved} detail={detail} brand={brand} />

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        )}

        {mode === 'blank' ? (
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3.5">
            <span className="text-xs text-neutral-500">{blankFiles.length ? `${blankFiles.length} slide${blankFiles.length === 1 ? '' : 's'} to start` : 'Starts empty'}</span>
            <button type="button" onClick={createBlank} disabled={busy} className="flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
              {busy ? (<><Spinner /> {progress.done > 0 ? `Adding ${progress.done}/${progress.total - 1}…` : 'Creating…'}</>) : 'Create carousel'}
            </button>
          </div>
        ) : (
        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3.5">
          <span className="text-xs text-neutral-500">{detail ? `${total} slide${total === 1 ? '' : 's'}` : 'Choose a session'}{total > 10 ? ' (max 10)' : ''}</span>
          <button type="button" onClick={create} disabled={!detail || busy || total === 0 || !size || available === 0} className="flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {busy ? (<><Spinner /> Building {Math.min(progress.done + 1, progress.total)}/{progress.total}…</>) : 'Build carousel'}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
