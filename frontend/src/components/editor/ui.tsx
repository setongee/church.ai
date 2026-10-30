'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ban } from 'lucide-react';
import { SWATCHES } from './constants';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function IconButton({
  title,
  onClick,
  active,
  disabled,
  children,
  className,
}: {
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-neutral-600 transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        active ? 'bg-neutral-200 text-neutral-800' : 'hover:bg-neutral-100',
        className
      )}
    >
      {children}
    </button>
  );
}

// Rendered in a portal with fixed positioning: the context toolbar scrolls horizontally, and
// any overflow-x container clips absolutely positioned children, which hid these dropdowns.
export function Popover({
  trigger,
  children,
  align = 'left',
  className,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const anchor = wrapRef.current?.getBoundingClientRect();
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const margin = 8;
    const pw = pop.offsetWidth;
    const ph = pop.scrollHeight;
    let left = align === 'right' ? anchor.right - pw : anchor.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));
    const below = window.innerHeight - anchor.bottom - margin * 2;
    const above = anchor.top - margin * 2;
    const useAbove = ph > below && above > below;
    const maxHeight = Math.max(160, useAbove ? above : below);
    const height = Math.min(ph, maxHeight);
    const top = useAbove ? anchor.top - margin - height : anchor.bottom + margin;
    setPos({ top, left, maxHeight });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setPos(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setPos(null);
  };

  return (
    <div ref={wrapRef} className="relative">
      {trigger(open, () => (open ? close() : setOpen(true)))}
      {open &&
        createPortal(
          <div
            ref={popRef}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, maxHeight: pos?.maxHeight, visibility: pos ? 'visible' : 'hidden' }}
            className={cx('fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white p-3 shadow-xl', className)}
          >
            {children(close)}
          </div>,
          document.body
        )}
    </div>
  );
}

export function ColorInput({
  value,
  onChange,
  title,
  allowNone,
  onCommit,
  children,
}: {
  value: string;
  onChange: (color: string) => void;
  title: string;
  allowNone?: boolean;
  onCommit?: () => void;
  children?: ReactNode;
}) {
  const isNone = !value || value === 'transparent';
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <Popover
      trigger={(_, toggle) => (
        <button
          type="button"
          title={title}
          aria-label={title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-1.5 hover:bg-neutral-100"
        >
          {children}
          <span
            className="h-5 w-5 rounded-full border border-neutral-300"
            style={
              isNone
                ? { background: 'linear-gradient(135deg,#fff 45%,#ef4444 45%,#ef4444 55%,#fff 55%)' }
                : { background: value }
            }
          />
        </button>
      )}
      className="w-60"
    >
      {() => (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => {
                  onChange(c);
                  onCommit?.();
                }}
                className={cx(
                  'h-7 w-7 rounded-full border border-neutral-200',
                  value.toLowerCase() === c && 'ring-2 ring-neutral-900 ring-offset-1'
                )}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="color"
              value={hex}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onCommit}
              className="h-8 w-10 cursor-pointer rounded border border-neutral-200 bg-white p-0.5"
            />
            <input
              type="text"
              value={isNone ? '' : value}
              placeholder="#000000"
              onChange={(e) => /^#?[0-9a-f]{0,6}$/i.test(e.target.value) && onChange(e.target.value.startsWith('#') || !e.target.value ? e.target.value : `#${e.target.value}`)}
              onBlur={onCommit}
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs uppercase"
            />
            {allowNone && (
              <button
                type="button"
                title="No colour"
                onClick={() => {
                  onChange('');
                  onCommit?.();
                }}
                className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50"
              >
                <Ban size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-neutral-600">{label}</span>
        <span className="tabular-nums text-neutral-400">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="h-1.5 w-full cursor-pointer accent-neutral-900"
      />
    </div>
  );
}

export function PanelSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-neutral-100 px-4 py-4 last:border-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      aria-hidden
    />
  );
}

// Drag & drop / click image picker used by the background and AI panels.
export function DropZone({
  onFiles,
  multiple,
  children,
  className,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cx(
        'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-5 text-center text-xs transition-colors',
        over ? 'border-neutral-900 bg-neutral-100 text-neutral-800' : 'border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50',
        className
      )}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// Downscales a user file into a JPEG data URL small enough to ship as an AI reference.
export function fileToDataUrl(file: File, maxSide = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}
