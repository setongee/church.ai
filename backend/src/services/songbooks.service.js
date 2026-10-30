import { fetchPageText } from './webSearch.service.js';

// "Songbooks": a single web page that holds many songs. They are read once, split into songs,
// cached, and searched locally (no per-song page to find). Add another by giving it a parser.

const norm = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^\p{L}\p{N}]+/gu, '');
const termsOf = (s) => (String(s || '').normalize('NFC').toLowerCase().replace(/[’‘`´]/g, "'").match(/[\p{L}\p{M}\p{N}']+/gu) ?? []).filter((w) => w.length > 2);

// A tonic-solfa line is mostly solfa syllables (d r m f s l t, with ᵢ/¹ octave marks) - never real
// words - sometimes with a note tacked on ("(lower note)", "*optional for chorus").
const SOLFA_TOKEN = /^[drmfslt][ᵢ¹²₁₂]*$/i;
function isSolfaLine(line) {
  const tokens = line
    .replace(/[(){}\[\]*/|,;:…\-–—.]+/g, ' ')
    .replace(/\b\d+ce\b/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return true; // just punctuation / dots
  const solfa = tokens.filter((t) => SOLFA_TOKEN.test(t)).length;
  return solfa >= 3 ? solfa / tokens.length >= 0.55 : solfa === tokens.length && solfa >= 2;
}

const ATTRIBUTION = /^(©|\(c\)|copyright|source\s*:)/i;
const HEADING = /tonic\s*solfa|^songs? and tonic/i;

// Tonality Music: lyrics, then a "© Author" / "Source: unknown" line, then the solfa notation, then
// the next song. Songs have no titles - the first line is the title - except where a heading such as
// "EXCESS LOVE- CHORDS with Tonic solfa" names one.
export function parseTonality(text) {
  const lines = text.split('\n').map((l) => l.replace(/\s+$/g, ''));
  // Only the songs themselves, between the intro and the footer.
  const startAt = lines.findIndex((l) => /^SONGS AND TONIC SOLFA/i.test(l.trim()));
  const endAt = lines.findIndex((l, i) => i > startAt && /Ready to Start Your Music Journey/i.test(l));
  const body = lines.slice(startAt >= 0 ? startAt + 1 : 0, endAt > 0 ? endAt : undefined);

  const songs = [];
  let cur = [];
  let pendingTitle = '';
  let author = '';
  let afterAttribution = false;

  const finish = () => {
    const lyrics = cur.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (lyrics.split(/\s+/).length >= 6 || (pendingTitle && lyrics)) {
      const first = cur.find((l) => l.trim()) || '';
      const title = pendingTitle || first.replace(/[}\/\d]*\s*(\d+ce)?$/i, '').replace(/[,;:\s]+$/, '').trim();
      const prev = songs[songs.length - 1];
      // A heading-named song whose lyric lines are interleaved with notation arrives in pieces.
      if (pendingTitle && prev && prev.title === title) {
        prev.lyrics = `${prev.lyrics}\n${lyrics}`;
        prev.author ||= author;
      } else {
        songs.push({ title: title.slice(0, 120), author, lyrics });
      }
    }
    cur = [];
    pendingTitle = '';
    author = '';
    afterAttribution = false;
  };

  for (const raw of body) {
    const line = raw.trim();
    if (!line) continue;
    if (/^https?:\/\//.test(line)) continue; // embedded media
    if (HEADING.test(line)) {
      // "EXCESS LOVE- CHORDS with Tonic solfa (C major)" - a title for the song that follows.
      if (cur.length) finish();
      const name = line.replace(/\s*[-–]\s*chords.*$/i, '').replace(/\s*with\s+tonic.*$/i, '').trim();
      pendingTitle = name.length > 2 && name.length < 60 ? name.replace(/\b([A-Z])([A-Z]+)\b/g, (m, a, b) => a + b.toLowerCase()) : '';
      continue;
    }
    if (ATTRIBUTION.test(line)) {
      author = line.replace(ATTRIBUTION, '').replace(/^[:\s]+/, '').replace(/\*+$/, '').trim();
      if (/^unknown$/i.test(author)) author = '';
      afterAttribution = true;
      continue;
    }
    if (isSolfaLine(line)) {
      afterAttribution = true; // solfa follows the attribution; the next real lyric line starts a new song
      continue;
    }
    // A real lyric line after an attribution/solfa block means the previous song is complete.
    if (afterAttribution && cur.length) {
      const keepTitle = pendingTitle;
      finish();
      pendingTitle = keepTitle;
    }
    cur.push(line.replace(/^\d{1,2}\)\s*/, '').replace(/\s*\}\s*(\d+ce)?\s*$/i, '').replace(/\s*\/\s*\d+ce\s*$/i, '').replace(/\s*\/?\s*repeat\s*$/i, ''));
  }
  finish();
  return songs;
}

const SONGBOOKS = [
  {
    id: 'tonality',
    host: 'tonalitymusic.com.ng',
    url: 'https://tonalitymusic.com.ng/30-nigerian-praise-and-worship-songs-with-tonic-solfa/',
    parse: parseTonality,
  },
];

const TTL = 24 * 60 * 60 * 1000;
const cache = new Map(); // id -> { at, songs }

async function load(book) {
  const hit = cache.get(book.id);
  if (hit && Date.now() - hit.at < TTL) return hit.songs;
  const text = await fetchPageText(book.url, 400000);
  const songs = text ? book.parse(text) : [];
  if (songs.length) cache.set(book.id, { at: Date.now(), songs });
  return songs;
}

// Songs from the songbooks that match what the user typed / the AI's guess.
export async function searchSongbooks({ query, guess }) {
  const q = norm(query);
  const guessTitle = guess ? norm(guess.title) : '';
  const terms = [...new Set([...termsOf(query), ...(guess ? termsOf(guess.title) : [])])];
  const out = [];
  for (const book of SONGBOOKS) {
    let songs = [];
    try {
      songs = await load(book);
    } catch (err) {
      console.error('[songbook] failed to load', book.id, err.message);
    }
    for (const s of songs) {
      const hay = norm(`${s.title}${s.author}${s.lyrics}`);
      let score = 0;
      if (q.length >= 5 && hay.includes(q)) score = 3; // what they typed appears verbatim
      else if (guessTitle.length >= 5 && hay.includes(guessTitle)) score = 2; // the song the AI named
      else if (terms.length >= 3 && terms.filter((t) => hay.includes(norm(t))).length / terms.length >= 0.85) score = 1;
      // Songs here are named by their first line; when the AI has named the song and it's in there, use that.
      const title = guess && guessTitle.length >= 5 && hay.includes(guessTitle) ? guess.title : s.title;
      if (score) out.push({ score, id: `${book.url}#${norm(s.title).slice(0, 40)}`, title, artist: s.author, source: book.host, url: book.url, lyrics: s.lyrics });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3).map(({ score, ...r }) => r);
}
