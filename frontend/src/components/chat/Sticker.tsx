"use client";

import { useEffect, useId, useState } from "react";
import { STICKERS, STICKER_PACKS, recentStickers, stickerById, type StickerDef } from "@/lib/stickers";

// A die-cut sticker drawn in SVG: a coloured badge with a white outline and soft shadow, a big emoji, and a caption pill.
const burst = (cx: number, cy: number, outer: number, inner: number, points: number) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");

const tilt = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 9) - 4) * 0.9; // a little personality: -3.6° .. +3.6°
};

export function Sticker({ id, size = 120, plain }: { id: string; size?: number; plain?: boolean }) {
  const def = stickerById(id);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!def) return <span className="inline-grid place-items-center rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-500">Sticker</span>;
  const w = Math.min(116, 22 + def.label.length * 6.6);
  const fill = `url(#sg-${uid})`;
  return (
    <svg viewBox="0 0 120 130" width={size} height={(size * 130) / 120} role="img" aria-label={`Sticker: ${def.label}`} style={{ transform: plain ? undefined : `rotate(${tilt(id)}deg)` }} className="shrink-0 select-none overflow-visible">
      <defs>
        <linearGradient id={`sg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={def.from} />
          <stop offset="1" stopColor={def.to} />
        </linearGradient>
        <filter id={`ss-${uid}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.28" />
        </filter>
      </defs>
      <g filter={`url(#ss-${uid})`}>
        {def.shape === "circle" && <circle cx="60" cy="54" r="46" fill={fill} stroke="#fff" strokeWidth="7" />}
        {def.shape === "squircle" && <rect x="13" y="7" width="94" height="94" rx="30" fill={fill} stroke="#fff" strokeWidth="7" />}
        {def.shape === "burst" && <polygon points={burst(60, 54, 52, 42, 12)} fill={fill} stroke="#fff" strokeWidth="7" strokeLinejoin="round" />}
        <ellipse cx="47" cy="35" rx="17" ry="8" fill="#fff" opacity="0.26" transform="rotate(-28 47 35)" />
        <text x="60" y="73" fontSize="52" textAnchor="middle" style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>
          {def.emoji}
        </text>
      </g>
      <g filter={`url(#ss-${uid})`}>
        <rect x={(120 - w) / 2} y="100" width={w} height="23" rx="11.5" fill="#fff" stroke={def.to} strokeWidth="2" />
        <text x="60" y="115.5" fontSize="12" fontWeight="800" textAnchor="middle" fill="#1f2937" style={{ fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif" }}>
          {def.label}
        </text>
      </g>
    </svg>
  );
}

// The popover next to the composer: tabs for each pack (plus recently used), tap a sticker to send it.
export function StickerPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState<string>("church");
  useEffect(() => {
    const r = recentStickers();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setRecent(r);
    if (r.length) setTab("recent");
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list: StickerDef[] = tab === "recent" ? recent.map((id) => stickerById(id)).filter((s): s is StickerDef => Boolean(s)) : STICKERS.filter((s) => s.pack === tab);
  const tabs = [...(recent.length ? [{ id: "recent", label: "Recent", icon: "🕘" }] : []), ...STICKER_PACKS];
  return (
    <>
      <div className="fixed inset-0 z-20" onMouseDown={onClose} aria-hidden />
      <div role="dialog" aria-label="Stickers" className="absolute bottom-full right-3 z-30 mb-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
        <div className="flex gap-1 border-b border-neutral-100 px-2 pt-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold ${tab === t.id ? "bg-orange-50 text-orange-700" : "text-neutral-500 hover:bg-neutral-50"}`}>
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto p-3 sm:grid-cols-4">
          {list.map((s) => (
            <button key={s.id} onClick={() => onPick(s.id)} title={s.label} className="grid place-items-center rounded-xl p-1 transition hover:scale-105 hover:bg-neutral-50 active:scale-95">
              <Sticker id={s.id} size={72} plain />
            </button>
          ))}
          {list.length === 0 && <p className="col-span-full py-8 text-center text-sm text-neutral-400">Stickers you use will show up here.</p>}
        </div>
      </div>
    </>
  );
}
