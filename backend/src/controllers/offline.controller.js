import { Song } from '../models/Song.model.js';
import { Schedule } from '../models/Schedule.model.js';
import { PresentMedia } from '../models/PresentMedia.model.js';
import { Wrapper } from '../models/Wrapper.model.js';
import { SceneTemplate } from '../models/SceneTemplate.model.js';
import { bibleData, listInstalled } from '../services/bible/store.js';

// What a device keeps a local copy of, and how to tell when the server has something it doesn't: a count and the latest
// change time per kind. A device compares this with the manifest it stored at its last sync.
const stamp = async (Model) => {
  const [count, last] = await Promise.all([Model.countDocuments(), Model.findOne().sort({ updatedAt: -1 }).select('updatedAt').lean()]);
  return { count, at: last?.updatedAt ? new Date(last.updatedAt).toISOString() : '' };
};

export async function manifest(req, res) {
  const [songs, media, schedules, wrappers, templates] = await Promise.all([stamp(Song), stamp(PresentMedia), stamp(Schedule), stamp(Wrapper), stamp(SceneTemplate)]);
  res.json({ songs, media, schedules, wrappers, templates, bibles: listInstalled().map((b) => ({ id: b.id, name: b.name || b.abbr || b.id, verses: b.verses || 0, installedAt: b.installedAt || '' })) });
}

// Every song and hymn (the normal list is capped), so the whole library can live on the device.
export async function allSongs(req, res) {
  res.json(await Song.find().sort({ title: 1 }).lean());
}

export function exportBible(req, res) {
  try {
    res.json({ id: req.params.id, chapters: bibleData(req.params.id) });
  } catch (err) {
    res.status(err.status || 404).json({ error: err.message || 'That Bible is not installed.' });
  }
}
