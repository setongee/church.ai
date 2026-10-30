"use client";

import Link from "next/link";
import { AlertCircle, AlertTriangle, CalendarClock, Check, Clapperboard, FileText, GalleryHorizontal, Image as ImageIcon, ListChecks, Video, Zap, CircleDot } from "lucide-react";
import { Avatar } from "@/components/notify/ToastHost";
import { PLATFORM_SHORT, campaignColor, fmtTime, isLocked, needsMedia, statusMeta, type ContentFormat, type ContentItem, type ContentPlatform, type ContentStatus, type Person } from "@/lib/content";

const FORMAT_ICON: Record<ContentFormat, typeof Video> = { reel: Clapperboard, post: ImageIcon, carousel: GalleryHorizontal, story: CircleDot, video: Video, other: FileText };
export function FormatIcon({ format, size = 13, className = "" }: { format: ContentFormat; size?: number; className?: string }) {
  const Icon = FORMAT_ICON[format] ?? FileText;
  return <Icon size={size} className={className} aria-label={format} />;
}

export function StatusBadge({ status, className = "" }: { status: ContentStatus; className?: string }) {
  const s = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${className}`} style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)`, color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: ContentPlatform }) {
  return <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-neutral-600">{PLATFORM_SHORT[platform]}</span>;
}

export function OwnerStack({ owners, size = 20, max = 3 }: { owners: Person[]; size?: number; max?: number }) {
  if (!owners.length) return null;
  const shown = owners.slice(0, max);
  return (
    <span className="flex items-center -space-x-1.5" title={owners.map((o) => o.name).join(", ")}>
      {shown.map((o) => (
        <span key={o._id} className="rounded-full ring-2 ring-white">
          <Avatar name={o.name} size={size} />
        </span>
      ))}
      {owners.length > max && (
        <span className="grid place-items-center rounded-full bg-neutral-200 text-[9px] font-bold text-neutral-700 ring-2 ring-white" style={{ width: size, height: size }}>
          +{owners.length - max}
        </span>
      )}
    </span>
  );
}

const TASK_COLOR = { todo: "#64748b", in_progress: "#2563eb", review: "#d97706", done: "#16a34a" } as const;
export function TaskBadge({ task, stop }: { task: NonNullable<ContentItem["task"]>; stop?: boolean }) {
  const c = TASK_COLOR[task.status] ?? "#64748b";
  return (
    <Link href={`/board?task=${task._id}`} onClick={(e) => stop && e.stopPropagation()} title={`Task: ${task.title}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>
      <ListChecks size={11} /> {task.status === "done" ? "Done" : "Task"}
    </Link>
  );
}

// What a scheduled item's state looks like at a glance: the post time, or what's wrong.
export function StateGlyph({ item, size = 12 }: { item: ContentItem; size?: number }) {
  if (item.status === "failed") return <AlertCircle size={size} className="shrink-0 text-[#dc2626]" aria-label="Needs attention" />;
  if (item.status === "published") return <Check size={size} className="shrink-0 text-[#16a34a]" aria-label="Posted" />;
  if (needsMedia(item)) return <AlertTriangle size={size} className="shrink-0 text-[#d97706]" aria-label="No media attached" />;
  if (item.status === "scheduled") return <Zap size={size} className="shrink-0 text-[#7c3aed]" aria-label="Posts automatically" />;
  if (item.status === "publishing") return <CalendarClock size={size} className="shrink-0 animate-pulse text-[#0ea5e9]" aria-label="Posting" />;
  return null;
}

// The coloured entry that sits on a day, a time slot or a board column. Draggable to reschedule.
export function Chip({ item, onOpen, canDrag, showTime = true }: { item: ContentItem; onOpen: (i: ContentItem) => void; canDrag: boolean; showTime?: boolean }) {
  const color = campaignColor(item.campaign);
  const st = statusMeta(item.status);
  const draggable = canDrag && !isLocked(item);
  const when = item.scheduledAt ? fmtTime(new Date(item.scheduledAt)) : "";
  const warn = needsMedia(item);
  return (
    <button
      id={`content-${item._id}`}
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item._id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(item)}
      title={`${item.title} · ${st.label}${item.campaign ? ` · ${item.campaign}` : ""}${warn ? " · no media attached" : ""}`}
      className={`flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-lg py-1 pr-1.5 text-left text-[11.5px] leading-tight transition hover:brightness-95 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      <span className="w-1 shrink-0 self-stretch rounded-l-lg" style={{ background: color }} />
      <FormatIcon format={item.format} size={12} className="shrink-0 text-neutral-500" />
      <span className="min-w-0 flex-1 truncate font-medium text-neutral-900">{item.title}</span>
      {showTime && when && item.status === "scheduled" && <span className="shrink-0 text-[10px] font-semibold tabular-nums text-[#7c3aed]">{when}</span>}
      <StateGlyph item={item} />
      {item.status !== "scheduled" && item.status !== "published" && item.status !== "failed" && !warn && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: st.color }} />}
    </button>
  );
}

export const dropProps = (onDropId: (id: string) => void, setOver?: (over: boolean) => void) => ({
  onDragOver: (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver?.(true);
  },
  onDragLeave: () => setOver?.(false),
  onDrop: (e: React.DragEvent) => {
    e.preventDefault();
    setOver?.(false);
    const id = e.dataTransfer.getData("text/plain");
    if (id) onDropId(id);
  },
});
