// Finds Bible references in what a preacher says: "turn with me to John chapter three verse sixteen",
// "Romans 8:28-30", "Psalm one hundred and nineteen", even noisy speech-to-text ("Jon 3 16").
//
// Pure TypeScript with no imports (it also runs under plain Node for the tests), fast enough to run on every
// interim transcript update. It reports WHERE in the text a reference sits (so a repeat isn't suggested twice) and
// whether the text ends right after it (`atTail`) - speech arrives word by word, so "John 3" at the tail may still
// become "John 3:16" a moment later.

export interface SpokenRef {
  book: number; // 1-66, in Bible order
  bookName: string;
  chapter: number;
  verseFrom: number | null; // null = the whole chapter was named
  verseTo: number | null; // for a range, else the same as verseFrom
  start: number; // where the reference begins in the text
  end: number; // where it ends
  hasVerse: boolean;
  atTail: boolean; // nothing but whitespace follows it, so more words may still extend it
  // high = a clear reference; medium = a fuzzy book name, or an everyday word ("Mark", "Job", "Acts", "Numbers")
  // with no chapter/verse wording; low = a bare "verse 17" resolved against the previous reference.
  confidence: "high" | "medium" | "low";
  contextual?: boolean;
  key: string; // same reference => same key ("43:3:16-16")
  label: string; // "John 3:16", "Psalms 23", "Romans 8:28-30"
}

// [name, ...spoken forms]. Numbered books ("1 John") are built from NUMBERED below.
const BOOKS: [string, ...string[]][] = [
  ["Genesis", "genesis"],
  ["Exodus", "exodus"],
  ["Leviticus", "leviticus"],
  ["Numbers", "numbers"],
  ["Deuteronomy", "deuteronomy"],
  ["Joshua", "joshua"],
  ["Judges", "judges"],
  ["Ruth", "ruth"],
  ["1 Samuel"],
  ["2 Samuel"],
  ["1 Kings"],
  ["2 Kings"],
  ["1 Chronicles"],
  ["2 Chronicles"],
  ["Ezra", "ezra"],
  ["Nehemiah", "nehemiah"],
  ["Esther", "esther"],
  ["Job", "job"],
  ["Psalms", "psalms", "psalm"],
  ["Proverbs", "proverbs", "proverb"],
  ["Ecclesiastes", "ecclesiastes"],
  ["Song of Solomon", "song of solomon", "song of songs", "songs of solomon", "songs of songs", "canticles"],
  ["Isaiah", "isaiah", "isiah"],
  ["Jeremiah", "jeremiah"],
  ["Lamentations", "lamentations"],
  ["Ezekiel", "ezekiel", "ezekial"],
  ["Daniel", "daniel"],
  ["Hosea", "hosea"],
  ["Joel", "joel"],
  ["Amos", "amos"],
  ["Obadiah", "obadiah"],
  ["Jonah", "jonah"],
  ["Micah", "micah"],
  ["Nahum", "nahum"],
  ["Habakkuk", "habakkuk", "habakuk", "habacuc", "habbakuk"],
  ["Zephaniah", "zephaniah"],
  ["Haggai", "haggai"],
  ["Zechariah", "zechariah"],
  ["Malachi", "malachi"],
  ["Matthew", "matthew", "mathew"],
  ["Mark", "mark"],
  ["Luke", "luke"],
  ["John", "john", "jon"],
  ["Acts", "acts", "acts of the apostles"],
  ["Romans", "romans"],
  ["1 Corinthians"],
  ["2 Corinthians"],
  ["Galatians", "galatians"],
  ["Ephesians", "ephesians"],
  ["Philippians", "philippians", "phillipians"],
  ["Colossians", "colossians"],
  ["1 Thessalonians"],
  ["2 Thessalonians"],
  ["1 Timothy"],
  ["2 Timothy"],
  ["Titus", "titus"],
  ["Philemon", "philemon"],
  ["Hebrews", "hebrews"],
  ["James", "james"],
  ["1 Peter"],
  ["2 Peter"],
  ["1 John"],
  ["2 John"],
  ["3 John"],
  ["Jude", "jude"],
  ["Revelation", "revelation", "revelations", "the revelation", "book of revelation"],
];

// "first john" / "1 john" / "one john": the word after the number -> the book.
const NUMBERED: Record<number, Record<string, number>> = {
  1: { samuel: 9, kings: 11, chronicles: 13, corinthians: 46, thessalonians: 52, timothy: 54, peter: 60, john: 62 },
  2: { samuel: 10, kings: 12, chronicles: 14, corinthians: 47, thessalonians: 53, timothy: 55, peter: 61, john: 63 },
  3: { john: 64 },
};
const ORDINALS: Record<string, number> = { "1": 1, one: 1, first: 1, "2": 2, two: 2, second: 2, "3": 3, three: 3, third: 3 };

// How many chapters each book has (to reject "John 40" and to read "Jude 5" as verse 5).
const CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];

// Book names that are also everyday English words: they only count as "high" with chapter/verse wording.
const COMMON_WORDS = new Set(["numbers", "ruth", "job", "mark", "acts", "judges", "james", "amos", "jude"]);

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

interface Tok {
  w: string; // lower-case word, digits, or one of : - – —
  s: number; // start offset in the text
  e: number; // end offset
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /[A-Za-z]+|\d+|[:\-–—]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ w: m[0].toLowerCase(), s: m.index, e: m.index + m[0].length });
  return out;
}

const isDigits = (w: string) => /^\d+$/.test(w);

interface Num {
  value: number;
  next: number; // index of the token after the number
  words: boolean; // spoken as words rather than digits
}

function readUnderHundred(t: Tok[], i: number): Num | null {
  const w = t[i]?.w;
  if (!w) return null;
  if (w in TENS) {
    let j = i + 1;
    if (t[j]?.w === "-" && t[j + 1] && t[j + 1].w in UNITS) j++; // "twenty-eight"
    if (t[j] && t[j].w in UNITS) return { value: TENS[w] + UNITS[t[j].w], next: j + 1, words: true };
    return { value: TENS[w], next: i + 1, words: true };
  }
  if (w in TEENS) return { value: TEENS[w], next: i + 1, words: true };
  if (w in UNITS) return { value: UNITS[w], next: i + 1, words: true };
  return null;
}

// Speech-to-text often writes the number it hears as another word. Only trusted straight after "verse".
const HOMOPHONES: Record<string, number> = { for: 4, fore: 4, won: 1, ate: 8 };

// "16", "sixteen", "twenty one", "twenty-one", "one hundred and nineteen", "hundred and fifty".
function readNumber(t: Tok[], i: number, afterVerseWord = false): Num | null {
  const w = t[i]?.w;
  if (!w) return null;
  if (afterVerseWord && w in HOMOPHONES) return { value: HOMOPHONES[w], next: i + 1, words: true };
  if (isDigits(w)) return w.length <= 4 ? { value: parseInt(w, 10), next: i + 1, words: false } : null;
  if (w === "hundred" || (w in UNITS && t[i + 1]?.w === "hundred")) {
    const base = w in UNITS ? UNITS[w] * 100 : 100;
    const after = w in UNITS ? i + 2 : i + 1;
    const j = t[after]?.w === "and" ? after + 1 : after;
    const rest = readUnderHundred(t, j);
    return rest ? { value: base + rest.value, next: rest.next, words: true } : { value: base, next: after, words: true };
  }
  return readUnderHundred(t, i);
}

// ---- book names ------------------------------------------------------------------------------------------------------

const SINGLE = new Map<string, number>(); // one-word names
const MULTI: { words: string[]; book: number }[] = []; // multi-word names, longest first
BOOKS.forEach(([, ...forms], i) => {
  for (const f of forms) {
    const words = f.split(" ");
    if (words.length === 1) SINGLE.set(f, i + 1);
    else MULTI.push({ words, book: i + 1 });
  }
});
MULTI.sort((a, b) => b.words.length - a.words.length);
const NAMEABLE = [...SINGLE.keys()].filter((k) => k.length >= 6); // what a mis-heard long name can be matched to

// Edit distance, giving up (returns max + 1) once it can't come in under `max`.
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

interface BookHit {
  book: number;
  from: number; // first token of the book name (the "first" of "first john" included)
  next: number; // token after the name
  fuzzy: boolean; // a mis-heard name
  common: boolean; // an everyday English word
}

function readBook(t: Tok[], i: number): BookHit | null {
  const w = t[i].w;
  // "first john", "2 corinthians"
  const n = ORDINALS[w];
  const after = t[i + 1]?.w;
  if (n && after && NUMBERED[n]?.[after]) return { book: NUMBERED[n][after], from: i, next: i + 2, fuzzy: false, common: false };
  for (const m of MULTI) {
    if (m.words.every((mw, k) => t[i + k]?.w === mw)) return { book: m.book, from: i, next: i + m.words.length, fuzzy: false, common: false };
  }
  const single = SINGLE.get(w);
  if (single) return { book: single, from: i, next: i + 1, fuzzy: w === "jon", common: COMMON_WORDS.has(w) };
  // A mis-heard long name ("thesalonians", "habacuc"): within a letter or two of a real one.
  if (w.length >= 6 && /^[a-z]+$/.test(w)) {
    const max = w.length >= 9 ? 2 : 1;
    let best = 0;
    let bestD = max + 1;
    for (const name of NAMEABLE) {
      const d = distance(w, name, max);
      if (d < bestD) {
        bestD = d;
        best = SINGLE.get(name) || 0;
      }
    }
    if (best) return { book: best, from: i, next: i + 1, fuzzy: true, common: false };
  }
  return null;
}

// ---- finding references ----------------------------------------------------------------------------------------------

const CHAPTER_WORDS = new Set(["chapter", "chapters", "ch"]);
const VERSE_WORDS = new Set(["verse", "verses", "vs", "versus"]);
const RANGE_WORDS = new Set(["to", "through", "thru", "until", "till", "-", "–", "—"]);

function build(book: number, chapter: number, from: number | null, to: number | null, start: number, end: number, text: string, confidence: SpokenRef["confidence"], contextual = false): SpokenRef {
  const name = BOOKS[book - 1][0];
  const toV = from ? (to && to >= from ? to : from) : null;
  return {
    book,
    bookName: name,
    chapter,
    verseFrom: from,
    verseTo: toV,
    start,
    end,
    hasVerse: from !== null,
    atTail: text.slice(end).replace(/[\s.,;!?]/g, "") === "",
    confidence,
    contextual: contextual || undefined,
    key: `${book}:${chapter}:${from ?? 0}-${toV ?? 0}`,
    label: `${name} ${chapter}${from ? `:${from}${toV && toV !== from ? `-${toV}` : ""}` : ""}`,
  };
}

// Everything after a book name: chapter, optional verse, optional verse range.
function readLocator(t: Tok[], hit: BookHit, text: string): { ref: SpokenRef; next: number } | null {
  let p = hit.next;
  let marked = false; // "chapter" / "verse" wording or a colon was used
  while (CHAPTER_WORDS.has(t[p]?.w ?? "")) {
    p++;
    marked = true;
  }
  const max = CHAPTERS[hit.book - 1];
  // A one-chapter book can go straight to the verse: "third John verse four", "Jude verse 5".
  if (max === 1 && VERSE_WORDS.has(t[p]?.w ?? "")) {
    const v = readNumber(t, p + 1, true);
    if (!v || v.value < 1 || v.value > 176) return null;
    let last = v.next - 1;
    let to: number | null = null;
    if (RANGE_WORDS.has(t[v.next]?.w ?? "")) {
      const m = readNumber(t, v.next + 1);
      if (m && m.value > v.value && m.value <= 176) {
        to = m.value;
        last = m.next - 1;
      }
    }
    return { ref: build(hit.book, 1, v.value, to, t[hit.from].s, t[last].e, text, hit.fuzzy ? "medium" : "high"), next: last + 1 };
  }
  const ch = readNumber(t, p);
  if (!ch) return null;
  let chapter = ch.value;
  let verseFrom: number | null = null;
  let verseTo: number | null = null;
  let last = ch.next - 1; // the last token used
  let q = ch.next;

  // Psalms has 150 chapters and people drop the "hundred": "Psalm one nineteen" is 119, "one thirty six" is 136,
  // "one fifty" is 150. (Psalm 1 only has six verses, so "1:19" or "1:36" can't be what was meant.) A "verse"/colon in
  // between ("Psalm one verse six") keeps it as chapter 1.
  if (hit.book === 19 && chapter === 1) {
    const n = readNumber(t, q);
    if (n && n.value >= 7 && n.value <= 50) {
      chapter = 100 + n.value;
      last = n.next - 1;
      q = n.next;
    }
  }

  // "John 316" = John 3:16 (a long run of digits that can't be a chapter).
  if (!ch.words && chapter > max && t[p].w.length >= 3) {
    const raw = t[p].w;
    for (const cut of [1, 2]) {
      const c = parseInt(raw.slice(0, cut), 10);
      const rest = raw.slice(cut);
      const v = parseInt(rest, 10);
      if (c >= 1 && c <= max && rest.length >= 1 && !rest.startsWith("0") && v >= 1 && v <= 176) {
        chapter = c;
        verseFrom = v;
        break;
      }
    }
    if (verseFrom === null) return null;
  }
  // A one-chapter book ("Jude 5", "Philemon 8") reads the number as the verse.
  if (max === 1 && chapter > 1 && verseFrom === null) {
    verseFrom = chapter;
    chapter = 1;
  }
  if (chapter < 1 || chapter > max) return null;

  if (verseFrom === null) {
    // ":" / "colon" / "verse" / "and verse", or just the next number ("Romans eight twenty eight", "John 3 16").
    let r = q;
    let verseWord = false;
    for (;;) {
      const w = t[r]?.w;
      if (w === ":" || w === "colon" || VERSE_WORDS.has(w ?? "")) {
        marked = true;
        if (VERSE_WORDS.has(w ?? "")) verseWord = true;
        r++;
      } else if (w === "and" && VERSE_WORDS.has(t[r + 1]?.w ?? "")) r++;
      else break;
    }
    const v = readNumber(t, r, verseWord);
    if (v && v.value >= 1 && v.value <= 176) {
      verseFrom = v.value;
      last = v.next - 1;
      q = v.next;
    }
  } else {
    q = last + 1;
  }

  // A verse range: "16 to 18", "16-18", "16 through verse 18".
  if (verseFrom !== null && RANGE_WORDS.has(t[q]?.w ?? "")) {
    let j = q + 1;
    if (VERSE_WORDS.has(t[j]?.w ?? "")) j++;
    const m = readNumber(t, j);
    if (m && m.value > verseFrom && m.value <= 176) {
      verseTo = m.value;
      last = m.next - 1;
    }
  }

  const evidence = marked || verseFrom !== null;
  const confidence: SpokenRef["confidence"] = hit.fuzzy || (hit.common && !evidence) ? "medium" : "high";
  return { ref: build(hit.book, chapter, verseFrom, verseTo, t[hit.from].s, t[last].e, text, confidence), next: last + 1 };
}

// Every Bible reference in `text`, in the order spoken. `context` (the reference just read) lets a bare
// "verse 17" mean that verse of the same chapter (low confidence, never to be shown automatically).
export function detectScriptures(text: string, opts: { context?: { book: number; chapter: number } | null } = {}): SpokenRef[] {
  const t = tokenize(text);
  const found: SpokenRef[] = [];
  let i = 0;
  while (i < t.length) {
    const hit = readBook(t, i);
    const parsed = hit ? readLocator(t, hit, text) : null;
    if (!parsed) {
      i++;
      continue;
    }
    found.push(parsed.ref);
    i = parsed.next;
  }

  if (!found.length && opts.context) {
    for (let k = 0; k < t.length; k++) {
      if (!VERSE_WORDS.has(t[k].w)) continue;
      const n = readNumber(t, k + 1, true);
      if (!n || n.value < 1 || n.value > 176) continue;
      let to: number | null = null;
      let end = t[n.next - 1].e;
      if (RANGE_WORDS.has(t[n.next]?.w ?? "")) {
        let j = n.next + 1;
        if (VERSE_WORDS.has(t[j]?.w ?? "")) j++;
        const m = readNumber(t, j);
        if (m && m.value > n.value && m.value <= 176) {
          to = m.value;
          end = t[m.next - 1].e;
        }
      }
      found.push(build(opts.context.book, opts.context.chapter, n.value, to, t[k].s, end, text, "low", true));
      break;
    }
  }
  return found;
}

export const bookNameOf = (n: number) => BOOKS[n - 1]?.[0] ?? "";
export const chapterCountOf = (n: number) => CHAPTERS[n - 1] ?? 0;
// The 66 names, for things like speech-recognition keyword boosting.
export const BOOK_NAMES = BOOKS.map(([name]) => name);
