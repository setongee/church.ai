"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSessionForService, getService } from "@/lib/api";
import type { ServiceDetail } from "@/lib/types";

const SESSION_TYPE_SUGGESTIONS = [
  "Prayer Session",
  "Message Session",
  "Fresh Fire Session",
];

export default function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<ServiceDetail | null>(null);
  const [title, setTitle] = useState("");
  const [preacher, setPreacher] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getService(id)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [id]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim() || !preacher.trim()) {
      setError("Title and preacher are both required.");
      return;
    }
    setLoading(true);
    try {
      const session = await createSessionForService(id, {
        title: title.trim(),
        preacher: preacher.trim(),
      });
      router.push(`/sessions/${session._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      setLoading(false);
    }
  }

  if (!detail) {
    return (
      <main className="mx-auto w-3xl px-6 py-12 text-sm text-neutral-400">
        Loading...
      </main>
    );
  }

  const { service, sessions } = detail;

  return (
    <main className="mx-auto w-6xl px-6 py-12">
      <Link
        href="/"
        className="text-xs text-neutral-400 hover:text-neutral-600"
      >
        &larr; All services
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
        {service.name}
      </h1>

      <form onSubmit={handleStart} className="mt-8 rounded-lg  bg-white p-6 ">
        <h2 className="text-base font-medium text-neutral-900">
          Start a new session
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Session title *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prayer Session"
              list="session-type-suggestions"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <datalist id="session-type-suggestions">
              {SESSION_TYPE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Preacher *
            </label>
            <input
              value={preacher}
              onChange={(e) => setPreacher(e.target.value)}
              placeholder="Pastor Jane Doe"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Starting..." : "Start streaming"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-base font-medium text-neutral-900">Sessions</h2>
        <ul className="mt-4 divide-y divide-neutral-200 rounded-lg bg-white">
          {sessions.length === 0 && (
            <li className="px-4 py-6 text-sm text-neutral-400">
              No sessions yet.
            </li>
          )}
          {sessions.map((s) => (
            <li key={s._id}>
              <button
                onClick={() => router.push(`/sessions/${s._id}`)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
              >
                <span>
                  <span className="block text-sm font-medium text-neutral-900">
                    {s.title}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {s.preacher}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.status === "live"
                      ? "bg-red-100 text-red-700"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {s.status === "live" ? "LIVE" : "Ended"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
