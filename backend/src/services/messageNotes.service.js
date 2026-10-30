import { TranscriptSegment } from '../models/TranscriptSegment.model.js';
import { generateNotesDevotional, generateNotesStructure } from './openrouter.service.js';
import { cleanRef, lookupMany } from './scripture.service.js';

const KINDS = ['read', 'pray', 'reflect', 'act', 'share', 'memorize', 'review'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Single *asterisks* (italic markdown the model sometimes adds) are dropped; **bold** is kept.
const unItalic = (t) => t.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '$1');
const str = (v, max = 600) => (typeof v === 'string' ? unItalic(v.replace(/\s+/g, ' ').trim()).slice(0, max) : '');
const list = (v) => (Array.isArray(v) ? v : []);

// YYYY-MM-DD in local time.
export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The Monday-Saturday of the week after the service: the first Monday strictly after it.
export function weekAfter(serviceIso) {
  const base = serviceIso ? new Date(`${serviceIso}T12:00:00`) : new Date();
  const start = new Date(base);
  start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7));
  return WEEKDAYS.map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return isoDate(d);
  });
}

export async function transcriptText(sessionId) {
  const segments = await TranscriptSegment.find({ session: sessionId, isFinal: true }).sort({ createdAt: 1 });
  return segments.map((s) => s.text).join(' ');
}

// Resolves every scripture reference against the real text, and rewrites references in the
// sections to their canonical form so they match the list exactly.
async function resolveScriptures(draft, translation) {
  const refs = [...draft.scriptures.map((s) => s.ref), ...draft.sections.flatMap((s) => s.points.flatMap((p) => p.refs))];
  const found = await lookupMany(refs, translation);
  const canon = (ref) => found.get(cleanRef(ref))?.ref || cleanRef(ref);

  const byRef = new Map();
  for (const s of draft.scriptures) {
    const ref = canon(s.ref);
    const hit = found.get(cleanRef(s.ref));
    const prev = byRef.get(ref.toLowerCase());
    byRef.set(ref.toLowerCase(), { ref, text: hit?.text || '', verified: Boolean(hit), quoted: Boolean(prev?.quoted || s.quoted), use: prev?.use || s.use });
  }
  // A reference used in a point but missing from the model's own list still belongs in the list.
  for (const sec of draft.sections) {
    for (const p of sec.points) {
      p.refs = p.refs.map(canon);
      for (const ref of p.refs) {
        if (!byRef.has(ref.toLowerCase())) {
          const hit = found.get(cleanRef(ref)) ?? [...found.values()].find((v) => v?.ref === ref);
          byRef.set(ref.toLowerCase(), { ref, text: hit?.text || '', verified: Boolean(hit), quoted: false, use: '' });
        }
      }
    }
  }
  // Whole chapters and other very long passages are shown as references, never as inline quotes.
  return [...byRef.values()].map((x) => (x.text.length > 1000 ? { ...x, quoted: false, text: '' } : x));
}

function cleanStructure(raw) {
  return {
    title: str(raw?.title, 120),
    hook: str(raw?.hook, 400),
    bigIdea: str(raw?.bigIdea, 400),
    closing: str(raw?.closing, 500),
    scriptures: list(raw?.scriptures)
      .map((s) => ({ ref: cleanRef(s?.ref), quoted: Boolean(s?.quoted), use: str(s?.use, 120) }))
      .filter((s) => s.ref)
      .slice(0, 40),
    sections: list(raw?.sections)
      .map((s) => ({
        heading: str(s?.heading, 100),
        summary: str(s?.summary, 300),
        pullQuote: str(s?.pullQuote, 260),
        points: list(s?.points)
          .map((p) => ({ text: str(typeof p === 'string' ? p : p?.text, 600), refs: list(p?.refs).map(cleanRef).filter(Boolean).slice(0, 4) }))
          .filter((p) => p.text)
          .slice(0, 9),
      }))
      .filter((s) => s.heading && s.points.length)
      .slice(0, 10),
  };
}

export function cleanDevotional(raw, serviceIso) {
  const dates = weekAfter(serviceIso);
  const byDay = new Map(list(raw?.days).map((d) => [str(d?.day, 20).toLowerCase(), d]));
  const days = WEEKDAYS.map((name, i) => {
    // Normally in order; fall back to position if the model named the days oddly.
    const d = byDay.get(name.toLowerCase()) ?? list(raw?.days)[i] ?? {};
    return { day: name, date: dates[i], title: str(d.title, 60), kind: KINDS.includes(d.kind) ? d.kind : 'reflect', action: str(d.action, 500), scripture: cleanRef(d.scripture).slice(0, 60) };
  });
  return {
    prayerPoints: list(raw?.prayerPoints).map((t) => ({ text: str(typeof t === 'string' ? t : t?.text, 400), include: true })).filter((p) => p.text).slice(0, 12),
    furtherReading: list(raw?.furtherReading).map((r) => ({ ref: cleanRef(r?.ref).slice(0, 60), why: str(r?.why, 240) })).filter((r) => r.ref).slice(0, 8),
    plan: { theme: str(raw?.weeklyTheme, 80), target: str(raw?.weeklyTarget, 300), days },
  };
}

// Compact view of the notes for the follow-through prompt (no full verse text needed).
function digest(n) {
  return {
    title: n.title,
    bigIdea: n.bigIdea,
    scriptures: n.scriptures.map((s) => s.ref),
    sections: n.sections.map((s) => ({ heading: s.heading, points: s.points.map((p) => p.text) })),
    closing: n.closing,
  };
}

export async function buildNotes({ session, fullText, translation = 'kjv' }) {
  const structure = cleanStructure(await generateNotesStructure({ fullText, titleHint: session.title, preacher: session.preacher }));
  if (structure.sections.length === 0) {
    const err = new Error("Couldn't build the notes from this message. Check the transcript and OPENROUTER_API_KEY, then try again.");
    err.status = 502;
    throw err;
  }
  structure.scriptures = await resolveScriptures(structure, translation);
  const serviceIso = isoDate(new Date(session.startedAt || session.createdAt || Date.now()));
  const devotional = cleanDevotional(await generateNotesDevotional({ notes: digest(structure) }), serviceIso);
  return {
    ...structure,
    ...devotional,
    title: structure.title || session.title,
    preacher: session.preacher,
    date: serviceIso,
    translation,
  };
}

// Refetches every scripture's text in another translation.
export async function retranslate(scriptures, translation) {
  const found = await lookupMany(scriptures.map((s) => s.ref), translation);
  return scriptures.map((s) => {
    const hit = found.get(cleanRef(s.ref));
    return { ...s, text: hit?.text || s.text, verified: Boolean(hit) || s.verified };
  });
}
