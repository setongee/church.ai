"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { growthPlan, type GrowthPlan, type RangeId } from "@/lib/analytics";
import { Dialog, Section } from "./Dialog";

// A written plan for growing the account and its engagement, from the account's own numbers plus current advice
// found on the web (AI-written when available, otherwise the built-in playbook).
export function GrowthModal({ range, onClose }: { range: RangeId; onClose: () => void }) {
  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    growthPlan(range)
      .then((d) => (d.error || !d.plan ? setError(d.error || "Couldn’t build a plan") : setPlan(d.plan)))
      .catch((e) => setError(e.message));
  }, [range]);

  return (
    <Dialog eyebrow="Growth plan" title="How to grow your Instagram" subtitle={plan ? (plan.ai ? "Written by AI from your numbers and current research." : "Built from your numbers and the built-in playbook.") : undefined} onClose={onClose}>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!plan && !error && <p className="py-16 text-center text-sm text-neutral-400">Researching what works right now and reading your numbers… this takes up to a minute.</p>}
      {plan && (
        <>
          <div>
            <p className="max-w-3xl text-base leading-relaxed text-neutral-800">{plan.summary}</p>
            {!plan.ai && <p className="mt-2 text-sm text-neutral-400">{plan.aiIssue === "credits" ? "The AI writer is paused (the OpenRouter key is out of credit), so this plan comes from your numbers and the built-in playbook." : "The AI writer isn’t reachable right now, so this plan comes from your numbers and the built-in playbook."}</p>}
          </div>

          <Section title="Do these first" hint="Most impactful first.">
            <ol className="grid gap-4 md:grid-cols-2">
              {plan.priorities.map((p, i) => (
                <li key={i} className="flex gap-4 rounded-2xl bg-neutral-50 p-5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-600 text-sm font-bold text-[#ffffff]">{i + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{p.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-600">{p.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <div className="grid gap-10 md:grid-cols-2">
            <Bullets title="Post ideas" items={plan.contentIdeas} />
            <Bullets title="Caption tips" items={plan.captionTips} />
          </div>

          <Section title="When &amp; how often">
            <p className="max-w-3xl text-sm leading-relaxed text-neutral-700">{plan.schedule}</p>
          </Section>

          {plan.sources.length > 0 && (
            <Section title="Researched from">
              <ul className="space-y-2 text-sm">
                {plan.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-orange-600 hover:underline">
                      <ExternalLink size={14} /> {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </Dialog>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <Section title={title}>
      <ul className="space-y-3 text-sm leading-relaxed text-neutral-700">
        {items.map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
