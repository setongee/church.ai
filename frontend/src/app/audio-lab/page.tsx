"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getService, listAudioMerges, listServices } from "@/lib/api";
import { AudioLabPanel } from "@/components/AudioLabPanel";
import { Kpi } from "@/components/analytics/Charts";
import { useCached } from "@/lib/queries";
import type { AudioMerge, Service, Session } from "@/lib/types";

const select = "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-500 disabled:opacity-50";

// Audio Lab from anywhere: choose a service and one of its sessions, then cut and stitch it.
export default function AudioLabPage() {
  // Both lists are cached: the page opens instantly and re-checks in the background.
  const { data: servicesData, error: servicesError } = useCached<Service[]>(["services"], listServices);
  const services = servicesData ?? (servicesError ? [] : null);
  const [serviceId, setServiceId] = useState("");
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const { data: recentData } = useCached<AudioMerge[]>(["audio-merges"], listAudioMerges);
  const recent = useMemo(() => recentData ?? [], [recentData]);
  const [now] = useState(() => Date.now()); // when the page opened, for "this week"


  function pickService(id: string) {
    setServiceId(id);
    setSessionId("");
    setSessions(null);
    if (!id) return;
    getService(id)
      .then((d) => setSessions(d.sessions.filter((s) => s.status === "ended")))
      .catch(() => setSessions([]));
  }

  const session = sessions?.find((s) => s._id === sessionId);

  // Headline numbers from the cuts made so far.
  const kpis = useMemo(() => {
    const done = recent.filter((m) => m.status === "done");
    const week = 7 * 86400000;
    const inWeek = (m: AudioMerge, from: number, to: number) => {
      const t = new Date(m.createdAt).getTime();
      return t >= now - to && t < now - from;
    };
    const seconds = done.reduce((n, m) => n + (m.durationSec ?? 0), 0);
    const sessionIds = new Set(done.map((m) => (typeof m.session === "string" ? m.session : m.session._id)));
    return {
      cuts: done.length,
      thisWeek: done.filter((m) => inWeek(m, 0, week)).length,
      lastWeek: done.filter((m) => inWeek(m, week, 2 * week)).length,
      audio: seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`,
      moments: done.reduce((n, m) => n + m.segments.length, 0),
      sessions: sessionIds.size,
      inProgress: recent.filter((m) => m.status !== "done" && m.status !== "error").length,
    };
  }, [recent, now]);

  async function openRecent(m: AudioMerge) {
    const sid = typeof m.session === "string" ? m.session : m.session._id;
    const svcId = typeof m.session === "object" ? m.session.service : undefined;
    if (svcId) {
      setServiceId(svcId);
      const d = await getService(svcId).catch(() => null);
      if (d) setSessions(d.sessions.filter((s) => s.status === "ended"));
    }
    setSessionId(sid);
  }

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-20 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Audio Lab</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">
        Cut and stitch the right parts of a message into one viral-ready audio. Ask for a theme in your own words, and the AI reads the whole message to find every part that truly speaks to it.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Cuts made" value={kpis.cuts} />
        <Kpi label="This week" value={kpis.thisWeek} prev={kpis.lastWeek} />
        <Kpi label="Audio produced" value={kpis.audio} />
        <Kpi label="Moments picked" value={kpis.moments} />
        <Kpi label="Sessions covered" value={kpis.sessions} />
      </div>
      {kpis.inProgress > 0 && <p className="mt-3 text-xs font-medium text-orange-700">{kpis.inProgress} {kpis.inProgress === 1 ? "cut is" : "cuts are"} still being made…</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <select value={serviceId} onChange={(e) => pickService(e.target.value)} className={select} aria-label="Service">
          <option value="">{services ? "Choose a service…" : "Loading…"}</option>
          {(services ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!serviceId || !sessions} className={select} aria-label="Session">
          <option value="">{!serviceId ? "Choose a session…" : !sessions ? "Loading…" : sessions.length === 0 ? "No finished sessions in this service" : "Choose a session…"}</option>
          {(sessions ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {s.title} — {s.preacher}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6">
        {session ? (
          <>
            <p className="mb-4 text-sm text-neutral-500">
              Working on <span className="font-medium text-neutral-800">{session.title}</span> ·{" "}
              <Link href={`/sessions/${session._id}`} className="underline hover:text-neutral-800">
                open session
              </Link>
            </p>
            <AudioLabPanel key={session._id} sessionId={session._id} hasAudio={!!session.audioUrl} />
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">Pick a service and a session to start.</div>
            {recent.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-neutral-900">Recent cuts</h2>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  {recent
                    .filter((m) => m.status === "done")
                    .map((m) => (
                      <li key={m._id}>
                        <button type="button" onClick={() => openRecent(m)} className="h-full w-full rounded-xl bg-white p-6 text-left hover:bg-neutral-50">
                          <span className="block truncate text-sm font-medium text-neutral-900">{m.title}</span>
                          <span className="block truncate text-xs text-neutral-500">
                            {typeof m.session === "object" ? m.session.title : ""} · {m.prompt || "Best moments"}
                          </span>
                          <span className="mt-6 block text-xs text-neutral-400">
                            Created {new Date(m.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
