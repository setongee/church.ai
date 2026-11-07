"use client";

import { useEffect, useState } from "react";
import { CalendarDays, KeyRound, ListChecks, MoreHorizontal, Pencil, ShieldCheck, Trash2, UserCheck, UserX, UsersRound } from "lucide-react";
import { Modal } from "@/components/present/ui";
import { useCached } from "@/lib/queries";
import { listServices } from "@/lib/api";
import { listSprints, listTasks, updateTask, type Task } from "@/lib/board";
import { roleLabel, TEAM_ROLES, type TeamRole } from "@/lib/auth";
import { listRoles } from "@/lib/roles";
import { assignMemberToRoster, deleteUser, getRoster, memberRoster, signOutUser, updateUser, type TeamUser } from "@/lib/team";

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900";
const ghost = "rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50";
const solid = "rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const HUES = [18, 32, 150, 200, 262, 330];
const hue = (id: string) => HUES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];

function ago(iso: string | null) {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "No date");

type Dialog = { kind: "edit" | "role" | "roster" | "task" | "viewRoster"; user: TeamUser } | null;

export function MemberTable({ users, me, run, onSecret }: { users: TeamUser[]; me?: string; run: (fn: () => Promise<unknown>) => Promise<void>; onSecret: (s: { name: string; password: string }) => void }) {
  const [menu, setMenu] = useState<{ user: TeamUser; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const openMenu = (user: TeamUser, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ user, x: Math.max(8, r.right - 220), y: Math.min(r.bottom + 4, window.innerHeight - 340) });
  };
  const pick = (kind: NonNullable<Dialog>["kind"], user: TeamUser) => {
    setMenu(null);
    setDialog({ kind, user });
  };

  return (
    <>
      <div className="mt-6 overflow-x-auto rounded-2xl bg-white">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {["Full name", "Email", "Phone", "Last signed in", "Status", "Assignments", "Role", "Actions"].map((h, i) => (
                <th key={i} className="whitespace-nowrap px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u._id === me;
              return (
                <tr key={u._id} className={`border-b border-neutral-50 last:border-0 ${u.active ? "" : "opacity-60"}`}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#ffffff]" style={{ background: `hsl(${hue(u._id)} 60% 45%)` }}>{initials(u.name)}</span>
                      <span className="font-semibold text-neutral-900">
                        {u.name} {self && <span className="text-xs font-medium text-neutral-400">(you)</span>}
                        {u.isAdmin && <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Admin</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{u.phone || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{ago(u.lastSeenAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {!u.active ? <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600">Suspended</span> : u.signedIn ? <span className="text-xs font-semibold text-green-600">● Signed in</span> : <span className="text-xs text-neutral-400">Not signed in</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => pick("viewRoster", u)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-orange-300 hover:text-orange-700"><CalendarDays size={13} /> View</button>
                  </td>
                  <td className="px-4 py-3">
                    {u.isAdmin ? <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-[11px] font-bold text-white">Admin</span> : u.appRole ? <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">{u.appRole.name}</span> : <span className="text-xs text-neutral-400">None</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={(e) => openMenu(u, e.currentTarget)} aria-label={`Actions for ${u.name}`} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100"><MoreHorizontal size={18} /></button>
                  </td>
                </tr>
              );
            })}
            {!users.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-400">No team members yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div role="menu" style={{ left: menu.x, top: menu.y }} className="fixed z-50 w-56 overflow-hidden rounded-xl border border-neutral-100 bg-white p-1.5 shadow-xl">
            {(() => {
              const u = menu.user;
              const self = u._id === me;
              const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50";
              return (
                <>
                  <button role="menuitem" className={item} onClick={() => pick("edit", u)}><Pencil size={15} /> Edit member</button>
                  <button role="menuitem" className={item} onClick={() => pick("task", u)}><ListChecks size={15} /> Assign to a task</button>
                  <button role="menuitem" className={item} onClick={() => pick("roster", u)}><UsersRound size={15} /> Assign to a service</button>
                  <button role="menuitem" className={item} onClick={() => pick("role", u)}><ShieldCheck size={15} /> Assign a role</button>
                  <button role="menuitem" className={item} onClick={() => { setMenu(null); void run(async () => { const r = await updateUser(u._id, { resetPassword: true }); if (r.password) onSecret({ name: u.name, password: r.password }); }); }}><KeyRound size={15} /> Reset password</button>
                  {!self && (
                    <>
                      <button role="menuitem" className={item} onClick={() => { setMenu(null); void run(() => updateUser(u._id, { active: !u.active })); }}>{u.active ? <UserX size={15} /> : <UserCheck size={15} />} {u.active ? "Suspend" : "Unsuspend"}</button>
                      <button role="menuitem" className={`${item} text-red-600 hover:bg-red-50`} onClick={() => { setMenu(null); if (window.confirm(`Remove ${u.name} from the team?`)) void run(() => deleteUser(u._id)); }}><Trash2 size={15} /> Delete</button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}

      {dialog?.kind === "edit" && <EditDialog user={dialog.user} self={dialog.user._id === me} run={run} onClose={() => setDialog(null)} />}
      {dialog?.kind === "role" && <RoleDialog user={dialog.user} run={run} onClose={() => setDialog(null)} />}
      {dialog?.kind === "roster" && <AssignRosterDialog user={dialog.user} run={run} onClose={() => setDialog(null)} />}
      {dialog?.kind === "task" && <TaskDialog user={dialog.user} run={run} onClose={() => setDialog(null)} />}
      {dialog?.kind === "viewRoster" && <ViewRosterDialog user={dialog.user} onClose={() => setDialog(null)} />}
    </>
  );
}

type RunProps = { run: (fn: () => Promise<unknown>) => Promise<void>; onClose: () => void };

function EditDialog({ user, self, run, onClose }: RunProps & { user: TeamUser; self: boolean }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Edit member" guard onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await run(() => updateUser(user._id, { name, email, phone }));
          setBusy(false);
          onClose();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required className={field} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className={field} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={field} />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {user.signedIn && !self ? <button type="button" onClick={() => void run(() => signOutUser(user._id)).then(onClose)} className="text-xs font-semibold text-neutral-500 underline">Sign them out of their device</button> : <span />}
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className={ghost}>Cancel</button>
            <button disabled={busy} className={solid}>Save</button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function RoleDialog({ user, run, onClose }: RunProps & { user: TeamUser }) {
  const { data: roles } = useCached(["roles"], listRoles);
  const [value, setValue] = useState<string>(user.isAdmin ? "admin" : (user.appRole?._id ?? ""));
  const options = [
    { id: "", label: "No role", hint: "Only what everyone has, plus any service assignments" },
    { id: "admin", label: "Admin", hint: "Everything: the team, roles, Church Profile and approving work" },
    ...(roles ?? []).map((r) => ({ id: r._id, label: r.name, hint: r.description || r.access.filter((a) => a !== "presenter").map((a) => roleLabel(a)).join(", ") || "Only what everyone has" })),
  ];
  return (
    <Modal title={`Assign a role to ${user.name}`} onClose={onClose}>
      <div className="space-y-2">
        <p className="text-sm text-neutral-500">Their role across the whole app. Service assignments are added on top while a service is on.</p>
        {options.map((r) => (
          <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 ${value === r.id ? "border-orange-400 bg-orange-50" : "border-neutral-200"}`}>
            <input type="radio" name="role" checked={value === r.id} onChange={() => setValue(r.id)} />
            <span><span className="block text-sm font-medium text-neutral-900">{r.label}</span><span className="block text-xs text-neutral-500">{r.hint}</span></span>
          </label>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className={ghost}>Cancel</button>
          <button onClick={async () => { await run(() => updateUser(user._id, { appRoleId: value })); onClose(); }} className={solid}>Save role</button>
        </div>
      </div>
    </Modal>
  );
}

function AssignRosterDialog({ user, run, onClose }: RunProps & { user: TeamUser }) {
  const { data: services } = useCached(["services"], listServices);
  const [serviceId, setServiceId] = useState("");
  const [role, setRole] = useState<TeamRole>("presenter");
  const [sessionId, setSessionId] = useState(""); // "" = the whole service
  // The service's sessions (Praise & Worship, Word, ...), for choosing which part this job is for.
  const { data: roster } = useCached(["roster", serviceId], () => getRoster(serviceId), { enabled: Boolean(serviceId) });
  const sessions = serviceId ? (roster?.sessions ?? []) : [];
  return (
    <Modal title={`Assign ${user.name} to a service`} onClose={onClose}>
      <div className="space-y-3">
        <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSessionId(""); }} className={field}>
          <option value="">Choose a service…</option>
          {(services ?? []).map((s) => <option key={s._id} value={s._id}>{s.name}{s.date ? ` — ${day(s.date)}` : ""}</option>)}
        </select>
        <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!serviceId} className={field} aria-label="Which part of the service">
          <option value="">Whole service{sessions.length ? " (every session)" : ""}</option>
          {sessions.map((x) => <option key={x.id} value={x.id}>{x.name} only</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value as TeamRole)} className={field} aria-label="Their job">
          {TEAM_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {serviceId && !sessions.length && <p className="text-xs text-neutral-400">This service has no sessions yet. Add some (like Praise &amp; Worship, Word) on its Roster tab to give jobs for one part of it.</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={ghost}>Cancel</button>
          <button disabled={!serviceId} onClick={async () => { await run(() => assignMemberToRoster(user._id, { serviceId, role, sessionId: sessionId || null })); onClose(); }} className={solid}>Assign</button>
        </div>
      </div>
    </Modal>
  );
}

function TaskDialog({ user, run, onClose }: RunProps & { user: TeamUser }) {
  const { data: sprints } = useCached(["sprints"], listSprints);
  const open = (sprints ?? []).filter((s) => s.status !== "completed");
  const [sprintId, setSprintId] = useState("");
  const current = sprintId || open.find((s) => s.status === "active")?.id || open[0]?.id || "";
  const { data: tasks, set } = useCached<Task[]>(["tasks", current], () => listTasks(current), { enabled: Boolean(current) });
  const toggle = async (t: Task) => {
    const has = t.assignees.some((a) => a.id === user._id);
    const ids = has ? t.assignees.filter((a) => a.id !== user._id).map((a) => a.id) : [...t.assignees.map((a) => a.id), user._id];
    await run(async () => {
      const next = await updateTask(t.id, { assignees: ids });
      set((list) => (list ?? []).map((x) => (x.id === t.id ? next : x)));
    });
  };
  return (
    <Modal title={`Assign ${user.name} to a task`} onClose={onClose}>
      <div className="space-y-3">
        <select value={current} onChange={(e) => setSprintId(e.target.value)} className={field}>
          {!open.length && <option value="">No open sprints</option>}
          {open.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "active" ? " (active)" : ""}</option>)}
        </select>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {(tasks ?? []).map((t) => {
            const has = t.assignees.some((a) => a.id === user._id);
            return (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-3.5 py-2.5 hover:bg-neutral-50">
                  <input type="checkbox" checked={has} onChange={() => void toggle(t)} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-neutral-900">{t.title}</span><span className="block text-xs text-neutral-500">{t.assignees.map((a) => a.name).join(", ") || "Nobody yet"}</span></span>
                </label>
              </li>
            );
          })}
          {tasks && !tasks.length && <li className="py-6 text-center text-sm text-neutral-400">No tasks in this sprint.</li>}
        </ul>
        <div className="flex justify-end"><button onClick={onClose} className={solid}>Done</button></div>
      </div>
    </Modal>
  );
}

function ViewRosterDialog({ user, onClose }: { user: TeamUser; onClose: () => void }) {
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const { data, error } = useCached(["member-roster", user._id], () => memberRoster(user._id));
  const rows = data?.[tab] ?? [];
  return (
    <Modal title={`${user.name} — service assignments`} onClose={onClose}>
      <div role="tablist" className="inline-flex gap-1 rounded-full bg-neutral-100 p-1">
        {([["upcoming", "Upcoming / Active"], ["history", "History"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === k ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>{label}{data ? ` (${data[k].length})` : ""}</button>
        ))}
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.serviceId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 px-3.5 py-3">
            <span><span className="block text-sm font-semibold text-neutral-900">{r.serviceName}</span><span className="block text-xs text-neutral-500">{day(r.date)}</span></span>
            <span className="flex flex-wrap gap-1">{r.items.map((it, i) => <span key={i} className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">{roleLabel(it.role)}{it.session ? ` · ${it.session}` : ""}</span>)}</span>
          </li>
        ))}
        {data && !rows.length && <li className="py-8 text-center text-sm text-neutral-400">{tab === "upcoming" ? "Not on any current roster." : "No past services yet."}</li>}
      </ul>
    </Modal>
  );
}
