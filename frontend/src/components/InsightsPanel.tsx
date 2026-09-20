'use client';

import type { ReactNode } from 'react';
import type { Insight } from '@/lib/types';
import { renderInlineMarkdown } from '@/lib/inlineMarkdown';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  // At most one topic insight ever exists per session (auto-guessed after a few minutes, or
  // the preacher's own explicit statement replacing it) - see analysis.service.js.
  const title = insights.find((i) => i.type === 'topic');
  const keyPoints = insights.filter((i) => i.type === 'keyPoint');
  const scriptures = insights.filter((i) => i.type === 'scripture');
  const declarations = insights.filter((i) => i.type === 'declaration');

  const isEmpty = insights.length === 0;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Notes</h2>

      {isEmpty && (
        <p className="py-8 text-center text-xs text-neutral-400">
          A title, scriptures, and notes will show up here as the message unfolds.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-6">
        {title && (
          <Section title="Title">
            <p className="text-base font-semibold leading-snug text-neutral-900">
              {renderInlineMarkdown(title.text)}
            </p>
          </Section>
        )}

        {scriptures.length > 0 && (
          <Section title="Scriptures">
            <ul className="flex flex-col gap-1.5">
              {scriptures.map((s) => (
                <li key={s._id} className="text-sm leading-snug text-neutral-800">
                  {s.reference && <span className="mr-1 font-semibold text-neutral-500">{s.reference}</span>}
                  {renderInlineMarkdown(s.text)}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {keyPoints.length > 0 &&
          (() => {
            const standalone = keyPoints.filter((kp) => !kp.items || kp.items.length === 0);
            const lists = keyPoints.filter((kp) => kp.items && kp.items.length > 0);
            return (
              <Section title="Notes">
                <div className="flex flex-col gap-4">
                  {standalone.length > 0 && (
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-snug text-neutral-800">
                      {standalone.map((kp) => (
                        <li key={kp._id}>{renderInlineMarkdown(kp.text)}</li>
                      ))}
                    </ul>
                  )}
                  {lists.map((kp) => (
                    <div key={kp._id}>
                      <p className="text-sm font-semibold text-neutral-900">{renderInlineMarkdown(kp.text)}</p>
                      <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-sm leading-snug text-neutral-800">
                        {kp.items!.map((item, i) => (
                          <li key={i}>{renderInlineMarkdown(item)}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </Section>
            );
          })()}

        {declarations.length > 0 && (
          <Section title="Declarations">
            <ul className="flex flex-col gap-1.5">
              {declarations.map((d) => (
                <li key={d._id} className="text-sm leading-snug text-neutral-800">
                  {renderInlineMarkdown(d.text)}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
