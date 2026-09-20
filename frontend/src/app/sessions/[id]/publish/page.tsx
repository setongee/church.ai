'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getPublishQueue, publishQuoteToInstagram } from '@/lib/api';
import { PublishQuoteCard } from '@/components/PublishQuoteCard';
import type { PublishQueue, Quote } from '@/lib/types';

// Small delay between each publish call in "Post all" - Instagram creates one media container
// per call, and spacing them out is friendlier to the API than firing them all at once.
const POST_ALL_DELAY_MS = 2000;

export default function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [queue, setQueue] = useState<PublishQueue | null>(null);
  const [loadError, setLoadError] = useState('');
  const [postingAll, setPostingAll] = useState(false);

  useEffect(() => {
    getPublishQueue(id)
      .then(setQueue)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load'));
  }, [id]);

  function updateQuote(updated: Quote) {
    setQueue((prev) =>
      prev ? { ...prev, quotes: prev.quotes.map((q) => (q._id === updated._id ? updated : q)) } : prev
    );
  }

  async function handlePostAll() {
    if (!queue) return;
    setPostingAll(true);
    const unpublished = queue.quotes.filter((q) => !q.instagramMediaId);
    for (const q of unpublished) {
      try {
        const updated = await publishQuoteToInstagram(q._id);
        updateQuote(updated);
      } catch {
        // Per-card error state isn't visible from here; the card itself will still show
        // "Post to Instagram" so a failed one is obviously not done and can be retried alone.
      }
      await new Promise((resolve) => setTimeout(resolve, POST_ALL_DELAY_MS));
    }
    setPostingAll(false);
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      </main>
    );
  }

  if (!queue) {
    return <main className="mx-auto max-w-6xl px-6 py-12 text-sm text-neutral-400">Loading...</main>;
  }

  const { session, quotes } = queue;
  const unpublishedCount = quotes.filter((q) => !q.instagramMediaId).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/sessions/${id}`} className="text-xs text-neutral-400 hover:text-neutral-600">
            &larr; {session.title}
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">Post to Instagram</h1>
          <p className="text-sm text-neutral-500">
            {quotes.length} exported image{quotes.length === 1 ? '' : 's'} ready for review.
          </p>
        </div>
        {unpublishedCount > 0 && (
          <button
            onClick={handlePostAll}
            disabled={postingAll}
            className="rounded-lg bg-linear-to-r from-pink-600 to-orange-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {postingAll ? 'Posting...' : `Post all remaining (${unpublishedCount})`}
          </button>
        )}
      </div>

      {quotes.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
          No exported images yet. Open a quote in the image editor and hit &ldquo;Export
          image&rdquo; first - it&apos;ll show up here.
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {quotes.map((quote) => (
            <PublishQuoteCard key={quote._id} quote={quote} onUpdate={updateQuote} />
          ))}
        </div>
      )}
    </main>
  );
}
