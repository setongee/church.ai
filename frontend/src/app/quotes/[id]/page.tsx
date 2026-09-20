'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getServiceQuotes } from '@/lib/api';
import type { ServiceQuotes } from '@/lib/types';

function useCopy() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // clipboard not available, ignore
    }
  };
  return { copiedId, copy };
}

export default function ServiceQuotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ServiceQuotes | null>(null);
  const { copiedId, copy } = useCopy();

  useEffect(() => {
    getServiceQuotes(id).then(setData).catch(() => setData(null));
  }, [id]);

  if (!data) {
    return <main className="mx-auto max-w-4xl px-6 py-12 text-sm text-neutral-400">Loading...</main>;
  }

  const { service, quotes } = data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/quotes" className="text-xs text-neutral-400 hover:text-neutral-600">
        &larr; All services
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
        {service.name} &ndash; Quotes
      </h1>
      <p className="mt-1 text-sm text-neutral-500">{quotes.length} quotes across all sessions.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {quotes.length === 0 && (
          <p className="col-span-2 rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
            No quotes yet for this service.
          </p>
        )}
        {quotes.map((q) => (
          <div key={q._id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium leading-snug text-neutral-900">&ldquo;{q.text}&rdquo;</p>
            <p className="mt-1.5 text-xs text-neutral-500">
              {q.sessionTitle} &middot; {q.sessionPreacher}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => copy(`${q._id}-text`, q.text)}
                className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
              >
                {copiedId === `${q._id}-text` ? 'Copied!' : 'Copy quote'}
              </button>
              <button
                onClick={() => router.push(`/editor/${q._id}`)}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Generate image
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
