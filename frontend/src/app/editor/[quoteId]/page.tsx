'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getQuote, type QuoteWithSession } from '@/lib/api';
import { QuoteImageEditor } from '@/components/QuoteImageEditor';
import type { Service } from '@/lib/types';

export default function QuoteEditorPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = use(params);
  const [data, setData] = useState<QuoteWithSession | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getQuote(quoteId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load quote'));
  }, [quoteId]);

  if (error) {
    return <main className="mx-auto max-w-5xl px-6 py-12 text-sm text-red-600">{error}</main>;
  }

  if (!data) {
    return <main className="mx-auto max-w-5xl px-6 py-12 text-sm text-neutral-400">Loading...</main>;
  }

  const { quote, session } = data;
  const service = typeof session.service === 'object' ? (session.service as Service) : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href={`/sessions/${session._id}`}
        className="text-xs text-neutral-400 hover:text-neutral-600"
      >
        &larr; {session.title}
      </Link>
      <h1 className="mt-1 text-xl font-semibold text-neutral-900">Image editor</h1>
      <p className="mt-1 text-sm text-neutral-500">&ldquo;{quote.text}&rdquo;</p>

      <div className="mt-6">
        <QuoteImageEditor quote={quote} service={service} />
      </div>
    </main>
  );
}
