'use client';

import { useState } from 'react';
import { publishQuoteToInstagram } from '@/lib/api';
import { PublishQuoteCard } from './PublishQuoteCard';
import type { Quote } from '@/lib/types';

// Small delay between each publish call in "Post all" - Instagram creates one media container
// per call, and spacing them out is friendlier to the API than firing them all at once.
const POST_ALL_DELAY_MS = 2000;

export function ExportsTab({
  quotes,
  onUpdate,
}: {
  quotes: Quote[];
  onUpdate: (quote: Quote) => void;
}) {
  const [postingAll, setPostingAll] = useState(false);
  const exported = quotes.filter((q) => q.exportedImageUrl);
  const unpublishedCount = exported.filter((q) => !q.instagramMediaId).length;

  async function handlePostAll() {
    setPostingAll(true);
    const unpublished = exported.filter((q) => !q.instagramMediaId);
    for (const q of unpublished) {
      try {
        onUpdate(await publishQuoteToInstagram(q._id));
      } catch {
        // Per-card error state isn't visible from here; the card itself will still show
        // "Post to Instagram" so a failed one is obviously not done and can be retried alone.
      }
      await new Promise((resolve) => setTimeout(resolve, POST_ALL_DELAY_MS));
    }
    setPostingAll(false);
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Exports</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {exported.length} exported image{exported.length === 1 ? '' : 's'} ready for review.
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

      {exported.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
          No exported images yet. Open a quote in the image editor and hit &ldquo;Export
          image&rdquo; first - it&apos;ll show up here.
        </div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {exported.map((quote) => (
            <PublishQuoteCard key={quote._id} quote={quote} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
