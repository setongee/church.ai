import { Schedule } from '../models/Schedule.model.js';
import { PresentSession } from '../models/PresentSession.model.js';
import { cleanBackground } from './presentContent.controller.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const KINDS = new Set(['scripture', 'scripture2', 'song', 'text', 'image', 'quote', 'video', 'ministering', 'giving', 'welcome']);
const TYPES = new Set(['scripture', 'song', 'announcement', 'image', 'prayer', 'quote', 'media', 'slideshow', 'template']);
const BG_TYPES = new Set(['gradient', 'color', 'image', 'video']);
const IMAGE_FITS = new Set(['contain', 'cover', 'stretch', 'zoom']);
const QUOTE_LAYOUTS = new Set(['classic', 'centered', 'bold', 'bar', 'card', 'minimal', 'bigmark']);

const str = (v, max) => String(v ?? '').slice(0, max);

// Highlighted ranges of a scripture's text ({ start, end, color }), set in the Scripture tab.
export function cleanHighlights(list, textLength) {
  if (!Array.isArray(list)) return undefined;
  const out = list
    .slice(0, 100)
    .map((h) => ({ start: Math.max(0, Math.floor(Number(h?.start))), end: Math.min(textLength, Math.floor(Number(h?.end))), color: /^#[0-9a-f]{6}$/i.test(h?.color) ? h.color : '#fde047' }))
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start);
  return out.length ? out : undefined;
}

const cleanPart = (p) => {
  const text = str(p?.text, 6000);
  return { reference: str(p?.reference, 100), version: str(p?.version, 20), text, highlights: cleanHighlights(p?.highlights, text.length) };
};

// The split-screen points deck (key points beside the scripture): { on, pages: [{ heading, points[] }], index }.
export function cleanSplit(d) {
  if (!d || typeof d !== 'object') return null;
  const pages = (Array.isArray(d.pages) ? d.pages : [])
    .slice(0, 100)
    .map((p) => ({ heading: str(p?.heading, 200), points: (Array.isArray(p?.points) ? p.points : []).slice(0, 40).map((x) => str(x, 400)).filter((x) => x.trim()) }))
    .filter((p) => p.heading.trim() || p.points.length);
  if (!pages.length) return null;
  return { on: Boolean(d.on), title: str(d.title, 200), pages, index: Math.min(pages.length - 1, Math.max(0, Math.floor(Number(d.index)) || 0)) };
}

const ANNOUNCEMENT_LAYOUTS = new Set(['classic', 'bold', 'split', 'glass', 'spotlight', 'poster', 'lower', 'ticket', 'editorial', 'wave']);
const EFFECT_IDS = new Set(['pulse', 'glow', 'neon', 'outline', 'shimmer', 'float', 'rise', 'wave']);
const EFFECT_SPEEDS = new Set(['slow', 'normal', 'fast']);
// A song slide's text effect, or undefined.
const cleanEffect = (e) => (e && EFFECT_IDS.has(e.id) ? { id: e.id, speed: EFFECT_SPEEDS.has(e.speed) ? e.speed : undefined, color: /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : undefined } : undefined);

export function cleanSlide(s) {
  if (!s || !KINDS.has(s.kind)) return null;
  if (s.kind === 'image') return s.url ? { kind: 'image', url: str(s.url, 1000) } : null;
  if (s.kind === 'video') return s.url ? { kind: 'video', url: str(s.url, 1000), loop: Boolean(s.loop), muted: Boolean(s.muted) } : null;
  if (s.kind === 'welcome') {
    const colour = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
    const speed = Number(s.speed);
    return {
      kind: 'welcome',
      script: str(s.script, 60),
      main: str(s.main, 24),
      badgeTop: str(s.badgeTop, 10),
      badgeNum: str(s.badgeNum, 4),
      badgeColor: colour(s.badgeColor),
      marquee: str(s.marquee, 120),
      logoUrl: str(s.logoUrl, 1000),
      bgUrl: str(s.bgUrl, 1000),
      photos: (Array.isArray(s.photos) ? s.photos : []).slice(0, 30).map((u) => str(u, 1000)).filter(Boolean),
      speed: Number.isFinite(speed) ? Math.min(15, Math.max(1.5, speed)) : undefined,
      logoGap: Number.isFinite(Number(s.logoGap)) ? Math.min(10, Math.max(-3, Number(s.logoGap))) : undefined,
      marqueeGap: Number.isFinite(Number(s.marqueeGap)) ? Math.min(4, Math.max(-4, Number(s.marqueeGap))) : undefined,
      scriptFont: str(s.scriptFont, 80),
      mainFont: str(s.mainFont, 80),
      badgeFont: str(s.badgeFont, 80),
      marqueeFont: str(s.marqueeFont, 80),
    };
  }
  if (s.kind === 'giving') {
    if (!s.accountNo) return null;
    const colour = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
    return {
      kind: 'giving',
      accountNo: str(s.accountNo, 20),
      accountName: str(s.accountName, 120),
      bankName: str(s.bankName, 60),
      heading: str(s.heading, 80),
      logoUrl: str(s.logoUrl, 1000),
      c1: colour(s.c1),
      c2: colour(s.c2),
      c3: colour(s.c3),
      hi: colour(s.hi),
      loop: Boolean(s.loop),
    };
  }
  if (s.kind === 'ministering') {
    if (!s.name) return null;
    const colour = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
    const gap = Number(s.gap);
    const scale = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(2, Math.max(0.5, Number(v))) : undefined);
    return {
      kind: 'ministering',
      template: s.template ? str(s.template, 40) : undefined,
      name: str(s.name, 120),
      logoUrl: str(s.logoUrl, 1000),
      photoUrl: str(s.photoUrl, 1000),
      word: str(s.word, 24),
      gap: Number.isFinite(gap) ? Math.min(10, Math.max(-2, gap)) : undefined,
      titleColor: colour(s.titleColor),
      nameColor: colour(s.nameColor),
      pillColor: colour(s.pillColor),
      titleScale: scale(s.titleScale),
      nameScale: scale(s.nameScale),
      titleSpacing: Number.isFinite(Number(s.titleSpacing)) ? Math.min(0.5, Math.max(-0.1, Number(s.titleSpacing))) : undefined,
      loop: Boolean(s.loop),
    };
  }
  if (s.kind === 'quote') return { kind: 'quote', text: str(s.text, 4000), attribution: s.attribution ? str(s.attribution, 200) : undefined, background: cleanBackground(s.background) ?? undefined };
  if (s.kind === 'scripture2') return s.left && s.right ? { kind: 'scripture2', left: cleanPart(s.left), right: cleanPart(s.right) } : null;
  if (s.kind === 'scripture') return { kind: 'scripture', ...cleanPart(s) };
  if (s.kind === 'song') return { kind: 'song', title: str(s.title, 200), label: s.label ? str(s.label, 60) : undefined, text: str(s.text, 4000), effect: cleanEffect(s.effect) };
  const layout = ANNOUNCEMENT_LAYOUTS.has(s.layout) && s.layout !== 'classic' ? s.layout : undefined;
  const variant = s.variant === 'prayer' ? 'prayer' : undefined;
  return { kind: 'text', variant, scene: variant && s.scene ? cleanScene(s.scene) : undefined, layout, kicker: layout && s.kicker ? str(s.kicker, 60) : undefined, accent: layout && /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : undefined, title: s.title ? str(s.title, 200) : undefined, text: str(s.text, 4000), imageUrl: s.imageUrl ? str(s.imageUrl, 1000) : undefined, background: cleanBackground(s.background) ?? undefined };
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 500)
    .filter((i) => i && TYPES.has(i.type))
    .map((i) => ({
      ...(i._id && /^[0-9a-f]{24}$/i.test(i._id) ? { _id: i._id } : {}),
      type: i.type,
      title: str(i.title, 200),
      subtitle: str(i.subtitle, 200),
      ...(i.type === 'template' && i.scene ? { scene: cleanScene(i.scene) } : {}),
      ...(i.type === 'slideshow' && i.show ? { show: { seconds: Math.min(600, Math.max(2, Number(i.show.seconds) || 8)), loop: Boolean(i.show.loop) } } : {}),
      slides: (Array.isArray(i.slides) ? i.slides : []).slice(0, 200).map(cleanSlide).filter(Boolean),
    }));
}

// One section's look (scripture, song or prayer): where its text sits, the fill, alignment, size and an optional backdrop.
export function cleanLook(l) {
  if (!l || typeof l !== 'object') return null;
  const background = cleanBackground(l.background);
  return { frame: cleanFrame(l.frame), frameBg: cleanBackground(l.frameBg), align: l.align === 'left' ? 'left' : 'center', scale: Math.min(2, Math.max(0.3, Number(l.scale) || 1)), ...(background ? { background } : {}) };
}
// { scripture?, song?, prayer? } - the looks a template (or the screen) gives each section, or null when none are set.
export function cleanSections(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};
  for (const k of ['scripture', 'song', 'prayer']) {
    const look = cleanLook(s[k]);
    if (look) out[k] = look;
  }
  return Object.keys(out).length ? out : null;
}

// A template scene's text style: where the text sits, its fill, alignment and size - and, per section, any looks of its own.
function cleanScene(sc) {
  const st = sc?.style ?? {};
  const sections = cleanSections(sc?.sections);
  return {
    layer: 'background',
    background: cleanBackground(sc?.background),
    ...(sections ? { sections } : {}),
    style: { frame: cleanFrame(st.frame), frameBg: cleanBackground(st.frameBg), align: st.align === 'left' ? 'left' : 'center', scale: Math.min(2, Math.max(0.3, Number(st.scale) || 1)) },
  };
}

// A text frame on the 1920x1080 screen, or null for the normal full-screen layout.
export function cleanFrame(f) {
  if (!f || typeof f !== 'object') return null;
  const n = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  const w = n(f.w, 360, 1920);
  const h = n(f.h, 140, 1080);
  return { x: n(f.x, 0, 1920 - w), y: n(f.y, 0, 1080 - h), w, h };
}

function cleanSettings(s) {
  const out = {};
  if (s?.background && BG_TYPES.has(s.background.type) && typeof s.background.value === 'string') {
    out.background = { type: s.background.type, value: str(s.background.value, 1000) };
  }
  if (s?.style && typeof s.style === 'object') {
    const st = s.style;
    out.style = {
      align: st.align === 'left' ? 'left' : 'center',
      scale: Math.min(2, Math.max(0.3, Number(st.scale) || 1)),
      font: str(st.font, 80),
      weight: [400, 500, 700].includes(Number(st.weight)) ? Number(st.weight) : 500,
      imageFit: IMAGE_FITS.has(st.imageFit) ? st.imageFit : 'contain',
      quoteLayout: QUOTE_LAYOUTS.has(st.quoteLayout) ? st.quoteLayout : 'classic',
      ...(ANNOUNCEMENT_LAYOUTS.has(st.announcementTemplate) ? { announcementTemplate: st.announcementTemplate } : {}),
      frame: cleanFrame(st.frame),
      frameBg: cleanBackground(st.frameBg),
    };
  }
  if (typeof s?.wrapperId === 'string' && /^[0-9a-f]{24}$/i.test(s.wrapperId)) {
    out.wrapperId = s.wrapperId; // the service wrapper applied to this schedule
    // How the screen looked before the wrapper, so taking the wrapper off puts that back (even after a reload).
    if (s.wrapperBefore && typeof s.wrapperBefore === 'object') {
      const before = cleanSettings({ background: s.wrapperBefore.background, style: s.wrapperBefore.style });
      out.wrapperBefore = { ...(before.background ? { background: before.background } : {}), ...(before.style ? { style: before.style } : {}) };
    }
  }
  for (const key of ['logoSlide', 'bgSlide']) {
    const c = s?.[key] ? cleanSlide(s[key]) : null;
    if (c && (c.kind === 'ministering' || c.kind === 'giving' || c.kind === 'welcome')) out[key] = c;
  }
  if (typeof s?.logoUrl === 'string' && s.logoUrl) {
    out.logoUrl = str(s.logoUrl, 1000);
    out.logoKind = ['logo', 'image', 'video'].includes(s.logoKind) ? s.logoKind : 'logo';
  }
  return out;
}

export async function listSchedules(req, res) {
  const [docs, used] = await Promise.all([
    Schedule.find().sort({ createdAt: 1 }).lean(),
    PresentSession.aggregate([{ $group: { _id: '$schedule', last: { $max: '$startedAt' } } }]),
  ]);
  const lastUsed = new Map(used.map((u) => [String(u._id), u.last]));
  res.json(docs.map((d) => ({ _id: d._id, name: d.name, count: d.items.length, lastUsedAt: lastUsed.get(String(d._id)) ?? null, updatedAt: d.updatedAt })));
}

export async function getSchedule(req, res) {
  const doc = await Schedule.findById(req.params.id);
  if (!doc) throw bad('Schedule not found.', 404);
  res.json(doc);
}

export async function createSchedule(req, res) {
  const name = str(req.body?.name, 80).trim();
  if (!name) throw bad('Give the schedule a name.');
  res.json(await Schedule.create({ name, items: cleanItems(req.body?.items), settings: cleanSettings(req.body?.settings) }));
}

export async function updateSchedule(req, res) {
  const update = {};
  if (req.body?.name !== undefined) {
    update.name = str(req.body.name, 80).trim();
    if (!update.name) throw bad('Give the schedule a name.');
  }
  if (req.body?.items !== undefined) update.items = cleanItems(req.body.items);
  if (req.body?.settings !== undefined) update.settings = cleanSettings(req.body.settings);
  const doc = await Schedule.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!doc) throw bad('Schedule not found.', 404);
  res.json(doc);
}

export async function deleteSchedule(req, res) {
  await Schedule.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}
