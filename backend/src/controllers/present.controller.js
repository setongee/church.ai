import { env } from '../config/env.js';
import { Song } from '../models/Song.model.js';
import { extractText, parseSong } from '../services/songImport.service.js';
import { titleCase } from '../services/titleCase.js';
import { cleanTranslationLook } from './schedule.controller.js';
import { findSongLyrics } from '../services/lyricsSearch.service.js';
import { Announcement } from '../models/Announcement.model.js';
import { BOOK_LIST } from '../services/bible/books.js';
import { detectFormat } from '../services/bible/parse.js';
import { aiIssue, callOpenRouterJSON, suggestScriptures } from '../services/openrouter.service.js';
import { topicPassages } from '../services/bible/topics.js';
import { bookFromName, bookName as bookNameOf } from '../services/bible/books.js';
import { downloadBible, getBooks, getCatalog, getChapter, getVerses, importBible, listInstalled, lookup, removeBible, search, searchAny } from '../services/bible/store.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// ---- Bibles -----------------------------------------------------------------------------------

export function listBibles(req, res) {
  const installed = listInstalled();
  const ids = new Set(installed.map((b) => b.id));
  res.json({
    installed,
    available: getCatalog().filter((c) => !ids.has(c.id)),
    books: BOOK_LIST,
  });
}

export async function downloadBibleHandler(req, res) {
  res.json(await downloadBible(String(req.body?.id || '')));
}

export function importBibleHandler(req, res) {
  if (!req.file) throw bad('Choose an XML file.');
  const name = String(req.body?.name || '').trim();
  const abbr = String(req.body?.abbr || '').trim();
  if (!name && !abbr) throw bad('Give the Bible a name.');
  const xml = req.file.buffer.toString('utf8');
  if (!detectFormat(xml)) throw bad('Unrecognised file. Use a Zefania, OSIS, USFX or OpenSong (.xmm) Bible.');
  res.json(importBible({ xml, name, abbr, lang: req.body?.lang }));
}

export function deleteBible(req, res) {
  removeBible(req.params.id);
  res.json({ ok: true });
}

export function bibleBooks(req, res) {
  res.json(getBooks(req.params.id));
}

export function bibleChapter(req, res) {
  res.json(getChapter(req.params.id, Number(req.query.book), Number(req.query.chapter)));
}

// One search box for both: a reference ("jn 3:16") opens that passage, anything else is a keyword search.
export function bibleFind(req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ type: 'empty' });
  const passage = lookup(req.params.id, q);
  if (passage?.verses.length) return res.json({ type: 'passage', passage });
  res.json({ type: 'search', ...search(req.params.id, q) });
}

// The "smart" search box. A plain reference ("Jn 3:16") opens that passage straight away. Anything
// else - a quote (in any translation's wording), a paraphrase, a story, a topic, a spoken reference
// - goes to the AI, which only names passages; the words shown are always the real text of the
// chosen version. Plain word matches come along too.
export async function bibleSmart(req, res) {
  const id = req.params.id;
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ type: 'empty' });

  const passage = lookup(id, q);
  if (passage?.verses.length) return res.json({ type: 'passage', passage });

  const [ai, strict] = await Promise.all([suggestScriptures({ query: q }).catch((err) => (console.error('[smart] ai failed', err.message), null)), Promise.resolve(search(id, q, 40))]);
  // The strict word search wants every word, which "woman with the issue of blood" never satisfies; fall back to a
  // looser one that ignores filler words and ranks by how many meaningful words match.
  const keyword = strict.total >= 5 ? strict : (() => {
    const loose = searchAny(id, q, 40);
    const have = new Set(strict.results.map((r) => `${r.book}:${r.chapter}:${r.verse}`));
    const extra = loose.results.filter((r) => !have.has(`${r.book}:${r.chapter}:${r.verse}`));
    return { total: strict.total + extra.length, results: [...strict.results, ...extra].slice(0, 40) };
  })();

  const seen = new Set();
  const suggestions = [];
  // Well-known stories and topics from the built-in index come first (free, and exact), then the AI's picks.
  for (const p of [...topicPassages(q), ...(ai ?? [])]) {
    const book = bookFromName(p.book);
    if (!book || p.chapter < 1) continue;
    const to = Math.min(p.verseEnd, p.verseStart + 14);
    const verses = getVerses(id, book, p.chapter, p.verseStart, Math.max(to, p.verseStart));
    if (!verses.length) continue; // not a real passage in this Bible - drop it rather than guess
    const from = verses[0].n;
    const last = verses[verses.length - 1].n;
    const key = `${book}:${p.chapter}:${from}-${last}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      book,
      chapter: p.chapter,
      bookName: bookNameOf(book),
      from,
      to: last,
      reference: `${bookNameOf(book)} ${p.chapter}:${from}${last > from ? `-${last}` : ''}`,
      reason: p.reason,
      verses,
    });
  }

  // Word matches that the suggestions don't already cover.
  const covered = (r) => suggestions.some((s) => s.book === r.book && s.chapter === r.chapter && r.verse >= s.from && r.verse <= s.to);
  const results = keyword.results.filter((r) => !covered(r));
  res.json({ type: 'smart', suggestions, ai: ai !== null, aiIssue: ai !== null ? null : aiIssue() ?? 'unavailable', keyword: { total: keyword.total, results } });
}

// ---- Songs ------------------------------------------------------------------------------------

const songFields = (b) => ({
  title: titleCase(b.title),
  author: String(b.author || ''),
  lyrics: String(b.lyrics || ''),
  ...(b.category === 'hymn' || b.category === 'song' ? { category: b.category } : {}),
  ...(b.number !== undefined ? { number: String(b.number).trim().slice(0, 12) } : {}),
  ...(b.translationLook !== undefined ? { translationLook: cleanTranslationLook(b.translationLook) } : {}),
});

export async function listSongs(req, res) {
  const q = String(req.query.q || '').trim();
  const hymns = req.query.category === 'hymn';
  const search = q ? { $or: ['title', 'author', 'lyrics', 'number'].map((f) => ({ [f]: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })) } : {};
  // Songs panel: everything that isn't a hymn (older songs have no category). Hymns panel: hymns only, by number.
  const filter = { ...search, category: hymns ? 'hymn' : { $ne: 'hymn' } };
  const query = Song.find(filter);
  res.json(await (hymns ? query.collation({ locale: 'en', numericOrdering: true }).sort({ number: 1, title: 1 }).limit(1000) : query.sort({ title: 1 }).limit(300)));
}
export async function createSong(req, res) {
  const f = songFields(req.body || {});
  if (!f.title) throw bad('A song needs a title.');
  res.json(await Song.create(f));
}
// "Find lyrics": AI works out which songs are meant, the lyrics come from a lyrics database.
export async function findSongs(req, res) {
  const q = String(req.body?.q || '').trim();
  if (q.length < 2) throw bad('Type a song title, an artist, or a line you remember.');
  res.json(await findSongLyrics(q));
}

// Import .txt / .docx song files. One song per file; the file name is the title unless the file
// says "Title: …". Songs whose title already exists are skipped rather than duplicated.
// `?preview=1` only reads the files and answers with the songs it found, saving nothing (a presenter's copy then
// stays on their own device until it's sent for review).
export async function importSongs(req, res) {
  const preview = req.query.preview === '1';
  const files = req.files || [];
  if (!files.length) throw bad('Choose one or more .txt or .docx files.');
  const created = [];
  const skipped = [];
  const failed = [];
  for (const file of files) {
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    try {
      const song = parseSong(await extractText({ ...file, originalname: name }), name);
      // With a single file the user can type the title/author themselves.
      if (files.length === 1) {
        const t = String(req.body?.title || '').trim();
        const a = String(req.body?.author || '').trim();
        if (t) song.title = t.slice(0, 200);
        if (a) song.author = a.slice(0, 200);
      }
      song.title = titleCase(song.title);
      if (!song.lyrics) throw bad('No lyrics found in this file.');
      const exists = await Song.findOne({ title: new RegExp(`^${song.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
      if (exists) {
        skipped.push({ name, reason: 'A song with this title already exists.' });
        continue;
      }
      created.push(preview ? song : await Song.create(song));
    } catch (err) {
      failed.push({ name, error: err.message || 'Could not read this file.' });
    }
  }
  res.json({ created, skipped, failed });
}

export async function updateSong(req, res) {
  const f = songFields(req.body || {});
  if (!f.title) throw bad('A song needs a title.');
  const song = await Song.findByIdAndUpdate(req.params.id, f, { new: true });
  if (!song) throw bad('Song not found.', 404);
  res.json(song);
}
const TRANSLATE_SYSTEM = `You translate song lyrics for a Nigerian church screen. You get the start of the song for context (songStart) and a numbered list of lines to translate. Many songs mix English with Nigerian languages: Yoruba, Igbo, Hausa, Edo, Efik, Urhobo, Ibibio, Tiv and others, plus Nigerian Pidgin. Also handle other languages (Spanish, French, Latin, Swahili, Twi, Zulu...).
First work out which language each line is in (Yoruba text is often written without tone marks, e.g. "Mo rire gba o", "Olorun mi", "ese"). Then, for each line that is not plain English, or has non-English words in it, give a natural English translation of the whole line, as a church would sing it (e.g. "Olorun mi" = "My God"). Use the song's context to resolve ambiguous words. Pidgin lines get a plain-English line too.
Skip: lines already fully English, section labels like [Chorus], and pure vocal sounds with no meaning ("e e e", "eh", "yee", "la la la", "hallelujah"). A line that is only a refrain you have already translated should still get its translation (keep it short).
Keep each translation to one short line. Never invent lines. Return ONLY JSON: {"translations": [{"n": number, "english": string}]} using the line numbers you were given.`;

// "Translate foreign words": the AI only supplies translations by line number; this code inserts them under the original
// lines, so the lyrics themselves can never be altered. Nothing is saved: the editor shows the result for review.
export async function translateLyrics(req, res) {
  const lyrics = String(req.body?.lyrics ?? '').replace(/\r\n/g, '\n');
  if (lyrics.trim().length < 3) throw bad('Add some lyrics first.');
  if (lyrics.length > 12000) throw bad('These lyrics are too long to translate at once. Do it in parts.');
  const lines = lyrics.split('\n');
  const skip = (t) => !t || /^\[[^\]]+\]$/.test(t) || /^\(.*\)$/.test(t); // bracketed lines are earlier translations (or backing vocals): leave them
  // Each distinct line is translated once (songs repeat their choruses) and reused wherever it appears.
  const key = (t) => t.toLowerCase().replace(/[′’‘`]/g, "'").replace(/\s+/g, ' ');
  const first = new Map();
  const groups = new Map();
  lines.forEach((l, n) => {
    const t = l.trim();
    if (skip(t)) return;
    const k = key(t);
    if (!first.has(k)) first.set(k, { n, text: t });
    groups.set(k, [...(groups.get(k) || []), n]);
  });
  const unique = [...first.values()];
  if (!unique.length) throw bad('Add some lyrics first.');
  // Batches run side by side so a long song doesn't take minutes; each batch also gets a few lines of the song for context.
  const BATCH = 45;
  const chunks = [];
  for (let i = 0; i < unique.length; i += BATCH) chunks.push(unique.slice(i, i + BATCH));
  const context = unique.slice(0, 12).map((u) => u.text);
  const results = await Promise.all(
    chunks.map((chunk) =>
      callOpenRouterJSON({ system: TRANSLATE_SYSTEM, user: JSON.stringify({ songStart: context, lines: chunk }), maxTokens: 8000, temperature: 0.2, model: env.openrouterTranslateModel }).catch(() => null)
    )
  );
  if (results.some((r) => !Array.isArray(r?.translations))) {
    const why = aiIssue();
    throw bad(why === 'credits' ? 'The AI is paused (out of credit). You can still add translations by hand.' : 'The AI couldn’t be reached just now. Try again in a moment.', 502);
  }
  const byLine = new Map();
  for (const out of results) {
    const valid = new Set(unique.map((u) => u.n));
    for (const t of out.translations) {
      const n = Number(t?.n);
      const english = String(t?.english ?? '').replace(/\s+/g, ' ').trim().replace(/^\(?\s*(English:)?\s*/i, '').replace(/\)\s*$/, '').trim();
      if (!valid.has(n) || !english) continue;
      const k = key(lines[n].trim());
      for (const m of groups.get(k) || []) if (!byLine.has(m)) byLine.set(m, english);
    }
  }
  const result = [];
  lines.forEach((l, n) => {
    result.push(l);
    if (byLine.has(n) && !/^\(.*\)$/.test((lines[n + 1] ?? '').trim())) result.push(`(${byLine.get(n)})`);
  });
  res.json({ lyrics: result.join('\n'), added: result.length - lines.length });
}
// "Apply to every song": one translation look for all songs and hymns.
export async function setAllTranslationLooks(req, res) {
  const look = cleanTranslationLook(req.body?.look);
  if (!look) throw bad('Choose a look first.');
  const r = await Song.updateMany({}, { translationLook: look });
  res.json({ updated: r.modifiedCount ?? 0 });
}
export async function deleteSong(req, res) {
  await Song.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}

const TEMPLATES = new Set(['classic', 'bold', 'split', 'glass', 'spotlight', 'poster', 'lower', 'ticket', 'editorial', 'wave']);
// The look of an announcement: template, small label, accent colour.
const announcementFields = (b) => ({
  title: String(b?.title || '').trim(),
  body: String(b?.body || ''),
  imageUrl: String(b?.imageUrl || ''),
  template: TEMPLATES.has(b?.template) ? b.template : 'classic',
  kicker: String(b?.kicker || '').trim().slice(0, 60),
  accent: /^#[0-9a-f]{6}$/i.test(b?.accent) ? b.accent : '',
});

// ---- Announcements ----------------------------------------------------------------------------

export async function listAnnouncements(req, res) {
  res.json(await Announcement.find().sort({ createdAt: -1 }).limit(200));
}
export async function createAnnouncement(req, res) {
  const title = String(req.body?.title || '').trim();
  if (!title) throw bad('An announcement needs a title.');
  res.json(await Announcement.create(announcementFields(req.body)));
}
export async function updateAnnouncement(req, res) {
  const title = String(req.body?.title || '').trim();
  if (!title) throw bad('An announcement needs a title.');
  const doc = await Announcement.findByIdAndUpdate(req.params.id, announcementFields(req.body), { new: true });
  if (!doc) throw bad('Announcement not found.', 404);
  res.json(doc);
}
export async function deleteAnnouncement(req, res) {
  await Announcement.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}
