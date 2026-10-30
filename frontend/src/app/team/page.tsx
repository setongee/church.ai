"use client";

import { useCallback, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Modal } from "@/components/present/ui";
import { useCached } from "@/lib/queries";
import { RosterCalendar } from "@/components/team/RosterCalendar";
import { MemberTable } from "@/components/team/MemberTable";
import { createUser, listUsers, type TeamUser } from "@/lib/team";

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900";

export default function TeamPage() {
  const { user: me } = useAuth();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false); // the add-member modal
  const [tab, setTab] = useState<"members" | "roster">("members");

  // Cached: the member list shows instantly and re-checks in the background (and after any change).
  const { data: usersData, reload, error: usersError } = useCached<TeamUser[]>(["users"], listUsers, { enabled: Boolean(me?.isAdmin) });
  const users = usersData ?? [];
  const load = useCallback(async () => void (await reload()), [reload]);
  const shownError = error || (usersError && !usersData ? usersError.message : "");

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let ok = false;
    await run(async () => {
      const r = await createUser({ name, email, phone: phone || undefined, password: password || undefined, isAdmin });
      if (r.password) setSecret({ name: r.user.name, password: r.password });
      const sent = [r.delivery.email.ok && "email", r.delivery.sms.ok && "text"].filter(Boolean).join(" and ");
      setNotice(sent ? `${r.user.name} was sent their login details by ${sent}.` : `${r.user.name} was added, but their login details couldn’t be sent (${r.delivery.email.error || r.delivery.sms.error}). Pass the password on yourself.`);
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setIsAdmin(false);
      ok = true;
    });
    setBusy(false);
    if (ok) setAdding(false);
  }

  if (me && !me.isAdmin) return <main className="mx-auto w-full max-w-8xl px-4 py-12 text-sm sm:px-6 lg:px-20 text-neutral-500">Only admins can manage the team.</main>;

  return (
    <main className="mx-auto w-full max-w-8xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Team</h1>
        {tab === "members" && (
          <button
            onClick={() => {
              setError("");
              setAdding(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700"
          >
            <Plus size={16} /> Add a team member
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Team" className="mt-5 inline-flex gap-1 rounded-full bg-neutral-100 p-1">
        {(
          [
            ["members", "Team members"],
            ["roster", "Team roster"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === k ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
            {label}
          </button>
        ))}
      </div>

      {shownError && !adding && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{shownError}</p>}
      {notice && <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
      {secret && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            Password for <b>{secret.name}</b>: <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono font-semibold">{secret.password}</code> — shown once, so pass it on now.
          </span>
          <span className="flex gap-2">
            <button onClick={() => navigator.clipboard?.writeText(secret.password)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold"><Copy size={13} /> Copy</button>
            <button onClick={() => setSecret(null)} className="text-xs font-semibold underline">Done</button>
          </span>
        </div>
      )}

      {adding && (
        <Modal title="Add a team member" onClose={() => !busy && setAdding(false)}>
          <form onSubmit={add} className="space-y-3">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required className={field} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className={field} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone for SMS (optional) — 0803…" className={field} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (leave empty to generate one)" minLength={8} className={field} />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> Admin (can manage the team and rosters)
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAdding(false)} disabled={busy} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button disabled={busy} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
                {busy ? "Adding & sending…" : "Add member"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {tab === "members" && <MemberTable users={users} me={me?._id} run={run} onSecret={setSecret} />}

      {tab === "roster" && (
        <div className="mt-6">
          <RosterCalendar />
        </div>
      )}
    </main>
  );
}
