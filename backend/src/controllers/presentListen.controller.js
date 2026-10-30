import { matchQuote, warmMatchIndex } from '../services/bible/match.js';
import { findParaphrase } from '../services/bible/paraphrase.js';

// GET /present/bibles/:id/match?q=<words heard> -> { matches: [{ book, chapter, verse, bookName, text, run, confidence, version }], tookMs }
// Matches a quote with no reference. Never uses an AI; empty when nothing is a confident match.
export function bibleMatch(req, res) {
  const q = String(req.query.q || '').slice(0, 600);
  if (!q.trim()) return res.json({ matches: [], tookMs: 0 });
  res.json(matchQuote(req.params.id, q));
}

// POST /present/bibles/:id/warm - builds the quote index ahead of time (called when listening starts).
export function bibleWarm(req, res) {
  setImmediate(() => warmMatchIndex(req.params.id));
  res.json({ ok: true });
}

// POST /present/bibles/:id/paraphrase { phrase } -> { matches: [{ book, chapter, verse, verseEnd, bookName, text, confidence, reason }], available, reason?, tookMs }
// The AI-assisted fallback for a verse said in the preacher's own words. Only the spoken sentence leaves the server.
export async function bibleParaphrase(req, res) {
  res.json(await findParaphrase(req.params.id, req.body?.phrase));
}
