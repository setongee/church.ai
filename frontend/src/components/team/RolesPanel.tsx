"use client";

import { useState } from "react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Modal } from "@/components/present/ui";
import { useCached } from "@/lib/queries";
import { ACCESS_INFO, type TeamRole } from "@/lib/auth";
import { createRole, deleteRole, listRoles, updateRole, type AppRole } from "@/lib/roles";

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900";
const ACCESS = Object.keys(ACCESS_INFO) as Exclude<TeamRole, "presenter">[];

// App-level roles: named sets of access a person keeps all the time (Admin is built in and opens everything).
export function RolesPanel() {
  const { data: roles, reload, error } = useCached<AppRole[]>(["roles"], listRoles);
  const [editing, setEditing] = useState<AppRole | "new" | null>(null);
  const [problem, setProblem] = useState("");

  async function remove(r: AppRole) {
    const who = r.members ? ` ${r.members} ${r.members === 1 ? "person has" : "people have"} it and will be left without a role.` : "";
    if (!window.confirm(`Delete the “${r.name}” role?${who}`)) return;
    setProblem("");
    try {
      await deleteRole(r._id);
      await reload();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-neutral-500">
          A role is what someone is across the whole app. Choose what it opens, then give it to people from the Team members tab. A <b>service assignment</b> is different: it’s a job on one service and only opens things around it.
        </p>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
          <Plus size={16} /> New role
        </button>
      </div>
      {(problem || error) && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem || error?.message}</p>}

      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        <li className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-neutral-900"><ShieldCheck size={16} className="text-orange-600" /> Admin <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Built in</span></p>
          <p className="mt-1 text-sm text-neutral-500">Everything: the team, roles, Church Profile and approving work sent for review.</p>
        </li>
        {(roles ?? []).map((r) => (
          <li key={r._id} className="rounded-2xl bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{r.name}</p>
                {r.description && <p className="text-sm text-neutral-500">{r.description}</p>}
              </div>
              <span className="flex shrink-0 gap-1">
                <button onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100"><Pencil size={15} /></button>
                <button onClick={() => void remove(r)} aria-label={`Delete ${r.name}`} className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </span>
            </div>
            <p className="mt-3 flex flex-wrap gap-1">
              {r.access.length ? r.access.filter((a) => a !== "presenter").map((a) => <span key={a} className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">{ACCESS_INFO[a as keyof typeof ACCESS_INFO]?.label ?? a}</span>) : <span className="text-xs text-neutral-400">Only what everyone has</span>}
            </p>
            <p className="mt-2 text-xs text-neutral-400">{r.members} {r.members === 1 ? "person" : "people"}</p>
          </li>
        ))}
        {roles && !roles.length && <li className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-400 md:col-span-2">No roles yet. Create one, like “Social Media Manager”.</li>}
      </ul>

      {editing && <RoleDialog role={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </div>
  );
}

function RoleDialog({ role, onClose, onSaved }: { role: AppRole | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [access, setAccess] = useState<TeamRole[]>(role?.access ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (a: TeamRole) => setAccess((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = { name, description, access };
      if (role) await updateRole(role._id, input);
      else await createRole(input);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <Modal title={role ? `Edit ${role.name}` : "New role"} guard onClose={() => !busy && onClose()}>
      <form onSubmit={save} className="space-y-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name, e.g. Design Lead" required className={field} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What they do (optional)" className={field} />
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Access</p>
          <p className="mb-2 text-xs text-neutral-400">Everyone can already use Present, Image Studio (kept on their device until approved), and look at the calendar and tasks, and chat.</p>
          <div className="space-y-2">
            {ACCESS.map((a) => (
              <label key={a} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 ${access.includes(a) ? "border-orange-400 bg-orange-50" : "border-neutral-200"}`}>
                <input type="checkbox" checked={access.includes(a)} onChange={() => toggle(a)} className="mt-1" />
                <span>
                  <span className="block text-sm font-medium text-neutral-900">{ACCESS_INFO[a].label}</span>
                  <span className="block text-xs text-neutral-500">{ACCESS_INFO[a].opens}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
          <button disabled={busy} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">{busy ? "Saving…" : "Save role"}</button>
        </div>
      </form>
    </Modal>
  );
}
