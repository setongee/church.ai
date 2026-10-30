"use client";

import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { campaignColor, fmtWhen, isLocked, statusMeta, type ContentItem, type ContentStatus } from "@/lib/content";
import { FormatIcon, OwnerStack, PlatformBadge, StateGlyph, TaskBadge, dropProps } from "./parts";

const COLUMNS: ContentStatus[] = ["idea", "drafting", "review", "ready", "scheduled", "published"];

interface Props {
  items: ContentItem[];
  canWrite: boolean;
  onOpen: (i: ContentItem) => void;
  onMoveTo: (id: string, status: ContentStatus) => void;
  onAdd: (status: ContentStatus) => void;
}

// Work moves left to right: idea -> drafting -> review -> ready -> scheduled -> posted. Drag a card to change its stage.
export function PipelineView({ items, canWrite, onOpen, onMoveTo, onAdd }: Props) {
  const failed = items.filter((i) => i.status === "failed" || i.status === "publishing");
  const columns: { id: ContentStatus; list: ContentItem[] }[] = COLUMNS.map((id) => ({ id, list: items.filter((i) => i.status === id) }));
  return (
    <div className="space-y-3">
      {failed.length > 0 && (
        <div className="rounded-2xl bg-[rgba(220,38,38,0.08)] p-2.5">
          <ColumnHead status="failed" count={failed.length} />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {failed.map((i) => (
              <Card key={i._id} item={i} canWrite={canWrite} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="flex min-w-max gap-3 lg:grid lg:min-w-0 lg:grid-cols-6">
          {columns.map((c) => (
            <Column key={c.id} id={c.id} list={c.list} canWrite={canWrite} onOpen={onOpen} onMoveTo={onMoveTo} onAdd={onAdd} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ColumnHead({ status, count }: { status: ContentStatus; count: number }) {
  const s = statusMeta(status);
  return (
    <div className="flex items-center gap-2 px-1.5 pb-1 pt-0.5">
      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
      <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">{s.label}</h3>
      <span className="ml-auto rounded-full bg-neutral-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-600">{count}</span>
    </div>
  );
}

function Column({ id, list, canWrite, onOpen, onMoveTo, onAdd }: { id: ContentStatus; list: ContentItem[] } & Omit<Props, "items">) {
  const [over, setOver] = useState(false);
  return (
    <div {...(canWrite ? dropProps((itemId) => onMoveTo(itemId, id), setOver) : {})} className={`w-72 shrink-0 space-y-2 rounded-2xl p-2.5 transition-colors lg:w-auto ${over ? "bg-orange-50" : "bg-neutral-50"}`} style={{ minHeight: "14rem" }}>
      <ColumnHead status={id} count={list.length} />
      {list.map((i) => (
        <Card key={i._id} item={i} canWrite={canWrite} onOpen={onOpen} />
      ))}
      {list.length === 0 && <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-6 text-center text-xs text-neutral-400">{canWrite ? "Drop here" : "Nothing here"}</p>}
      {canWrite && id !== "scheduled" && id !== "published" && (
        <button onClick={() => onAdd(id)} className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-neutral-400 hover:bg-white hover:text-orange-600">
          <Plus size={14} /> Add
        </button>
      )}
    </div>
  );
}

function Card({ item, canWrite, onOpen }: { item: ContentItem; canWrite: boolean; onOpen: (i: ContentItem) => void }) {
  const color = campaignColor(item.campaign);
  const draggable = canWrite && !isLocked(item);
  return (
    <div
      id={`content-${item._id}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item._id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(item)}
      className={`rounded-xl bg-white p-3 transition hover:-translate-y-px ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      style={{ boxShadow: `inset 3px 0 0 ${color}` }}
    >
      <div className="flex items-start gap-2">
        <FormatIcon format={item.format} size={14} className="mt-0.5 shrink-0 text-neutral-400" />
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-neutral-900">{item.title}</p>
        <StateGlyph item={item} size={14} />
      </div>
      {item.campaign && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {item.campaign}
        </p>
      )}
      {item.status === "failed" && item.error && <p className="mt-1.5 line-clamp-2 text-[11px] text-[#dc2626]">{item.error}</p>}
      <div className="mt-2.5 flex items-center gap-2">
        <PlatformBadge platform={item.platform} />
        {item.scheduledAt && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500">
            <CalendarClock size={12} /> {fmtWhen(item.scheduledAt)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {item.task && <TaskBadge task={item.task} stop />}
          <OwnerStack owners={item.owners} size={20} />
        </span>
      </div>
    </div>
  );
}
