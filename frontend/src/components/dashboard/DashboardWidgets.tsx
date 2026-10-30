"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ListChecks, Flag, MessageCircle, Zap } from "lucide-react";
import type { DashPost, DashService, DashTask, Dashboard } from "@/lib/dashboard";

const card = "rounded-2xl bg-white p-5";
export const FORMAT: Record<string, string> = { reel: "Reel", post: "Post", carousel: "Carousel", story: "Story", video: "Video", other: "Other" };
const STATUS: Record<string, { label: string; color: string }> = {
  idea: { label: "Idea", color: "#737373" },
  drafting: { label: "Drafting", color: "#2563eb" },
  review: { label: "In review", color: "#d97706" },
  ready: { label: "Ready", color: "#0d9488" },
  scheduled: { label: "Scheduled", color: "#7c3aed" },
  published: { label: "Posted", color: "#16a34a" },
  failed: { label: "Failed", color: "#dc2626" },
  todo: { label: "To do", color: "#737373" },
  in_progress: { label: "In progress", color: "#2563eb" },
  done: { label: "Done", color: "#16a34a" },
};
const PRIORITY: Record<string, string> = { urgent: "#dc2626", high: "#ea580c", medium: "#2563eb", low: "#737373" };

const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const niceDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const niceWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const daysUntil = (iso: string) => Math.round((new Date(`${dayOf(iso)}T12:00:00Z`).getTime() - new Date(`${todayKey()}T12:00:00Z`).getTime()) / 86400000);

export function Section({ title, hint, href, cta, children, className = "" }: { title: string; hint?: string; href?: string; cta?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${card} ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
        {href && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-orange-600 hover:underline">
            {cta ?? "Open"} <ArrowRight size={13} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function Stat({ icon: Icon, color, value, label, hint, href, alert }: { icon: typeof Zap; color: string; value: ReactNode; label: string; hint?: string; href?: string; alert?: boolean }) {
  const inner = (
    <div className={`flex h-full items-center gap-3.5 rounded-2xl p-4 transition ${alert ? "bg-red-50" : "bg-white"} ${href ? "hover:shadow-md" : ""}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `${color}22`, color }}>
        <Icon size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold leading-none tracking-tight text-neutral-900">{value}</span>
        <span className="mt-1 block text-sm font-medium leading-tight text-neutral-700">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-tight text-neutral-400">{hint}</span>}
      </span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Chip({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: "#737373" };
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffffff]" style={{ background: s.color }}>
      {s.label}
    </span>
  );
}

// ---- my tasks ------------------------------------------------------------------------------------------------------------

export function MyTasks({ me }: { me: Dashboard["me"] }) {
  const today = todayKey();
  return (
    <Section title="My tasks" hint={me.open ? `${me.open} open${me.overdue ? ` · ${me.overdue} overdue` : ""}${me.doneRecently ? ` · ${me.doneRecently} finished lately` : ""}` : undefined} href="/board" cta="Open the board">
      {me.tasks.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-sm text-neutral-400">
          <CheckCircle2 size={16} className="text-green-500" /> Nothing open on your plate.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {me.tasks.map((t: DashTask) => {
            const late = t.dueDate && dayOf(t.dueDate) < today;
            return (
              <li key={t.id}>
                <Link href={`/board?task=${t.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PRIORITY[t.priority] ?? "#737373" }} title={`${t.priority} priority`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">{t.title}</span>
                    <span className="block truncate text-xs text-neutral-400">{t.sprint}</span>
                  </span>
                  <Chip status={t.status} />
                  <span className={`w-20 shrink-0 text-right text-xs ${late ? "font-semibold text-red-600" : "text-neutral-500"}`}>{t.dueDate ? (late ? "Overdue" : niceDay(t.dueDate)) : "No date"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ---- the active sprint -----------------------------------------------------------------------------------------------------

export function SprintCard({ sprint }: { sprint: NonNullable<Dashboard["sprint"]> }) {
  const pct = sprint.total ? Math.round((sprint.counts.done / sprint.total) * 100) : 0;
  const parts: [string, number, string][] = [
    ["To do", sprint.counts.todo, "#a3a3a3"],
    ["In progress", sprint.counts.in_progress, "#2563eb"],
    ["In review", sprint.counts.review, "#d97706"],
    ["Done", sprint.counts.done, "#16a34a"],
  ];
  return (
    <Section title="Active sprint" hint={sprint.name} href="/board" cta="Open the board">
      <div className="flex items-center gap-5">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#16a34a ${pct * 3.6}deg, rgba(163,163,163,.25) 0)` }}>
          <span className="grid h-[74px] w-[74px] place-items-center rounded-full bg-white text-xl font-semibold text-neutral-900">{pct}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-600">
            <b className="text-neutral-900">{sprint.counts.done}</b> of {sprint.total} tasks done · <b className="text-neutral-900">{sprint.daysLeft}</b> day{sprint.daysLeft === 1 ? "" : "s"} left
          </p>
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-neutral-100">
            {parts.map(([label, n, color]) => n > 0 && <span key={label} title={`${label}: ${n}`} style={{ width: `${(n / (sprint.total || 1)) * 100}%`, background: color }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
            {parts.map(([label, n, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label} {n}
              </span>
            ))}
          </div>
          {sprint.mine > 0 && <p className="mt-2 text-xs text-neutral-400">{sprint.mine} of them are yours.</p>}
        </div>
      </div>
    </Section>
  );
}

// ---- content ----------------------------------------------------------------------------------------------------------------

function PostRow({ p }: { p: DashPost }) {
  return (
    <li>
      <Link href={`/calendar?item=${p.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-[10px] font-bold uppercase text-neutral-500">{(FORMAT[p.format] ?? p.format).slice(0, 4)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">{p.title}</span>
          <span className="block truncate text-xs text-neutral-400">
            {p.scheduledAt ? niceWhen(p.scheduledAt) : "No date yet"}
            {p.owners.length ? ` · ${p.owners.slice(0, 2).join(", ")}${p.owners.length > 2 ? ` +${p.owners.length - 2}` : ""}` : ""}
          </span>
        </span>
        {p.why ? <span className="shrink-0 text-right text-xs font-semibold text-red-600">{p.why}</span> : <Chip status={p.status} />}
      </Link>
    </li>
  );
}

export function UpcomingPosts({ posts, scheduledThisWeek }: { posts: DashPost[]; scheduledThisWeek: number }) {
  return (
    <Section title="Coming up" hint={scheduledThisWeek ? `${scheduledThisWeek} set to post by themselves this week` : "Planned posts, soonest first"} href="/calendar" cta="Content calendar">
      {posts.length === 0 ? <p className="py-6 text-sm text-neutral-400">Nothing planned yet. Plan a few posts on the content calendar.</p> : <ul className="divide-y divide-neutral-100">{posts.map((p) => <PostRow key={p.id} p={p} />)}</ul>}
    </Section>
  );
}

export function NeedsAttention({ posts, total }: { posts: DashPost[]; total: number }) {
  return (
    <Section title="Needs attention" hint={total ? `${total} post${total === 1 ? "" : "s"} to sort out` : undefined} href="/calendar" cta="Open the calendar">
      {posts.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-sm text-neutral-400">
          <CheckCircle2 size={16} className="text-green-500" /> Every post is on track.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">{posts.map((p) => <PostRow key={p.id} p={p} />)}</ul>
      )}
    </Section>
  );
}

// ---- services (admins and service managers) ---------------------------------------------------------------------------------

export function ServicesCard({ services, canOpen }: { services: DashService[]; canOpen: boolean }) {
  return (
    <Section title="Services" hint="Next up first" href={canOpen ? "/services" : undefined} cta="View more">
      {services.length === 0 ? (
        <p className="py-4 text-sm text-neutral-400">No services yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {services.map((s) => {
            const d = s.date ? daysUntil(s.date) : null;
            const past = d !== null && d < 0;
            const body = (
              <>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-700">
                  <CalendarClock size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">{s.name}</span>
                  <span className="block text-xs text-neutral-400">{s.date ? niceDay(s.date) : "No date"}</span>
                </span>
                {d !== null && !past && <span className="shrink-0 text-xs font-semibold text-orange-700">{d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`}</span>}
                {past && <span className="shrink-0 text-xs text-neutral-400">Past</span>}
              </>
            );
            return <li key={s.id}>{canOpen ? <Link href={`/services/${s.id}`} className={`flex items-center gap-3 py-2.5 hover:opacity-80 ${past ? "opacity-70" : ""}`}>{body}</Link> : <div className={`flex items-center gap-3 py-2.5 ${past ? "opacity-70" : ""}`}>{body}</div>}</li>;
          })}
        </ul>
      )}
    </Section>
  );
}

// ---- the stat row -------------------------------------------------------------------------------------------------------------

export function KpiRow({ d, services, unread, mentioned }: { d: Dashboard; services: { total: number; hint: string } | null; unread: number; mentioned: boolean }) {
  const flags = d.content.attentionCount;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {services && <Stat icon={CalendarClock} color="#ea580c" value={services.total} label="Services" hint={services.hint} href="/services" />}
      <Stat icon={ListChecks} color="#2563eb" value={d.me.open} label="My open tasks" hint={d.me.dueSoon ? `${d.me.dueSoon} due this week` : "Nothing due this week"} href="/board" />
      <Stat icon={AlertTriangle} color="#dc2626" value={d.me.overdue} label="Overdue tasks" hint={d.me.overdue ? "Update or move them" : "All on time"} href="/board" alert={d.me.overdue > 0} />
      <Stat icon={Zap} color="#7c3aed" value={d.content.scheduledThisWeek} label="Going out" hint="Posts, next 7 days" href="/calendar" />
      <Stat icon={Flag} color="#d97706" value={flags} label="Needs attention" hint={flags ? "Posts to look at" : "All clear"} href="/calendar" alert={flags > 0} />
      <Stat icon={MessageCircle} color="#0d9488" value={unread} label={mentioned ? "Tagged in chat" : "Unread chat"} href="/chat" alert={mentioned} />
    </div>
  );
}
