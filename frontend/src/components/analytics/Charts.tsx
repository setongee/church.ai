"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

// ---- KPI tile -------------------------------------------------------------------------------------

// A headline number with its change against the previous period of the same length (not shown for "all time").
export function Kpi({
  label,
  value,
  prev,
  suffix = "",
}: {
  label: string;
  value: number | string;
  prev?: number | null;
  suffix?: string;
}) {
  const num = typeof value === "number" ? value : null;
  const delta =
    num != null && prev != null
      ? prev === 0
        ? num === 0
          ? 0
          : 100
        : Math.round(((num - prev) / prev) * 100)
      : null;
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900">
        {typeof value === "number" ? value.toLocaleString() : value}
        {suffix && (
          <span className="ml-1 text-base font-medium text-neutral-400">
            {suffix}
          </span>
        )}
      </p>
      {delta != null && (
        <p
          className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${delta > 0 ? "text-green-700" : delta < 0 ? "text-red-700" : "text-neutral-500"}`}
        >
          {delta > 0 ? (
            <ArrowUpRight size={14} />
          ) : delta < 0 ? (
            <ArrowDownRight size={14} />
          ) : (
            <Minus size={14} />
          )}
          {delta > 0 ? "+" : ""}
          {delta}%{" "}
          <span className="font-normal text-neutral-400">vs previous</span>
        </p>
      )}
    </div>
  );
}

// ---- shared bits ----------------------------------------------------------------------------------

const fmtDate = (iso: string, bucket: "day" | "week" | "month") => {
  const d = new Date(`${iso}T12:00:00Z`);
  return bucket === "month"
    ? d.toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      })
    : d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
};

// Axis / grid ink: recessive neutrals that follow the light/dark theme.
const AXIS = { fontSize: 11, fill: "var(--color-neutral-500)" };
const GRID = "var(--color-neutral-200)";

interface TipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}
// Tooltip card used by every chart.
function Tip({
  active,
  payload,
  title,
}: {
  active?: boolean;
  payload?: TipEntry[];
  title: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-[#171717] px-3 py-2 text-xs text-[#ffffff]">
      <p className="mb-1 font-semibold">{title}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ background: p.color }}
          />{" "}
          {p.name}: <b>{p.value}</b>
        </p>
      ))}
    </div>
  );
}

// ---- grouped bars over time -----------------------------------------------------------------------

export function TimelineChart({
  data,
  bucket,
  series,
}: {
  data: Record<string, number | string>[];
  bucket: "day" | "week" | "month";
  series: { key: string; label: string; color: string }[];
}) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-neutral-600">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color }}
              />{" "}
              {s.label}
            </span>
          ))}
        </div>
        <button
          onClick={() => setTable((t) => !t)}
          className="text-xs font-medium text-neutral-500 hover:text-orange-600"
        >
          {table ? "View as chart" : "View as table"}
        </button>
      </div>
      {data.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 py-10 text-center text-sm text-neutral-400">
          Nothing was created or published in this period.
        </p>
      ) : table ? (
        <div className="max-h-60 overflow-y-auto rounded-xl border border-neutral-100">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-semibold">
                  {bucket === "month"
                    ? "Month"
                    : bucket === "week"
                      ? "Week of"
                      : "Day"}
                </th>
                {series.map((s) => (
                  <th
                    key={s.key}
                    className="px-3 py-2 text-right font-semibold"
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr
                  key={String(d.date)}
                  className="border-t border-neutral-100"
                >
                  <td className="px-3 py-1.5 text-neutral-700">
                    {fmtDate(String(d.date), bucket)}
                  </td>
                  {series.map((s) => (
                    <td
                      key={s.key}
                      className="px-3 py-1.5 text-right tabular-nums text-neutral-900"
                    >
                      {Number(d[s.key]) || 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="date" tickFormatter={(v) => fmtDate(String(v), bucket)} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
            <Tooltip cursor={{ fill: "var(--color-neutral-100)", opacity: 0.6 }} content={({ active, payload, label }) => <Tip active={active} payload={payload as unknown as TipEntry[]} title={fmtDate(String(label), bucket)} />} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={16} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---- horizontal bars ------------------------------------------------------------------------------

// One hue (magnitude); every bar carries its own value label.
export function HBars({
  items,
  fill,
}: {
  items: { label: string; value: number; sub?: string }[];
  fill?: boolean;
}) {
  const data = items.map((i) => ({
    ...i,
    text: `${i.value}${i.sub ? `  ${i.sub}` : ""}`,
  }));
  // `fill` stretches the bars to the height of whatever holds the chart (its parent needs a height).
  return (
    <ResponsiveContainer
      width="100%"
      height={fill ? "100%" : Math.max(60, items.length * 38 + 8)}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 64, bottom: 0, left: 0 }}
        barCategoryGap={10}
      >
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="label"
          width={112}
          tick={{ fontSize: 13, fill: "var(--color-neutral-700)" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--color-neutral-100)", opacity: 0.6 }}
          content={({ active, payload }) => (
            <Tip
              active={active}
              payload={payload as unknown as TipEntry[]}
              title={String(
                (payload?.[0]?.payload as { label?: string } | undefined)
                  ?.label ?? "",
              )}
            />
          )}
        />
        <Bar
          dataKey="value"
          name="Made"
          fill="var(--viz-1)"
          radius={[0, 4, 4, 0]}
          maxBarSize={14}
          background={{ fill: "var(--color-neutral-100)", radius: 4 }}
        >
          <LabelList
            dataKey="text"
            position="right"
            style={{ fontSize: 12, fill: "var(--color-neutral-900)" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- score ring -----------------------------------------------------------------------------------

export const toneOf = (score: number) =>
  score >= 70 ? "good" : score >= 45 ? "ok" : "poor";
// Status colours (reserved for good / fair / weak, always shown with a word as well).
const STATUS_FILL = {
  good: "#16a34a",
  ok: "#d97706",
  poor: "#dc2626",
} as const;

export function ScoreRing({
  score,
  grade,
  size = 120,
  showGrade = true,
}: {
  score: number;
  grade: string;
  size?: number;
  showGrade?: boolean;
}) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${score} out of 100, ${grade}`}
    >
      <RadialBarChart
        width={size}
        height={size}
        data={[{ value: score }]}
        innerRadius="78%"
        outerRadius="100%"
        startAngle={90}
        endAngle={-270}
        barSize={size * 0.1}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar
          dataKey="value"
          cornerRadius={size}
          fill={STATUS_FILL[toneOf(score)]}
          background={{ fill: "var(--color-neutral-200)" }}
          isAnimationActive={false}
        />
      </RadialBarChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold tabular-nums text-neutral-900"
          style={{ fontSize: size * 0.28 }}
        >
          {score}
        </span>
        {showGrade && (<span
          className="font-semibold text-neutral-500"
          style={{ fontSize: Math.max(11, size * 0.09) }}
        >
          {grade}
        </span>)}
      </div>
    </div>
  );
}

// ---- score bars (a labelled 0-100 bar per measure) -------------------------------------------------

const WORD = { good: "Strong", ok: "Fair", poor: "Weak" } as const;

export function ScoreBars({
  items,
}: {
  items: {
    id: string;
    label: string;
    score: number;
    value?: string;
    status: "good" | "ok" | "poor";
  }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={items.length * 44 + 8}>
      <BarChart
        data={items}
        layout="vertical"
        margin={{ top: 0, right: 92, bottom: 0, left: 0 }}
        barCategoryGap={14}
      >
        <XAxis type="number" hide domain={[0, 100]} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fontSize: 13, fill: "var(--color-neutral-800)" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            const it = payload?.[0]?.payload as
              | (typeof items)[number]
              | undefined;
            if (!active || !it) return null;
            return (
              <div className="rounded-lg bg-[#171717] px-3 py-2 text-xs text-[#ffffff]">
                <p className="font-semibold">{it.label}</p>
                {it.value && <p className="opacity-80">{it.value}</p>}
                <p>
                  Score <b>{it.score}</b> · {WORD[it.status]}
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="score"
          radius={[0, 5, 5, 0]}
          maxBarSize={12}
          background={{ fill: "var(--color-neutral-100)", radius: 5 }}
          isAnimationActive={false}
        >
          {items.map((it) => (
            <Cell key={it.id} fill={STATUS_FILL[it.status]} />
          ))}
          <LabelList
            dataKey="score"
            position="right"
            content={(p) => {
              const {
                x = 0,
                y = 0,
                width = 0,
                height = 0,
                index = 0,
              } = p as {
                x?: number;
                y?: number;
                width?: number;
                height?: number;
                index?: number;
              };
              const it = items[index];
              return (
                <text
                  x={Number(x) + Number(width) + 8}
                  y={Number(y) + Number(height) / 2}
                  dominantBaseline="central"
                  fontSize={12}
                  fill="var(--color-neutral-800)"
                >
                  <tspan fontWeight={700}>{it.score}</tspan>
                  <tspan fill="var(--color-neutral-500)">
                    {" "}
                    · {WORD[it.status]}
                  </tspan>
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// A single-series area chart for a trend (e.g. followers gained per day).
export function TrendArea({ data, label, color = "var(--viz-1)", height = 180 }: { data: { date: string; value: number }[]; label: string; color?: string; height?: number }) {
  const id = `trend-${label.replace(/\W/g, "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tickFormatter={(v) => fmtDate(String(v).slice(0, 10), "day")} tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ stroke: "var(--color-neutral-300)", strokeWidth: 1 }} content={({ active, payload, label: l }) => <Tip active={active} payload={payload as unknown as TipEntry[]} title={fmtDate(String(l).slice(0, 10), "day")} />} />
        <Area type="monotone" dataKey="value" name={label} stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={data.length <= 12 ? { r: 3, strokeWidth: 2, stroke: "var(--color-white)", fill: color } : false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-white)" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// An area chart across categories (e.g. the kinds of content made), filling whatever height its parent has.
export function CategoryArea({ items, fill, height = 240 }: { items: { label: string; value: number; sub?: string }[]; fill?: boolean; height?: number }) {
  const data = items.map((i) => ({ ...i, name: i.label }));
  return (
    <ResponsiveContainer width="100%" height={fill ? "100%" : height}>
      <AreaChart data={data} margin={{ top: 22, right: 18, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="cat-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-28} textAnchor="end" height={64} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          cursor={{ stroke: "var(--color-neutral-300)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            const it = payload?.[0]?.payload as { label: string; value: number; sub?: string } | undefined;
            if (!active || !it) return null;
            return (
              <div className="rounded-lg bg-[#171717] px-3 py-2 text-xs text-[#ffffff]">
                <p className="font-semibold">{it.label}</p>
                <p>
                  Made: <b>{it.value}</b>
                  {it.sub ? ` · ${it.sub}` : ""}
                </p>
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="value" name="Made" stroke="var(--viz-1)" strokeWidth={2} fill="url(#cat-area)" dot={{ r: 3.5, strokeWidth: 2, stroke: "var(--color-white)", fill: "var(--viz-1)" }} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-white)" }}>
          <LabelList dataKey="value" position="top" style={{ fontSize: 12, fill: "var(--color-neutral-900)" }} />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// The account-health measures as an area across the page: one point per measure (0-100), coloured by status, with
// a dashed line where "strong" starts.
export function ScoreArea({ items, height = 280 }: { items: { id: string; label: string; score: number; value?: string; status: "good" | "ok" | "poor" }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={items} margin={{ top: 24, right: 20, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="score-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.38} />
            <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-22} textAnchor="end" height={62} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <ReferenceLine y={70} stroke="var(--color-neutral-400)" strokeDasharray="4 4" label={{ value: "Strong", position: "insideTopRight", fontSize: 11, fill: "var(--color-neutral-500)" }} />
        <Tooltip
          cursor={{ stroke: "var(--color-neutral-300)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            const it = payload?.[0]?.payload as (typeof items)[number] | undefined;
            if (!active || !it) return null;
            return (
              <div className="rounded-lg bg-[#171717] px-3 py-2 text-xs text-[#ffffff]">
                <p className="font-semibold">{it.label}</p>
                {it.value && <p className="opacity-80">{it.value}</p>}
                <p>
                  Score <b>{it.score}</b> · {WORD[it.status]}
                </p>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="score"
          name="Score"
          stroke="var(--viz-1)"
          strokeWidth={2}
          fill="url(#score-area)"
          isAnimationActive={false}
          dot={(p) => {
            const { cx, cy, index } = p as { cx?: number; cy?: number; index?: number };
            const it = items[index ?? 0];
            return <circle key={it?.id} cx={cx} cy={cy} r={5} fill={STATUS_FILL[it?.status ?? "ok"]} stroke="var(--color-white)" strokeWidth={2} />;
          }}
          activeDot={{ r: 7, strokeWidth: 2, stroke: "var(--color-white)" }}
        >
          <LabelList dataKey="score" position="top" style={{ fontSize: 12, fontWeight: 700, fill: "var(--color-neutral-900)" }} />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// The account-health measures on a radar: one spoke per measure, scored 0-100 from the centre. A balanced, full
// shape is a healthy account; a dent shows what is holding it back. Dots carry the status colour.
const SHORT: Record<string, string> = { consistency: "Consistency", engagement: "Engagement", reach: "Reach", signals: "Saves & shares", format: "Format mix", growth: "Growth" };

export function ScoreRadar({ items, height = 320 }: { items: { id: string; label: string; score: number; value?: string; status: "good" | "ok" | "poor" }[]; height?: number }) {
  const data = items.map((i) => ({ ...i, short: SHORT[i.id] ?? i.label }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="short" tick={{ fontSize: 12, fill: "var(--color-neutral-700)" }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fontSize: 10, fill: "var(--color-neutral-400)" }} axisLine={false} />
        <Tooltip
          content={({ active, payload }) => {
            const it = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!active || !it) return null;
            return (
              <div className="rounded-lg bg-[#171717] px-3 py-2 text-xs text-[#ffffff]">
                <p className="font-semibold">{it.label}</p>
                {it.value && <p className="opacity-80">{it.value}</p>}
                <p>
                  Score <b>{it.score}</b> · {WORD[it.status]}
                </p>
              </div>
            );
          }}
        />
        <Radar
          dataKey="score"
          name="Score"
          stroke="var(--viz-1)"
          strokeWidth={2}
          fill="var(--viz-1)"
          fillOpacity={0.22}
          isAnimationActive={false}
          dot={(p) => {
            const { cx, cy, index } = p as { cx?: number; cy?: number; index?: number };
            const it = data[index ?? 0];
            return <circle key={it?.id} cx={cx} cy={cy} r={5} fill={STATUS_FILL[it?.status ?? "ok"]} stroke="var(--color-white)" strokeWidth={2} />;
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
