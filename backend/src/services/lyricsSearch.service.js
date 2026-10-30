import { extractLyricsFromPage, identifySongs } from './openrouter.service.js';
import { parseSong } from './songImport.service.js';
import { searchSongbooks } from './songbooks.service.js';
import { fetchPageText, webSearch } from './webSearch.service.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Curly and straight apostrophes are the same word (pages and models disagree on which to use), and
// accented letters (Yoruba tone marks etc.) compare the same whether typed composed or decomposed.
const wordsOf = (t) => t.normalize('NFC').toLowerCase().replace(/[’‘`´]/g, "'").match(/[\p{L}\p{M}\p{N}']+/gu) ?? [];

// Sites that show a video/stream/store page, never lyrics text.
const SKIP_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|apple\.com|music\.amazon|amazon\.com|facebook\.com|instagram\.com|tiktok\.com|pinterest\.|twitter\.com|x\.com|reddit\.com|wikipedia\.org|deezer\.com|tidal\.com|soundcloud\.com|shazam\.com)$/i;

// zionlyrics.com has its own search (/search?q=), which finds Nigerian/African gospel well. Returns
// the song pages that best fit the words searched for, most relevant first.
async function searchZion(...queries) {
  const terms = [...new Set(queries.flatMap((q) => wordsOf(q).filter((w) => w.length > 2)))];
  const found = new Map();
  await Promise.all(
    [...new Set(queries.map((q) => String(q).trim()).filter(Boolean))].map(async (q) => {
      try {
        const res = await fetch(`https://zionlyrics.com/search?q=${encodeURIComponent(q.slice(0, 80))}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' }, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return;
        const html = await res.text();
        for (const m of html.matchAll(/href="(https:\/\/zionlyrics\.com\/song\/[^"#?]+)"/g)) found.set(m[1], m[1].split('/song/')[1]);
      } catch (err) {
        console.error('[zionlyrics] search failed', err.message);
      }
    })
  );
  const score = (slug) => {
    const w = new Set(slug.split('-'));
    return terms.filter((t) => w.has(t)).length - (/remix|instrumental|karaoke|swahili|cover/.test(slug) ? 0.5 : 0);
  };
  return [...found.entries()]
    .map(([url, slug]) => ({ url, score: score(slug) }))
    .filter((r) => r.score >= Math.min(2, terms.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => ({ url: r.url, title: '' }));
}

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// Guards against the model changing the words: nearly every word it returns must really be on the page.
function isOnPage(lyrics, pageText) {
  const page = new Set(wordsOf(pageText));
  const w = wordsOf(lyrics);
  return w.length >= 8 && w.filter((x) => page.has(x)).length / w.length >= 0.92;
}

// Finds lyrics for a free-text query using normal web search. AI first works out which song is
// meant (even from a half-remembered line), then lyric pages from ordinary search results are
// read and the lyrics copied off them, so each result shows where it came from.
export async function findSongLyrics(query) {
  const q = String(query || '').trim();
  const guesses = (await identifySongs({ query: q }).catch(() => null)) ?? [];
  const best = guesses[0];
  const primary = best ? `${best.title} ${best.artist}`.trim() : q;
  // Web search, zionlyrics' own search and the songbooks all at once.
  const [search, zion, bookHits] = await Promise.all([
    webSearch(`${primary} lyrics`),
    searchZion(primary, q),
    searchSongbooks({ query: q, guess: best }).catch(() => []),
  ]);

  const pages = [];
  const seenUrls = new Set();
  const hostCount = new Map();
  const addPages = (results, perHost = 1) => {
    for (const r of results) {
      const h = host(r.url);
      if (!h || SKIP_HOSTS.test(h) || seenUrls.has(r.url) || (hostCount.get(h) || 0) >= perHost) continue;
      seenUrls.add(r.url);
      hostCount.set(h, (hostCount.get(h) || 0) + 1);
      pages.push({ ...r, host: h });
      if (pages.length >= 9) break;
    }
  };
  addPages(zion, 3); // zionlyrics first - it's the best source for local gospel
  addPages(search.results);
  // Less common songs (local gospel, a different spelling) often turn up better for what the
  // user actually typed than for the AI's guess - widen the net.
  const guessMatchesQuery = best && norm(`${best.title}${best.artist}`).includes(norm(q));
  if (best && (pages.length < 4 || !guessMatchesQuery)) {
    const second = await webSearch(`${q} lyrics`);
    search.blocked &&= second.blocked;
    addPages(second.results);
  }

  const read = await Promise.all(
    pages.map(async (p) => {
      const text = await fetchPageText(p.url);
      if (text.length < 200) return null;
      const got = await extractLyricsFromPage({ pageText: text }).catch(() => null);
      if (!got || !isOnPage(got.lyrics, text)) return null;
      const lyrics = parseSong(got.lyrics, '').lyrics;
      return lyrics ? { id: p.url, title: got.title || best?.title || q, artist: got.artist || best?.artist || '', source: p.host, url: p.url, lyrics } : null;
    })
  );

  // Identical lyrics from another site add nothing to compare.
  const seen = new Set();
  const results = [];
  const fromBooks = bookHits.map((b) => ({ ...b, lyrics: parseSong(b.lyrics, '').lyrics })).filter((b) => b.lyrics);
  for (const r of [...fromBooks, ...read]) {
    if (!r) continue;
    const fp = norm(r.lyrics).slice(0, 400);
    if (seen.has(fp)) continue;
    seen.add(fp);
    results.push(r);
  }
  return { guesses, busy: search.blocked && !pages.length && !results.length, results };
}
