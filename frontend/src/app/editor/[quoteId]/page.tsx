'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDesign, getQuote } from '@/lib/api';

// Old per-quote editor URL: open (or create) the quote's design in the session's Editor tab.
export default function LegacyQuoteEditorRedirect({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = use(params);
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    getQuote(quoteId)
      .then(({ quote, session }) => createDesign({ sessionId: session._id, source: 'quote', sourceId: quote._id, text: quote.text }).then(({ design }) => router.replace(`/design/${design._id}`)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to open the editor'));
  }, [quoteId, router]);

  return <main className="mx-auto max-w-5xl px-6 py-12 text-sm text-neutral-500">{error ? <span className="text-red-600">{error}</span> : 'Opening the editor…'}</main>;
}
