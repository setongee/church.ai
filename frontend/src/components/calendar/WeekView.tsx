"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { addDays, dayKey, sameDay, startOfWeek, type ContentItem } from "@/lib/content";
import { Chip, dropProps } from "./parts";

const FIRST_HOUR = 6;
const LAST_HOUR = 23;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
const ROW_PX = 60;
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });

interface Props {
  items: ContentItem[];
  cursor: Date;
  canWrite: boolean;
  onOpen: (i: ContentItem) => void;
  onQuickAdd: (day: Date, hour: number) => void;
  onDropOnSlot: (id: string, day: Date, hour: number) => void;
}

export function WeekView({ items, cursor, canWrite, onOpen, onQuickAdd, onDropOnSlot }: Props) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = new Date();
  // The "now" line: re-checked each minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const slots = new Map<string, ContentItem[]>();
  for (const it of items) {
    if (!it.scheduledAt) continue;
    const d = new Date(it.scheduledAt);
    const h = Math.min(LAST_HOUR, Math.max(FIRST_HOUR, d.getHours()));
    const k = `${dayKey(d)}|${h}`;
    slots.set(k, [...(slots.get(k) ?? []), it]);
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white">
      <div className="overflow-x-auto">
        <div className="min-w-[56rem]">
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-neutral-100">
            <div />
            {days.map((d) => {
              const isToday = sameDay(d, today);
              return (
                <div key={dayKey(d)} className="px-2 py-2.5 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">{d.toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className={`mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${isToday ? "bg-orange-600 text-[#ffffff]" : "text-neutral-800"}`}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>
          <div>
            {HOURS.map((h) => (
              <div key={h} className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-t border-neutral-100 first:border-t-0">
                <div className="pr-2 pt-1 text-right text-[10.5px] font-medium text-neutral-400">{hourLabel(h)}</div>
                {days.map((d) => (
                  <Slot key={dayKey(d)} day={d} hour={h} list={slots.get(`${dayKey(d)}|${h}`) ?? []} nowPct={sameDay(d, today) && now.getHours() === h ? (now.getMinutes() / 60) * 100 : null} {...{ canWrite, onOpen, onQuickAdd, onDropOnSlot }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Slot({ day, hour, list, nowPct, canWrite, onOpen, onQuickAdd, onDropOnSlot }: { day: Date; hour: number; list: ContentItem[]; nowPct: number | null } & Omit<Props, "items" | "cursor">) {
  const [over, setOver] = useState(false);
  return (
    <div {...(canWrite ? dropProps((id) => onDropOnSlot(id, day, hour), setOver) : {})} style={{ minHeight: ROW_PX }} className={`group relative border-l border-neutral-100 p-1 transition-colors ${over ? "bg-orange-50" : ""}`}>
      {nowPct !== null && (
        <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: `${nowPct}%` }}>
          <span className="-ml-1 h-2 w-2 rounded-full bg-[#dc2626]" />
          <span className="h-px flex-1 bg-[#dc2626]" />
        </div>
      )}
      <div className="space-y-1">
        {list.map((it) => (
          <Chip key={it._id} item={it} onOpen={onOpen} canDrag={canWrite} />
        ))}
      </div>
      {canWrite && list.length === 0 && (
        <button onClick={() => onQuickAdd(day, hour)} aria-label={`Add content at ${hourLabel(hour)}`} className="absolute inset-0 grid place-items-center text-neutral-300 opacity-0 transition hover:bg-orange-50/60 hover:text-orange-600 focus:opacity-100 group-hover:opacity-100">
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}
