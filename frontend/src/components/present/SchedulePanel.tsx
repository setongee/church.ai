"use client";

import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, Film, GalleryHorizontal, GripVertical, HandHeart, Image as ImageIcon, LayoutTemplate, Megaphone, Music2, Quote as QuoteIcon, X } from "lucide-react";
import type { Schedule, ScheduleItem, ScheduleItemType, Slide } from "@/lib/present";
import { Empty } from "./ui";

interface Props {
  schedule: Schedule | null;
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  // Play a slide show item from the schedule.
  onPlayShow: (item: ScheduleItem) => void;
  // Trigger a template item: applies its scene (or shows the template).
  onTrigger: (item: ScheduleItem) => void;
}

const ICONS = { scripture: BookOpen, song: Music2, announcement: Megaphone, image: ImageIcon, prayer: HandHeart, quote: QuoteIcon, media: Film, slideshow: GalleryHorizontal, template: LayoutTemplate };

// The kinds of thing in a schedule, for the filter chips.
const FILTERS: { id: ScheduleItemType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "scripture", label: "Scripture" },
  { id: "song", label: "Songs" },
  { id: "template", label: "Templates" },
  { id: "announcement", label: "Announcements" },
  { id: "prayer", label: "Prayers" },
  { id: "quote", label: "Quotes" },
  { id: "media", label: "Media" },
  { id: "image", label: "Images" },
  { id: "slideshow", label: "Slide shows" },
];

const preview = (s: Slide) => (s.kind === "image" ? "Image" : s.kind === "video" ? "Video" : s.kind === "welcome" ? `Welcome — ${s.main ?? ""}` : s.kind === "giving" ? `Offering & Tithe — ${s.accountNo}` : s.kind === "ministering" ? `Speaker intro — ${s.name}` : s.kind === "scripture2" ? `${s.left.reference} ${s.left.version} | ${s.right.reference} ${s.right.version}` : s.text.replace(/\s+/g, " "));

// The order of service. Click an item to stage it; arrow keys step through every slide in order.
export function SchedulePanel({ schedule, onStage, onLive, onMove, onRemove, onPlayShow, onTrigger }: Props) {
  const [filter, setFilter] = useState<ScheduleItemType | "all">("all");
  const [pos, setPos] = useState<{ item: string; slide: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const items = useMemo(() => schedule?.items ?? [], [schedule]);
  // Only the kinds that are actually in this schedule get a chip (with how many).
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const it of items) c.set(it.type, (c.get(it.type) ?? 0) + 1);
    return c;
  }, [items]);
  const active = filter === "all" || counts.has(filter) ? filter : "all"; // a kind that's been emptied falls back to All
  const shown = active === "all" ? items : items.filter((it) => it.type === active);
  const flat = useMemo(() => shown.flatMap((it) => it.slides.map((_, i) => ({ item: it._id, slide: i }))), [shown]);

  function pick(it: ScheduleItem, slide: number) {
    setPos({ item: it._id, slide });
    if (it.slides[slide]) onStage(it.slides[slide]);
  }

  function step(dir: 1 | -1) {
    if (!flat.length) return;
    const cur = pos ? flat.findIndex((f) => f.item === pos.item && f.slide === pos.slide) : -1;
    const next = flat[Math.min(flat.length - 1, Math.max(0, cur + dir))];
    const it = shown.find((i) => i._id === next.item);
    if (it) pick(it, next.slide);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (["ArrowDown", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      step(1);
    } else if (["ArrowUp", "ArrowLeft"].includes(e.key)) {
      e.preventDefault();
      step(-1);
    }
  }

  if (!schedule) return <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>;
  if (!items.length) {
    return (
      <Empty icon={<CalendarDays size={22} />} title={`${schedule.name} is empty`}>
        Use <b>Add to schedule</b> in Scripture, Songs, Announcements or Images to build the order of service.
      </Empty>
    );
  }

  return (
    <div tabIndex={0} data-own-arrows onKeyDown={onKeyDown} className="h-full min-h-0 space-y-2 overflow-y-auto outline-none">
      <div className="flex flex-wrap gap-1.5 pb-1">
        {FILTERS.filter((f) => f.id === "all" || counts.has(f.id)).map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={active === f.id} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${active === f.id ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
            {f.label}
            <span className="ml-1.5 opacity-70">{f.id === "all" ? items.length : counts.get(f.id)}</span>
          </button>
        ))}
      </div>
      {shown.map((it) => {
        const idx = items.indexOf(it);
        const Icon = ICONS[it.type];
        const on = pos?.item === it._id;
        return (
          <div
            key={it._id}
            draggable
            onDragStart={() => setDrag(idx)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(idx);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            onDrop={() => {
              if (drag !== null) onMove(drag, idx);
              setDrag(null);
              setOver(null);
            }}
            className={`group rounded-xl border bg-white transition ${on ? "border-orange-300 ring-2 ring-orange-500/10" : "border-neutral-100 hover:border-neutral-200"} ${over === idx && drag !== null && drag !== idx ? "border-t-4 border-t-orange-400" : ""} ${drag === idx ? "opacity-40" : ""}`}
          >
            <div className="flex items-center gap-2 pr-2">
              <GripVertical size={16} className="ml-2 shrink-0 cursor-grab text-neutral-300 group-hover:text-neutral-400" />
              <button onClick={() => pick(it, on ? pos!.slide : 0)} onDoubleClick={() => (it.type === "template" ? onTrigger(it) : it.slides[0] && onLive(it.slides[on ? pos!.slide : 0]))} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? "bg-orange-50 text-orange-600" : "bg-neutral-100 text-neutral-500"}`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-900">{it.title || "Untitled"}</span>
                  <span className="block truncate text-xs text-neutral-400">
                    {[it.subtitle, it.scene && "Scene", it.slides.length > 1 && `${it.slides.length} slides`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
              {it.type === "template" && (
                <button onClick={() => onTrigger(it)} className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700">
                  Go live
                </button>
              )}
              {it.type === "slideshow" && (
                <button onClick={() => onPlayShow(it)} className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700">
                  Play
                </button>
              )}
              <button onClick={() => onRemove(it._id)} aria-label="Remove from schedule" className="rounded-md p-1.5 text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                <X size={15} />
              </button>
            </div>

            {on && it.slides.length > 1 && (
              <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 p-3 xl:grid-cols-3">
                {it.slides.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => pick(it, i)}
                    onDoubleClick={() => onLive(s)}
                    className={`rounded-lg border p-2.5 text-left transition ${pos?.slide === i ? "border-orange-300 bg-orange-50" : "border-neutral-100 bg-neutral-50/60 hover:border-neutral-200"}`}
                  >
                    {s.kind === "song" && s.label && <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-orange-600">{s.label}</span>}
                    <span className="line-clamp-3 text-xs leading-snug text-neutral-700">{preview(s)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="pt-1 text-xs text-neutral-400">Click to preview · Double-click or Enter to go live · ↑ ↓ step through slides · Drag to reorder · Templates: Go live or double-click</p>
    </div>
  );
}
