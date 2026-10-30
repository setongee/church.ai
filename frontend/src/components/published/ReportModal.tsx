"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { postReport, type PostReport, type PublishedPost } from "@/lib/analytics";
import { ScoreBars, ScoreRing } from "@/components/analytics/Charts";
import { Dialog, Section } from "./Dialog";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const btn = "inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-orange-300 hover:text-orange-700";

// One post's review: the verdict, the numbers, why it scored what it did, and what to do next.
export function ReportModal({ post, onClose }: { post: PublishedPost; onClose: () => void }) {
  const [r, setR] = useState<PostReport | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchReport = useCallback(
    (refresh: boolean) =>
      postReport(post.kind, post.id, refresh)
        .then((d) => (d.error ? setError(d.error) : setR(d)))
        .catch((e) => setError(e.message)),
    [post.kind, post.id],
  );
  const refreshNow = () => {
    setR(null);
    setError("");
    void fetchReport(true);
  };
  useEffect(() => {
    void fetchReport(false);
  }, [fetchReport]);

  const p = r?.post;
  const rv = r?.review;
  const stats = p
    ? [
        { label: "Reached", value: p.reach.toLocaleString() },
        { label: "Likes", value: p.likes.toLocaleString() },
        { label: "Comments", value: p.comments.toLocaleString() },
        { label: "Saves", value: p.saves.toLocaleString() },
        { label: "Shares", value: p.shares.toLocaleString() },
        p.avgWatchSec != null ? { label: "Avg watch", value: `${p.avgWatchSec}s` } : { label: "Views", value: p.views.toLocaleString() },
      ]
    : [];

  return (
    <Dialog
      eyebrow={p ? `${p.label} · ${p.type.toLowerCase()}` : post.label}
      title={p?.title || p?.caption.slice(0, 90) || post.title || "Post report"}
      subtitle={p ? `Published ${new Date(p.publishedAt).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : undefined}
      onClose={onClose}
      actions={
        p && (
          <>
            {p.permalink && (
              <a href={p.permalink} target="_blank" rel="noreferrer" className={btn}>
                <ExternalLink size={15} /> View
              </a>
            )}
            <button onClick={refreshNow} className={btn}>
              <RefreshCw size={15} /> Refresh
            </button>
          </>
        )
      }
    >
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!r && !error && <p className="py-16 text-center text-sm text-neutral-400">Reading the numbers and writing the review… this can take a few seconds.</p>}

      {r && p && (
        <>
          {/* Verdict + numbers */}
          <div className="grid items-center gap-8 lg:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-6">
              {p.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbnail} alt="" className="h-36 w-36 shrink-0 rounded-2xl bg-neutral-100 object-cover" />
              )}
              <div className="flex flex-col items-center gap-2">
                <ScoreRing score={r.score ?? 0} grade={r.grade ?? ""} size={140} />
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Post score</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl bg-neutral-50 px-5 py-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {r.limited && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Instagram hasn’t given reach data for this post yet, so the score leans on likes and comments only.</p>}

          {/* Written review */}
          {rv && (
            <Section title="The review" hint={rv.ai ? "Written by AI from this post’s numbers." : rv.aiIssue === "credits" ? "The AI writer is paused (the OpenRouter key is out of credit), so this comes from the scoring rules." : "The AI writer isn’t reachable right now, so this comes from the scoring rules."}>
              <p className="max-w-3xl text-base leading-relaxed text-neutral-800">{rv.summary}</p>
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <Card tone="good" title="What worked" items={rv.whatWorked.length ? rv.whatWorked : r.strengths ?? []} empty="Nothing stood out as a clear strength yet." />
                <Card tone="warn" title="What to improve" items={rv.toImprove} empty="Nothing urgent." />
              </div>
            </Section>
          )}

          {/* Score breakdown */}
          <Section title="Why it scored this" hint="Each measure is scored 0–100; the post score is their weighted average.">
            <div className="rounded-2xl bg-neutral-50 p-6">
              <ScoreBars items={(r.components ?? []).map((c) => ({ id: c.id, label: c.label, score: c.score, value: c.value, status: c.status }))} />
            </div>
            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {r.components?.map((c) => (
                <div key={c.id}>
                  <dt className="text-sm font-medium text-neutral-800">
                    {c.label} <span className="font-normal text-neutral-400">· {c.value}</span>
                  </dt>
                  <dd className="mt-0.5 text-sm leading-relaxed text-neutral-500">{c.detail}</dd>
                </div>
              ))}
            </dl>
            {r.accountEr != null && r.er != null && (
              <p className="mt-5 text-sm text-neutral-600">
                Engagement rate <b className="text-neutral-900">{pct(r.er)}</b> vs your account’s recent average <b className="text-neutral-900">{pct(r.accountEr)}</b> —{" "}
                {r.er >= r.accountEr ? <span className="font-semibold text-green-700">above average</span> : <span className="font-semibold text-red-700">below average</span>}.
              </p>
            )}
          </Section>

          {rv?.captionRewrite && (
            <Section title="A stronger caption" hint="Same message, with a hook and one clear call to action.">
              <div className="rounded-2xl bg-neutral-50 p-6">
                <p className="whitespace-pre-line text-base leading-relaxed text-neutral-800">{rv.captionRewrite}</p>
                <button
                  onClick={() => {
                    void navigator.clipboard?.writeText(rv.captionRewrite);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className={`${btn} mt-4`}
                >
                  <Copy size={15} /> {copied ? "Copied" : "Copy caption"}
                </button>
              </div>
            </Section>
          )}

          {rv && rv.nextPostIdeas.length > 0 && (
            <Section title="Post next" hint="Follow-ups built on what this post started.">
              <ul className="grid gap-4 md:grid-cols-3">
                {rv.nextPostIdeas.map((t, i) => (
                  <li key={i} className="rounded-2xl border border-neutral-200 p-5 text-sm leading-relaxed text-neutral-700">
                    <span className="mb-2 grid h-6 w-6 place-items-center rounded-full bg-orange-600 text-xs font-bold text-[#ffffff]">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!rv && r.tips && <Card tone="warn" title="What to improve" items={r.tips.map((t) => `${t.title}: ${t.detail}`)} empty="" />}
        </>
      )}
    </Dialog>
  );
}

function Card({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "good" | "warn" }) {
  const accent = tone === "good" ? "border-green-500" : "border-amber-500";
  const dot = tone === "good" ? "bg-green-500" : "bg-amber-500";
  return (
    <div className={`rounded-2xl border border-neutral-200 border-t-4 ${accent} p-6`}>
      <h4 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="space-y-3 text-sm leading-relaxed text-neutral-700">
          {items.map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
