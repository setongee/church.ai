"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { addDays, dayKey, sameDay, startOfWeek, type ContentItem } from "@/lib/content";
import { Chip, dropProps } from "./parts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

interface Props {
  items: ContentItem[];
  cursor: Date;
  canWrite: boolean;
  onOpen: (i: ContentItem) => void;
  onQuickAdd: (day: Date) => void;
  onDropOnDay: (id: string, day: Date) => void;
  onShowDay: (day: Date) => void;
}

export function MonthView({ items, cursor, canWrite, onOpen, onQuickAdd, onDropOnDay, onShowDay }: Props) {
  const today = new Date();
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil(((first.getDay() + 6) % 7 + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const byDay = new Map<string, ContentItem[]>();
  for (const it of items) {
    if (!it.scheduledAt) continue;
    const k = dayKey(new Date(it.scheduledAt));
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  for (const list of byDay.values()) list.sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime());

  return (
    <div className="overflow-hidden rounded-2xl bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-100">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-widest text-neutral-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => (
          <Cell key={dayKey(day)} day={day} dim={day.getMonth() !== cursor.getMonth()} isToday={sameDay(day, today)} last={i >= days.length - 7} list={byDay.get(dayKey(day)) ?? []} {...{ canWrite, onOpen, onQuickAdd, onDropOnDay, onShowDay }} />
        ))}
      </div>
    </div>
  );
}

function Cell({ day, dim, isToday, last, list, canWrite, onOpen, onQuickAdd, onDropOnDay, onShowDay }: { day: Date; dim: boolean; isToday: boolean; last: boolean; list: ContentItem[] } & Omit<Props, "items" | "cursor">) {
  const [over, setOver] = useState(false);
  const past = !isToday && day < new Date(new Date().setHours(0, 0, 0, 0));
  return (
    <div {...(canWrite ? dropProps((id) => onDropOnDay(id, day), setOver) : {})} className={`group relative min-h-[7rem] border-neutral-100 p-1.5 transition-colors sm:min-h-[8rem] ${last ? "" : "border-b"} border-r [&:nth-child(7n)]:border-r-0 ${over ? "bg-orange-50" : dim ? "bg-neutral-50/60" : ""}`}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold tabular-nums ${isToday ? "bg-orange-600 text-[#ffffff]" : dim ? "text-neutral-300" : past ? "text-neutral-400" : "text-neutral-700"}`}>{day.getDate()}</span>
        {canWrite && (
          <button onClick={() => onQuickAdd(day)} aria-label={`Add content on ${day.toDateString()}`} className="grid h-6 w-6 place-items-center rounded-full text-neutral-400 opacity-0 transition hover:bg-orange-100 hover:text-orange-700 focus:opacity-100 group-hover:opacity-100">
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="space-y-1">
        {list.slice(0, MAX_CHIPS).map((it) => (
          <Chip key={it._id} item={it} onOpen={onOpen} canDrag={canWrite} />
        ))}
        {list.length > MAX_CHIPS && (
          <button onClick={() => onShowDay(day)} className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-orange-600">
            +{list.length - MAX_CHIPS} more
          </button>
        )}
      </div>
    </div>
  );
}
