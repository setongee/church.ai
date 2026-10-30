"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { canOpen, roleLabel } from "@/lib/auth";
import { myAssignments, type Assignment } from "@/lib/team";
import { useCached } from "@/lib/queries";
import { flashElement, queryParam } from "@/lib/deeplink";
import { getDashboard, type DashService, type Dashboard as DashboardData } from "@/lib/dashboard";
import { useChat } from "./chat/ChatProvider";
import { KpiRow, MyTasks, NeedsAttention, SprintCard, ServicesCard, UpcomingPosts } from "./dashboard/DashboardWidgets";

// Service dates are stored as UTC noon, so compare them as plain calendar days.
const dayKey = (iso: string) => iso.slice(0, 10);
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);

type Mark = { id: string; title: string; kind: "service" | "task" | "post"; href: string };
const KIND_BG = { service: "#ea580c", task: "#2563eb", post: "#7c3aed" } as const;
const MAX_PER_DAY = 3;

// The landing page: the numbers that matter, a calendar of what's happening (services, task deadlines, posts going out),
// your tasks, the flags that need someone, and the next few services. Profile and password live on /profile.
export function Dashboard() {
  const { user } = useAuth();
  const { unread: chatUnread, mentioned: chatMentioned } = useChat();
  const { data: dash, error: dashErr } = useCached<DashboardData>(["dashboard"], getDashboard, { staleTime: 60_000, refetchInterval: 60_000 });
  // Admins can't be rostered, so only the others need their assignments.
  const { data: mine } = useCached<Assignment[]>(["my-assignments"], myAssignments, { enabled: Boolean(user && !user.isAdmin) });
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // A notification can link to a service (?service=ID): flash it in the list.
  useEffect(() => {
    const id = queryParam("service");
    if (id && dash) flashElement(`service-${id}`);
  }, [dash]);

  const today = localKey(new Date());
  const isStaff = Boolean(user?.isAdmin || user?.roles.includes("manager"));
  const canSeeServices = Boolean(user && canOpen(user, "/services"));

  // The services this person cares about: all of them for admins/managers, otherwise the ones they're rostered on.
  const services = useMemo<DashService[]>(() => (isStaff ? dash?.services?.calendar ?? [] : (mine ?? []).map((a) => ({ id: a.serviceId, name: a.serviceName, date: a.date }))), [isStaff, dash, mine]);
  const topServices = useMemo<DashService[]>(() => {
    if (isStaff) return dash?.services?.top ?? [];
    const dated = services.filter((s) => s.date);
    const coming = dated.filter((s) => dayKey(s.date!) >= today).sort((a, b) => a.date!.localeCompare(b.date!));
    const gone = dated.filter((s) => dayKey(s.date!) < today).sort((a, b) => b.date!.localeCompare(a.date!));
    return [...coming, ...gone, ...services.filter((s) => !s.date)].slice(0, 5);
  }, [isStaff, dash, services, today]);
  const servicesStat = useMemo(() => {
    if (isStaff && dash?.services) {
      const n = dash.services.next?.date ? daysBetween(today, dayKey(dash.services.next.date)) : null;
      return { total: dash.services.total, hint: n === null ? "None coming up" : `Next ${n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}` };
    }
    if (!isStaff && mine) {
      const coming = mine.filter((a) => a.date && dayKey(a.date) >= today).sort((a, b) => a.date!.localeCompare(b.date!));
      const n = coming[0]?.date ? daysBetween(today, dayKey(coming[0].date)) : null;
      return { total: mine.length, hint: n === null ? "None coming up" : `Next ${n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}` };
    }
    return null;
  }, [isStaff, dash, mine, today]);

  const marks = useMemo(() => {
    const m = new Map<string, Mark[]>();
    const add = (k: string, mark: Mark) => m.set(k, [...(m.get(k) ?? []), mark]);
    for (const s of services) if (s.date) add(dayKey(s.date), { id: s.id, title: s.name, kind: "service", href: canSeeServices ? `/services/${s.id}` : "/dashboard" });
    for (const t of dash?.calendar?.tasks ?? []) add(localKey(new Date(t.date)), { id: t.id, title: t.title, kind: "task", href: `/board?task=${t.id}` });
    for (const p of dash?.calendar?.posts ?? []) add(localKey(new Date(p.date)), { id: p.id, title: p.title, kind: "post", href: "/calendar" });
    return m;
  }, [services, dash, canSeeServices]);

  if (!user) return null;

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => (i < lead || i >= lead + daysInMonth ? null : i - lead + 1));
  const keyFor = (d: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  // Someone who's not an admin and has never been rostered gets a one-line nudge; admins can't be rostered so never see it.
  const unassigned = !user.isAdmin && mine && mine.length === 0;
  const todaysRoles = (mine ?? []).filter((a) => a.date && dayKey(a.date) === today);

  return (
    <main className="mx-auto w-full max-w-8xl px-4 pb-16 pt-8 sm:px-20 sm:pt-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {greeting}, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-0.5 text-sm text-neutral-500">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      <div className="space-y-6">
        {todaysRoles.length > 0 && (
          <p className="rounded-2xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-semibold text-green-800">You’re on today: {todaysRoles.map((a) => `${a.serviceName} (${a.roles.map(roleLabel).join(" & ")})`).join(", ")}.</p>
        )}
        {unassigned && <p className="rounded-2xl bg-white px-5 py-3 text-sm text-neutral-500">You haven’t been added to a service roster yet — when you are, you’ll get an email and the pages for your role will open.</p>}
        {dashErr && !dash && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{dashErr.message}</p>}
        {dash && <KpiRow d={dash} services={servicesStat} unread={chatUnread} mentioned={chatMentioned} />}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="min-w-0 self-start rounded-2xl bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900"><CalendarDays size={18} className="text-orange-600" /> {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-3 text-[11px] text-neutral-500 sm:flex">
                  {(["service", "task", "post"] as const).map((k) => (
                    <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: KIND_BG[k] }} />{k === "service" ? "Services" : k === "task" ? "Task deadlines" : "Posts"}</span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100"><ChevronLeft size={16} /></button>
                  <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="rounded-lg px-2.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-100">Today</button>
                  <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100"><ChevronRight size={16} /></button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                const k = d ? keyFor(d) : "";
                const here = d ? marks.get(k) ?? [] : [];
                return (
                  <div key={i} className={`min-h-20 min-w-0 rounded-lg border p-1 text-left ${d ? (k === today ? "border-orange-300 bg-orange-50/50" : "border-neutral-100") : "border-transparent"}`}>
                    {d && <span className={`text-xs ${k === today ? "font-bold text-orange-700" : "text-neutral-400"}`}>{d}</span>}
                    {here.slice(0, MAX_PER_DAY).map((m) => (
                      <Link key={`${m.kind}-${m.id}`} href={m.href} title={m.title} id={m.kind === "service" ? `service-${m.id}` : undefined} className="mt-0.5 block truncate rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#ffffff]" style={{ background: k < today ? "#737373" : KIND_BG[m.kind] }}>
                        {m.title}
                      </Link>
                    ))}
                    {here.length > MAX_PER_DAY && <span className="mt-0.5 block px-1 text-[10px] font-semibold text-neutral-400">+{here.length - MAX_PER_DAY} more</span>}
                  </div>
                );
              })}
            </div>
          </section>

          {dash && (
            <div className="min-w-0 space-y-6">
              <MyTasks me={dash.me} />
              <NeedsAttention posts={dash.content.attention} total={dash.content.attentionCount} />
            </div>
          )}
        </div>

        {dash && (
          <div className="grid gap-6 lg:grid-cols-2">
            {dash.sprint ? <SprintCard sprint={dash.sprint} /> : <UpcomingPosts posts={dash.content.upcoming} scheduledThisWeek={dash.content.scheduledThisWeek} />}
            <ServicesCard services={topServices} canOpen={canSeeServices} />
          </div>
        )}
      </div>
    </main>
  );
}
