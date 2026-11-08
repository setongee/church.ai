import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseBible } from './parse.js';
import { BOOK_LIST, bookName, parseReference } from './books.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Original XML is kept in xml/ (so a Bible can be re-parsed or exported); parsed JSON in parsed/ is
// what lookups and search actually read.
export const BIBLE_DIR = path.join(__dirname, '..', '..', '..', 'data', 'bibles');
const XML_DIR = path.join(BIBLE_DIR, 'xml');
const PARSED_DIR = path.join(BIBLE_DIR, 'parsed');
const INDEX_FILE = path.join(BIBLE_DIR, 'index.json');
fs.mkdirSync(XML_DIR, { recursive: true });
fs.mkdirSync(PARSED_DIR, { recursive: true });

const RAW = 'https://raw.githubusercontent.com/seven1m/open-bibles/master';

// Free, public-domain / openly licensed Bibles that can be downloaded on demand (Open Bibles
// project, which republishes Zefania/OSIS/USFX XML). Copyrighted versions (NIV, ESV, NKJV, NLT,
// GNT, TPT, AMPC...) are NOT here - license-holders don't allow redistribution - but a licensed
// copy in Zefania/OSIS/USFX XML can be imported with importBible().
const CATALOG = [
  ['kjv', 'KJV', 'King James Version', 'en', 'eng-kjv.osis.xml', 'Public domain'],
  ['asv', 'ASV', 'American Standard Version (1901)', 'en', 'eng-asv.zefania.xml', 'Public domain'],
  ['bbe', 'BBE', 'Bible in Basic English', 'en', 'eng-bbe.usfx.xml', 'Public domain'],
  ['web', 'WEB', 'World English Bible', 'en', 'eng-web.usfx.xml', 'Public domain'],
  ['webbe', 'WEBBE', 'World English Bible, British Edition', 'en', 'eng-gb-webbe.usfx.xml', 'Public domain'],
  ['ylt', 'YLT', "Young's Literal Translation", 'en', 'eng-ylt.zefania.xml', 'Public domain'],
  ['darby', 'DARBY', 'Darby Bible', 'en', 'eng-darby.zefania.xml', 'Public domain'],
  ['dra', 'DRA', 'Douay-Rheims American', 'en', 'eng-dra.zefania.xml', 'Public domain'],
  ['bsb', 'BSB', 'Berean Standard Bible', 'en', 'eng-bsb.usfx.xml', 'Public domain (CC0)'],
  ['oeb-us', 'OEB', 'Open English Bible (US)', 'en', 'eng-us-oeb.osis.xml', 'CC0'],
  ['oeb-gb', 'OEB-GB', 'Open English Bible (GB)', 'en', 'eng-gb-oeb.osis.xml', 'CC0'],
  ['rv1909', 'RV1909', 'Reina-Valera 1909', 'es', 'spa-rv1909.usfx.xml', 'Public domain'],
  ['almeida', 'ARA', 'João Ferreira de Almeida', 'pt', 'por-almeida.usfx.xml', 'Public domain'],
  ['ostervald', 'OSTER', 'Ostervald', 'fr', 'fra-ostervald.osis.xml', 'Public domain'],
  ['luther1912', 'LUT1912', 'Luther Bibel 1912', 'de', 'deu-luther1912.osis.xml', 'Public domain'],
  ['riveduta', 'RIV', 'Riveduta', 'it', 'ita-riveduta.osis.xml', 'Public domain'],
  ['synodal', 'SYNOD', 'Синодальный перевод', 'ru', 'rus-synodal.zefania.xml', 'Public domain'],
  ['swahili', 'SWA', 'Swahili Union Version', 'sw', 'swa-swahili.osis.xml', 'Public domain'],
  ['cuv', 'CUV', 'Chinese Union Version (Simplified)', 'zh', 'chi-cuv-simp.usfx.xml', 'Public domain'],
  ['tagalog', 'ADB', 'Ang Dating Biblia', 'tl', 'tgl-tagalog.osis.xml', 'Public domain'],
].map(([id, abbr, name, lang, file, license]) => ({ id, abbr, name, lang, license, url: `${RAW}/${file}` }));

export const getCatalog = () => CATALOG;

// ---- registry of installed Bibles -------------------------------------------------------------

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return [];
  }
}
const writeIndex = (list) => fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2));

export const listInstalled = () => readIndex();

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// ---- loaded (parsed) Bibles, kept in memory once used -----------------------------------------

const loaded = new Map(); // id -> { chapters: {book: {ch: [[v, text]]}}, flat: [{book,chapter,verse,text,lower}] }

function load(id) {
  if (loaded.has(id)) return loaded.get(id);
  const file = path.join(PARSED_DIR, `${path.basename(id)}.json`);
  if (!fs.existsSync(file)) {
    throw Object.assign(new Error('That Bible is not installed.'), { status: 404 });
  }
  const chapters = JSON.parse(fs.readFileSync(file, 'utf8'));
  const flat = [];
  for (const [b, chs] of Object.entries(chapters)) {
    for (const [c, vs] of Object.entries(chs)) {
      for (const [v, text] of vs) flat.push({ book: +b, chapter: +c, verse: v, text, lower: text.toLowerCase() });
    }
  }
  flat.sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);
  const entry = { chapters, flat };
  loaded.set(id, entry);
  return entry;
}

// Every verse of an installed Bible as { book, chapter, verse, text } in reading order (for matching a spoken quote).
export const allVerses = (id) => load(id).flat;

// A whole parsed Bible ({ book: { chapter: [[verse, text]] } }), for keeping a copy on a device.
export const bibleData = (id) => load(path.basename(id)).chapters;

// ---- install / remove -------------------------------------------------------------------------

function install(meta, xml) {
  const { format, data, verses } = parseBible(xml);
  fs.writeFileSync(path.join(XML_DIR, `${meta.id}.xml`), xml);
  fs.writeFileSync(path.join(PARSED_DIR, `${meta.id}.json`), JSON.stringify(data));
  loaded.delete(meta.id);
  const entry = { ...meta, format, verses, installedAt: new Date().toISOString() };
  writeIndex([...readIndex().filter((b) => b.id !== meta.id), entry]);
  return entry;
}

export async function downloadBible(id) {
  const item = CATALOG.find((c) => c.id === id);
  if (!item) throw Object.assign(new Error('Unknown Bible.'), { status: 404 });
  const res = await fetch(item.url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw Object.assign(new Error(`Download failed (${res.status}).`), { status: 502 });
  const xml = await res.text();
  const { url, ...meta } = item;
  return install({ ...meta, source: 'catalog' }, xml);
}

// A user-supplied XML Bible (e.g. a licensed NIV/ESV/NKJV module they own, or one found on the
// Zefania / OSIS sites). Fields are the display name/abbreviation the user chose.
export function importBible({ xml, name, abbr, lang }) {
  const id = slug(abbr || name) || `bible-${Date.now()}`;
  return install(
    { id, abbr: String(abbr || name).toUpperCase().slice(0, 12), name: String(name || abbr).slice(0, 80), lang: lang || 'en', license: 'Imported', source: 'import' },
    xml
  );
}

export function removeBible(id) {
  const safe = path.basename(id);
  for (const f of [path.join(XML_DIR, `${safe}.xml`), path.join(PARSED_DIR, `${safe}.json`)]) {
    fs.rmSync(f, { force: true });
  }
  loaded.delete(safe);
  writeIndex(readIndex().filter((b) => b.id !== safe));
}

// ---- reading ----------------------------------------------------------------------------------

export function getBooks(id) {
  const { chapters } = load(id);
  return BOOK_LIST.filter((b) => chapters[b.n]).map((b) => ({ ...b, chapters: Math.max(...Object.keys(chapters[b.n]).map(Number)) }));
}

export function getChapter(id, book, chapter) {
  const vs = load(id).chapters[book]?.[chapter];
  if (!vs) throw Object.assign(new Error('Chapter not found in this version.'), { status: 404 });
  return { book, chapter, bookName: bookName(book), verses: vs.map(([n, text]) => ({ n, text })) };
}

// The verses from..to of a chapter (clamped to what exists), or [] if the chapter isn't in this version.
export function getVerses(id, book, chapter, from, to) {
  const vs = load(id).chapters[book]?.[chapter];
  if (!vs) return [];
  return vs.filter(([n]) => n >= from && n <= to).map(([n, text]) => ({ n, text }));
}

// Resolves "John 3:16-18" against one version. null when the text isn't a Bible reference.
export function lookup(id, q) {
  const ref = parseReference(q);
  if (!ref) return null;
  const vs = load(id).chapters[ref.book]?.[ref.chapter];
  if (!vs) return { ...ref, bookName: bookName(ref.book), verses: [] };
  const wanted = ref.verses ? new Set(ref.verses) : null;
  return {
    book: ref.book,
    chapter: ref.chapter,
    bookName: bookName(ref.book),
    verses: vs.filter(([n]) => !wanted || wanted.has(n)).map(([n, text]) => ({ n, text })),
  };
}

// Every word must appear as a whole word (any order); phrases in "quotes" must appear exactly.
// Verses containing the words as one exact phrase are listed first.
export function search(id, q, limit = 100) {
  const phrases = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
  const words = q.replace(/"[^"]*"/g, ' ').toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  if (!phrases.length && !words.length) return { total: 0, results: [] };
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRes = words.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, 'u'));
  const exact = words.length > 1 ? words.join(' ') : '';
  const exactHits = [];
  const otherHits = [];
  for (const v of load(id).flat) {
    if (!phrases.every((p) => v.lower.includes(p)) || !wordRes.every((r) => r.test(v.lower))) continue;
    (exact && v.lower.includes(exact) ? exactHits : otherHits).push(v);
  }
  const all = [...exactHits, ...otherHits];
  return {
    total: all.length,
    results: all.slice(0, limit).map((v) => ({ book: v.book, chapter: v.chapter, bookName: bookName(v.book), verse: v.verse, text: v.text })),
  };
}

// Words that carry no meaning for finding a verse.
const STOP = new Set('a an and are as at be but by for from had has have he her his i if in into is it its me my no not of on or our she so than that the their them then there these they this to up was we were what when which who whom whose will with would you your woman man'.split(' '));

// A looser word search for when the strict one finds nothing: ignores filler words ("with", "the", "of"),
// tolerates plurals and -ed/-ing, and ranks verses by how many of the meaningful words they contain.
// "woman with the issue of blood" -> verses that mention a woman, an issue and blood.
export function searchAny(id, q, limit = 40) {
  const raw = q.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const words = [...new Set(raw.filter((w) => w.length > 2 && !STOP.has(w)))];
  // "woman" is a stop word above only so that "the woman" alone doesn't match half the Bible; keep it when it's
  // the only meaningful word or part of a longer query.
  const sig = words.length >= 2 ? [...new Set([...words, ...raw.filter((w) => w === 'woman' || w === 'man')])] : words;
  if (sig.length < 2) return { total: 0, results: [] };
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const res = sig.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(w.replace(/(ing|ed|es|s)$/, ''))}(?:s|es|ed|ing|d)?(?![\\p{L}\\p{N}])`, 'u'));
  const need = sig.length <= 3 ? sig.length : Math.ceil(sig.length * 0.7);
  const hits = [];
  for (const v of load(id).flat) {
    let n = 0;
    for (const r of res) if (r.test(v.lower)) n++;
    if (n >= need) hits.push({ v, n });
  }
  hits.sort((a, b) => b.n - a.n);
  return {
    total: hits.length,
    results: hits.slice(0, limit).map(({ v }) => ({ book: v.book, chapter: v.chapter, bookName: bookName(v.book), verse: v.verse, text: v.text })),
  };
}
