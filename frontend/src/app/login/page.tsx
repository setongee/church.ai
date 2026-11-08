"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authStatus, login, setToken, setupAdmin } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { clearCache } from "@/lib/cache";
import { isNetworkError, useOfflineStatus } from "@/lib/offline/offline";

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { setUser, goOffline } = useAuth();
  const net = useOfflineStatus();
  // The server can't be reached (no internet, or it is down): Present can still run on its own from this device.
  const [unreachable, setUnreachable] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Signed in on another device already: ask before signing that one out.
  const [other, setOther] = useState<{ device: string; lastSeenAt?: string } | null>(null);
  const reason = useSearchParams().get("reason");
  const replacedBy = useSearchParams().get("device");

  useEffect(() => {
    authStatus()
      .then((s) => setNeedsSetup(s.needsSetup))
      .catch(() => {
        setNeedsSetup(false);
        setUnreachable(true);
        setError("Can’t reach the server. Check that the backend is running.");
      });
  }, []);

  async function submit(e: React.FormEvent | null, takeOver = false) {
    e?.preventDefault();
    setError("");
    setOther(null);
    setBusy(true);
    try {
      const r = needsSetup ? await setupAdmin({ name, email, password }) : await login(email, password, takeOver);
      setToken(r.token);
      // Cached pages belong to whoever was signed in before; a different person starts clean.
      try {
        if (localStorage.getItem("rq-user") !== r.user._id) clearCache();
        localStorage.setItem("rq-user", r.user._id);
      } catch {}
      setUser(r.user);
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (err) {
      const e = err as { code?: string; device?: string; lastSeenAt?: string };
      if (e.code === "ALREADY_SIGNED_IN") setOther({ device: e.device || "another device", lastSeenAt: e.lastSeenAt });
      else {
        if (isNetworkError(err)) setUnreachable(true);
        setError(err instanceof Error ? err.message : "Couldn’t sign in");
      }
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-1px)] w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/logo.png" alt="FAFC" className="mx-auto mb-4 h-14 w-auto" />
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">FAFC Media Engine</h1>
        <p className="mt-1 text-sm text-neutral-500">{needsSetup ? "Welcome! Create the first admin account to get started." : "Sign in to continue."}</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6">
        {needsSetup && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required className={field} />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={needsSetup ? "new-password" : "current-password"} minLength={needsSetup ? 8 : undefined} required className={field} />
          {needsSetup && <span className="mt-1 block text-xs text-neutral-400">At least 8 characters.</span>}
        </label>

        {reason === "replaced" && !error && !other && (
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You were signed out because you signed in on {replacedBy || "another device"}. Sign in again to use this one.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {other && (
          <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p>
              You’re signed in on <b>{other.device}</b>
              {other.lastSeenAt ? ` (active ${new Date(other.lastSeenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})` : ""}. You can only be signed in on one device, so continuing <b>signs you out there</b> and anything unsaved on it, such as a stream you’re running, stops.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void submit(null, true)} disabled={busy} className="rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
                Sign out there and continue
              </button>
              <button type="button" onClick={() => setOther(null)} className="rounded-lg border border-amber-300 px-3.5 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100">
                Cancel
              </button>
            </div>
          </div>
        )}

        <button type="submit" disabled={busy || needsSetup === null} className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-[#ffffff] transition hover:bg-orange-700 disabled:opacity-50">
          {busy ? "Please wait…" : needsSetup ? "Create admin account" : "Sign in"}
        </button>
      </form>
      {(net.offline || unreachable) && (
        <div className="mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm text-amber-900">No connection? You can still run Present from the copy saved on this device, with no sign-in.</p>
          <button type="button" onClick={goOffline} className="w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-neutral-700">
            Use in offline mode
          </button>
        </div>
      )}
      <p className="mt-4 text-center text-xs text-neutral-400">Signing in on a new device signs you out of the old one.</p>
    </main>
  );
}
