"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, CheckSquare, MessageSquare, MoreHorizontal } from "lucide-react";
import { STATUSES, fmtDay, isOverdue, priorityMeta, type Task, type TaskStatus } from "@/lib/board";
import { AvatarStack, PriorityChip } from "./bits";

export function TaskCard({ task, canMove, dragging, onOpen, onMove, onDragStart, onDragEnd }: { task: Task; canMove: boolean; dragging: boolean; onOpen: () => void; onMove: (s: TaskStatus) => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const done = task.checklist.filter((c) => c.done).length;
  const overdue = isOverdue(task);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <div
      ref={ref}
      id={`task-${task.id}`}
      data-card
      draggable={canMove}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group relative cursor-pointer overflow-hidden rounded-xl bg-white p-3.5 pl-4 transition hover:-translate-y-px hover:shadow-md ${dragging ? "opacity-40" : ""} ${canMove ? "lg:cursor-grab" : ""}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${priorityMeta(task.priority).bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <PriorityChip priority={task.priority} />
          {task.labels.slice(0, 2).map((l) => (
            <span key={l} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              {l}
            </span>
          ))}
        </div>
        {canMove && (
          <div className="relative shrink-0">
            <button
              onClick={(e) => (e.stopPropagation(), setMenu((m) => !m))}
              aria-label="Move this task"
              aria-haspopup="menu"
              className="-mr-1 grid h-7 w-7 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <MoreHorizontal size={16} />
            </button>
            {menu && (
              <div role="menu" onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-neutral-100 bg-white p-1 shadow-xl">
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Move to</p>
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    role="menuitem"
                    disabled={s.id === task.status}
                    onClick={() => (setMenu(false), onMove(s.id))}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
                  >
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <h3 className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug text-neutral-900">{task.title}</h3>

      <div className="mt-3 flex items-center justify-between gap-2">
        <AvatarStack people={task.assignees} />
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-[11px] text-neutral-500">
          {task.dueDate && (
            <span className={`inline-flex items-center gap-1 font-medium ${overdue ? "text-red-600" : ""}`} title={overdue ? "Overdue" : "Due"}>
              <CalendarClock size={12} /> {fmtDay(task.dueDate)}
            </span>
          )}
          {task.checklist.length > 0 && (
            <span className={`inline-flex items-center gap-1 ${done === task.checklist.length ? "text-emerald-600" : ""}`}>
              <CheckSquare size={12} /> {done}/{task.checklist.length}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={12} /> {task.commentCount}
            </span>
          )}
        </div>
      </div>

      {task.contentItem && (
        <Link href={`/calendar?item=${task.contentItem.id}`} onClick={(e) => e.stopPropagation()} className="mt-3 flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-orange-700 hover:bg-orange-500/20">
          <CalendarDays size={12} /> <span className="truncate">{task.contentItem.title || "Content item"}</span>
        </Link>
      )}
    </div>
  );
}
