"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useCached } from "@/lib/queries";
import {
  RANGES,
  igOverview,
  type IgOverview,
  type PublishedPost,
  type RangeId,
} from "@/lib/analytics";
import { Kpi, ScoreRing, toneOf } from "@/components/analytics/Charts";
import {
  RangeChips,
  saveRange,
  savedRange,
} from "@/components/analytics/RangeChips";
import { ReportModal } from "@/components/published/ReportModal";
import { GrowthModal } from "@/components/published/GrowthModal";
import { AnalyticsModal } from "@/components/published/AnalyticsModal";

const pct = (n = 0) => `${(n * 100).toFixed(1)}%`;
const SORTS = [
  { id: "new", label: "Newest" },
  { id: "score", label: "Best score" },
  { id: "engaged", label: "Most engagement" },
] as const;

export default function PublishedPage() {
  const [range, setRange] = useState<RangeId>("30d");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("new");
  const [report, setReport] = useState<PublishedPost | null>(null);
  const [growth, setGrowth] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [scope, setScope] = useState<"platform" | "account">("platform");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setRange(savedRange());
  }, []);

  // Cached per period (Instagram's numbers only move slowly): opens instantly from the last fetch and re-checks every
  // ten minutes. The refresh button asks Instagram for fresh numbers right now and updates the cache with them.
  const qc = useQueryClient();
  const key = ["ig", "overview", range];
  const { data: fetched, error: err, fetching } = useCached<IgOverview>(key, () => igOverview(range), { staleTime: 10 * 60_000 });
  const data = fetched ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const loading = (fetching && !fetched) || refreshing;
  const error = refreshError || (err && !fetched ? err.message : fetched?.error && fetched.connected ? fetched.error : "");
  const refreshNow = () => {
    setRefreshing(true);
    setRefreshError("");
    igOverview(range, true)
      .then((d) => qc.setQueryData(key, d))
      .catch((e) => setRefreshError(e.message))
      .finally(() => setRefreshing(false));
  };

  const kinds = useMemo(
    () => [...new Set((data?.posts ?? []).map((p) => p.label))],
    [data],
  );
  const posts = useMemo(() => {
    const list = (data?.posts ?? []).filter(
      (p) => kind === "all" || p.label === kind,
    );
    return [...list].sort((a, b) =>
      sort === "score"
        ? (b.score ?? -1) - (a.score ?? -1)
        : sort === "engaged"
          ? (b.interactions ?? -1) - (a.interactions ?? -1)
          : new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
    );
  }, [data, kind, sort]);

  const h = data?.health;
  const acct = data?.account;

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-20 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Published posts
          </h1>
          <p className="text-sm text-neutral-500">
            Everything this platform has posted to Instagram, how it’s doing,
            and how to do better.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/upload-post"
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700"
          >
            Upload &amp; post
          </Link>
          <RangeChips
            value={range}
            onChange={(r) => (setRange(r), saveRange(r))}
          />
          <button
            onClick={refreshNow}
            disabled={loading}
            aria-label="Refresh from Instagram"
            title="Refresh from Instagram"
            className="rounded-full p-2.5 text-neutral-500 hover:bg-neutral-100 hover:text-orange-600 disabled:opacity-50"
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {data && !data.connected && (
        <p className="rounded-2xl bg-white p-6 text-sm text-neutral-600">
          {data.error}
        </p>
      )}
      {!data && !error && (
        <p className="text-sm text-neutral-400">Loading from Instagram…</p>
      )}

      {data?.connected && data.profile && (
        <div className="space-y-6">
          {/* Account health */}
          {h && (
            <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-white px-4 py-2.5">
              <ScoreRing
                score={h.score}
                grade={h.grade}
                size={46}
                showGrade={false}
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-base font-semibold text-neutral-900">
                  Account health
                </p>
                <p className="text-sm text-neutral-500">
                  @{data.profile.username} ·{" "}
                  {data.profile.followers.toLocaleString()} followers ·{" "}
                  {data.profile.following.toLocaleString()} following ·{" "}
                  {data.profile.posts.toLocaleString()} posts
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setAnalytics(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700"
                >
                  <BarChart3 size={15} /> View Analytics
                </button>
                <button
                  onClick={() => setGrowth(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3.5 py-1.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700"
                >
                  <Sparkles size={15} /> How to Grow
                </button>
              </div>
            </section>
          )}

          {/* Numbers: the whole account, or just what was posted from here */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Which numbers"
                className="inline-flex gap-1 rounded-full bg-neutral-100 p-1"
              >
                {(
                  [
                    ["platform", "From this platform"],
                    ["account", "Whole account"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={scope === k}
                    onClick={() => setScope(k)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${scope === k ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500">
                {scope === "platform"
                  ? "Only the posts published from this platform."
                  : "Everything on the Instagram account, including posts made elsewhere."}{" "}
                · {RANGES.find((r) => r.id === range)?.label.toLowerCase()}
              </p>
            </div>
            {scope === "platform" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <Kpi label="Posts from here" value={data.totals?.posts ?? 0} />
                <Kpi label="Likes" value={data.totals?.likes ?? 0} />
                <Kpi label="Comments" value={data.totals?.comments ?? 0} />
                <Kpi label="Saves" value={data.totals?.saves ?? 0} />
                <Kpi label="Shares" value={data.totals?.shares ?? 0} />
                <Kpi label="Reach" value={data.totals?.reach ?? 0} />
                <Kpi label="Avg score" value={data.totals?.avgScore ?? "—"} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Kpi label="Reached" value={acct?.reach ?? "—"} />
                  <Kpi label="Views" value={acct?.views ?? "—"} />
                  <Kpi
                    label="Profile visits"
                    value={acct?.profile_views ?? "—"}
                  />
                  <Kpi
                    label="Accounts engaged"
                    value={acct?.accounts_engaged ?? "—"}
                  />
                  <Kpi
                    label="Followers gained"
                    value={
                      acct?.followersGained != null
                        ? `${acct.followersGained > 0 ? "+" : ""}${acct.followersGained}`
                        : "—"
                    }
                  />
                </div>
              </>
            )}
          </section>

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {["all", ...kinds].map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${kind === k ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
                >
                  {k === "all" ? "All posts" : k}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-neutral-500">Sort</span>
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  aria-pressed={sort === s.id}
                  className={`rounded-full px-3 py-1.5 font-semibold ${sort === s.id ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Posts */}
          {posts.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-12 text-center text-sm text-neutral-400">
              No posts from this platform in this period. Publish a quote,
              carousel or reel to Instagram and it will show up here.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {posts.map((p) => (
                <PostCard
                  key={`${p.kind}-${p.id}`}
                  p={p}
                  onReport={() => setReport(p)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {report && <ReportModal post={report} onClose={() => setReport(null)} />}
      {analytics && h && (
        <AnalyticsModal
          health={h}
          account={acct}
          handle={data?.profile?.username}
          onClose={() => setAnalytics(false)}
        />
      )}
      {growth && <GrowthModal range={range} onClose={() => setGrowth(false)} />}
    </main>
  );
}

function PostCard({ p, onReport }: { p: PublishedPost; onReport: () => void }) {
  const tone = p.score != null ? toneOf(p.score) : null;
  const badge =
    tone === "good"
      ? "bg-green-100 text-green-800"
      : tone === "ok"
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-800";
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl bg-white">
      <div className="flex gap-3 p-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
          {p.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.thumbnail}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-orange-600">
              {p.label}
            </span>
            {p.score != null && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${badge}`}
                title={`${p.grade}`}
              >
                {p.score} · {p.grade}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-neutral-900">
            {p.title || p.caption?.slice(0, 90) || "Untitled"}
          </p>
          <p className="text-xs text-neutral-500">
            {new Date(p.publishedAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
      {p.error ? (
        <p className="px-4 pb-3 text-xs text-amber-800">
          Couldn’t read this post from Instagram: {p.error}
        </p>
      ) : (
        <div className="grid grid-cols-5 gap-1 px-4 pb-3 text-center">
          {[
            ["♥", p.likes, "Likes"],
            ["💬", p.comments, "Comments"],
            ["🔖", p.saves, "Saves"],
            ["↗", p.shares, "Shares"],
            ["👁", p.reach, "Reached"],
          ].map(([icon, v, label]) => (
            <div
              key={String(label)}
              className="rounded-lg bg-neutral-50 py-1.5"
              title={String(label)}
            >
              <p className="text-sm font-semibold tabular-nums text-neutral-900">
                {Number(v ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-neutral-500">
                {icon} {label}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 px-4 py-2.5">
        <span className="text-xs text-neutral-500">
          {p.er != null ? `${pct(p.er)} engagement` : ""}
        </span>
        <div className="flex gap-1.5">
          {p.permalink && (
            <a
              href={p.permalink}
              target="_blank"
              rel="noreferrer"
              aria-label="View on Instagram"
              title="View on Instagram"
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-orange-600"
            >
              <ExternalLink size={15} />
            </a>
          )}
          <button
            onClick={onReport}
            disabled={!!p.error}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-40"
          >
            Review report
          </button>
        </div>
      </div>
    </li>
  );
}
