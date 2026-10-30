import { Quote } from '../models/Quote.model.js';
import { Design } from '../models/Design.model.js';
import { DesignAnimation } from '../models/DesignAnimation.model.js';
import { Session } from '../models/Session.model.js';
import { Insight } from '../models/Insight.model.js';
import { MessageNotes } from '../models/MessageNotes.model.js';

// Read-only views of what the rest of the app has already generated, so the Present screen can use it
// without re-uploading or retyping: quote graphics, designs, AI images, reels, carousels, quotes from
// sermons, prayer points from message notes...

const clip = (s, n = 70) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const when = (d) => (d ? new Date(d) : new Date(0));
const matches = (q, ...parts) => !q || parts.some((p) => String(p || '').toLowerCase().includes(q));
const byNewest = (a, b) => when(b.createdAt) - when(a.createdAt);

// Pictures and videos for Media / Backgrounds: only what's been tagged "presentation" in the design
// studio - the designs themselves, and the animations made from them.
export async function appMedia(req, res) {
  const q = String(req.query.q || '').trim().toLowerCase();
  const designs = await Design.find({ presentation: true }).sort({ updatedAt: -1 }).limit(200).lean();
  const ids = designs.map((d) => d._id);
  const animations = ids.length ? await DesignAnimation.find({ status: 'done', design: { $in: ids }, videoUrl: { $exists: true, $nin: [null, ''] } }).sort({ createdAt: -1 }).limit(200).lean() : [];
  const titleOf = new Map(designs.map((d) => [String(d._id), d.title]));

  const items = [];
  designs.forEach((d) => {
    if (d.exportedImageUrl && matches(q, d.title, d.text)) items.push({ id: `design:${d._id}`, source: 'design', label: 'Design', type: 'image', url: d.exportedImageUrl, title: clip(d.title) || 'Design', createdAt: d.updatedAt });
  });
  animations.forEach((a) => {
    const title = titleOf.get(String(a.design)) || 'Animation';
    if (matches(q, title)) items.push({ id: `animation:${a._id}`, source: 'animation', label: 'Animation', type: 'video', url: a.videoUrl, title: clip(title), createdAt: a.createdAt });
  });
  res.json(items.sort(byNewest));
}

// Narrows the sermon-text sources to one session, or to every session of one service.
async function sessionScope(req) {
  const { session, service } = req.query;
  if (session) return { session };
  if (service) return { session: { $in: await Session.find({ service }).distinct('_id') } };
  return {};
}

// Quotes and excerpts from sermons.
export async function appQuotes(req, res) {
  const q = String(req.query.q || '').trim().toLowerCase();
  const scope = await sessionScope(req);
  const [quotes, insights, notes] = await Promise.all([
    Quote.find(scope).sort({ createdAt: -1 }).limit(150).populate('session', 'title preacher').lean(),
    Insight.find({ ...scope, type: { $in: ['keyPoint', 'declaration'] } }).sort({ createdAt: -1 }).limit(150).populate('session', 'title preacher').lean(),
    MessageNotes.find(scope).sort({ updatedAt: -1 }).limit(30).lean(),
  ]);

  const items = [];
  const add = (kind, label, text, attribution, context, createdAt, id) => {
    if (String(text || '').trim() && matches(q, text, attribution, context)) items.push({ id: `${kind}:${id}`, kind, label, text: String(text).trim(), attribution: attribution || '', context: context || '', createdAt });
  };
  quotes.forEach((d) => add('quote', 'Quote', d.text, d.session?.preacher, d.session?.title, d.createdAt, d._id));
  insights.forEach((d) =>
    add(d.type, d.type === 'declaration' ? 'Declaration' : 'Key point', d.text, d.session?.preacher, d.session?.title, d.createdAt, d._id)
  );
  notes.forEach((n) => {
    add('bigIdea', 'Big idea', n.bigIdea, n.preacher, n.title, n.updatedAt, `${n._id}-big`);
    (n.sections || []).forEach((s, i) => add('pullQuote', 'Pull quote', s.pullQuote, n.preacher, n.title, n.updatedAt, `${n._id}-${i}`));
  });
  res.json(items.sort(byNewest).slice(0, 400));
}

// Prayer points from message notes, plus declarations.
export async function appPrayers(req, res) {
  const q = String(req.query.q || '').trim().toLowerCase();
  const scope = await sessionScope(req);
  const [notes, declarations] = await Promise.all([
    MessageNotes.find({ ...scope, 'prayerPoints.0': { $exists: true } }).sort({ updatedAt: -1 }).limit(40).lean(),
    Insight.find({ ...scope, type: 'declaration' }).sort({ createdAt: -1 }).limit(100).populate('session', 'title').lean(),
  ]);
  const items = [];
  notes.forEach((n) =>
    (n.prayerPoints || []).forEach((p, i) => {
      if (p.include !== false && String(p.text || '').trim() && matches(q, p.text, n.title))
        items.push({ id: `prayer:${n._id}-${i}`, kind: 'prayerPoint', label: 'Prayer point', text: String(p.text).trim(), context: n.title || '', createdAt: n.updatedAt });
    })
  );
  declarations.forEach((d) => {
    if (matches(q, d.text, d.session?.title)) items.push({ id: `declaration:${d._id}`, kind: 'declaration', label: 'Declaration', text: String(d.text).trim(), context: d.session?.title || '', createdAt: d.createdAt });
  });
  res.json(items.sort(byNewest).slice(0, 300));
}
