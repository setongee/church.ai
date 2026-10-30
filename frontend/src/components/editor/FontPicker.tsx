'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { loadFontList, loadFontPreview, type FontEntry } from '@/lib/fonts';
import { Popover, Spinner, cx } from './ui';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'brand', label: 'Brand' },
  { key: 'sans-serif', label: 'Sans' },
  { key: 'serif', label: 'Serif' },
  { key: 'display', label: 'Display' },
  { key: 'handwriting', label: 'Script' },
  { key: 'monospace', label: 'Mono' },
];

const PAGE = 40;

function FontRow({ font, active, onPick }: { font: FontEntry; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  // Fetch the preview subset only once the row scrolls into view, so opening the picker
  // doesn't fire hundreds of stylesheet requests.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (font.local) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        loadFontPreview(font.family);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [font]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onPick}
      className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-neutral-100', active && 'bg-neutral-100')}
    >
      <span className="truncate text-[17px] leading-tight text-neutral-900" style={{ fontFamily: `"${font.family}", system-ui` }}>
        {font.family}
      </span>
      {active && <Check size={14} className="shrink-0 text-neutral-900" />}
    </button>
  );
}

function PickerBody({ value, onPick }: { value: string; onPick: (family: string) => void }) {
  const [fonts, setFonts] = useState<FontEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadFontList().then(setFonts);
  }, []);

  const filtered = useMemo(() => {
    if (!fonts) return [];
    const q = query.trim().toLowerCase();
    return fonts.filter((f) => (cat === 'all' || f.category === cat) && (!q || f.family.toLowerCase().includes(q)));
  }, [fonts, query, cat]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setLimit((l) => l + PAGE));
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length, limit]);

  return (
    <div className="w-[min(20rem,calc(100vw-2rem))]">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder={fonts ? `Search ${fonts.length.toLocaleString()} fonts` : 'Loading fonts…'}
          className="w-full rounded-lg border border-neutral-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-neutral-500"
        />
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setCat(c.key);
              setLimit(PAGE);
            }}
            className={cx(
              'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
              cat === c.key ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto overscroll-contain">
        {!fonts && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
            <Spinner /> Loading…
          </div>
        )}
        {fonts && filtered.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No fonts match.</p>}
        {filtered.slice(0, limit).map((f) => (
          <FontRow key={f.family} font={f} active={f.family === value} onPick={() => onPick(f.family)} />
        ))}
        {filtered.length > limit && <div ref={sentinelRef} className="h-6" />}
      </div>
    </div>
  );
}

export function FontPicker({
  value,
  onChange,
  className,
  block,
}: {
  value: string;
  onChange: (family: string) => void;
  className?: string;
  block?: boolean;
}) {
  return (
    <Popover
      className="p-3"
      trigger={(_, toggle) => (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          className={cx(
            'flex h-8 items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm text-neutral-800 hover:bg-neutral-50',
            block ? 'w-full' : 'w-40',
            className
          )}
        >
          <span className="truncate" style={{ fontFamily: `"${value}", system-ui` }}>
            {value}
          </span>
          <ChevronDown size={14} className="shrink-0 text-neutral-400" />
        </button>
      )}
    >
      {(close) => (
        <PickerBody
          value={value}
          onPick={(f) => {
            onChange(f);
            close();
          }}
        />
      )}
    </Popover>
  );
}
