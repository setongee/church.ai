import { Service } from '../models/Service.model.js';
import { Session } from '../models/Session.model.js';
import { Quote } from '../models/Quote.model.js';
import { Reel } from '../models/Reel.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { PhotoReel } from '../models/PhotoReel.model.js';
import { Carousel } from '../models/Carousel.model.js';
import { Design } from '../models/Design.model.js';
import { AudioMerge } from '../models/AudioMerge.model.js';
import { MessageNotes } from '../models/MessageNotes.model.js';
import { PresentSession } from '../models/PresentSession.model.js';
import { RANGES } from './instagramAnalytics.controller.js';

// What the platform has produced, by kind. `published` models carry an Instagram publish date.
const KINDS = [
  { id: 'sessions', label: 'Sessions', Model: Session },
  { id: 'quotes', label: 'Quotes', Model: Quote, published: true },
  { id: 'reels', label: 'Reels', Model: Reel, published: true },
  { id: 'compilations', label: 'Merged reels', Model: Compilation, published: true },
  { id: 'photoReels', label: 'Photo reels', Model: PhotoReel, published: true },
  { id: 'carousels', label: 'Carousels', Model: Carousel, published: true },
  { id: 'designs', label: 'Designs', Model: Design, published: true },
  { id: 'audioMerges', label: 'Audio Lab merges', Model: AudioMerge },
  { id: 'notes', label: 'Message notes', Model: MessageNotes },
  { id: 'presentServices', label: 'Presented services', Model: PresentSession },
];

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export async function overview(req, res) {
  const key = req.query.range in RANGES ? req.query.range : '30d';
  const days = RANGES[key];
  const now = new Date();
  const start = days ? new Date(now.getTime() - days * 86400000) : null;
  const prevStart = days ? new Date(start.getTime() - days * 86400000) : null;
  const inRange = (field) => (start ? { [field]: { $gte: start, $lte: now } } : {});
  const inPrev = (field) => ({ [field]: { $gte: prevStart, $lt: start } });

  const perKind = await Promise.all(
    KINDS.map(async (k) => {
      const [count, prev, createdDays, published, publishedPrev, publishedDays] = await Promise.all([
        k.Model.countDocuments(inRange('createdAt')),
        days ? k.Model.countDocuments(inPrev('createdAt')) : null,
        k.Model.aggregate([{ $match: inRange('createdAt') }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } }]),
        k.published ? k.Model.countDocuments({ instagramMediaId: { $exists: true, $nin: [null, ''] }, ...inRange('instagramPublishedAt') }) : 0,
        k.published && days ? k.Model.countDocuments({ instagramMediaId: { $exists: true, $nin: [null, ''] }, ...inPrev('instagramPublishedAt') }) : null,
        k.published ? k.Model.aggregate([{ $match: { instagramMediaId: { $exists: true, $nin: [null, ''] }, ...inRange('instagramPublishedAt') } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$instagramPublishedAt' } }, n: { $sum: 1 } } }]) : [],
      ]);
      return { ...k, count, prev, createdDays, published, publishedPrev, publishedDays };
    })
  );

  // Content made (everything except sessions / presented services, which are events) and posts published.
  const isContent = (k) => !['sessions', 'presentServices'].includes(k.id);
  const content = perKind.filter(isContent);
  const sum = (arr, f) => arr.reduce((n, k) => n + (f(k) ?? 0), 0);
  const kpis = [
    { id: 'sessions', label: 'Sessions', value: perKind.find((k) => k.id === 'sessions').count, prev: perKind.find((k) => k.id === 'sessions').prev },
    { id: 'content', label: 'Content created', value: sum(content, (k) => k.count), prev: days ? sum(content, (k) => k.prev) : null },
    { id: 'published', label: 'Posts published', value: sum(perKind, (k) => k.published), prev: days ? sum(perKind, (k) => k.publishedPrev) : null },
    { id: 'presented', label: 'Services presented', value: perKind.find((k) => k.id === 'presentServices').count, prev: perKind.find((k) => k.id === 'presentServices').prev },
  ];

  // Timeline: days for up to 30 days, weeks for 90, months beyond.
  const bucketOf = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    if (!days || days > 90) return `${iso.slice(0, 7)}-01`;
    if (days > 30) {
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return dayKey(monday);
    }
    return iso;
  };
  const created = new Map();
  const pub = new Map();
  for (const k of perKind) {
    if (isContent(k)) for (const r of k.createdDays) created.set(bucketOf(r._id), (created.get(bucketOf(r._id)) ?? 0) + r.n);
    for (const r of k.publishedDays) pub.set(bucketOf(r._id), (pub.get(bucketOf(r._id)) ?? 0) + r.n);
  }
  const keys = [...new Set([...created.keys(), ...pub.keys()])].sort();
  const timeline = keys.map((d) => ({ date: d, created: created.get(d) ?? 0, published: pub.get(d) ?? 0 }));

  // Per service: sessions and the content made in them.
  const services = await Service.find().select('name date').lean();
  const sessions = await Session.find({}).select('service').lean();
  const serviceOf = new Map(sessions.map((s) => [String(s._id), String(s.service)]));
  const rows = new Map(services.map((s) => [String(s._id), { id: String(s._id), name: s.name, date: s.date, sessions: 0, quotes: 0, reels: 0, published: 0 }]));
  const rangedSessions = await Session.find(inRange('createdAt')).select('service').lean();
  for (const s of rangedSessions) rows.get(String(s.service)) && (rows.get(String(s.service)).sessions += 1);
  for (const [field, Model] of [['quotes', Quote], ['reels', Reel]]) {
    const agg = await Model.aggregate([{ $match: inRange('createdAt') }, { $group: { _id: '$session', n: { $sum: 1 } } }]);
    for (const a of agg) rows.get(serviceOf.get(String(a._id)))?.[field] !== undefined && (rows.get(serviceOf.get(String(a._id)))[field] += a.n);
  }
  for (const Model of [Quote, Reel, Compilation]) {
    const agg = await Model.aggregate([{ $match: { instagramMediaId: { $exists: true, $nin: [null, ''] }, ...inRange('instagramPublishedAt') } }, { $group: { _id: '$session', n: { $sum: 1 } } }]);
    for (const a of agg) {
      const row = rows.get(serviceOf.get(String(a._id)));
      if (row) row.published += a.n;
    }
  }
  const byService = [...rows.values()].filter((r) => r.sessions + r.quotes + r.reels + r.published > 0).sort((a, b) => b.sessions + b.quotes + b.reels - (a.sessions + a.quotes + a.reels)).slice(0, 12);

  res.json({
    range: key,
    from: start,
    to: now,
    totals: { services: await Service.countDocuments(), servicesInRange: services.filter((s) => !start || (s.date && new Date(s.date) >= start && new Date(s.date) <= now)).length },
    kpis,
    mix: content.map((k) => ({ id: k.id, label: k.label, count: k.count, published: k.published })).sort((a, b) => b.count - a.count),
    timeline,
    bucket: !days || days > 90 ? 'month' : days > 30 ? 'week' : 'day',
    byService,
  });
}
