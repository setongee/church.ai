"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { activityFeed, type ActivityEvent, type ActivityFeed, type ActivityRange } from "@/lib/chat";
import { getSocket } from "@/lib/socket";

const KINDS: { id: string; label: string; tone: string }[] = [
  { id: "present", label: "Presenting", tone: "bg-purple-100 text-purple-800" },
  { id: "design", label: "Design", tone: "bg-sky-100 text-sky-800" },
  { id: "content", label: "Content", tone: "bg-orange-100 text-orange-800" },
  { id: "audio", label: "Audio", tone: "bg-emerald-100 text-emerald-800" },
  { id: "publish", label: "Published", tone: "bg-rose-100 text-rose-800" },
  { id: "task", label: "Tasks", tone: "bg-indigo-100 text-indigo-800" },
  { id: "service", label: "Services", tone: "bg-neutral-200 text-neutral-800" },
];
const tone = (k: string) => KINDS.find((x) => x.id === k)?.tone ?? "bg-neutral-100 text-neutral-700";
const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

// What the team is doing right now: a live feed of what each person makes, edits, schedules and publishes.
export default function ActivityPage() {
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [range, setRange] = useState<ActivityRange | "">("");
  const [actor, setActor] = useState("");
  const [kind, setKind] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    activityFeed(range, actor, kind)
      .then((f) => (setFeed(f), setError("")))
      .catch((e) => setError(e.message));
  }, [range, actor, kind]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  // New events arrive over the socket.
  useEffect(() => {
    const socket = getSocket();
    const onNew = (e: ActivityEvent) => {
      if ((actor && e.actor !== actor) || (kind && e.kind !== kind)) return;
      setFeed((f) => {
        if (!f) return f;
        const rest = f.events.filter((x) => x.id !== e.id);
        const team = f.team.map((t) => (t.id === e.actor ? { ...t, last: { text: e.text, at: e.at, count: (t.last?.count ?? 0) + 1 } } : t));
        return { ...f, events: [e, ...rest].slice(0, 300), team };
      });
    };
    socket.on("activity:new", onNew);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("activity:new", onNew);
    };
  }, [actor, kind]);

  const ranges = useMemo(() => [...(feed?.live ? [["live", "This service"] as const] : []), ["1h", "Last hour"] as const, ["today", "Today"] as const, ["7d", "Last 7 days"] as const], [feed?.live]);
  const active = (feed?.range ?? "1h") as ActivityRange;

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-20 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Live activity</h1>
          <p className="text-sm text-neutral-500">What each team member is doing, as it happens.</p>
        </div>
        {feed?.live ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3.5 py-1.5 text-sm font-semibold text-red-700">
            <Radio size={15} className="animate-pulse" /> Live now · {feed.live.scheduleName || "service"} · since {new Date(feed.live.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-sm font-medium text-neutral-500">No service is live</span>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* The team, with what each person did last */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Team</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {feed?.team.map((t) => (
            <li key={t.id}>
              <button onClick={() => setActor(actor === t.id ? "" : t.id)} aria-pressed={actor === t.id} className={`flex h-full w-full items-start gap-3 rounded-2xl p-3.5 text-left transition ${actor === t.id ? "bg-orange-50 ring-2 ring-orange-300" : "bg-white hover:bg-neutral-50"}`}>
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700">
                  {initials(t.name)}
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${t.online ? "bg-green-500" : "bg-neutral-300"}`} title={t.online ? "Signed in" : "Not signed in"} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-neutral-900">{t.name}</span>
                  <span className="line-clamp-2 block text-xs text-neutral-500">{t.last ? `${t.last.text} · ${ago(t.last.at, now)}` : t.online ? "Signed in — nothing yet" : "No activity"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Time period" className="inline-flex gap-1 rounded-full bg-neutral-100 p-1">
          {ranges.map(([id, label]) => (
            <button key={id} onClick={() => setRange(id)} aria-pressed={active === id} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active === id ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(kind === k.id ? "" : k.id)} aria-pressed={kind === k.id} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${kind === k.id ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* The feed */}
      <section className="rounded-2xl bg-white p-2">
        {!feed ? (
          <p className="p-8 text-center text-sm text-neutral-400">Loading…</p>
        ) : feed.events.length === 0 ? (
          <p className="p-10 text-center text-sm text-neutral-400">Nothing yet in this period{actor || kind ? " for this filter" : ""}. New activity appears here the moment it happens.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {feed.events.map((e) => {
              const body = (
                <>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700">{initials(e.actorName || "?")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-800">
                      <b className="text-neutral-900">{e.actorName || "Someone"}</b> {e.text.charAt(0).toLowerCase() + e.text.slice(1)}
                      {e.count > 1 && <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600">×{e.count}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-neutral-400">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone(e.kind)}`}>{KINDS.find((k) => k.id === e.kind)?.label ?? e.kind}</span>
                      {ago(e.at, now)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={e.id}>
                  {e.href ? (
                    <Link href={e.href} className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-neutral-50">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
