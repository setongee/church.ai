"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authStatus, login, setToken, setupAdmin } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { clearCache } from "@/lib/cache";

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
  const { setUser } = useAuth();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false); // already signed in on another device

  useEffect(() => {
    authStatus()
      .then((s) => setNeedsSetup(s.needsSetup))
      .catch(() => {
        setNeedsSetup(false);
        setError("Can’t reach the server. Check that the backend is running.");
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBlocked(false);
    setBusy(true);
    try {
      const r = needsSetup ? await setupAdmin({ name, email, password }) : await login(email, password);
      setToken(r.token);
      // Cached pages belong to whoever was signed in before; a different person starts clean.
      try {
        if (localStorage.getItem("rq-user") !== r.user._id) clearCache();
        localStorage.setItem("rq-user", r.user._id);
      } catch {}
      setUser(r.user);
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t sign in");
      setBlocked((err as { code?: string }).code === "ALREADY_SIGNED_IN");
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

        {error && (
          <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${blocked ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-700"}`}>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || needsSetup === null} className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-[#ffffff] transition hover:bg-orange-700 disabled:opacity-50">
          {busy ? "Please wait…" : needsSetup ? "Create admin account" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-neutral-400">You can only be signed in on one device at a time.</p>
    </main>
  );
}
