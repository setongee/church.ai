"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Flag, KanbanSquare, Pencil, Plus, Search, Target, Trash2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Empty, btnGhost, btnPrimary, inputCls } from "@/components/present/ui";
import { Avatar } from "@/components/notify/ToastHost";
import { useCached } from "@/lib/queries";
import { getSocket } from "@/lib/socket";
import { flashElement, queryParam } from "@/lib/deeplink";
import { listTeam, type TeamMember } from "@/lib/team";
import { PRIORITIES, STATUSES, completeSprint, createSprint, createTask, daysLeft, deleteSprint, deleteTask, fmtDay, getTask, listSprints, listTasks, moveTask, updateSprint, type Priority, type Sprint, type SprintInput, type Task, type TaskInput, type TaskStatus } from "@/lib/board";
import { ProgressRing, Skeleton } from "./bits";
import { CompleteSprintModal, ConfirmModal, SprintModal, TaskModal } from "./Modals";
import { TaskCard } from "./TaskCard";
import { TaskDrawer } from "./TaskDrawer";

const statusPill: Record<Sprint["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-600",
  planned: "bg-blue-500/15 text-blue-600",
  completed: "bg-slate-500/15 text-slate-600",
};

export function BoardPage() {
  const { user } = useAuth();
  const admin = Boolean(user?.isAdmin);
  const me = user?._id ?? "";

  const { data: sprintsData, set: setSprints, reload: reloadSprints, loading: sprintsLoading } = useCached<Sprint[]>(["board-sprints"], listSprints);
  const sprints = useMemo(() => sprintsData ?? [], [sprintsData]);
  const { data: team } = useCached<TeamMember[]>(["board-team"], listTeam);
  const people = useMemo(() => (team ?? []).map((t) => ({ id: t._id, name: t.name })), [team]);

  const [pickedId, setPickedId] = useState<string | null>(null);
  const sprint = sprints.find((s) => s.id === pickedId) ?? sprints.find((s) => s.status === "active") ?? sprints.find((s) => s.status === "planned") ?? sprints[0] ?? null;
  const { data: tasksData, set: setTasks, reload: reloadTasks, loading: tasksLoading } = useCached<Task[]>(["board-tasks", sprint?.id], () => listTasks(sprint!.id), { enabled: Boolean(sprint) });
  const tasks = useMemo(() => tasksData ?? [], [tasksData]);

  const [who, setWho] = useState<string>("all"); // all | mine | <person id>
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; index: number } | null>(null);
  const [col, setCol] = useState<TaskStatus>("todo"); // the column shown on small screens
  const [error, setError] = useState("");
  const [modal, setModal] = useState<null | { kind: "sprint"; edit?: Sprint } | { kind: "task"; status?: TaskStatus } | { kind: "complete" } | { kind: "delete-sprint" } | { kind: "delete-task"; task: Task }>(null);
  const colRefs = useRef<Partial<Record<TaskStatus, HTMLDivElement | null>>>({});

  const canAct = useCallback((t: Task) => admin || t.assignees.some((a) => a.id === me), [admin, me]);

  // A teammate changed something: refresh the board (and an open task) shortly.
  useEffect(() => {
    const socket = getSocket();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChanged = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void reloadSprints();
        void reloadTasks();
        setTick((n) => n + 1);
      }, 250);
    };
    socket.on("board:changed", onChanged);
    if (!socket.connected) socket.connect();
    return () => {
      clearTimeout(timer);
      socket.off("board:changed", onChanged);
    };
  }, [reloadSprints, reloadTasks]);

  // Deep link: /board?task=ID opens that task (switching to its sprint first).
  useEffect(() => {
    const id = queryParam("task");
    if (!id) return;
    getTask(id)
      .then((t) => {
        setPickedId(t.sprintId);
        setCol(t.status);
        setOpenId(t.id);
        setTimeout(() => flashElement(`task-${t.id}`), 500);
      })
      .catch(() => {});
  }, []);

  const closeDrawer = useCallback(() => {
    setOpenId(null);
    if (queryParam("task")) window.history.replaceState(null, "", "/board");
  }, []);

  // ---- filtering & grouping -----------------------------------------------------------------------------------------
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (who === "mine" && !t.assignees.some((a) => a.id === me)) return false;
      if (who !== "all" && who !== "mine" && !t.assignees.some((a) => a.id === who)) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (needle && !`${t.title} ${t.labels.join(" ")} ${t.assignees.map((a) => a.name).join(" ")}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tasks, who, me, priority, q]);
  const byStatus = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of [...visible].sort((a, b) => a.order - b.order)) m[t.status].push(t);
    return m;
  }, [visible]);
  const workload = useMemo(() => {
    const m = new Map<string, { id: string; name: string; open: number; done: number }>();
    for (const t of tasks) for (const a of t.assignees) {
      const e = m.get(a.id) ?? { id: a.id, name: a.name, open: 0, done: 0 };
      if (t.status === "done") e.done++;
      else e.open++;
      m.set(a.id, e);
    }
    return [...m.values()].sort((a, b) => b.open + b.done - (a.open + a.done));
  }, [tasks]);
  const counts = useMemo(() => {
    const c = { todo: 0, in_progress: 0, review: 0, done: 0 };
    for (const t of tasks) c[t.status]++;
    return { ...c, total: tasks.length };
  }, [tasks]);
  const progress = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  const unassigned = tasks.filter((t) => !t.assignees.length).length;

  // ---- moving -------------------------------------------------------------------------------------------------------
  const performMove = useCallback(
    async (id: string, status: TaskStatus, index?: number) => {
      const before = tasks;
      const task = before.find((t) => t.id === id);
      if (!task) return;
      const others = before.filter((t) => t.status === status && t.id !== id).sort((a, b) => a.order - b.order);
      const at = Math.max(0, Math.min(others.length, index ?? others.length));
      const ordered = [...others.slice(0, at), task, ...others.slice(at)];
      const next = before.map((t) => {
        const i = ordered.findIndex((o) => o.id === t.id);
        return i >= 0 ? { ...t, status, order: i, completedAt: status === "done" ? t.completedAt ?? new Date().toISOString() : null } : t;
      });
      setTasks(next);
      setError("");
      try {
        await moveTask(id, status, at);
      } catch (e) {
        setTasks(before);
        setError(e instanceof Error ? e.message : "Couldn’t move that task");
      }
    },
    [tasks, setTasks],
  );

  function dragOverColumn(e: React.DragEvent, status: TaskStatus) {
    if (!dragging) return;
    e.preventDefault();
    const box = colRefs.current[status];
    if (!box) return;
    const cards = [...box.querySelectorAll<HTMLElement>("[data-card]")].filter((c) => c.id !== `task-${dragging}`);
    let index = 0;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) index++;
    }
    setOver((o) => (o && o.status === status && o.index === index ? o : { status, index }));
  }
  function drop(status: TaskStatus) {
    const id = dragging;
    const target = over && over.status === status ? over.index : undefined;
    setDragging(null);
    setOver(null);
    if (id) void performMove(id, status, target);
  }

  // ---- actions ------------------------------------------------------------------------------------------------------
  const refresh = () => {
    void reloadSprints();
    void reloadTasks();
  };
  async function saveSprint(input: SprintInput, edit?: Sprint) {
    const s = edit ? await updateSprint(edit.id, input) : await createSprint(input);
    setPickedId(s.id);
    setModal(null);
    void reloadSprints();
  }
  async function saveTask(input: TaskInput) {
    const t = await createTask(input);
    if (input.sprint !== sprint?.id) setPickedId(input.sprint);
    setModal(null);
    refresh();
    setCol(t.status);
  }
  const hasActive = sprints.some((s) => s.status === "active");
  const otherOpen = sprints.filter((s) => s.id !== sprint?.id && s.status !== "completed");
  const left = sprint ? daysLeft(sprint.endDate) : 0;

  // ---- render -------------------------------------------------------------------------------------------------------
  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-6 sm:py-10 lg:px-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Tasks</h1>
          <p className="mt-1 text-sm text-neutral-500">{admin ? "Plan the sprint, give the work out, and follow how it’s going." : "The work given to you — move it along as you go."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && sprint && sprint.status !== "completed" && (
            <button onClick={() => setModal({ kind: "task" })} className={btnPrimary}>
              <Plus size={16} /> New task
            </button>
          )}
          {admin && (
            <button onClick={() => setModal({ kind: "sprint" })} className={btnGhost}>
              <Flag size={16} /> New sprint
            </button>
          )}
        </div>
      </div>

      {sprintsLoading && !sprintsData ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <div className="grid gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      ) : !sprint ? (
        <div className="rounded-2xl bg-white p-6">
          <Empty icon={<KanbanSquare size={28} />} title="No sprints yet">
            {admin ? (
              <>
                <p className="mb-4">A sprint is a stretch of time (say two weeks) with a list of tasks. Start one, then add tasks and give them to the team.</p>
                <button onClick={() => setModal({ kind: "sprint" })} className={btnPrimary}>
                  <Plus size={16} /> Create the first sprint
                </button>
              </>
            ) : (
              "An admin hasn’t set up a sprint yet. When they do, the work given to you will show up here."
            )}
          </Empty>
        </div>
      ) : (
        <>
          {/* sprint tabs */}
          <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {sprints.map((s) => (
              <button key={s.id} onClick={() => (setPickedId(s.id), setFilterReset())} aria-pressed={s.id === sprint.id} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${s.id === sprint.id ? "bg-[#171717] text-[#ffffff]" : "bg-white text-neutral-600 hover:text-neutral-900"}`}>
                {s.name}
                <span className={`rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${s.id === sprint.id ? "bg-[rgba(255,255,255,0.18)] text-[#ffffff]" : statusPill[s.status]}`}>{s.status}</span>
              </button>
            ))}
          </div>

          {/* sprint summary */}
          <section className="mb-5 grid gap-5 rounded-2xl bg-white p-5 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="flex gap-5">
              <ProgressRing value={progress} size={76} stroke={8} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-neutral-900">{sprint.name}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusPill[sprint.status]}`}>{sprint.status}</span>
                  {admin && (
                    <span className="ml-auto flex items-center gap-0.5">
                      <button onClick={() => setModal({ kind: "sprint", edit: sprint })} aria-label="Edit sprint" title="Edit sprint" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                        <Pencil size={15} />
                      </button>
                      {sprint.status !== "completed" && (
                        <button onClick={() => setModal({ kind: "complete" })} aria-label="Complete sprint" title="Complete sprint" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-emerald-50 hover:text-emerald-600">
                          <Flag size={15} />
                        </button>
                      )}
                      <button onClick={() => setModal({ kind: "delete-sprint" })} aria-label="Delete sprint" title="Delete sprint" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </span>
                  )}
                </div>
                {sprint.goal && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-neutral-600">
                    <Target size={14} className="mt-0.5 shrink-0 text-neutral-400" /> {sprint.goal}
                  </p>
                )}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
                  <span className="inline-flex items-center gap-1">
                    <CalendarRange size={13} /> {fmtDay(sprint.startDate)} – {fmtDay(sprint.endDate)}
                  </span>
                  {sprint.status !== "completed" && <span className={left < 0 ? "font-semibold text-red-600" : left <= 2 ? "font-semibold text-orange-600" : ""}>{left < 0 ? `${-left} day${left === -1 ? "" : "s"} over` : left === 0 ? "Ends today" : `${left} day${left === 1 ? "" : "s"} left`}</span>}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label} <b className="text-neutral-900">{counts[s.id]}</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Who’s carrying what</p>
              {workload.length === 0 && unassigned === 0 ? (
                <p className="text-sm text-neutral-400">Nothing given out yet.</p>
              ) : (
                <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {workload.slice(0, 6).map((w) => (
                    <li key={w.id}>
                      <button onClick={() => setWho(who === w.id ? "all" : w.id)} aria-pressed={who === w.id} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-neutral-50 ${who === w.id ? "bg-orange-500/10" : ""}`}>
                        <Avatar name={w.name} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-neutral-900">{w.id === me ? "You" : w.name}</span>
                          <span className="mt-0.5 flex h-1.5 overflow-hidden rounded-full bg-neutral-200">
                            <span className="bg-emerald-500" style={{ width: `${(w.done / (w.open + w.done)) * 100}%` }} />
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-neutral-500">
                          {w.open} open · {w.done} done
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {unassigned > 0 && <p className="mt-2 text-xs text-orange-600">{unassigned} task{unassigned === 1 ? " isn’t" : "s aren’t"} given to anyone yet.</p>}
            </div>
          </section>

          {/* filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-white p-1">
              {[
                ["all", "Everyone"],
                ["mine", "My tasks"],
              ].map(([id, label]) => (
                <button key={id} onClick={() => setWho(id)} aria-pressed={who === id} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${who === id ? "bg-orange-600 text-[#ffffff]" : "text-neutral-600 hover:text-neutral-900"}`}>
                  {label}
                </button>
              ))}
            </div>
            <select value={who !== "all" && who !== "mine" ? who : ""} onChange={(e) => setWho(e.target.value || "all")} aria-label="Filter by person" className={`${inputCls} !w-auto`}>
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value as "all" | Priority)} aria-label="Filter by priority" className={`${inputCls} !w-auto`}>
              <option value="all">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <label className="relative min-w-40 flex-1 sm:max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className={`${inputCls} !pl-9`} />
            </label>
          </div>

          {error && (
            <p className="mb-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {error}
              <button onClick={() => setError("")} className="text-xs font-semibold underline">
                Dismiss
              </button>
            </p>
          )}

          {/* small screens: one column at a time */}
          <div className="mb-3 flex gap-1.5 overflow-x-auto lg:hidden">
            {STATUSES.map((s) => (
              <button key={s.id} onClick={() => setCol(s.id)} aria-pressed={col === s.id} className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ${col === s.id ? "bg-[#171717] text-[#ffffff]" : "bg-white text-neutral-600"}`}>
                <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
                <span className="text-xs opacity-70">{byStatus[s.id].length}</span>
              </button>
            ))}
          </div>

          {/* the board */}
          <div className="grid gap-4 lg:grid-cols-4">
            {STATUSES.map((s) => {
              const list = byStatus[s.id];
              const showHere = over?.status === s.id;
              let seen = 0;
              return (
                <section
                  key={s.id}
                  className={`min-w-0 ${col === s.id ? "block" : "hidden"} lg:block`}
                  onDragOver={(e) => dragOverColumn(e, s.id)}
                  onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver((o) => (o?.status === s.id ? null : o))}
                  onDrop={(e) => (e.preventDefault(), drop(s.id))}
                >
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} /> {s.label}
                      <span className="rounded-full bg-neutral-200/70 px-2 py-0.5 text-xs font-semibold text-neutral-600">{list.length}</span>
                    </h3>
                    {admin && sprint.status !== "completed" && (
                      <button onClick={() => setModal({ kind: "task", status: s.id })} aria-label={`Add a task to ${s.label}`} className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 hover:bg-white hover:text-orange-600">
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                  <div ref={(el) => void (colRefs.current[s.id] = el)} className={`min-h-40 space-y-2.5 rounded-2xl p-1.5 transition ${showHere ? "bg-orange-500/5 ring-2 ring-dashed ring-orange-300" : ""}`}>
                    {tasksLoading && !tasksData ? (
                      <>
                        <Skeleton className="h-24" />
                        <Skeleton className="h-24" />
                      </>
                    ) : (
                      list.map((t) => {
                        const isDragged = dragging === t.id;
                        const slot = !isDragged ? seen++ : -1;
                        return (
                          <div key={t.id}>
                            {showHere && over!.index === slot && !isDragged && <div className="mb-2.5 h-1 rounded-full bg-orange-500" />}
                            <TaskCard task={t} canMove={canAct(t) && sprint.status !== "completed"} dragging={isDragged} onOpen={() => setOpenId(t.id)} onMove={(st) => void performMove(t.id, st)} onDragStart={(e) => (e.dataTransfer.setData("text/plain", t.id), (e.dataTransfer.effectAllowed = "move"), setDragging(t.id))} onDragEnd={() => (setDragging(null), setOver(null))} />
                          </div>
                        );
                      })
                    )}
                    {showHere && over!.index >= seen && <div className="h-1 rounded-full bg-orange-500" />}
                    {!list.length && !(tasksLoading && !tasksData) && (
                      <div className="grid h-28 place-items-center rounded-xl border border-dashed border-neutral-300 px-4 text-center text-xs text-neutral-400">{tasks.length && visible.length === 0 ? "Nothing matches these filters" : dragging ? "Drop here" : s.id === "todo" && !tasks.length ? (admin ? "Add the first task with “New task”" : "Nothing here yet") : "Nothing here"}</div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {openId && <TaskDrawer taskId={openId} tick={tick} sprints={sprints} people={people} me={me} admin={admin} canAct={canAct} onClose={closeDrawer} onMove={(id, st) => performMove(id, st)} onChanged={refresh} onDelete={(t) => setModal({ kind: "delete-task", task: t })} />}

      {modal?.kind === "sprint" && <SprintModal sprint={modal.edit} hasActive={hasActive} onClose={() => setModal(null)} onSave={(i) => saveSprint(i, modal.edit)} />}
      {modal?.kind === "task" && sprint && <TaskModal sprints={sprints} sprintId={sprint.id} status={modal.status} people={people} onClose={() => setModal(null)} onSave={saveTask} />}
      {modal?.kind === "complete" && sprint && (
        <CompleteSprintModal
          sprint={sprint}
          others={otherOpen}
          openCount={counts.total - counts.done}
          onClose={() => setModal(null)}
          onConfirm={async (carryTo) => {
            await completeSprint(sprint.id, carryTo);
            setModal(null);
            if (carryTo) setPickedId(carryTo);
            refresh();
          }}
        />
      )}
      {modal?.kind === "delete-sprint" && sprint && (
        <ConfirmModal
          title={`Delete “${sprint.name}”?`}
          body={`This also deletes its ${counts.total} task${counts.total === 1 ? "" : "s"}. This can’t be undone.`}
          confirm="Delete sprint"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await deleteSprint(sprint.id);
            setModal(null);
            setPickedId(null);
            setSprints((l) => l?.filter((x) => x.id !== sprint.id));
          }}
        />
      )}
      {modal?.kind === "delete-task" && (
        <ConfirmModal
          title="Delete this task?"
          body={`“${modal.task.title}” and its comments will be gone for good.`}
          confirm="Delete task"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await deleteTask(modal.task.id);
            setModal(null);
            closeDrawer();
            refresh();
          }}
        />
      )}
    </main>
  );

  function setFilterReset() {
    setWho("all");
    setPriority("all");
    setQ("");
  }
}
