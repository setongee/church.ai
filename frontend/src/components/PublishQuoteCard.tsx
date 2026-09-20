'use client';

import { useRef, useState } from 'react';
import { assetUrl, publishQuoteToInstagram, regenerateQuoteCaption, updateQuoteCaption } from '@/lib/api';
import type { Quote } from '@/lib/types';

const AUTOSAVE_DELAY_MS = 1200;

export function PublishQuoteCard({
  quote,
  onUpdate,
}: {
  quote: Quote;
  onUpdate: (quote: Quote) => void;
}) {
  const [caption, setCaption] = useState(quote.caption ?? '');
  // Tracks the last `quote.caption` this card has seen, so a change coming from outside (a
  // regenerate response) can be told apart from the user's own in-progress typing - adjusting
  // state during render per https://react.dev/learn/you-might-not-need-an-effect instead of an
  // effect, since this isn't synchronizing with any external system.
  const [lastSeenCaption, setLastSeenCaption] = useState(quote.caption ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [regenerating, setRegenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if ((quote.caption ?? '') !== lastSeenCaption) {
    setLastSeenCaption(quote.caption ?? '');
    setCaption(quote.caption ?? '');
  }

  function handleCaptionChange(value: string) {
    setCaption(value);
    setSaveStatus('idle');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const updated = await updateQuoteCaption(quote._id, value);
        onUpdate(updated);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('idle');
      }
    }, AUTOSAVE_DELAY_MS);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setError('');
    try {
      const updated = await regenerateQuoteCaption(quote._id);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate caption');
    } finally {
      setRegenerating(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError('');
    try {
      const updated = await publishQuoteToInstagram(quote._id);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish to Instagram');
    } finally {
      setPublishing(false);
    }
  }

  const isPublished = Boolean(quote.instagramMediaId);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-center bg-neutral-100 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl(quote.exportedImageUrl!)}
          alt={quote.text}
          className="max-h-72 w-auto rounded-md object-contain"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-xs font-medium leading-snug text-neutral-900">&ldquo;{quote.text}&rdquo;</p>

        <label className="mt-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Caption
        </label>
        <textarea
          value={caption}
          onChange={(e) => handleCaptionChange(e.target.value)}
          rows={4}
          placeholder="Write or generate a caption for this post..."
          className="w-full resize-none rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-800"
        />

        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span>
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Saved'}
          </span>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="font-medium text-indigo-600 hover:underline disabled:opacity-50"
          >
            {regenerating ? 'Regenerating...' : 'Regenerate caption'}
          </button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          {isPublished ? (
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md bg-green-50 px-2 py-1.5 text-xs font-medium text-green-700">
                Posted ✓
              </span>
              <div className="flex gap-2">
                {quote.instagramPermalink && (
                  <a
                    href={quote.instagramPermalink}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    View post
                  </a>
                )}
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                >
                  {publishing ? 'Posting...' : 'Post again'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="rounded-lg bg-linear-to-r from-pink-600 to-orange-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {publishing ? 'Posting...' : 'Post to Instagram'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
