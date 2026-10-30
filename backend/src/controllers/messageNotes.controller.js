import mongoose from 'mongoose';
import { MessageNotes } from '../models/MessageNotes.model.js';
import { Session } from '../models/Session.model.js';
import { buildNotes, cleanDevotional, retranslate, transcriptText, weekAfter } from '../services/messageNotes.service.js';
import { generateNotesDevotional } from '../services/openrouter.service.js';
import { TRANSLATIONS, cleanRef, lookupScripture } from '../services/scripture.service.js';

const isId = (id) => mongoose.isValidObjectId(id);
const KINDS = ['read', 'pray', 'reflect', 'act', 'share', 'memorize', 'review'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const s = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const arr = (v) => (Array.isArray(v) ? v : []);

async function loadSession(req, res) {
  const session = isId(req.params.id) ? await Session.findById(req.params.id) : null;
  if (!session) res.status(404).json({ error: 'session not found' });
  return session;
}

export async function getNotes(req, res) {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'session not found' });
  res.json(await MessageNotes.findOne({ session: req.params.id }));
}

// Builds the notes from the whole transcript. Takes a while (two model passes plus scripture
// lookups), so the caller waits on one request.
export async function generateNotes(req, res) {
  const session = await loadSession(req, res);
  if (!session) return;
  if (session.status !== 'ended') return res.status(400).json({ error: 'Message notes can be made once the session has ended.' });
  const fullText = await transcriptText(session._id);
  if (fullText.trim().split(/\s+/).length < 150) return res.status(400).json({ error: 'There is not enough transcript yet to write notes from.' });

  const translation = TRANSLATIONS[req.body?.translation] ? req.body.translation : 'kjv';
  const built = await buildNotes({ session, fullText, translation });
  const previous = await MessageNotes.findOne({ session: session._id });
  // A regenerate keeps what is personal: the listen link.
  const doc = await MessageNotes.findOneAndUpdate(
    { session: session._id },
    { ...built, messageLink: s(req.body?.messageLink, 500) || previous?.messageLink || '' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(doc);
}

// Saves the user's edits. Only known fields are accepted, and each is cleaned.
export async function updateNotes(req, res) {
  const doc = isId(req.params.id) ? await MessageNotes.findOne({ session: req.params.id }) : null;
  if (!doc) return res.status(404).json({ error: 'There are no notes for this session yet.' });
  const b = req.body ?? {};

  if (typeof b.title === 'string') doc.title = s(b.title, 120);
  if (typeof b.preacher === 'string') doc.preacher = s(b.preacher, 120);
  if (typeof b.date === 'string' && DATE_RE.test(b.date)) doc.date = b.date;
  if (typeof b.hook === 'string') doc.hook = s(b.hook, 400);
  if (typeof b.bigIdea === 'string') doc.bigIdea = s(b.bigIdea, 400);
  if (typeof b.closing === 'string') doc.closing = s(b.closing, 500);
  if (typeof b.messageLink === 'string') doc.messageLink = s(b.messageLink.trim(), 500);
  if (b.coverMode === 'text' || b.coverMode === 'image') doc.coverMode = b.coverMode;
  if (typeof b.coverImageUrl === 'string') doc.coverImageUrl = s(b.coverImageUrl, 600);
  if (typeof b.coverPrompt === 'string') doc.coverPrompt = s(b.coverPrompt, 1500);
  if (b.fonts && typeof b.fonts === 'object') doc.fonts = { head: s(b.fonts.head, 80), body: s(b.fonts.body, 80) };
  if (b.endInfo && typeof b.endInfo === 'object') {
    doc.endInfo = { serviceTimes: s(b.endInfo.serviceTimes, 400), venue: s(b.endInfo.venue, 300), contact: s(b.endInfo.contact, 300), note: s(b.endInfo.note, 200) };
  }

  if (Array.isArray(b.scriptures)) {
    doc.scriptures = b.scriptures.slice(0, 60).map((x) => ({ ref: cleanRef(x?.ref), text: s(x?.text, 3000), quoted: Boolean(x?.quoted), use: s(x?.use, 120), verified: Boolean(x?.verified) })).filter((x) => x.ref);
  }
  if (Array.isArray(b.sections)) {
    doc.sections = b.sections.slice(0, 12).map((sec) => ({
      heading: s(sec?.heading, 100),
      summary: s(sec?.summary, 300),
      pullQuote: s(sec?.pullQuote, 260),
      points: arr(sec?.points).slice(0, 12).map((p) => ({ text: s(p?.text, 600), refs: arr(p?.refs).map(cleanRef).filter(Boolean).slice(0, 4) })).filter((p) => p.text),
    })).filter((sec) => sec.heading || sec.points.length);
  }
  if (Array.isArray(b.prayerPoints)) doc.prayerPoints = b.prayerPoints.slice(0, 20).map((p) => ({ text: s(p?.text, 400), include: p?.include !== false })).filter((p) => p.text.trim());
  if (Array.isArray(b.furtherReading)) doc.furtherReading = b.furtherReading.slice(0, 12).map((r) => ({ ref: cleanRef(r?.ref).slice(0, 60), why: s(r?.why, 240) })).filter((r) => r.ref);
  if (b.plan && typeof b.plan === 'object') {
    doc.plan = {
      theme: s(b.plan.theme, 80),
      target: s(b.plan.target, 300),
      days: arr(b.plan.days).slice(0, 7).map((d) => ({ day: s(d?.day, 20), date: DATE_RE.test(d?.date) ? d.date : '', title: s(d?.title, 60), kind: KINDS.includes(d?.kind) ? d.kind : 'reflect', action: s(d?.action, 500), scripture: s(d?.scripture, 60) })),
    };
  }
  if (TRANSLATIONS[b.translation] && b.translation !== doc.translation) {
    doc.translation = b.translation;
    doc.scriptures = await retranslate(doc.scriptures, b.translation);
  }
  await doc.save();
  res.json(doc);
}

// Rewrites the prayer points / further reading / weekly plan from the current notes.
export async function regenerateDevotional(req, res) {
  const doc = isId(req.params.id) ? await MessageNotes.findOne({ session: req.params.id }) : null;
  if (!doc) return res.status(404).json({ error: 'There are no notes for this session yet.' });
  const raw = await generateNotesDevotional({
    notes: { title: doc.title, bigIdea: doc.bigIdea, scriptures: doc.scriptures.map((x) => x.ref), sections: doc.sections.map((x) => ({ heading: x.heading, points: x.points.map((p) => p.text) })), closing: doc.closing },
  });
  const fresh = cleanDevotional(raw, doc.date);
  if (fresh.prayerPoints.length === 0 && fresh.plan.days.every((d) => !d.action)) return res.status(502).json({ error: 'Could not write those just now. Try again.' });
  const part = String(req.body?.part || 'all');
  if (part === 'all' || part === 'prayer') doc.prayerPoints = fresh.prayerPoints;
  if (part === 'all' || part === 'reading') doc.furtherReading = fresh.furtherReading;
  if (part === 'all' || part === 'plan') doc.plan = { ...fresh.plan, days: fresh.plan.days.map((d, i) => ({ ...d, date: weekAfter(doc.date)[i] })) };
  await doc.save();
  res.json(doc);
}

// Looks up one reference, for adding a scripture by hand.
export async function lookupRef(req, res) {
  const translation = TRANSLATIONS[req.query.translation] ? req.query.translation : 'kjv';
  const hit = await lookupScripture(String(req.query.ref || ''), translation);
  if (!hit) return res.status(404).json({ error: "Couldn't find that verse. Check the reference, e.g. John 3:16." });
  res.json({ ref: hit.ref, text: hit.text });
}

export async function deleteNotes(req, res) {
  if (isId(req.params.id)) await MessageNotes.deleteOne({ session: req.params.id });
  res.json({ ok: true });
}
