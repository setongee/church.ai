"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Radio, Square } from "lucide-react";
import { useCached } from "@/lib/queries";
import { getSocket } from "@/lib/socket";
import { roleLabel } from "@/lib/auth";
import { endService, liveNow, setLiveSession, startService, type LiveService } from "@/lib/live";

const since = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Service mode on the dashboard: the live service, who is doing what (the session running now highlighted), and, for admins and
// service managers, the buttons to start and end sessions and the service. Only people on the roster (and admins and managers)
// are shown a live service at all.
export function LiveServiceCard() {
  const { data, reload } = useCached<LiveService[]>(["live"], liveNow, { refetchInterval: 30_000, staleTime: 0 });
  useEffect(() => {
    const socket = getSocket();
    const onChange = () => void reload();
    socket.on("service:changed", onChange);
    return () => void socket.off("service:changed", onChange);
  }, [reload]);

  if (!data?.length) return null;
  return (
    <div className="space-y-4">
      {data.map((s) => (
        <ServiceBlock key={s.id} s={s} onChanged={() => void reload()} />
      ))}
    </div>
  );
}

function ServiceBlock({ s, onChanged }: { s: LiveService; onChanged: () => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const active = s.sessions.find((x) => x.id === s.activeSessionId);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
    setBusy("");
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-green-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 bg-[#16a34a] px-5 py-3 text-[#ffffff]">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ffffff] opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ffffff]" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <b>Service live · {s.name}</b>
          <span className="opacity-90"> · since {since(s.startedAt)}{active ? ` · ${active.name} in progress` : s.sessions.length ? " · no session running" : ""}</span>
        </p>
      </div>

      <div className="space-y-4 p-5">
        {s.mine.length > 0 && (
          <p className={`rounded-xl px-4 py-2.5 text-sm ${s.limitedForMe ? "bg-orange-50 text-orange-900" : "bg-neutral-50 text-neutral-600"}`}>
            You’re on <b>{s.mine.map((j) => `${roleLabel(j.role)}${j.session ? ` (${j.session})` : ""}`).join(" & ")}</b>.{" "}
            {s.limitedForMe ? "You can open only your job’s pages until it ends." : "You’ll be limited to your job’s pages when your session starts."}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {s.groups.map((g) => (
            <div key={g.id ?? "all"} className={`rounded-xl border p-4 ${g.active ? "border-green-300 bg-green-50/50" : "border-neutral-100"}`}>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{g.title}</p>
                {g.active && <span className="rounded-full bg-[#16a34a] px-2 py-0.5 text-[10px] font-bold uppercase text-[#ffffff]">Live</span>}
                {s.canControl && g.id && (
                  <button
                    onClick={() => run(g.id!, () => setLiveSession(s.id, g.active ? null : g.id))}
                    disabled={Boolean(busy)}
                    className={`ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${g.active ? "border border-neutral-300 text-neutral-700 hover:bg-neutral-50" : "bg-orange-600 text-[#ffffff] hover:bg-orange-700"}`}
                  >
                    {g.active ? <Square size={11} /> : <Play size={11} />} {busy === g.id ? "…" : g.active ? "End" : "Start"}
                  </button>
                )}
              </div>
              {g.jobs.length === 0 ? (
                <p className="text-sm text-neutral-300">Nobody yet</p>
              ) : (
                <ul className="space-y-1.5">
                  {g.jobs.map((j) => (
                    <li key={j.role} className="text-sm">
                      <span className="text-xs font-semibold text-neutral-500">{j.label}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {j.names.map((n) => (
                          <span key={n} className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                            {n}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {s.canControl && (
          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
            <button
              onClick={() => window.confirm(`End ${s.name}? Everyone is released and gets their normal access back.`) && run("end", () => endService(s.id))}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Square size={13} /> {busy === "end" ? "Ending…" : "End service"}
            </button>
            {s.sessions.length === 0 && <span className="text-xs text-neutral-400">This service has no sessions, so everyone on it is limited to their job for as long as it runs.</span>}
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </section>
  );
}

// On a service's own page: start it (admins and service managers), or see that it's live and jump to the dashboard to run it.
export function StartServiceButton({ serviceId, serviceName }: { serviceId: string; serviceName: string }) {
  const { data, reload } = useCached<LiveService[]>(["live"], liveNow, { staleTime: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = data?.find((x) => x.id === serviceId);
  const other = data?.find((x) => x.id !== serviceId); // only one service can be live at a time

  if (live) {
    return (
      <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-[#15803d]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ffffff] opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ffffff]" />
        </span>
        Service live · open on dashboard
      </Link>
    );
  }
  if (other) {
    return (
      <Link href="/dashboard" title="End it first, then you can start this one" className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-500 hover:text-orange-600">
        <Radio size={15} /> “{other.name}” is live
      </Link>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Start ${serviceName}? The people on its roster are told, and anyone on the whole service is limited to their job’s pages until you end it.`)) return;
          setBusy(true);
          setError("");
          try {
            await startService(serviceId);
            await reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn’t start the service");
          }
          setBusy(false);
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50"
      >
        <Radio size={15} /> {busy ? "Starting…" : "Start service"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
