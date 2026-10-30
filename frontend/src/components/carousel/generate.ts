import { createCarouselPost, createDesign, deleteDesign, exportDesign, updateCarouselPost } from '@/lib/api';
import type { Brand, CarouselPostSlide, SavedTemplate, SessionDetail } from '@/lib/types';
import { buildContent } from '../editor/dataFields';
import { TEMPLATES } from '../editor/templates/catalog';
import type { Template, TemplateContent } from '../editor/templates/engine';
import { buildFromSaved, buildFromTemplate, type BuiltSlide } from './render';

export type CarouselSource = 'keyPoints' | 'quotes' | 'declarations' | 'scriptures' | 'mixed';

export const SOURCES: { key: CarouselSource; label: string; hint: string }[] = [
  { key: 'keyPoints', label: 'Key points', hint: 'The teaching points of the message' },
  { key: 'quotes', label: 'Key quotes', hint: 'Quotable lines picked from the message' },
  { key: 'declarations', label: 'Declarations', hint: 'What the preacher led people to declare' },
  { key: 'scriptures', label: 'Scriptures', hint: 'Verses referenced in the message' },
  { key: 'mixed', label: 'Mix of everything', hint: 'Points, quotes and scriptures alternating' },
];

const MAX_BODY = 8;

export const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

// The text for each content slide, from the session's summary and captured quotes/notes.
export function collectItems(detail: SessionDetail, source: CarouselSource): string[] {
  const summary = detail.session.summary;
  const keyPoints = summary?.keyPoints?.length ? summary.keyPoints : detail.insights.filter((i) => i.type === 'keyPoint').map((i) => i.text);
  const quotes = detail.quotes.map((q) => q.text);
  const declarations = summary?.declarations?.length ? summary.declarations : detail.insights.filter((i) => i.type === 'declaration').map((i) => i.text);
  const scriptures = summary?.scriptures?.length ? summary.scriptures : detail.insights.filter((i) => i.type === 'scripture').map((i) => (i.reference ? `${i.text} (${i.reference})` : i.text));
  const pool = { keyPoints, quotes, declarations, scriptures } as const;
  if (source !== 'mixed') return pool[source].map(clean).filter(Boolean);
  const out: string[] = [];
  const lists = [keyPoints, quotes, scriptures, declarations].map((l) => l.map(clean).filter(Boolean));
  for (let i = 0; lists.some((l) => i < l.length); i += 1) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export type TemplateChoice = { kind: 'builtin'; template: Template } | { kind: 'saved'; saved: SavedTemplate };

// Saved edits of a built-in template win over the original, as everywhere else.
export function templateChoices(saved: SavedTemplate[], kinds: Template['kind'][]): { id: string; name: string; choice: TemplateChoice; sizes: { w: number; h: number }[] | null }[] {
  const overrides = new Map(saved.filter((s) => s.baseId).map((s) => [s.baseId as string, s]));
  const list: { id: string; name: string; choice: TemplateChoice; sizes: { w: number; h: number }[] | null }[] = [];
  for (const t of TEMPLATES.filter((x) => kinds.includes(x.kind))) {
    const o = overrides.get(t.id);
    list.push(o ? { id: t.id, name: `${t.name} (edited)`, choice: { kind: 'saved', saved: o }, sizes: sizesOf(o) } : { id: t.id, name: t.name, choice: { kind: 'builtin', template: t }, sizes: null });
  }
  for (const s of saved.filter((x) => !x.baseId && kinds.includes(x.kind))) list.push({ id: s._id, name: s.name, choice: { kind: 'saved', saved: s }, sizes: sizesOf(s) });
  return list;
}

const sizesOf = (s: SavedTemplate) => [{ w: s.width, h: s.height }, ...(s.variants ?? []).map((v) => ({ w: v.width, h: v.height }))];

export function build(choice: TemplateChoice, size: { w: number; h: number }, content: TemplateContent): Promise<BuiltSlide> {
  return choice.kind === 'builtin' ? buildFromTemplate(choice.template, size, content) : buildFromSaved(choice.saved, size, content);
}

export interface GenerateOptions {
  detail: SessionDetail;
  brand: Brand | null;
  source: CarouselSource;
  count: number;
  cover: boolean;
  closing: boolean;
  size: { w: number; h: number };
  body: TemplateChoice;
  coverChoice: TemplateChoice;
  templateId: string;
  coverTemplateId: string;
  onProgress?: (done: number, total: number, label: string) => void;
}

type Created = { kind: 'design'; design: string; owned: true; label: string };

// Builds one design per slide (cover, N content slides, closing) from the chosen templates and
// exports each, so the carousel can be published straight away or tweaked in the editor first.
async function buildSlides(o: GenerateOptions, onCreated: (c: Created) => void): Promise<number> {
  const { session } = o.detail;
  const items = collectItems(o.detail, o.source).slice(0, Math.min(MAX_BODY, o.count));
  if (items.length === 0) throw new Error('There is nothing of that kind in this session yet. Pick another source.');

  const base = buildContent({ text: '' } as never, session, o.brand);
  const title = session.summary?.topics?.[0] || session.title;
  const closingText = o.brand?.outroCta || 'Get the full message';
  const plan: { label: string; text: string; content: TemplateContent; choice: TemplateChoice }[] = [];
  if (o.cover) plan.push({ label: 'Cover', text: title, content: { ...base, title, quote: title }, choice: o.coverChoice });
  items.forEach((text, i) => plan.push({ label: `${i + 1}`, text, content: { ...base, quote: text, points: [text] }, choice: o.body }));
  if (o.closing) plan.push({ label: 'Closing', text: closingText, content: { ...base, quote: closingText }, choice: o.body });
  const slides = plan.slice(0, 10);

  for (const [i, s] of slides.entries()) {
    o.onProgress?.(i, slides.length, s.label);
    const { design } = await createDesign({ sessionId: session._id, source: 'blank', text: s.text, title: `${session.title} · ${s.label}`.slice(0, 100), width: o.size.w, height: o.size.h });
    // Register it before the (slower) render so a failure part-way can still clean up.
    onCreated({ kind: 'design', design: design._id, owned: true, label: s.label });
    const built = await build(s.choice, o.size, s.content);
    await exportDesign(design._id, { dataUrl: built.dataUrl, editorState: built.state });
  }
  o.onProgress?.(slides.length, slides.length, '');
  return items.length;
}

const recipeOf = (o: GenerateOptions, count: number) => ({ source: o.source, count, templateId: o.templateId, coverTemplateId: o.coverTemplateId, cover: o.cover, closing: o.closing });

// Creates the carousel and its slides. Returns the carousel id.
export async function generateCarousel(o: GenerateOptions): Promise<string> {
  const carousel = await createCarouselPost({ sessionId: o.detail.session._id, width: o.size.w, height: o.size.h, recipe: recipeOf(o, o.count) });
  const created: Created[] = [];
  let count = o.count;
  try {
    count = await buildSlides(o, (c) => created.push(c));
  } finally {
    await updateCarouselPost(carousel._id, { slides: created, recipe: recipeOf(o, count) });
  }
  return carousel._id;
}

// Rebuilds a carousel's generated slides with new settings. Slides the user added themselves
// (uploads, designs from the library) stay where they are; the generated ones are replaced as a
// block, and the old generated designs are deleted once the new ones are in place.
export async function regenerateCarousel(carouselId: string, existing: CarouselPostSlide[], o: GenerateOptions): Promise<void> {
  const created: Created[] = [];
  try {
    const count = await buildSlides(o, (c) => created.push(c));
    const firstOwned = existing.findIndex((s) => s.owned && s.kind === 'design');
    const kept = existing.filter((s) => !(s.owned && s.kind === 'design'));
    const at = firstOwned < 0 ? 0 : existing.slice(0, firstOwned).filter((s) => !(s.owned && s.kind === 'design')).length;
    const next = [...kept.slice(0, at), ...created, ...kept.slice(at)].slice(0, 10);
    await updateCarouselPost(carouselId, {
      width: o.size.w,
      height: o.size.h,
      recipe: recipeOf(o, count),
      slides: next.map((s) => ({ kind: s.kind, design: 'design' in s ? s.design : undefined, owned: s.owned, imageUrl: 'imageUrl' in s ? s.imageUrl : undefined, videoUrl: 'videoUrl' in s ? s.videoUrl : undefined, label: s.label })),
    });
  } catch (err) {
    // Nothing was swapped in, so the half-built new slides are not wanted.
    await Promise.all(created.map((c) => deleteDesign(c.design).catch(() => {})));
    throw err;
  }
  await Promise.all(existing.filter((s) => s.owned && s.kind === 'design' && s.design).map((s) => deleteDesign(s.design as string).catch(() => {})));
}
