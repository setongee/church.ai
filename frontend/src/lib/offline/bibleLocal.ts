// A copy of the Bible reference parser and word search the server uses, so a Bible kept on this device works with no network:
// "Jn 3:16" opens a passage, and anything else is a word search. (Server: backend/src/services/bible/books.js and store.js.)
import type { FindResult, Passage, SmartResult } from "../present";

export type BibleChapters = Record<string, Record<string, [number, string][]>>;

const BOOKS: [string, string, string, string][] = [
  ['Genesis', 'Gen', 'GEN', 'ge gn'],
  ['Exodus', 'Exod', 'EXO', 'ex exo exod'],
  ['Leviticus', 'Lev', 'LEV', 'le lv'],
  ['Numbers', 'Num', 'NUM', 'nu nm nb'],
  ['Deuteronomy', 'Deut', 'DEU', 'de dt deut'],
  ['Joshua', 'Josh', 'JOS', 'jos jsh'],
  ['Judges', 'Judg', 'JDG', 'jdg jg jdgs'],
  ['Ruth', 'Ruth', 'RUT', 'ru rth'],
  ['1 Samuel', '1Sam', '1SA', '1sa 1sm 1s'],
  ['2 Samuel', '2Sam', '2SA', '2sa 2sm 2s'],
  ['1 Kings', '1Kgs', '1KI', '1ki 1kgs 1k'],
  ['2 Kings', '2Kgs', '2KI', '2ki 2kgs 2k'],
  ['1 Chronicles', '1Chr', '1CH', '1ch 1chr'],
  ['2 Chronicles', '2Chr', '2CH', '2ch 2chr'],
  ['Ezra', 'Ezra', 'EZR', 'ezr'],
  ['Nehemiah', 'Neh', 'NEH', 'ne neh'],
  ['Esther', 'Esth', 'EST', 'es est esth'],
  ['Job', 'Job', 'JOB', 'jb'],
  ['Psalms', 'Ps', 'PSA', 'ps psa psalm pslm pss'],
  ['Proverbs', 'Prov', 'PRO', 'pr prv prov'],
  ['Ecclesiastes', 'Eccl', 'ECC', 'ec ecc eccl qoh'],
  ['Song of Solomon', 'Song', 'SNG', 'ss song sos songofsongs songofsolomon canticles'],
  ['Isaiah', 'Isa', 'ISA', 'is isa'],
  ['Jeremiah', 'Jer', 'JER', 'je jer'],
  ['Lamentations', 'Lam', 'LAM', 'la lam'],
  ['Ezekiel', 'Ezek', 'EZK', 'eze ezk ezek'],
  ['Daniel', 'Dan', 'DAN', 'da dn dan'],
  ['Hosea', 'Hos', 'HOS', 'ho hos'],
  ['Joel', 'Joel', 'JOL', 'joe jl'],
  ['Amos', 'Amos', 'AMO', 'am amo'],
  ['Obadiah', 'Obad', 'OBA', 'ob oba obad'],
  ['Jonah', 'Jonah', 'JON', 'jnh jon'],
  ['Micah', 'Mic', 'MIC', 'mi mic'],
  ['Nahum', 'Nah', 'NAM', 'na nah'],
  ['Habakkuk', 'Hab', 'HAB', 'hab hb'],
  ['Zephaniah', 'Zeph', 'ZEP', 'zep zph zeph'],
  ['Haggai', 'Hag', 'HAG', 'hag hg'],
  ['Zechariah', 'Zech', 'ZEC', 'zec zch zech'],
  ['Malachi', 'Mal', 'MAL', 'mal ml'],
  ['Matthew', 'Matt', 'MAT', 'mt mat matt'],
  ['Mark', 'Mark', 'MRK', 'mk mr mrk'],
  ['Luke', 'Luke', 'LUK', 'lk lu luk'],
  ['John', 'John', 'JHN', 'jn jhn joh'],
  ['Acts', 'Acts', 'ACT', 'ac act'],
  ['Romans', 'Rom', 'ROM', 'ro rm rom'],
  ['1 Corinthians', '1Cor', '1CO', '1co 1cor'],
  ['2 Corinthians', '2Cor', '2CO', '2co 2cor'],
  ['Galatians', 'Gal', 'GAL', 'ga gal'],
  ['Ephesians', 'Eph', 'EPH', 'ep eph'],
  ['Philippians', 'Phil', 'PHP', 'php phil pp'],
  ['Colossians', 'Col', 'COL', 'col'],
  ['1 Thessalonians', '1Thess', '1TH', '1th 1thess 1thes'],
  ['2 Thessalonians', '2Thess', '2TH', '2th 2thess 2thes'],
  ['1 Timothy', '1Tim', '1TI', '1ti 1tim'],
  ['2 Timothy', '2Tim', '2TI', '2ti 2tim'],
  ['Titus', 'Titus', 'TIT', 'ti tit'],
  ['Philemon', 'Phlm', 'PHM', 'phm phlm philem'],
  ['Hebrews', 'Heb', 'HEB', 'he heb'],
  ['James', 'Jas', 'JAS', 'jm jas jam'],
  ['1 Peter', '1Pet', '1PE', '1pe 1pet 1pt'],
  ['2 Peter', '2Pet', '2PE', '2pe 2pet 2pt'],
  ['1 John', '1John', '1JN', '1jn 1jo 1jhn 1john'],
  ['2 John', '2John', '2JN', '2jn 2jo 2jhn 2john'],
  ['3 John', '3John', '3JN', '3jn 3jo 3jhn 3john'],
  ['Jude', 'Jude', 'JUD', 'jud jd'],
  ['Revelation', 'Rev', 'REV', 're rev rv revelations'],
];

export const BOOK_LIST = BOOKS.map(([name], i) => ({ n: i + 1, name }));
const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const byAlias = new Map<string, number>();
BOOKS.forEach(([name, , , aliases], i) => {
  byAlias.set(norm(name), i + 1);
  aliases.split(" ").forEach((a) => byAlias.set(norm(a), i + 1));
});
export const bookName = (n: number) => BOOKS[n - 1]?.[0] || "";
// A book from its written name or abbreviation, or 0 if unknown; from an OSIS / USFX id ("Gen", "GEN"), or 0.
export const bookFromName = (name: string) => byAlias.get(norm(name)) || 0;
const byId = new Map<string, number>();
BOOKS.forEach(([, osis, usfx], i) => {
  byId.set(osis.toLowerCase(), i + 1);
  byId.set(usfx.toLowerCase(), i + 1);
});
export const bookFromId = (id: string) => byId.get(String(id).toLowerCase()) || 0;

export function parseReference(input: string): { book: number; chapter: number; verses: number[] | null } | null {
  const m = /^\s*((?:[1-3]\s*)?[a-z][a-z .]*?)\s*(\d+)?(?:\s*[:.]\s*([\d,\s\-–—]+))?\s*$/i.exec(String(input || ""));
  if (!m) return null;
  const book = byAlias.get(norm(m[1]));
  if (!book) return null;
  const chapter = m[2] ? parseInt(m[2], 10) : 1;
  let verses: number[] | null = null;
  if (m[3]) {
    verses = [];
    for (const part of m[3].split(',')) {
      const r = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/.exec(part);
      if (!r) continue;
      const a = parseInt(r[1], 10);
      const b = r[2] ? parseInt(r[2], 10) : a;
      for (let v = a; v <= Math.min(b, a + 200); v++) verses.push(v);
    }
    if (!verses.length) verses = null;
  }
  return { book, chapter, verses };
}


interface Flat {
  book: number;
  chapter: number;
  verse: number;
  text: string;
  lower: string;
}
const flatCache = new Map<string, Flat[]>();
function flatOf(id: string, chapters: BibleChapters): Flat[] {
  let flat = flatCache.get(id);
  if (!flat) {
    flat = [];
    for (const [b, chs] of Object.entries(chapters)) for (const [c, vs] of Object.entries(chs)) for (const [v, text] of vs) flat.push({ book: +b, chapter: +c, verse: v, text, lower: text.toLowerCase() });
    flat.sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);
    flatCache.set(id, flat);
  }
  return flat;
}

export function localBooks(chapters: BibleChapters) {
  return BOOK_LIST.filter((b) => chapters[b.n]).map((b) => ({ ...b, chapters: Math.max(...Object.keys(chapters[b.n]).map(Number)) }));
}
export function localChapter(chapters: BibleChapters, book: number, chapter: number): Passage {
  const vs = chapters[book]?.[chapter];
  if (!vs) throw new Error("Chapter not found in this version.");
  return { book, chapter, bookName: bookName(book), verses: vs.map(([n, text]) => ({ n, text })) };
}
function lookup(chapters: BibleChapters, q: string): Passage | null {
  const ref = parseReference(q);
  if (!ref) return null;
  const vs = chapters[ref.book]?.[ref.chapter];
  if (!vs) return { book: ref.book, chapter: ref.chapter, bookName: bookName(ref.book), verses: [] };
  const wanted = ref.verses ? new Set(ref.verses) : null;
  return { book: ref.book, chapter: ref.chapter, bookName: bookName(ref.book), verses: vs.filter(([n]) => !wanted || wanted.has(n)).map(([n, text]) => ({ n, text })) };
}
type Hits = { total: number; results: { book: number; chapter: number; bookName: string; verse: number; text: string }[] };
const hit = (v: Flat) => ({ book: v.book, chapter: v.chapter, bookName: bookName(v.book), verse: v.verse, text: v.text });
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every word must appear as a whole word (any order); phrases in "quotes" must appear exactly; exact-phrase hits come first.
function search(id: string, chapters: BibleChapters, q: string, limit = 100): Hits {
  const phrases = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
  const words = q.replace(/"[^"]*"/g, " ").toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  if (!phrases.length && !words.length) return { total: 0, results: [] };
  const wordRes = words.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, "u"));
  const exact = words.length > 1 ? words.join(" ") : "";
  const first: Flat[] = [];
  const other: Flat[] = [];
  for (const v of flatOf(id, chapters)) {
    if (!phrases.every((p) => v.lower.includes(p)) || !wordRes.every((r) => r.test(v.lower))) continue;
    (exact && v.lower.includes(exact) ? first : other).push(v);
  }
  const all = [...first, ...other];
  return { total: all.length, results: all.slice(0, limit).map(hit) };
}

const STOP = new Set("a an and are as at be but by for from had has have he her his i if in into is it its me my no not of on or our she so than that the their them then there these they this to up was we were what when which who whom whose will with would you your woman man".split(" "));
// A looser search for when the strict one finds nothing: ignores filler words and ranks verses by how many meaningful words match.
function searchAny(id: string, chapters: BibleChapters, q: string, limit = 40): Hits {
  const raw = q.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const words = [...new Set(raw.filter((w) => w.length > 2 && !STOP.has(w)))];
  const sig = words.length >= 2 ? [...new Set([...words, ...raw.filter((w) => w === "woman" || w === "man")])] : words;
  if (sig.length < 2) return { total: 0, results: [] };
  const res = sig.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(w.replace(/(ing|ed|es|s)$/, ""))}(?:s|es|ed|ing|d)?(?![\\p{L}\\p{N}])`, "u"));
  const need = sig.length <= 3 ? sig.length : Math.ceil(sig.length * 0.7);
  const hits: { v: Flat; n: number }[] = [];
  for (const v of flatOf(id, chapters)) {
    let n = 0;
    for (const r of res) if (r.test(v.lower)) n++;
    if (n >= need) hits.push({ v, n });
  }
  hits.sort((a, b) => b.n - a.n);
  return { total: hits.length, results: hits.slice(0, limit).map(({ v }) => hit(v)) };
}

export function localFind(id: string, chapters: BibleChapters, q: string): FindResult {
  const text = q.trim();
  if (!text) return { type: "empty" };
  const passage = lookup(chapters, text);
  if (passage?.verses.length) return { type: "passage", passage };
  return { type: "search", ...search(id, chapters, text) };
}
// Offline there is no AI: a reference opens its passage, anything else is the plain word search (strict, then loose).
export function localSmart(id: string, chapters: BibleChapters, q: string): SmartResult {
  const text = q.trim();
  if (!text) return { type: "empty" };
  const passage = lookup(chapters, text);
  if (passage?.verses.length) return { type: "passage", passage };
  const strict = search(id, chapters, text, 40);
  let keyword = strict;
  if (strict.total < 5) {
    const have = new Set(strict.results.map((r) => `${r.book}:${r.chapter}:${r.verse}`));
    const extra = searchAny(id, chapters, text, 40).results.filter((r) => !have.has(`${r.book}:${r.chapter}:${r.verse}`));
    keyword = { total: strict.total + extra.length, results: [...strict.results, ...extra].slice(0, 40) };
  }
  return { type: "smart", suggestions: [], ai: false, aiIssue: "unavailable", keyword };
}
