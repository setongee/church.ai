import { StaticCanvas } from 'fabric';
import { clearFabricFontCache, loadFont, loadFontList } from '@/lib/fonts';
import { CUSTOM_PROPS } from '../editor/constants';
import {
  fillImageSlots,
  fillSlots,
  makeBgRect,
  runTemplate,
  type Template,
  type TemplateContent,
} from '../editor/templates/engine';
import { pickVariant } from '../editor/useDesignCanvas';
import type { SavedTemplate } from '@/lib/types';

type Size = { w: number; h: number };
type State = Record<string, unknown>;

function familiesIn(state: State): string[] {
  const out = new Set<string>();
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if (typeof rec.fontFamily === 'string') out.add(rec.fontFamily.replace(/^["']|["']$/g, ''));
    for (const v of Object.values(rec)) if (v && typeof v === 'object') walk(v);
  };
  walk(state);
  return [...out];
}

async function prepareFonts(families: string[]) {
  await loadFontList();
  await Promise.all(families.map((f) => loadFont(f).then(() => clearFabricFontCache(f)).catch(() => {})));
}

function snapshot(sc: StaticCanvas, opts: { format: 'jpeg' | 'png'; quality?: number; maxW?: number; multiplier?: number; w: number }) {
  const multiplier = opts.multiplier ?? (opts.maxW ? Math.min(1, opts.maxW / opts.w) : 1);
  return sc.toDataURL({ format: opts.format, quality: opts.quality ?? 0.92, multiplier, enableRetinaScaling: false });
}

// Draws a saved canvas state off-screen and returns it as an image (a JPEG by default - what
// Instagram needs). `multiplier` renders larger or smaller than the design's own size, drawing
// text and shapes at that resolution (crisper than scaling a finished picture). The editor's own export draws the same state, so the result matches.
export async function renderState(state: State, size: Size, opts: { format?: 'jpeg' | 'png'; quality?: number; maxW?: number; multiplier?: number } = {}): Promise<string> {
  await prepareFonts(familiesIn(state));
  const el = document.createElement('canvas');
  const sc = new StaticCanvas(el, { width: size.w, height: size.h, enableRetinaScaling: false });
  try {
    await sc.loadFromJSON(JSON.parse(JSON.stringify(state)));
    sc.renderAll();
    return snapshot(sc, { format: opts.format ?? 'jpeg', quality: opts.quality, maxW: opts.maxW, multiplier: opts.multiplier, w: size.w });
  } finally {
    await sc.dispose();
  }
}

export interface BuiltSlide {
  state: State;
  dataUrl: string;
}

// A built-in template poured with the given content, as an editor state + rendered image.
export async function buildFromTemplate(template: Template, size: Size, content: TemplateContent): Promise<BuiltSlide> {
  const built = await runTemplate(template, size, content);
  const el = document.createElement('canvas');
  const sc = new StaticCanvas(el, { width: size.w, height: size.h, enableRetinaScaling: false });
  try {
    const rect = makeBgRect(built.bg, size.w, size.h);
    Object.assign(rect, { role: 'bg-fill', tplId: template.id });
    if (built.bg.gradient) Object.assign(rect, { gradFrom: built.bg.gradient.from, gradTo: built.bg.gradient.to, gradAngle: built.bg.gradient.angle });
    sc.add(rect, ...built.objects);
    sc.renderAll();
    return { state: sc.toObject(CUSTOM_PROPS) as State, dataUrl: snapshot(sc, { format: 'jpeg', w: size.w }) };
  } finally {
    await sc.dispose();
  }
}

// A saved (user) template at the size it was tuned for, with the content poured into its linked
// text and pictures.
export async function buildFromSaved(saved: SavedTemplate, size: Size, content: TemplateContent): Promise<BuiltSlide> {
  const v = pickVariant(saved, size);
  if (v.width !== size.w || v.height !== size.h) throw new Error(`“${saved.name}” has no ${size.w}×${size.h} version.`);
  await prepareFonts(familiesIn(v.editorState));
  const el = document.createElement('canvas');
  const sc = new StaticCanvas(el, { width: size.w, height: size.h, enableRetinaScaling: false });
  try {
    await sc.loadFromJSON(JSON.parse(JSON.stringify(v.editorState)));
    fillSlots(sc.getObjects(), content);
    await fillImageSlots(sc.getObjects(), content);
    sc.renderAll();
    return { state: sc.toObject(CUSTOM_PROPS) as State, dataUrl: snapshot(sc, { format: 'jpeg', w: size.w }) };
  } finally {
    await sc.dispose();
  }
}
