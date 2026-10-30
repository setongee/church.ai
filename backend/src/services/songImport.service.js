import path from 'path';
import mammoth from 'mammoth';

const bad = (message) => Object.assign(new Error(message), { status: 400 });

const decodeHtml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e.toLowerCase()];
  });

// Word -> plain text that keeps the author's own line and stanza breaks: each paragraph is a
// line, an empty paragraph is a blank line (the stanza separator), and Shift+Enter is a line break.
async function docxToText(buffer) {
  const { value } = await mammoth.convertToHtml({ buffer }, { ignoreEmptyParagraphs: false });
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

function textFromBuffer(buffer) {
  // UTF-16 text files (some Windows editors) start with a byte-order mark.
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le').replace(/^﻿/, '');
  return buffer.toString('utf8').replace(/^﻿/, '');
}

export async function extractText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.docx') return docxToText(file.buffer);
  if (ext === '.doc') throw bad('Old .doc files aren’t supported — open it in Word and save as .docx (or .txt).');
  if (['.txt', '.text', '.lyrics', ''].includes(ext)) return textFromBuffer(file.buffer);
  throw bad(`“${ext}” files aren’t supported. Use .txt or .docx.`);
}

const SECTION_WORDS = 'verse|chorus|pre-?chorus|bridge|intro|outro|tag|ending|refrain|interlude|hook|vamp|turnaround|instrumental';
const BARE_LABEL = new RegExp(`^(?:\\[\\s*)?((?:${SECTION_WORDS})(?:\\s*\\d+)?)(?:\\s*\\])?\\s*:?$`, 'i');
const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());

const normalizeName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Raw text -> { title, author, lyrics } in the format the Songs panel uses: blank line between
// slides, "[Chorus]" on its own line to name a slide.
export function parseSong(text, filename) {
  let lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n').map((l) => l.replace(/\s+$/g, ''));

  const meta = { title: '', author: '' };
  // "Title: …" / "Author: …" lines at the top (a "Key: …" line is removed too).
  while (lines.length) {
    const first = lines.findIndex((l) => l.trim());
    if (first === -1) break;
    const m = /^(title|song|author|by|writer|writers|artist|composer|key)\s*[:\-–]\s*(.+)$/i.exec(lines[first].trim());
    if (!m || first > 6) break;
    const k = m[1].toLowerCase();
    if (k !== 'key') {
      const field = k === 'title' || k === 'song' ? 'title' : 'author';
      if (!meta[field]) meta[field] = m[2].trim();
    } // a "Key:" line is dropped - songs don't store a key
    lines.splice(first, 1);
  }

  const base = path.basename(filename || 'Untitled', path.extname(filename || '')).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const title = meta.title || base || 'Untitled song';

  // A first line that just repeats the song's name isn't a lyric.
  const firstIdx = lines.findIndex((l) => l.trim());
  if (firstIdx !== -1 && normalizeName(lines[firstIdx]) === normalizeName(title)) lines.splice(firstIdx, 1);

  // Section names written bare ("Verse 1", "CHORUS", "Chorus:") become "[Verse 1]" labels.
  lines = lines.map((l) => {
    const m = BARE_LABEL.exec(l.trim());
    return m ? `[${titleCase(m[1].trim().replace(/\s+/g, ' '))}]` : l;
  });

  // Tidy blank lines: none at the ends, never more than one in a row.
  let lyrics = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Nothing separating stanzas (one solid block)? Break it into slides of four lines so it isn't
  // one unreadable slide.
  if (lyrics && !/\n\s*\n/.test(lyrics)) {
    const all = lyrics.split('\n');
    if (all.length > 6) {
      const chunks = [];
      for (let i = 0; i < all.length; i += 4) chunks.push(all.slice(i, i + 4).join('\n'));
      lyrics = chunks.join('\n\n');
    }
  }
  return { title: title.slice(0, 200), author: meta.author.slice(0, 200), lyrics };
}
