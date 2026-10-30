"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RANGES,
  platformOverview,
  type PlatformOverview,
  type RangeId,
} from "@/lib/analytics";
import { useCached } from "@/lib/queries";
import { HBars, Kpi, TimelineChart } from "./analytics/Charts";
import { RangeChips, saveRange, savedRange } from "./analytics/RangeChips";

// The platform at a glance: what the team made and published, over a period you choose.
export function AnalyticsDashboard() {
  const [range, setRange] = useState<RangeId>("30d");
  // Cached per period: switching back to a period you've already looked at is instant, and it re-checks every few minutes.
  const { data: fetched, error: err } = useCached<PlatformOverview>(["analytics", "platform", range], () => platformOverview(range), { staleTime: 5 * 60_000 });
  const data = fetched ?? null;
  const error = err && !fetched ? err.message : "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setRange(savedRange());
  }, []);

  const label = RANGES.find((r) => r.id === range)?.label.toLowerCase();

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
          Platform analytics
        </h2>
        <RangeChips
          value={range}
          onChange={(r) => (setRange(r), saveRange(r))}
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="text-sm text-neutral-400">Loading the numbers…</p>
      )}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.kpis.map((k) => (
              <Kpi key={k.id} label={k.label} value={k.value} prev={k.prev} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-neutral-900">
                Created &amp; published{" "}
                <span className="font-normal text-neutral-400">
                  · per {data.bucket}, {label}
                </span>
              </h3>
              <TimelineChart
                data={data.timeline}
                bucket={data.bucket}
                series={[
                  {
                    key: "created",
                    label: "Content created",
                    color: "var(--viz-1)",
                  },
                  {
                    key: "published",
                    label: "Published to Instagram",
                    color: "var(--viz-2)",
                  },
                ]}
              />
            </div>
            <div className="flex flex-col rounded-2xl bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-neutral-900">
                What the team made
              </h3>
              {data.mix.every((m) => m.count === 0) ? (
                <p className="py-6 text-center text-sm text-neutral-400">
                  Nothing in this period.
                </p>
              ) : (
                <div className="min-h-[220px] flex-1">
                  <HBars
                    fill
                    items={data.mix
                      .filter((m) => m.count > 0)
                      .map((m) => ({
                        label: m.label,
                        value: m.count,
                        sub: m.published ? `${m.published} posted` : undefined,
                      }))}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">
                By service
              </h3>
              <Link
                href="/published"
                className="text-xs font-semibold text-orange-600 hover:underline"
              >
                Instagram performance →
              </Link>
            </div>
            {data.byService.length === 0 ? (
              <p className="py-4 text-sm text-neutral-400">
                No service activity in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-neutral-500">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Service</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Sessions
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Quotes
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Reels
                      </th>
                      <th className="py-2 pl-3 text-right font-semibold">
                        Posted
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byService.map((s) => (
                      <tr key={s.id} className="border-t border-neutral-100">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/services/${s.id}`}
                            className="font-medium text-neutral-900 hover:text-orange-600"
                          >
                            {s.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.sessions}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.quotes}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.reels}
                        </td>
                        <td className="py-2 pl-3 text-right tabular-nums">
                          {s.published}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
