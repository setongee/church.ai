"use client";

import type { Health, IgOverview } from "@/lib/analytics";
import { ScoreRadar, TrendArea } from "@/components/analytics/Charts";
import { Dialog, Section } from "./Dialog";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const WORD = { good: "Strong", ok: "Fair", poor: "Weak" } as const;
const DOT = { good: "bg-green-500", ok: "bg-amber-500", poor: "bg-red-500" } as const;

// The graphs and detail behind the account-health score.
export function AnalyticsModal({ health, account, handle, onClose }: { health: Health; account?: IgOverview["account"]; handle?: string; onClose: () => void }) {
  const trend = (account?.followerSeries ?? []).map((v) => ({ date: v.date, value: v.gained }));
  const st = health.stats;
  const facts: [string, string][] = [
    ["Posts in the period", String(st.posts)],
    ["Posts per week", String(st.postsPerWeek)],
    ["Average engagement", pct(st.avgEngagementRate)],
    ["Median reach", st.medianReach.toLocaleString()],
    ["Saves & shares rate", pct(st.savesSharesRate)],
    ["Reels share", `${Math.round(st.reelShare * 100)}%`],
    ["Longest gap between posts", `${st.maxGapDays} days`],
    ["Hashtags per post", String(st.avgHashtags)],
  ];
  return (
    <Dialog eyebrow="Account analytics" title={`${handle ? `@${handle} · ` : ""}Account health ${health.score}/100`} subtitle={`${health.grade} — how each part of the account is doing`} onClose={onClose}>
      <Section title="Health by measure" hint="Each spoke is scored 0–100. A full, even shape is a healthy account; a dent shows what is holding it back.">
        <div className="rounded-2xl bg-neutral-50 p-6">
          <ScoreRadar height={340} items={health.components.map((c) => ({ id: c.id, label: c.label, score: c.score, value: c.value, status: c.status }))} />
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {health.components.map((c) => (
            <li key={c.id} className="rounded-2xl border border-neutral-200 p-4">
              <p className="flex items-center justify-between gap-2 text-sm font-semibold text-neutral-900">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${DOT[c.status]}`} />
                  {c.label}
                </span>
                <span className="tabular-nums">
                  {c.score} <span className="text-xs font-normal text-neutral-500">· {WORD[c.status]}</span>
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">{c.value}</p>
              {c.status !== "good" && <p className="mt-2 text-sm leading-relaxed text-neutral-600">{c.tip}</p>}
            </li>
          ))}
        </ul>
      </Section>

      {(health.priorities.length > 0 || health.issues.length > 0) && (
        <Section title="Work on these first">
          <ol className="grid gap-4 md:grid-cols-2">
            {health.priorities.map((c, i) => (
              <li key={c.id} className="flex gap-4 rounded-2xl bg-neutral-50 p-5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-600 text-sm font-bold text-[#ffffff]">{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{c.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-600">{c.tip}</p>
                </div>
              </li>
            ))}
          </ol>
          {health.issues.map((t) => (
            <p key={t} className="mt-3 text-sm text-amber-800">⚠ {t}</p>
          ))}
        </Section>
      )}

      {trend.length > 1 && (
        <Section title="Followers gained per day" hint="The last 30 days.">
          <div className="rounded-2xl bg-neutral-50 p-5">
            <TrendArea data={trend} label="Followers gained" height={220} />
          </div>
        </Section>
      )}

      <Section title="The numbers behind it">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-neutral-50 px-5 py-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{k}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{v}</dd>
            </div>
          ))}
        </dl>
        {st.bestDay && (
          <p className="mt-4 text-sm text-neutral-600">
            Your best posts have gone out on <b className="text-neutral-900">{st.bestDay}</b>
            {st.bestHour != null && <> around <b className="text-neutral-900">{st.bestHour}:00</b></>}.
          </p>
        )}
      </Section>
    </Dialog>
  );
}
