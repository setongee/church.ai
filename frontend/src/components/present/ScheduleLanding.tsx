"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { createSchedule, deleteSchedule, getSchedule, listSchedules, startPresentSession, type PresentSession, type ScheduleSummary } from "@/lib/present";
import { btnGhost, btnPrimary, Empty, Field, inputCls, Modal } from "./ui";

const when = (iso?: string | null) => {
  if (!iso) return "Not used yet";
  const d = new Date(iso);
  return `Last used ${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })}`;
};

const defaultName = () => `Service — ${new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`;

// Where Present starts. You can't reach the controller until a service is running, and a service always
// begins from a schedule: one you made before, or a new one (optionally copied from an old one).
export function ScheduleLanding({ onStarted }: { onStarted: (s: PresentSession) => void }) {
  const [schedules, setSchedules] = useState<ScheduleSummary[] | null>(null);
  const [name, setName] = useState(defaultName);
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false); // the new-schedule modal
  const [error, setError] = useState("");

  useEffect(() => {
    listSchedules()
      .then((l) => setSchedules([...l].sort((a, b) => new Date(b.lastUsedAt ?? b.updatedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? a.updatedAt ?? 0).getTime())))
      .catch((e) => (setSchedules([]), setError(e.message)));
  }, []);

  async function start(id: string) {
    setBusy(id);
    setError("");
    try {
      onStarted((await startPresentSession(id)).session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the service");
      setBusy("");
    }
  }

  async function createAndStart() {
    if (!name.trim()) return;
    setBusy("new");
    setError("");
    try {
      // Copying an old schedule brings its items and its look (font, background, logo screen...).
      const from = copyFrom ? await getSchedule(copyFrom) : null;
      const created = await createSchedule({
        name: name.trim(),
        items: from?.items.map((i) => ({ type: i.type, title: i.title, subtitle: i.subtitle, slides: i.slides, show: i.show })),
        settings: from?.settings,
      });
      onStarted((await startPresentSession(created._id)).session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the schedule");
      setBusy("");
    }
  }

  async function remove(s: ScheduleSummary) {
    if (!confirm(`Delete “${s.name}” and its ${s.count} item${s.count === 1 ? "" : "s"}? This can’t be undone.`)) return;
    await deleteSchedule(s._id).catch(() => {});
    setSchedules((l) => l?.filter((x) => x._id !== s._id) ?? null);
    if (copyFrom === s._id) setCopyFrom("");
  }

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-10 sm:px-20 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <CalendarDays size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Present</h1>
            <p className="text-sm text-neutral-500">Start a service with a schedule — pick one you’ve used before, or make a new one.</p>
          </div>
        </div>
        <button
          onClick={() => {
            setName(defaultName());
            setCopyFrom("");
            setError("");
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700"
        >
          <Plus size={16} /> New schedule
        </button>
      </div>

      {error && !creating && <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}


      <h2 className="mt-8 text-xs font-bold uppercase tracking-widest text-neutral-400">Previous schedules</h2>
      {schedules === null ? (
        <p className="mt-6 text-sm text-neutral-400">Loading…</p>
      ) : schedules.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-neutral-200">
          <Empty icon={<CalendarDays size={22} />} title="No schedules yet">
            Use “New schedule” to create your first one and start presenting.
          </Empty>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {schedules.map((s) => (
            <div key={s._id} className="group flex flex-col rounded-2xl bg-white p-4 transition hover:border-orange-200">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate text-base font-semibold text-neutral-900">{s.name}</h3>
                <button onClick={() => remove(s)} aria-label={`Delete ${s.name}`} className="rounded-md p-1.5 text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                  <Trash2 size={15} />
                </button>
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                {s.count} item{s.count === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400">
                <Clock size={12} /> {when(s.lastUsedAt)}
              </p>
              <button onClick={() => start(s._id)} disabled={!!busy} className={`${btnGhost} mt-4 justify-center hover:border-orange-300 hover:text-orange-700`}>
                {busy === s._id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Start service
              </button>
            </div>
          ))}
        </div>
      )}
      {creating && (
        <Modal title="New schedule" onClose={() => busy !== "new" && setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createAndStart();
            }}
            className="space-y-4"
          >
            <Field label="Name">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Sunday Service, Youth Night" />
            </Field>
            <Field label="Start from">
              <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={inputCls}>
                <option value="">A blank schedule</option>
                {(schedules ?? []).map((s) => (
                  <option key={s._id} value={s._id}>
                    Copy of {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCreating(false)} disabled={busy === "new"} className={btnGhost}>
                Cancel
              </button>
              <button type="submit" disabled={!name.trim() || !!busy} className={btnPrimary}>
                {busy === "new" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create &amp; start
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
