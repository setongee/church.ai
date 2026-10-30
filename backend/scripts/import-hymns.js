// Usage:
//   npm run hymns:import                  download the open hymnal (MIT, h1rdr3v2/open-hymnal-json) and add its hymns
//   npm run hymns:import -- file.json     use a local copy instead (same format)
//   npm run hymns:import -- --all         also add the file's non-"Hymns" entries (modern worship songs, etc.)
// Safe to re-run: a hymn that already exists (same number and title) is left alone, never overwritten.
import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Song } from '../src/models/Song.model.js';

const URL = 'https://raw.githubusercontent.com/h1rdr3v2/open-hymnal-json/main/hymns/watchman/hymns.json';
const args = process.argv.slice(2);
const all = args.includes('--all');
const file = args.find((a) => !a.startsWith('--'));

const clean = (s) => String(s || '').replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim();

// [Verse 1] / [Chorus] blocks separated by a blank line - the format the Songs panel uses.
function toLyrics(parts) {
  let n = 0;
  return parts
    .map((p) => {
      const text = clean(p.content);
      if (!text) return '';
      const chorus = p.type !== 'verse';
      return `[${chorus ? 'Chorus' : `Verse ${p.verse ?? ++n}`}]\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

const raw = file ? fs.readFileSync(file, 'utf8') : await fetch(URL).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Download failed (${r.status})`))));
const hymns = JSON.parse(raw).hymns ?? [];

await mongoose.connect(env.mongodbUri);
let added = 0;
let skipped = 0;
for (const h of hymns) {
  if (!all && h.category !== 'Hymns') continue;
  const title = clean(h.title);
  const lyrics = toLyrics(h.lyrics ?? []);
  if (!title || !lyrics) continue;
  const number = String(h.number ?? '').trim();
  if (await Song.exists({ category: 'hymn', number, title })) {
    skipped++;
    continue;
  }
  await Song.create({ title, number, author: clean(h.author), lyrics, category: 'hymn' });
  added++;
}
console.log(`Hymns: ${added} added, ${skipped} already there.`);
await mongoose.disconnect();
