"use client";

import { useCallback, useEffect, useState } from "react";
import { getService, listServices } from "@/lib/api";
import type { Service, Session } from "@/lib/types";
import type { AppScope } from "@/lib/present";

const KEY = "present-app-scope";
const sel = "h-9 max-w-56 rounded-xl border border-neutral-200 bg-white px-2.5 text-sm text-neutral-800 outline-none focus:border-orange-400 disabled:opacity-50";

// Which service and session the "From the app" quotes / prayers come from, so they're never all shown at
// once. It remembers the choice, and starts on the newest session so something useful is already there.
export function useAppScope() {
  const [services, setServices] = useState<Service[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [scope, setScope] = useState<AppScope | null>(null);

  const loadSessions = useCallback(async (serviceId: string) => {
    const d = await getService(serviceId);
    const list = [...d.sessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    setSessions(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const all = await listServices();
        setServices(all);
        let saved: AppScope | null = null;
        try {
          saved = JSON.parse(localStorage.getItem(KEY) || "null");
        } catch {}
        const serviceId = saved && all.some((s) => s._id === saved!.service) ? saved.service : all[0]?._id;
        if (!serviceId) return setScope({ service: "", session: "" });
        const list = await loadSessions(serviceId);
        // Keep a remembered session if it still exists; otherwise the newest one.
        const session = saved?.service === serviceId && (saved.session === "" || list.some((s) => s._id === saved!.session)) ? saved.session : (list[0]?._id ?? "");
        setScope({ service: serviceId, session });
      } catch {
        setScope({ service: "", session: "" });
      }
    })();
  }, [loadSessions]);

  const change = useCallback(
    async (next: Partial<AppScope>) => {
      const service = next.service ?? scope?.service ?? "";
      let session = next.session ?? scope?.session ?? "";
      if (next.service !== undefined && next.service !== scope?.service) {
        const list = await loadSessions(service).catch(() => []);
        session = list[0]?._id ?? ""; // a new service starts on its newest session
      }
      const value = { service, session };
      setScope(value);
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {}
    },
    [scope, loadSessions],
  );

  return { services, sessions, scope, change };
}

export function SessionScope({ services, sessions, scope, onChange }: { services: Service[]; sessions: Session[]; scope: AppScope | null; onChange: (s: Partial<AppScope>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={scope?.service ?? ""} onChange={(e) => onChange({ service: e.target.value })} disabled={!services.length} className={sel} aria-label="Service">
        {!services.length && <option value="">No services</option>}
        {services.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
      </select>
      <select value={scope?.session ?? ""} onChange={(e) => onChange({ session: e.target.value })} disabled={!scope?.service} className={sel} aria-label="Session">
        <option value="">All sessions in this service</option>
        {sessions.map((s) => (
          <option key={s._id} value={s._id}>
            {s.title}
            {s.preacher ? ` — ${s.preacher}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
