// Builds the seed pack Present uses before a device has ever synced: public-domain Bibles, the hymn book and a few
// backgrounds, written to frontend/public/offline-seed/. The app loads it into the device on first open (even before sign-in),
// so Present works in offline mode from the first launch. Run:  node scripts/build-offline-seed.js [--include-songs]
// Only public-domain Bibles are included (the site serves these files without a sign-in). Custom songs are left out unless
// --include-songs is given, because their lyrics may be under copyright.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Song } from '../src/models/Song.model.js';
import { PresentMedia } from '../src/models/PresentMedia.model.js';
import { bibleData, listInstalled } from '../src/services/bible/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '..', 'frontend', 'public', 'offline-seed');
const PUBLIC_DOMAIN = ['kjv', 'asv', 'web', 'bbe']; // King James, American Standard, World English, Bible in Basic English
const MAX_BACKGROUNDS = 8;
const includeSongs = process.argv.includes('--include-songs');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'bibles'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'backgrounds'), { recursive: true });

await mongoose.connect(env.mongodbUri);

const bibles = [];
for (const b of listInstalled().filter((x) => PUBLIC_DOMAIN.includes(x.id))) {
  fs.writeFileSync(path.join(OUT, 'bibles', `${b.id}.json`), JSON.stringify(bibleData(b.id)));
  bibles.push({ id: b.id, name: b.name, abbr: b.abbr, lang: b.lang, license: b.license === 'Imported' ? 'Public domain' : b.license, verses: b.verses ?? 0 });
}

const songs = await Song.find(includeSongs ? {} : { category: 'hymn' }).sort({ title: 1 }).lean();
fs.writeFileSync(path.join(OUT, 'songs.json'), JSON.stringify(songs.map((s) => ({ _id: String(s._id), title: s.title, author: s.author || '', lyrics: s.lyrics || '', category: s.category || 'song', number: s.number || '', ...(s.translationLook ? { translationLook: s.translationLook } : {}) }))));

const media = [];
const picks = (await PresentMedia.find({ purpose: 'background', type: 'image' }).sort({ createdAt: 1 }).lean()).filter((m) => (m.size || 0) < 1_500_000).slice(0, MAX_BACKGROUNDS);
for (const [i, m] of picks.entries()) {
  try {
    const res = await fetch(m.url);
    if (!res.ok) continue;
    const ext = (new URL(m.url).pathname.match(/\.(jpe?g|png|webp)$/i)?.[0] || '.jpg').toLowerCase();
    const file = `bg-${i + 1}${ext}`;
    fs.writeFileSync(path.join(OUT, 'backgrounds', file), Buffer.from(await res.arrayBuffer()));
    media.push({ _id: `seed-bg-${i + 1}`, url: `/offline-seed/backgrounds/${file}`, name: m.name || `Background ${i + 1}`, type: 'image', purpose: 'background', size: m.size || 0, createdAt: new Date(m.createdAt || Date.now()).toISOString() });
  } catch (e) {
    console.warn('skipped a background:', e.message);
  }
}
fs.writeFileSync(path.join(OUT, 'media.json'), JSON.stringify(media));

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version: new Date().toISOString(), bibles, songs: songs.length, includesCustomSongs: includeSongs, backgrounds: media.map((m) => m.url) }, null, 2));
await mongoose.disconnect();
console.log(`Seed written to ${OUT}: ${bibles.length} Bibles, ${songs.length} songs, ${media.length} backgrounds`);
