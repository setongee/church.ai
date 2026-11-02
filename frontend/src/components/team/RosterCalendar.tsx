"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { listServices } from "@/lib/api";
import { useCached } from "@/lib/queries";
import { TEAM_ROLES } from "@/lib/auth";
import { getRoster, type Roster } from "@/lib/team";
import type { Service } from "@/lib/types";

// Service dates are stored as UTC noon, so compare them as plain calendar days.
const dayKey = (iso: string) => iso.slice(0, 10);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtLong = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// The team roster by day: a calendar of the services done and coming up, and who is doing what on each one.
export function RosterCalendar() {
  // Both lists are cached: the calendar opens instantly and re-checks in the background.
  const { data: servicesData, error: servicesError } = useCached<Service[]>(["services"], listServices);
  const services = servicesData ?? null;
  const { data: rostersData } = useCached<Record<string, Roster>>(["team-rosters"], async () => {
    const list = await listServices();
    // Everyone's roster, so each service can show how many people are on it.
    const entries = await Promise.all(list.slice(0, 80).map((s) => getRoster(s._id).then((r) => [s._id, r] as const).catch(() => null)));
    return Object.fromEntries(entries.filter((e): e is readonly [string, Roster] => !!e));
  });
  const rosters = rostersData ?? {};
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);
  const error = servicesError && !servicesData ? servicesError.message : "";

  const today = localToday();
  const dated = useMemo(() => (services ?? []).filter((s) => s.date), [services]);
  const undated = (services ?? []).filter((s) => !s.date);
  const byDay = useMemo(() => {
    const m = new Map<string, Service[]>();
    for (const s of dated) m.set(dayKey(s.date!), [...(m.get(dayKey(s.date!)) ?? []), s]);
    return m;
  }, [dated]);

  // The month grid, weeks starting Monday.
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => (i < lead || i >= lead + daysInMonth ? null : i - lead + 1));
  const keyFor = (d: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const selectedService = services?.find((s) => s._id === selected) ?? null;
  const selectedRoster = selected ? rosters[selected] : undefined;
  const upcoming = dated.filter((s) => dayKey(s.date!) >= today).sort((a, b) => a.date!.localeCompare(b.date!));
  const monthServices = dated.filter((s) => dayKey(s.date!).startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`)).sort((a, b) => a.date!.localeCompare(b.date!));
  const peopleOn = (id: string) => new Set((rosters[id]?.assignments ?? []).map((a) => a.user._id)).size;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <section className="rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <CalendarDays size={18} className="text-orange-600" /> {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                const d = new Date();
                setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-100"
            >
              Today
            </button>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            const k = d ? keyFor(d) : "";
            const here = d ? (byDay.get(k) ?? []) : [];
            return (
              <div key={i} className={`min-h-16 rounded-xl p-1 sm:min-h-24 sm:p-1.5 text-left ${d ? (k === today ? "bg-orange-50" : "bg-neutral-50") : ""}`}>
                {d && <span className={`text-xs ${k === today ? "font-bold text-orange-700" : "text-neutral-400"}`}>{d}</span>}
                <div className="mt-1 space-y-1">
                  {here.map((s) => {
                    const past = k < today;
                    const on = selected === s._id;
                    return (
                      <button
                        key={s._id}
                        onClick={() => setSelected(s._id)}
                        title={`${s.name} · ${peopleOn(s._id)} on the roster`}
                        className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-semibold text-[#ffffff] ${past ? "bg-[#737373]" : "bg-orange-600"} ${on ? "ring-2 ring-neutral-900 ring-offset-1" : ""}`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-600" /> Upcoming</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-neutral-500" /> Done</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-50 ring-1 ring-orange-300" /> Today</span>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {services && dated.length === 0 && <p className="mt-4 text-sm text-neutral-400">No service has a date yet. Set one when you create a service, and it appears here.</p>}
      </section>

      {/* The roster for the chosen service */}
      <aside className="space-y-5">
        <section className="rounded-2xl bg-white p-5">
          {selectedService ? (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-600">{selectedService.date && dayKey(selectedService.date) < today ? "Done" : "Upcoming"}</p>
              <h3 className="mt-1 text-lg font-semibold text-neutral-900">{selectedService.name}</h3>
              <p className="text-sm text-neutral-500">{selectedService.date ? fmtLong(selectedService.date) : "No date set"}</p>
              <div className="mt-5 space-y-5">
                {/* The whole service first, then each session (only the jobs somebody has) */}
                {[{ id: null as string | null, title: selectedRoster?.sessions.length ? "Whole service" : "" }, ...(selectedRoster?.sessions ?? []).map((x) => ({ id: x.id as string | null, title: x.name }))].map((g) => {
                  const jobs = TEAM_ROLES.map((r) => ({ r, people: (selectedRoster?.assignments ?? []).filter((a) => a.role === r.id && (a.sessionId ?? null) === g.id) }));
                  const any = jobs.some((j) => j.people.length);
                  if (g.id && !any) return (
                    <div key={g.id}>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-orange-600">{g.title}</p>
                      <p className="text-sm text-neutral-300">Nobody yet</p>
                    </div>
                  );
                  return (
                    <div key={g.id ?? "all"} className="space-y-3">
                      {g.title && <p className="text-xs font-bold uppercase tracking-wider text-orange-600">{g.title}</p>}
                      {jobs.filter((j) => !g.id || j.people.length).map(({ r, people }) => (
                        <div key={r.id}>
                          <p className="mb-1.5 text-xs font-semibold text-neutral-500">{r.label}</p>
                          {people.length === 0 ? (
                            <p className="text-sm text-neutral-300">Nobody</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {people.map((a) => (
                                <span key={a.user._id} className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                                  {a.user.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              {selectedRoster?.note && <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">{selectedRoster.note}</p>}
              <Link href={`/services/${selectedService._id}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline">
                <ExternalLink size={14} /> Open the service to edit the roster
              </Link>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-neutral-400">Pick a service on the calendar to see who is on its roster.</p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">{monthServices.length ? `In ${month.toLocaleDateString(undefined, { month: "long" })}` : "Coming up"}</h3>
          <ul className="space-y-1.5">
            {(monthServices.length ? monthServices : upcoming.slice(0, 6)).map((s) => (
              <li key={s._id}>
                <button onClick={() => {
                    const d = new Date(s.date!);
                    setSelected(s._id);
                    setMonth(new Date(d.getUTCFullYear(), d.getUTCMonth(), 1));
                  }} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-neutral-50 ${selected === s._id ? "bg-orange-50" : ""}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-neutral-900">{s.name}</span>
                    <span className="block text-xs text-neutral-500">{new Date(s.date!).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">{peopleOn(s._id)} {peopleOn(s._id) === 1 ? "person" : "people"}</span>
                </button>
              </li>
            ))}
            {monthServices.length === 0 && upcoming.length === 0 && <li className="text-sm text-neutral-400">Nothing scheduled.</li>}
          </ul>
        </section>

        {undated.length > 0 && (
          <section className="rounded-2xl bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-neutral-900">No date yet</h3>
            <ul className="space-y-1.5">
              {undated.map((s) => (
                <li key={s._id}>
                  <button onClick={() => setSelected(s._id)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-neutral-50 ${selected === s._id ? "bg-orange-50" : ""}`}>
                    <span className="truncate font-medium text-neutral-900">{s.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{peopleOn(s._id)} on roster</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
