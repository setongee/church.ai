"use client";

import { CalendarClock, ImageOff } from "lucide-react";
import { campaignColor, fmtWhen, needsAttention, startOfDay, addDays, type ContentItem } from "@/lib/content";
import { FormatIcon, OwnerStack, PlatformBadge, StateGlyph, StatusBadge, TaskBadge } from "./parts";

// Everything in date order, in plain sections: needs attention first, then what's coming, then unscheduled, then history.
export function ListView({ items, onOpen }: { items: ContentItem[]; onOpen: (i: ContentItem) => void }) {
  const today = startOfDay(new Date());
  const t = (i: ContentItem) => new Date(i.scheduledAt as string).getTime();
  const sections: { title: string; tone?: string; list: ContentItem[] }[] = [
    { title: "Needs attention", tone: "#dc2626", list: items.filter(needsAttention).sort((a, b) => (a.scheduledAt ? t(a) : Infinity) - (b.scheduledAt ? t(b) : Infinity)) },
  ];
  const rest = items.filter((i) => !needsAttention(i));
  sections.push(
    { title: "Today", tone: "#ea580c", list: rest.filter((i) => i.scheduledAt && t(i) >= today.getTime() && t(i) < addDays(today, 1).getTime() && i.status !== "published").sort((a, b) => t(a) - t(b)) },
    { title: "Coming up", list: rest.filter((i) => i.scheduledAt && t(i) >= addDays(today, 1).getTime() && i.status !== "published").sort((a, b) => t(a) - t(b)) },
    { title: "Not scheduled yet", list: rest.filter((i) => !i.scheduledAt && i.status !== "published") },
    { title: "Posted", tone: "#16a34a", list: rest.filter((i) => i.status === "published").sort((a, b) => (b.scheduledAt ? t(b) : 0) - (a.scheduledAt ? t(a) : 0)) },
  );
  const shown = sections.filter((s) => s.list.length);
  if (!shown.length) return <p className="rounded-2xl bg-white p-10 text-center text-sm text-neutral-400">Nothing matches. Try clearing a filter, or add some content.</p>;
  return (
    <div className="space-y-6">
      {shown.map((s) => (
        <section key={s.title}>
          <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-widest" style={{ color: s.tone ?? "#a3a3a3" }}>
            {s.title}
            <span className="rounded-full bg-neutral-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-600">{s.list.length}</span>
          </h3>
          <ul className="overflow-hidden rounded-2xl bg-white">
            {s.list.map((i) => (
              <li key={i._id} id={`content-${i._id}`} className="border-t border-neutral-100 first:border-t-0">
                <button onClick={() => onOpen(i)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-neutral-50">
                  <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: campaignColor(i.campaign) }} />
                  <FormatIcon format={i.format} size={16} className="shrink-0 text-neutral-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-neutral-900">{i.title}</span>
                      <StateGlyph item={i} size={13} />
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                      {i.scheduledAt ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={12} /> {fmtWhen(i.scheduledAt)}
                        </span>
                      ) : (
                        <span>No date yet</span>
                      )}
                      {i.campaign && <span>{i.campaign}</span>}
                      {i.status === "failed" && i.error ? <span className="text-[#dc2626]">{i.error}</span> : i.platform === "instagram" && !i.upload && i.status !== "published" ? (
                        <span className="inline-flex items-center gap-1 text-[#d97706]">
                          <ImageOff size={12} /> No media yet
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="hidden items-center gap-2 sm:flex">
                    {i.task && <TaskBadge task={i.task} stop />}
                    <PlatformBadge platform={i.platform} />
                    <OwnerStack owners={i.owners} />
                  </span>
                  <StatusBadge status={i.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
