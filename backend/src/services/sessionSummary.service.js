import { Session } from '../models/Session.model.js';
import { TranscriptSegment } from '../models/TranscriptSegment.model.js';
import { generateSummary, generateCarousel } from './openrouter.service.js';

// generateSummary returns null on any model/network hiccup, which used to leave an ended session
// with no summary for good (and so no ready-made points in the editor). One retry covers most blips.
export async function generateSummaryWithRetry(fullText) {
  return (await generateSummary({ fullText })) ?? (await generateSummary({ fullText }));
}

const inFlight = new Map();

// Backfills the summary (and carousel) for an ended session that missed it. Safe to call on every
// load: it's a no-op once a summary exists, and concurrent calls share one generation.
export function ensureSummary(session) {
  if (!session || session.status !== 'ended' || session.summary?.keyPoints?.length) return Promise.resolve(session);
  const key = String(session._id);
  if (!inFlight.has(key)) {
    const job = (async () => {
      const segments = await TranscriptSegment.find({ session: session._id }).sort({ createdAt: 1 });
      const fullText = segments.map((s) => s.text).join(' ');
      if (fullText.trim().length === 0) return session;
      const summary = await generateSummaryWithRetry(fullText);
      if (!summary) return session;
      session.summary = summary;
      if (!session.carousel?.length) {
        const carousel = await generateCarousel({ summary }).catch(() => null);
        if (carousel?.length) session.carousel = carousel;
      }
      await Session.updateOne({ _id: session._id }, { summary: session.summary, carousel: session.carousel });
      return session;
    })()
      .catch((err) => {
        console.error('[summary] backfill failed', err);
        return session;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return inFlight.get(key);
}
