'use client';

import { useState } from 'react';
import type { SessionSummary } from '@/lib/types';

function List({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      <ul className="mt-1.5 flex flex-col gap-1 text-sm text-neutral-800">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function formatSection(title: string, items: string[]): string {
  if (!items || items.length === 0) return '';
  return `\n*${title}*\n${items.map((item) => `- ${item}`).join('\n')}\n`;
}

function buildNotesText(summary: SessionSummary, title?: string, preacher?: string): string {
  const header = [title, preacher].filter(Boolean).join(' — ');
  return [
    header ? `*${header}*\n` : '',
    summary.overview,
    formatSection('Topics', summary.topics),
    formatSection('Key points', summary.keyPoints),
    formatSection('Scriptures', summary.scriptures),
    formatSection('Declarations', summary.declarations),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function SummaryPanel({
  summary,
  title,
  preacher,
}: {
  summary: SessionSummary;
  title?: string;
  preacher?: string;
}) {
  const [copied, setCopied] = useState(false);
  const notesText = buildNotesText(summary, title, preacher);

  function shareToWhatsApp() {
    // No official API can post into a WhatsApp Group - this pre-fills the message and lets
    // WhatsApp's own chat picker do the rest, one tap, in whichever group the user chooses.
    const url = `https://wa.me/?text=${encodeURIComponent(notesText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(notesText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available, ignore
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Service summary</h2>
        <div className="flex gap-2">
          <button
            onClick={copyNotes}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {copied ? 'Copied!' : 'Copy notes'}
          </button>
          <button
            onClick={shareToWhatsApp}
            className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            Share to WhatsApp
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-neutral-700">{summary.overview}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <List title="Topics" items={summary.topics} />
        <List title="Key points" items={summary.keyPoints} />
        <List title="Scriptures" items={summary.scriptures} />
        <List title="Declarations" items={summary.declarations} />
      </div>
    </div>
  );
}
