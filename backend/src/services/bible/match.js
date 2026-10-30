import { bookName } from './books.js';
import { allVerses, listInstalled } from './store.js';

// Finds the verse a preacher is quoting from the words alone ("for God so loved the world that he gave..."), without
// any reference and without an AI: an in-memory word index over each installed Bible, then the longest run of
// consecutive words the phrase shares with each candidate verse. Fast (a few ms warm) and strict: it would rather
// say nothing than guess.

const MIN_WORDS = 4; // fewer spoken words than this is never a quote
const MIN_RUN = 5; // the phrase and the verse must share this many words in a row
const MIN_INFO = 9; // ...and those words must be distinctive, not just "and the lord said unto"
const COMMON_DF = 3000; // words in more verses than this don't vote for candidates

const words = (text) =>
  String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const indexes = new Map(); // bible id -> { verses, toks, inv, n }

function indexFor(id) {
  let ix = indexes.get(id);
  if (ix) return ix;
  const verses = allVerses(id);
  const toks = new Array(verses.length);
  const inv = new Map();
  for (let i = 0; i < verses.length; i++) {
    const t = words(verses[i].text);
    toks[i] = t;
    for (const w of new Set(t)) {
      const list = inv.get(w);
      if (list) list.push(i);
      else inv.set(w, [i]);
    }
  }
  ix = { verses, toks, inv, n: verses.length };
  indexes.set(id, ix);
  return ix;
}

// The longest stretch of consecutive words the two share: { len, qStart }.
function longestRun(q, v) {
  let best = 0;
  let qEnd = 0;
  let prev = new Uint16Array(v.length + 1);
  for (let i = 1; i <= q.length; i++) {
    const cur = new Uint16Array(v.length + 1);
    for (let j = 1; j <= v.length; j++) {
      if (q[i - 1] === v[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) {
          best = cur[j];
          qEnd = i;
        }
      }
    }
    prev = cur;
  }
  return { len: best, qStart: qEnd - best };
}

function matchIn(id, phrase) {
  const q = words(phrase);
  if (q.length < MIN_WORDS) return [];
  const ix = indexFor(id);
  const votes = new Map();
  for (const w of new Set(q)) {
    const list = ix.inv.get(w);
    if (!list || list.length > COMMON_DF) continue;
    for (const i of list) votes.set(i, (votes.get(i) || 0) + 1);
  }
  const cands = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
  const scored = [];
  for (const [i] of cands) {
    const { len, qStart } = longestRun(q, ix.toks[i]);
    if (len < MIN_RUN) continue;
    let info = 0;
    for (const w of q.slice(qStart, qStart + len)) info += Math.log(ix.n / (ix.inv.get(w)?.length || 1));
    if (info < MIN_INFO) continue;
    scored.push({ i, len, info });
  }
  if (!scored.length) return [];
  scored.sort((a, b) => b.len - a.len || b.info - a.info);
  const best = scored[0].len;
  const tied = scored.filter((s) => s.len === best);
  // A phrase that many verses share ("the Lord spake unto Moses saying") isn't a quote of one of them.
  if (tied.length > 3 && best < 8) return [];
  return tied.slice(0, 3).map((s) => {
    const v = ix.verses[s.i];
    return { version: id, book: v.book, chapter: v.chapter, verse: Number(v.verse), bookName: bookName(v.book), text: v.text, run: s.len, confidence: s.len >= 8 || (s.len >= 6 && tied.length === 1) ? 'high' : 'medium' };
  });
}

// The verses sharing the most distinctive words with what was said, whatever the order or wording - the raw material for
// spotting a PARAPHRASE ("God loved the world so much he gave his only son"). Returns the best few, each with how many
// of the spoken distinctive words it covers (0-1).
export function nearVerses(id, phrase, limit = 8) {
  const q = [...new Set(words(phrase))];
  const ix = indexFor(id);
  const rare = q.filter((w) => (ix.inv.get(w)?.length || 0) > 0 && (ix.inv.get(w)?.length || 0) <= COMMON_DF);
  if (rare.length < 3) return [];
  const weight = (w) => Math.log(ix.n / (ix.inv.get(w)?.length || 1));
  const total = rare.reduce((n, w) => n + weight(w), 0) || 1;
  const votes = new Map();
  for (const w of rare) for (const i of ix.inv.get(w)) votes.set(i, (votes.get(i) || 0) + weight(w));
  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i, score]) => {
      const v = ix.verses[i];
      return { book: v.book, chapter: v.chapter, verse: Number(v.verse), bookName: bookName(v.book), text: v.text, coverage: Math.min(1, score / total), score };
    });
}

// Tries the chosen version first, then the other installed ones (a preacher may quote another translation).
export function matchQuote(id, phrase) {
  const started = performance.now();
  const order = [id, ...listInstalled().map((b) => b.id).filter((x) => x !== id)];
  let matches = [];
  for (const v of order) {
    try {
      matches = matchIn(v, phrase);
    } catch {
      matches = [];
    }
    if (matches.length) break;
  }
  // No exact quote - but does it share a lot of distinctive words with one verse? Then it may be a paraphrase worth
  // asking the AI about (the caller decides; this only says "worth a look").
  let hint = false;
  if (!matches.length) {
    try {
      const near = nearVerses(id, phrase, 3)[0];
      hint = Boolean(near && near.coverage >= 0.55 && near.score >= 11);
    } catch {
      hint = false;
    }
  }
  return { matches, hint, tookMs: Math.round((performance.now() - started) * 10) / 10 };
}

// Warm the index of one version in the background so the first spoken quote isn't the slow one.
export function warmMatchIndex(id) {
  for (const v of [id, ...listInstalled().map((b) => b.id).filter((x) => x !== id)]) {
    try {
      indexFor(v);
    } catch {
      // not installed
    }
  }
}
