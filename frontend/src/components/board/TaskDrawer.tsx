"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CalendarDays, Check, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/notify/ToastHost";
import { Field, btnGhost, inputCls } from "@/components/present/ui";
import { PRIORITIES, STATUSES, ago, commentOnTask, fmtFull, getTask, isOverdue, listLinkableContent, statusLabel, toInputDate, updateTask, type Person, type Sprint, type Task, type TaskStatus } from "@/lib/board";
import { PeopleChips, Skeleton } from "./bits";

const HISTORY_TEXT = (h: NonNullable<Task["history"]>[number], people: Map<string, string>) => {
  const who = h.user?.name ?? "Someone";
  switch (h.type) {
    case "created":
      return `${who} created this in ${h.to}`;
    case "moved":
      return `${who} moved it from ${h.from} to ${h.to}`;
    case "assigned":
      return `${who} gave it to ${people.get(h.to) ?? "someone"}`;
    case "unassigned":
      return `${who} took ${people.get(h.to) ?? "someone"} off it`;
    case "comment":
      return `${who} commented`;
    case "checklist":
      return `${who} — ${h.to}`;
    default:
      return h.from && h.to ? `${who} moved it from ${h.from} to ${h.to}` : `${who} edited the details`;
  }
};

// The full task: an admin shapes it, the people it's given to move it along, tick the checklist and comment.
export function TaskDrawer({ taskId, tick, sprints, people, me, admin, canAct, onClose, onMove, onChanged, onDelete }: { taskId: string; tick: number; sprints: Sprint[]; people: Person[]; me: string; admin: boolean; canAct: (t: Task) => boolean; onClose: () => void; onMove: (id: string, s: TaskStatus) => Promise<void>; onChanged: () => void; onDelete: (t: Task) => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [newItem, setNewItem] = useState("");
  const [content, setContent] = useState<{ id: string; title: string }[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState("");
  const loaded = useRef("");

  // Load (and re-load when something else changes it - e.g. the board refreshed after a teammate's move).
  const load = (id: string) =>
    getTask(id)
      .then((t) => {
        setTask(t);
        if (loaded.current !== t.id + t.updatedAt) {
          loaded.current = t.id + t.updatedAt;
          setTitle(t.title);
          setDescription(t.description);
          setLabels(t.labels.join(", "));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn’t load this task"));
  useEffect(() => {
    void load(taskId);
  }, [taskId, tick]);
  useEffect(() => {
    if (admin) void listLinkableContent().then(setContent);
  }, [admin]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const mine = task ? canAct(task) : false;

  async function run(fn: () => Promise<Task>) {
    setSaving(true);
    setError("");
    try {
      const t = await fn();
      setTask(t);
      loaded.current = t.id + t.updatedAt;
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save that");
    }
    setSaving(false);
  }
  const patch = (p: Parameters<typeof updateTask>[1]) => task && run(() => updateTask(task.id, p));

  const doneCount = task?.checklist.filter((c) => c.done).length ?? 0;
  const pct = task?.checklist.length ? Math.round((doneCount / task.checklist.length) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Task details">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            {task && (
              <select
                value={task.status}
                disabled={!mine || saving}
                onChange={(e) => run(async () => (await onMove(task.id, e.target.value as TaskStatus), getTask(task.id)))}
                aria-label="Column"
                className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-neutral-800 disabled:opacity-70"
              >
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            {saving && <Loader2 size={15} className="animate-spin text-neutral-400" />}
          </div>
          <div className="flex items-center gap-1">
            {admin && task && (
              <button onClick={() => onDelete(task)} aria-label="Delete task" className="grid h-9 w-9 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 size={17} />
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {!task ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <>
              {admin ? (
                <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== task.title && patch({ title })} className="w-full rounded-lg bg-transparent px-1 text-xl font-semibold text-neutral-900 outline-none focus:bg-neutral-50" maxLength={200} aria-label="Task title" />
              ) : (
                <h2 className="text-xl font-semibold text-neutral-900">{task.title}</h2>
              )}
              {!mine && !admin && <p className="rounded-xl bg-neutral-100 px-3.5 py-2.5 text-sm text-neutral-600">This task is given to {task.assignees.map((a) => a.name).join(", ") || "nobody yet"}. You can read it, but only they can update it.</p>}
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Priority">
                  <div className="flex flex-wrap gap-1.5">
                    {PRIORITIES.map((p) => (
                      <button key={p.id} disabled={!admin} onClick={() => task.priority !== p.id && patch({ priority: p.id })} aria-pressed={task.priority === p.id} className={`rounded-full px-3 py-1 text-xs font-semibold ${task.priority === p.id ? `${p.chip} ring-2 ring-current` : "bg-neutral-100 text-neutral-500"} ${admin ? "hover:bg-neutral-200" : "cursor-default"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Due">
                  {admin ? (
                    <input type="date" defaultValue={toInputDate(task.dueDate)} onChange={(e) => patch({ dueDate: e.target.value || null })} className={inputCls} />
                  ) : (
                    <p className={`text-sm ${isOverdue(task) ? "font-semibold text-red-600" : "text-neutral-800"}`}>{task.dueDate ? `${fmtFull(task.dueDate)}${isOverdue(task) ? " · overdue" : ""}` : "No due date"}</p>
                  )}
                </Field>
              </div>

              <Field label="Given to">
                {admin ? <PeopleChips people={people} value={task.assignees.map((a) => a.id)} onChange={(ids) => patch({ assignees: ids })} /> : <PeopleChips people={task.assignees} value={task.assignees.map((a) => a.id)} onChange={() => {}} disabled />}
              </Field>

              {admin && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Sprint">
                    <select value={task.sprintId} onChange={(e) => patch({ sprint: e.target.value })} className={inputCls}>
                      {sprints.filter((s) => s.status !== "completed" || s.id === task.sprintId).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Labels" hint="Comma separated">
                    <input value={labels} onChange={(e) => setLabels(e.target.value)} onBlur={() => patch({ labels: labels.split(",").map((l) => l.trim()).filter(Boolean) })} className={inputCls} />
                  </Field>
                </div>
              )}
              {!admin && task.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {task.labels.map((l) => (
                    <span key={l} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                      {l}
                    </span>
                  ))}
                </div>
              )}

              <Field label="Content calendar">
                {task.contentItem ? (
                  <div className="flex items-center gap-2">
                    <Link href={`/calendar?item=${task.contentItem.id}`} className="inline-flex min-w-0 items-center gap-2 rounded-xl bg-orange-500/10 px-3.5 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-500/20">
                      <CalendarDays size={15} /> <span className="truncate">{task.contentItem.title || "Open the content item"}</span>
                    </Link>
                    {admin && (
                      <button onClick={() => patch({ contentItem: null })} className="text-xs text-neutral-400 hover:text-red-600">
                        Unlink
                      </button>
                    )}
                  </div>
                ) : admin && content.length > 0 ? (
                  <select value="" onChange={(e) => e.target.value && patch({ contentItem: e.target.value })} className={inputCls}>
                    <option value="">Link a post from the calendar…</option>
                    {content.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-neutral-400">Not linked to a post.</p>
                )}
              </Field>

              <Field label="Details">
                {admin ? (
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== task.description && patch({ description })} rows={4} className={inputCls} placeholder="What needs doing, links, references…" maxLength={4000} />
                ) : (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{task.description || "No details."}</p>
                )}
              </Field>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Checklist</span>
                  {task.checklist.length > 0 && (
                    <span className="text-xs font-medium text-neutral-500">
                      {doneCount}/{task.checklist.length} · {pct}%
                    </span>
                  )}
                </div>
                {task.checklist.length > 0 && (
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <ul className="space-y-1">
                  {task.checklist.map((c) => (
                    <li key={c.id} className="group flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-neutral-50">
                      <button disabled={!mine} onClick={() => patch({ checklist: task.checklist.map((x) => ({ id: x.id, text: x.text, done: x.id === c.id ? !x.done : x.done })) })} aria-label={c.done ? "Untick" : "Tick"} aria-pressed={c.done} className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${c.done ? "border-emerald-500 bg-emerald-500 text-[#ffffff]" : "border-neutral-300 bg-white"} ${mine ? "" : "cursor-default"}`}>
                        {c.done && <Check size={13} strokeWidth={3} />}
                      </button>
                      <span className={`min-w-0 flex-1 text-sm ${c.done ? "text-neutral-400 line-through" : "text-neutral-800"}`}>{c.text}</span>
                      {admin && (
                        <button onClick={() => patch({ checklist: task.checklist.filter((x) => x.id !== c.id).map((x) => ({ id: x.id, text: x.text, done: x.done })) })} aria-label="Remove item" className="text-neutral-300 opacity-0 hover:text-red-600 group-hover:opacity-100">
                          <X size={15} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {admin && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newItem.trim()) return;
                      void patch({ checklist: [...task.checklist.map((x) => ({ id: x.id, text: x.text, done: x.done })), { text: newItem.trim(), done: false }] });
                      setNewItem("");
                    }}
                    className="mt-2 flex items-center gap-2"
                  >
                    <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a step…" className={inputCls} maxLength={200} />
                    <button type="submit" disabled={!newItem.trim()} aria-label="Add step" className={`${btnGhost} px-3`}>
                      <Plus size={16} />
                    </button>
                  </form>
                )}
              </div>

              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Comments</span>
                <ul className="space-y-3">
                  {(task.comments ?? []).map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <Avatar name={c.user?.name ?? "?"} size={30} />
                      <div className="min-w-0 flex-1 rounded-2xl bg-neutral-50 px-3.5 py-2.5">
                        <p className="text-xs text-neutral-500">
                          <b className="text-neutral-800">{c.user?.id === me ? "You" : c.user?.name}</b> · {ago(c.at)}
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-sm text-neutral-800">{c.text}</p>
                      </div>
                    </li>
                  ))}
                  {!(task.comments ?? []).length && <li className="text-sm text-neutral-400">No comments yet.</li>}
                </ul>
                {mine && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = comment.trim();
                      if (!text) return;
                      setComment("");
                      void run(() => commentOnTask(task.id, text));
                    }}
                    className="mt-3 flex items-center gap-2"
                  >
                    <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Post an update…" className={inputCls} maxLength={2000} />
                    <button type="submit" disabled={!comment.trim() || saving} aria-label="Send comment" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-600 text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
                      <Send size={16} />
                    </button>
                  </form>
                )}
              </div>

              <div>
                <span className="mb-3 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Activity</span>
                <ol className="space-y-3 border-l border-neutral-200 pl-4">
                  {(task.history ?? []).map((h, i) => (
                    <li key={i} className="relative text-sm text-neutral-600">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-neutral-300" />
                      {HISTORY_TEXT(h, names)}
                      <span className="ml-2 text-xs text-neutral-400">{ago(h.at)}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-xs text-neutral-400">
                  {task.createdBy ? `Created by ${task.createdBy.name} · ` : ""}
                  {statusLabel(task.status)}
                  {task.completedAt ? ` · finished ${ago(task.completedAt)}` : ""}
                </p>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
