"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { changePassword, roleLabel } from "@/lib/auth";
import { myAssignments } from "@/lib/team";
import { useCached } from "@/lib/queries";

const card = "rounded-2xl bg-white p-5 sm:p-6";
const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900";
const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Who you are on the platform and the one thing you can change here: your password.
export default function ProfilePage() {
  const { user } = useAuth();
  const { data: mine } = useCached(["my-assignments"], myAssignments, { enabled: Boolean(user && !user.isAdmin) });
  if (!user) return null;
  const initials = user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const coming = (mine ?? []).filter((a) => a.date && a.date.slice(0, 10) >= today).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 sm:pt-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Profile</h1>

      <section className={card}>
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-xl font-semibold text-white">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-neutral-900">{user.name}</p>
            <p className="truncate text-sm text-neutral-500">{user.email}</p>
            {user.phone && <p className="text-sm text-neutral-500">{user.phone}</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {user.isAdmin && <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white">Admin</span>}
          {user.roles.map((r) => <span key={r} className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">{roleLabel(r)}</span>)}
          {!user.isAdmin && user.roles.length === 0 && <span className="text-sm text-neutral-400">No role yet — roles come from the services you’re rostered on.</span>}
        </div>
        <p className="mt-4 text-xs text-neutral-400">To change your name, email or phone, ask an admin.</p>
      </section>

      {!user.isAdmin && (
        <section className={card}>
          <h2 className="text-base font-semibold text-neutral-900">Your next services</h2>
          {coming.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">Nothing coming up.</p>
          ) : (
            <ul className="mt-2 divide-y divide-neutral-100">
              {coming.map((a) => (
                <li key={a.serviceId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{a.serviceName}</p>
                    <p className="text-xs text-neutral-500">{fmt(a.date!)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{a.roles.map((r) => <span key={r} className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">{roleLabel(r)}</span>)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <PasswordCard />

      <p className="text-sm text-neutral-500">
        Notifications, skins and the rest are in <Link href="/settings" className="font-semibold text-orange-700 hover:underline">Settings</Link>.
      </p>
    </main>
  );
}

function PasswordCard() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await changePassword(cur, next);
      setCur("");
      setNext("");
      setMsg({ ok: true, text: "Password changed." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn’t change it" });
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className={`${card} space-y-3`}>
      <h2 className="text-base font-semibold text-neutral-900">Change password</h2>
      <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" autoComplete="current-password" required className={field} />
      <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" minLength={8} required className={field} />
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      <button disabled={busy} className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50">{busy ? "Saving…" : "Update password"}</button>
    </form>
  );
}
