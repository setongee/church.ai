import fs from 'fs';
import { deleteTrack, listTracks, saveUploadedTrack } from '../services/sounds.service.js';

export async function getTracks(req, res) {
  res.json(await listTracks());
}

export async function uploadTrack(req, res) {
  const file = req.file;
  try {
    if (!file) return res.status(400).json({ error: 'Choose an audio file.' });
    const name = String(req.body?.name || '').trim() || file.originalname.replace(/\.[^.]+$/, '');
    const doc = await saveUploadedTrack(name.slice(0, 80), file.path);
    const tracks = await listTracks();
    res.status(201).json(tracks.find((t) => t.id === doc._id.toString()));
  } finally {
    if (file) fs.promises.unlink(file.path).catch(() => {});
  }
}

export async function removeTrack(req, res) {
  if (req.params.id.startsWith('builtin:')) return res.status(400).json({ error: 'Built-in tracks cannot be deleted.' });
  if (!(await deleteTrack(req.params.id))) return res.status(404).json({ error: 'track not found' });
  res.json({ ok: true });
}
