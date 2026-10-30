'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronLeft, ChevronRight, Heart, MessageCircle, MoreHorizontal, Send, X } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import { cx } from '../editor/ui';

export interface PreviewItem {
  type: 'image' | 'video';
  src: string;
}

// A rough Instagram feed post around the carousel, so you can swipe through it as followers will:
// the slides, the "1/8" counter, the dots and the caption as it reads under the post.
export function InstagramPreview({
  items,
  aspect,
  caption,
  name,
  logoUrl,
  onClose,
}: {
  items: PreviewItem[];
  aspect: number;
  caption: string;
  name: string;
  logoUrl?: string;
  onClose: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const drag = useRef<{ x: number; left: number } | null>(null);

  const go = useCallback((to: number) => {
    const el = scroller.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(items.length - 1, to));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
  }, [items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, onClose]);

  // Touch swipes use native scroll-snap; the mouse gets the same by dragging.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !scroller.current) return;
    drag.current = { x: e.clientX, left: scroller.current.scrollLeft };
    scroller.current.style.scrollSnapType = 'none';
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !scroller.current) return;
    scroller.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endDrag = () => {
    const el = scroller.current;
    if (!drag.current || !el) return;
    drag.current = null;
    el.style.scrollSnapType = '';
    go(Math.round(el.scrollLeft / el.clientWidth));
  };

  const long = caption.length > 110 || caption.split('\n').length > 2;
  const shown = expanded || !long ? caption : `${caption.split('\n')[0].slice(0, 110).trimEnd()}…`;
  const display = caption.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" aria-label="Close preview" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><X size={18} /></button>
      <div className="flex max-h-full w-full max-w-[380px] flex-col overflow-hidden rounded-[28px] bg-white">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600 p-[2px]">
            <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-white">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(logoUrl)} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs font-bold text-neutral-700">{name.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{name}</span>
          <MoreHorizontal size={18} className="text-neutral-700" />
        </div>

        <div className="relative bg-neutral-100">
          <div
            ref={scroller}
            onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            className="flex cursor-grab snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
            style={{ aspectRatio: String(aspect) }}
          >
            {items.map((it, i) => (
              <div key={i} className="h-full w-full shrink-0 snap-center">
                {it.type === 'video' ? (
                  <video src={it.src} muted loop playsInline autoPlay={i === index} controls className="h-full w-full select-none object-cover" />
                ) : it.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.src} alt={`Slide ${i + 1}`} draggable={false} className="h-full w-full select-none object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-neutral-400">Empty slide</div>
                )}
              </div>
            ))}
          </div>
          {items.length > 1 && (
            <>
              <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white">{index + 1}/{items.length}</span>
              {index > 0 && <button type="button" aria-label="Previous slide" onClick={() => go(index - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1 text-neutral-800 hover:bg-white"><ChevronLeft size={18} /></button>}
              {index < items.length - 1 && <button type="button" aria-label="Next slide" onClick={() => go(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1 text-neutral-800 hover:bg-white"><ChevronRight size={18} /></button>}
            </>
          )}
        </div>

        <div className="flex items-center px-3 pb-1 pt-2.5">
          <div className="flex items-center gap-3.5 text-neutral-900">
            <button type="button" aria-label="Like" onClick={() => setLiked((v) => !v)}><Heart size={24} className={cx(liked && 'fill-rose-500 text-rose-500')} /></button>
            <MessageCircle size={24} />
            <Send size={23} />
          </div>
          <div className="mx-auto flex gap-1">
            {items.map((_, i) => (
              <span key={i} className={cx('h-1.5 w-1.5 rounded-full', i === index ? 'bg-blue-500' : 'bg-neutral-300')} />
            ))}
          </div>
          <button type="button" aria-label="Save" onClick={() => setSaved((v) => !v)} className="text-neutral-900"><Bookmark size={24} className={cx(saved && 'fill-neutral-900')} /></button>
        </div>

        <div className="space-y-1 overflow-y-auto px-3 pb-4 text-[13px] leading-snug text-neutral-900">
          <p className="font-semibold">{liked ? '1 like' : 'Be the first to like this'}</p>
          {display ? (
            <p className="whitespace-pre-line">
              <span className="font-semibold">{name}</span> {shown}
              {long && !expanded && (
                <button type="button" onClick={() => setExpanded(true)} className="ml-1 text-neutral-500">more</button>
              )}
            </p>
          ) : (
            <p className="text-neutral-400"><span className="font-semibold text-neutral-500">{name}</span> (no caption yet)</p>
          )}
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Just now</p>
        </div>
      </div>
    </div>
  );
}
