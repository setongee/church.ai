"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, Modal, btnGhost, btnPrimary, inputCls } from "@/components/present/ui";
import { PRIORITIES, STATUSES, todayInput, toInputDate, type Person, type Priority, type Sprint, type SprintInput, type TaskInput, type TaskStatus } from "@/lib/board";
import { PeopleChips } from "./bits";

export function SprintModal({ sprint, hasActive, onClose, onSave }: { sprint?: Sprint; hasActive: boolean; onClose: () => void; onSave: (input: SprintInput) => Promise<void> }) {
  const week = () => {
    const d = new Date();
    d.setDate(d.getDate() + 13);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [start, setStart] = useState(sprint ? toInputDate(sprint.startDate) : todayInput());
  const [end, setEnd] = useState(sprint ? toInputDate(sprint.endDate) : week());
  const [status, setStatus] = useState<Sprint["status"]>(sprint?.status ?? (hasActive ? "planned" : "active"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ name, goal, startDate: start, endDate: end, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the sprint");
      setBusy(false);
    }
  }
  return (
    <Modal title={sprint ? "Edit sprint" : "New sprint"} guard onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 12 — Easter outreach" className={inputCls} maxLength={120} />
        </Field>
        <Field label="Goal" hint="What the team is trying to get done in this sprint">
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} className={inputCls} maxLength={600} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Ends">
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          </Field>
        </div>
        {sprint?.status !== "completed" && (
          <Field label="Status">
            <div className="flex gap-2">
              {(["planned", "active"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize ${status === s ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !name.trim()} className={btnPrimary}>
            {busy && <Loader2 size={15} className="animate-spin" />} {sprint ? "Save" : "Create sprint"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TaskModal({ sprints, sprintId, status: startStatus, people, onClose, onSave }: { sprints: Sprint[]; sprintId: string; status?: TaskStatus; people: Person[]; onClose: () => void; onSave: (input: TaskInput) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sprint, setSprint] = useState(sprintId);
  const [status, setStatus] = useState<TaskStatus>(startStatus ?? "todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ sprint, title, description, status, priority, assignees, dueDate: dueDate || null, labels: labels.split(",").map((l) => l.trim()).filter(Boolean) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t create the task");
      setBusy(false);
    }
  }
  return (
    <Modal title="New task" guard onClose={() => !busy && onClose()} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Task">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Edit the Sunday reel and add captions" className={inputCls} maxLength={200} />
        </Field>
        <Field label="Details">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} placeholder="What needs doing, links, references…" maxLength={4000} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Sprint">
            <select value={sprint} onChange={(e) => setSprint(e.target.value)} className={inputCls}>
              {sprints.filter((s) => s.status !== "completed" || s.id === sprintId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Column">
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Priority">
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => (
              <button key={p.id} type="button" onClick={() => setPriority(p.id)} aria-pressed={priority === p.id} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${priority === p.id ? `${p.chip} ring-2 ring-current` : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Give it to" hint="They’ll be notified straight away">
          <PeopleChips people={people} value={assignees} onChange={setAssignees} />
        </Field>
        <Field label="Labels" hint="Comma separated, e.g. Reel, Youth, Easter">
          <input value={labels} onChange={(e) => setLabels(e.target.value)} className={inputCls} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !title.trim()} className={btnPrimary}>
            {busy && <Loader2 size={15} className="animate-spin" />} Create task
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CompleteSprintModal({ sprint, others, openCount, onClose, onConfirm }: { sprint: Sprint; others: Sprint[]; openCount: number; onClose: () => void; onConfirm: (carryTo?: string) => Promise<void> }) {
  const [carry, setCarry] = useState(others[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go(to?: string) {
    setBusy(true);
    setError("");
    try {
      await onConfirm(to);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t complete the sprint");
      setBusy(false);
    }
  }
  return (
    <Modal title={`Complete “${sprint.name}”?`} onClose={() => !busy && onClose()}>
      <p className="text-sm text-neutral-600">{openCount ? `${openCount} task${openCount === 1 ? " isn’t" : "s aren’t"} done yet.` : "Everything in this sprint is done — nice."}</p>
      {openCount > 0 && others.length > 0 && (
        <Field label="Carry the unfinished tasks into" className="mt-4">
          <select value={carry} onChange={(e) => setCarry(e.target.value)} className={inputCls}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={onClose} disabled={busy} className={btnGhost}>
          Cancel
        </button>
        {openCount > 0 && others.length > 0 && (
          <button onClick={() => go(carry)} disabled={busy || !carry} className={btnPrimary}>
            {busy && <Loader2 size={15} className="animate-spin" />} Complete &amp; carry over
          </button>
        )}
        <button onClick={() => go()} disabled={busy} className={openCount > 0 && others.length > 0 ? btnGhost : btnPrimary}>
          {openCount > 0 ? "Complete, leave them here" : "Complete sprint"}
        </button>
      </div>
    </Modal>
  );
}

export function ConfirmModal({ title, body, confirm, onClose, onConfirm }: { title: string; body: string; confirm: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} onClose={() => !busy && onClose()}>
      <p className="text-sm text-neutral-600">{body}</p>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} className={btnGhost}>
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong");
              setBusy(false);
            }
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#dc2626] px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-[#b91c1c] disabled:opacity-50"
        >
          {busy && <Loader2 size={15} className="animate-spin" />} {confirm}
        </button>
      </div>
    </Modal>
  );
}
