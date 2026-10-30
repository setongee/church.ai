import { env } from '../../config/env.js';
import { aiIssue, callOpenRouterJSON } from '../openrouter.service.js';
import { bookFromName, bookName } from './books.js';
import { getVerses } from './store.js';
import { nearVerses } from './match.js';

// Spots a PARAPHRASE: the preacher says a verse in their own words ("God loved the world so much he gave his only
// son"), so no run of words matches the text. The closest verses by shared distinctive words are found first (fast,
// local), then an AI picks the one being quoted - or says it is nobody's verse. The AI only ever NAMES a passage: what is
// shown is always the real text from the chosen Bible, and a reference that doesn't exist in it is thrown away.

const SYSTEM = `You help a church presenter. You get the words a preacher just said, plus candidate Bible verses found by a word search. Decide whether the preacher is QUOTING or PARAPHRASING a specific Bible verse (or two or three consecutive verses).
Preachers paraphrase freely, quote other translations, and mix their own words in. Rules:
- Answer only when you are confident which verse it is. If the sentence is the preacher's own teaching, a story, an illustration, a welcome, a prayer, an announcement or general talk, return an empty list. Doing nothing is better than guessing.
- Candidates come from a word search and are often wrong when the preacher used different words, so judge them honestly: use one when it clearly fits; if you recognise a well-known verse that fits better (for example "through Christ who strengthens me" for "Christ gives me strength to handle anything"), name that verse instead. Never invent a reference.
- At most 2 matches, best first. confidence "high" only when the wording clearly follows the verse; otherwise "medium".
Output nothing but the JSON object - no sentence before or after it. Respond ONLY with JSON: {"matches":[{"book":"John","chapter":3,"verseStart":16,"verseEnd":16,"confidence":"high","reason":"max 12 words"}]}`;

const STOP = new Set('the a an and or but of to in on at by for with from as is are was were be been being it its this that these those he she they them his her their we you your our i me my not no so if then than there here who whom which what when where do does did have has had will would shall should can could may might must also just very more most much many some any all each every one'.split(' '));
const content = (t) => String(t).toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

const cache = new Map(); // `${id}|${phrase}` -> { at, result }
const TTL = 10 * 60_000;

export async function findParaphrase(id, rawPhrase) {
  const started = performance.now();
  const phrase = String(rawPhrase || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (phrase.split(' ').length < 4) return { matches: [], available: true, tookMs: 0 };
  if (!env.openrouterApiKey) return { matches: [], available: false, reason: 'no-key', tookMs: 0 };

  const key = `${id}|${phrase.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.result, tookMs: 0, cached: true };

  const near = nearVerses(id, phrase, 8);
  const user = JSON.stringify({ spoken: phrase, candidates: near.map((n) => ({ ref: `${n.bookName} ${n.chapter}:${n.verse}`, text: n.text.slice(0, 220) })) });
  // The stronger model first; a brief rate limit gets one quick retry, then the cheaper model gets a go.
  let ai = null;
  for (const model of [...new Set([env.paraphraseModel, env.openrouterModel])]) {
    for (let attempt = 0; attempt < 2 && !ai; attempt++) {
      ai = await callOpenRouterJSON({ system: SYSTEM, user, maxTokens: 260, temperature: 0.1, model }).catch(() => null);
      if (!ai && aiIssue() !== 'busy') break;
      if (!ai) await new Promise((r) => setTimeout(r, 700));
    }
    if (ai) break;
  }
  if (!ai || !Array.isArray(ai.matches)) return { matches: [], available: false, reason: aiIssue() || 'unavailable', tookMs: Math.round(performance.now() - started) };

  const spoken = new Set(content(phrase));
  const matches = [];
  for (const m of ai.matches.slice(0, 2)) {
    const book = bookFromName(String(m?.book ?? ''));
    const chapter = Math.trunc(Number(m?.chapter));
    const from = Math.trunc(Number(m?.verseStart)) || 1;
    const to = Math.min(from + 2, Math.max(from, Math.trunc(Number(m?.verseEnd)) || from));
    if (!book || !(chapter >= 1)) continue;
    const verses = getVerses(id, book, chapter, from, to);
    if (!verses.length) continue; // not a real passage in this Bible - drop it rather than trust it
    const text = verses.map((v) => v.text).join(' ');
    const fromList = near.some((n) => n.book === book && n.chapter === chapter && n.verse >= verses[0].n && n.verse <= verses[verses.length - 1].n);
    const shared = content(text).filter((w) => spoken.has(w)).length;
    const overlap = spoken.size ? shared / spoken.size : 0;
    // A name that came from the word search is trusted; one the AI produced on its own has to share at least some words
    // with what was said (a loose paraphrase can share few, so this is a light check, not a strict one).
    if (!fromList && overlap < 0.12 && m?.confidence !== 'high') continue;
    matches.push({
      book,
      chapter,
      verse: verses[0].n,
      verseEnd: verses[verses.length - 1].n,
      bookName: bookName(book),
      text,
      confidence: 'medium', // a paraphrase is always "check it"
      reason: String(m?.reason || '').slice(0, 100),
    });
  }
  const result = { matches, available: true };
  cache.set(key, { at: Date.now(), result });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return { ...result, tookMs: Math.round(performance.now() - started) };
}
