'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Images, LayoutPanelLeft } from 'lucide-react';
import { createCarouselPost, listCarouselPosts, updateCarouselPost } from '@/lib/api';
import type { CarouselPost, Design } from '@/lib/types';
import { Spinner } from './ui';
import type { DesignCanvas } from './useDesignCanvas';

// Right-click menu on the canvas: start a carousel from this design, or add the design to one.
export function CanvasContextMenu({ at, ed, design, sessionId, onClose }: { at: { x: number; y: number }; ed: DesignCanvas; design: Design; sessionId?: string; onClose: () => void }) {
  const router = useRouter();
  const [recent, setRecent] = useState<CarouselPost[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listCarouselPosts().then((l) => setRecent(l.slice(0, 5))).catch(() => setRecent([]));
    const close = () => onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const slide = { kind: 'design' as const, design: design._id, owned: false, label: design.title.slice(0, 80) };

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError('');
    try {
      await ed.flush();
      router.push(`/carousels/${await fn()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  const create = () =>
    run(async () => (await createCarouselPost({ sessionId, title: design.title, width: ed.size.w, height: ed.size.h, slides: [slide] }))._id);

  const addTo = (c: CarouselPost) =>
    run(async () => {
      if (c.slides.length >= 10) throw new Error('That carousel already has 10 slides.');
      const existing = c.slides.map((s) => ({ _id: s._id, kind: s.kind, design: s.design, owned: s.owned, imageUrl: s.imageUrl, videoUrl: s.videoUrl, label: s.label }));
      await updateCarouselPost(c._id, { slides: [...existing, slide] });
      return c._id;
    });

  const left = Math.min(at.x, window.innerWidth - 270);
  const top = Math.min(at.y, window.innerHeight - 240);
  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-100 disabled:opacity-50';

  return (
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="fixed z-[61] w-64 rounded-xl border border-black/10 bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.25)]" style={{ left, top }} role="menu">
        <button type="button" role="menuitem" disabled={busy || !ed.ready} onClick={create} className={item}>
          {busy ? <Spinner className="h-4 w-4" /> : <Images size={16} />} Create a carousel with this design
        </button>
        {recent && recent.length > 0 && (
          <>
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Add to a carousel</p>
            {recent.map((c) => (
              <button key={c._id} type="button" role="menuitem" disabled={busy} onClick={() => addTo(c)} className={item}>
                <LayoutPanelLeft size={15} className="shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="text-[11px] text-neutral-400">{c.slides.length}/10</span>
              </button>
            ))}
          </>
        )}
        {error && <p className="px-2.5 py-1.5 text-xs text-red-600">{error}</p>}
      </div>
    </>
  );
}
