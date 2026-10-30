'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActiveSelection,
  Canvas,
  Circle,
  FabricImage,
  Point,
  Rect,
  Shadow,
  Textbox,
  Triangle,
  type FabricObject,
} from 'fabric';
import { assetUrl, exportDesign, patchDesign, uploadEditorImage } from '@/lib/api';
import { clearFabricFontCache, loadFont } from '@/lib/fonts';
import type { Design, SavedTemplate } from '@/lib/types';
import {
  AUTOSAVE_DELAY_MS,
  CUSTOM_PROPS,
  HISTORY_LIMIT,
  TEXT_PRESETS,
  type TextPreset,
} from './constants';
import { attachSnapping, type SnapController } from './snapping';
import { fillImageSlots, fillSlots, imageSlotValues, makeBgRect, slotTextValue, swapImage, makeGradient, runTemplate, type Template, type TemplateContent } from './templates/engine';

// Which saved version of a template to start from for a canvas of `target` size.
export function pickVariant(
  tpl: Pick<SavedTemplate, 'width' | 'height' | 'editorState' | 'variants'>,
  target: { w: number; h: number }
): { width: number; height: number; editorState: Record<string, unknown> } {
  const all = [{ width: tpl.width, height: tpl.height, editorState: tpl.editorState }, ...(tpl.variants ?? [])];
  const score = (v: { width: number; height: number }) => Math.abs(Math.log(v.width / v.height / (target.w / target.h))) * 10 + Math.abs(Math.log((v.width * v.height) / (target.w * target.h))) * 0.1;
  return all.reduce((best, v) => (score(v) < score(best) ? v : best));
}

// ---------- types shared with the UI ----------

type Meta = { role?: string; uid?: string; label?: string; locked?: boolean; gradFrom?: string; gradTo?: string; gradAngle?: number; tplId?: string; lowerThird?: boolean };
type EObj = FabricObject & Meta;
const meta = (o: FabricObject) => o as EObj;

export interface TextInfo {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  linethrough: boolean;
  fill: string;
  textBackgroundColor: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
  charSpacing: number;
  stroke: string;
  strokeWidth: number;
  shadow: boolean;
  text: string;
  hasRange: boolean;
}

export interface SelectionInfo {
  kind: 'text' | 'shape' | 'image' | 'multi';
  count: number;
  locked: boolean;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  rx: number;
  text?: TextInfo;
  // The data field this single text/image is bound to (see dataFields.ts), if any.
  slot?: string;
  // Background / overlay layers can't be linked to data.
  structural?: boolean;
}

export interface LayerInfo {
  uid: string;
  label: string;
  kind: 'text' | 'image' | 'shape' | 'background';
  role?: string;
  visible: boolean;
  locked: boolean;
  selected: boolean;
}

export interface BackgroundInfo {
  hasImage: boolean;
  dim: number;
  adjusting: boolean;
  fill: string;
  gradient: { from: string; to: string; angle: number } | null;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type TextPatch = Partial<{
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  underline: boolean;
  linethrough: boolean;
  fill: string;
  textBackgroundColor: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
  charSpacing: number;
  stroke: string;
  strokeWidth: number;
}>;

// Properties that can differ per character and therefore must go through setSelectionStyles
// when only part of a text is selected.
const CHAR_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'underline', 'linethrough', 'fill', 'textBackgroundColor', 'stroke', 'strokeWidth'];

interface HistoryEntry {
  json: string;
  w: number;
  h: number;
}

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function collectFamilies(node: unknown, out: Set<string>) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectFamilies(n, out));
    return;
  }
  const rec = node as Record<string, unknown>;
  if (typeof rec.fontFamily === 'string') out.add(rec.fontFamily);
  Object.values(rec).forEach((v) => collectFamilies(v, out));
}

function stripStyleKeys(t: Textbox, keys: string[]) {
  const styles = t.styles as Record<string, Record<string, Record<string, unknown>>>;
  for (const line of Object.values(styles ?? {})) {
    for (const ch of Object.values(line)) keys.forEach((k) => delete ch[k]);
  }
}

function toBlobFromDataUrl(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function dataUrlToBlob(dataUrl: string) {
  return toBlobFromDataUrl(dataUrl);
}

// ---------- the hook ----------

export function useDesignCanvas({
  design,
  hostRef,
  stageRef,
  onDesignChange,
}: {
  design: Design;
  hostRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onDesignChange: (design: Design) => void;
}) {
  const canvasRef = useRef<Canvas | null>(null);
  const snapRef = useRef<SnapController | null>(null);
  const historyRef = useRef<{ stack: HistoryEntry[]; index: number }>({ stack: [], index: -1 });
  const suspendRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizeRef = useRef({ w: design.width, h: design.height });
  const scaleRef = useRef(1);
  const snapEnabledRef = useRef(true);
  const gridVisibleRef = useRef(false);
  const exportDirtyRef = useRef(!design.exportedImageUrl);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDesignChangeRef = useRef(onDesignChange);
  useEffect(() => {
    onDesignChangeRef.current = onDesignChange;
  });

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [size, setSize] = useState({ w: design.width, h: design.height });
  const [fitScale, setFitScale] = useState(0.4);
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [bg, setBg] = useState<BackgroundInfo>({ hasImage: false, dim: 0, adjusting: false, fill: '#111111', gradient: null });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [snapEnabled, setSnapEnabledState] = useState(true);
  const [gridVisible, setGridVisibleState] = useState(false);
  const [busy, setBusy] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const displayScale = fitScale * zoom;
  useEffect(() => {
    scaleRef.current = displayScale;
  }, [displayScale]);

  // ----- derived UI state -----

  const refreshLayers = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = new Set(canvas.getActiveObjects());
    const list: LayerInfo[] = [];
    for (const o of canvas.getObjects()) {
      const m = meta(o);
      if (!m.uid) m.uid = uid();
      const isText = o.type === 'textbox' || o.type === 'text' || o.type === 'i-text';
      const isImage = o.type === 'image';
      const role = m.role;
      let label = m.label ?? '';
      if (role === 'bg-fill') label = 'Background colour';
      else if (role === 'bg-image') label = 'Background image';
      else if (role === 'overlay') label = 'Dim overlay';
      else if (role === 'grain') label = 'Film grain';
      else if (!label) {
        if (isText) label = ((o as Textbox).text ?? '').replace(/\s+/g, ' ').slice(0, 30) || 'Text';
        else if (isImage) label = 'Image';
        else label = o.type === 'circle' ? 'Circle' : o.type === 'triangle' ? 'Triangle' : 'Shape';
      }
      list.push({
        uid: m.uid,
        label,
        kind: role ? 'background' : isText ? 'text' : isImage ? 'image' : 'shape',
        role,
        visible: o.visible !== false,
        locked: Boolean(m.locked),
        selected: active.has(o),
      });
    }
    setLayers(list.reverse());

    const fill = canvas.getObjects().find((o) => meta(o).role === 'bg-fill');
    const img = canvas.getObjects().find((o) => meta(o).role === 'bg-image');
    const overlay = canvas.getObjects().find((o) => meta(o).role === 'overlay');
    const f = fill ? meta(fill) : null;
    setActiveTemplateId(f?.tplId ?? null);
    setBg({
      hasImage: Boolean(img),
      dim: overlay?.opacity ?? 0,
      adjusting: Boolean(img && img.selectable),
      fill: typeof fill?.fill === 'string' ? fill.fill : '#111111',
      gradient: f?.gradFrom && f.gradTo ? { from: f.gradFrom, to: f.gradTo, angle: f.gradAngle ?? 160 } : null,
    });
  }, []);

  const refreshSelection = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objs = canvas.getActiveObjects();
    if (objs.length === 0) {
      setSelection(null);
      return;
    }
    const first = objs[0];
    const isText = (o: FabricObject) => o.type === 'textbox';
    const allText = objs.every(isText);
    const allImage = objs.every((o) => o.type === 'image');
    const allShape = objs.every((o) => !isText(o) && o.type !== 'image');
    const kind: SelectionInfo['kind'] = objs.length > 1 && !allText && !allImage && !allShape ? 'multi' : allText ? 'text' : allImage ? 'image' : allShape ? 'shape' : 'multi';

    let textInfo: TextInfo | undefined;
    if (allText) {
      const t = first as Textbox;
      const hasRange = Boolean(t.isEditing && t.selectionStart !== t.selectionEnd);
      const sel = hasRange ? (t.getSelectionStyles(t.selectionStart, t.selectionEnd, true)[0] ?? {}) : {};
      const pick = <K extends string>(key: K, fallback: unknown) =>
        ((sel as Record<string, unknown>)[key] ?? (t as unknown as Record<string, unknown>)[key] ?? fallback);
      const w = pick('fontWeight', 400);
      textInfo = {
        fontFamily: String(pick('fontFamily', 'Google Sans')).replace(/^["']|["']$/g, ''),
        fontSize: Math.round(Number(pick('fontSize', 48))),
        fontWeight: w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w) || 400,
        italic: pick('fontStyle', 'normal') === 'italic',
        underline: Boolean(pick('underline', false)),
        linethrough: Boolean(pick('linethrough', false)),
        fill: typeof pick('fill', '#ffffff') === 'string' ? (pick('fill', '#ffffff') as string) : '#ffffff',
        textBackgroundColor: String(pick('textBackgroundColor', '') || ''),
        textAlign: (t.textAlign as TextInfo['textAlign']) ?? 'center',
        lineHeight: t.lineHeight ?? 1.2,
        charSpacing: t.charSpacing ?? 0,
        stroke: typeof pick('stroke', '') === 'string' ? String(pick('stroke', '') || '') : '',
        strokeWidth: Number(pick('strokeWidth', 0)) || 0,
        shadow: Boolean(t.shadow),
        text: t.text ?? '',
        hasRange,
      };
    }
    setSelection({
      kind,
      count: objs.length,
      locked: objs.every((o) => meta(o).locked),
      opacity: first.opacity ?? 1,
      fill: typeof first.fill === 'string' ? first.fill : '',
      stroke: typeof first.stroke === 'string' ? first.stroke : '',
      strokeWidth: first.strokeWidth ?? 0,
      rx: (first as Rect).rx ?? 0,
      text: textInfo,
      structural: objs.some((o) => Boolean(meta(o).role)),
      slot: objs.length === 1 ? (first as unknown as { slot?: string }).slot || undefined : undefined,
    });
  }, []);

  const refreshAll = useCallback(() => {
    refreshLayers();
    refreshSelection();
  }, [refreshLayers, refreshSelection]);

  // ----- object decoration -----

  const styleControls = useCallback((o: FabricObject) => {
    const s = 1 / (scaleRef.current || 1);
    o.set({
      cornerStyle: 'circle',
      cornerColor: '#ffffff',
      cornerStrokeColor: '#0b6bff',
      borderColor: '#0b6bff',
      transparentCorners: false,
      cornerSize: 9 * s,
      touchCornerSize: 30 * s,
      borderScaleFactor: 1.2 * s,
      borderOpacityWhenMoving: 0.6,
      padding: 0,
      snapAngle: 15,
      snapThreshold: 4,
    });
  }, []);

  const decorate = useCallback(
    (o: FabricObject) => {
      const m = meta(o);
      if (!m.uid) m.uid = uid();
      styleControls(o);
      if (m.locked || m.role === 'bg-fill' || (m.role && !o.selectable)) {
        o.set({ selectable: false, evented: false });
      }
    },
    [styleControls]
  );

  // ----- history + autosave -----

  const serialize = useCallback((): { json: string; state: Record<string, unknown> } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Objects inside a live ActiveSelection serialise with group-relative coordinates, so
    // temporarily release the selection and restore it afterwards.
    const active = canvas.getActiveObject();
    let restore: FabricObject[] | null = null;
    if (active && active.type === 'activeselection') {
      restore = (active as ActiveSelection).getObjects();
      canvas.discardActiveObject();
    }
    const state = canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
    if (restore) {
      canvas.setActiveObject(new ActiveSelection(restore, { canvas }));
    }
    return { json: JSON.stringify(state), state };
  }, []);

  const saveNow = useCallback(async () => {
    const out = serialize();
    if (!out) return;
    setSaveStatus('saving');
    try {
      const updated = await patchDesign(design._id, {
        editorState: out.state,
        width: sizeRef.current.w,
        height: sizeRef.current.h,
      });
      onDesignChangeRef.current(updated);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, [design._id, serialize]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('idle');
    saveTimerRef.current = setTimeout(saveNow, AUTOSAVE_DELAY_MS);
  }, [saveNow]);

  const pushHistory = useCallback(() => {
    const out = serialize();
    if (!out) return;
    const h = historyRef.current;
    if (h.stack[h.index]?.json === out.json) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push({ json: out.json, w: sizeRef.current.w, h: sizeRef.current.h });
    if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
    h.index = h.stack.length - 1;
    setCanUndo(h.index > 0);
    setCanRedo(false);
  }, [serialize]);

  const recordChange = useCallback(() => {
    if (suspendRef.current > 0) return;
    pushHistory();
    exportDirtyRef.current = true;
    scheduleSave();
    refreshAll();
  }, [pushHistory, scheduleSave, refreshAll]);

  // Runs several canvas mutations as a single undo step.
  const batch = useCallback(
    async (fn: () => Promise<void> | void) => {
      suspendRef.current += 1;
      try {
        await fn();
      } finally {
        suspendRef.current -= 1;
      }
      recordChange();
    },
    [recordChange]
  );

  const enforceOrder = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ['bg-fill', 'bg-image', 'overlay'].forEach((role, i) => {
      const o = canvas.getObjects().find((x) => meta(x).role === role);
      if (o) canvas.moveObjectTo(o, i);
    });
  }, []);

  // ----- fonts -----

  const prepareFont = useCallback(async (family: string) => {
    await loadFont(family);
    clearFabricFontCache(family);
  }, []);

  const relayoutText = useCallback((family?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((o) => {
      if (o.type !== 'textbox') return;
      const t = o as Textbox;
      if (family && t.fontFamily !== family) return;
      t.initDimensions();
      t.setCoords();
      t.dirty = true;
    });
    canvas.requestRenderAll();
  }, []);

  // ----- canvas lifecycle -----

  const restoreEntry = useCallback(
    async (entry: HistoryEntry) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      suspendRef.current += 1;
      try {
        const state = JSON.parse(entry.json) as Record<string, unknown>;
        const families = new Set<string>();
        collectFamilies(state, families);
        await Promise.all([...families].map(prepareFont));
        canvas.discardActiveObject();
        await canvas.loadFromJSON(state);
        if (entry.w !== sizeRef.current.w || entry.h !== sizeRef.current.h) {
          sizeRef.current = { w: entry.w, h: entry.h };
          setSize({ w: entry.w, h: entry.h });
        }
        canvas.getObjects().forEach(decorate);
        relayoutText();
        canvas.requestRenderAll();
      } finally {
        suspendRef.current -= 1;
      }
      exportDirtyRef.current = true;
      scheduleSave();
      refreshAll();
    },
    [decorate, prepareFont, refreshAll, relayoutText, scheduleSave]
  );

  const undo = useCallback(async () => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    setCanUndo(h.index > 0);
    setCanRedo(true);
    await restoreEntry(h.stack[h.index]);
  }, [restoreEntry]);

  const redo = useCallback(async () => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    setCanUndo(true);
    setCanRedo(h.index < h.stack.length - 1);
    await restoreEntry(h.stack[h.index]);
  }, [restoreEntry]);

  // ----- background -----

  const ensureBgFill = useCallback((): Rect => {
    const canvas = canvasRef.current!;
    const existing = canvas.getObjects().find((o) => meta(o).role === 'bg-fill') as Rect | undefined;
    if (existing) return existing;
    const { w, h } = sizeRef.current;
    const rect = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width: w, height: h, fill: '#111111', selectable: false, evented: false, objectCaching: false });
    meta(rect).role = 'bg-fill';
    decorate(rect);
    canvas.add(rect);
    canvas.sendObjectToBack(rect);
    return rect;
  }, [decorate]);

  const setBackgroundSolid = useCallback(
    (color: string) =>
      batch(() => {
        const rect = ensureBgFill();
        const m = meta(rect);
        delete m.gradFrom;
        delete m.gradTo;
        delete m.gradAngle;
        rect.set({ fill: color });
        canvasRef.current?.requestRenderAll();
      }),
    [batch, ensureBgFill]
  );

  const setBackgroundGradient = useCallback(
    (from: string, to: string, angle: number) =>
      batch(() => {
        const rect = ensureBgFill();
        const m = meta(rect);
        m.gradFrom = from;
        m.gradTo = to;
        m.gradAngle = angle;
        rect.set({ fill: makeGradient(sizeRef.current.w, sizeRef.current.h, from, to, angle) });
        canvasRef.current?.requestRenderAll();
      }),
    [batch, ensureBgFill]
  );

  const fitImage = (img: FabricImage, mode: 'cover' | 'contain') => {
    const { w, h } = sizeRef.current;
    const iw = img.width || w;
    const ih = img.height || h;
    const scale = mode === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    img.set({ scaleX: scale, scaleY: scale, left: w / 2, top: h / 2, originX: 'center', originY: 'center', angle: 0, flipX: false, flipY: false });
    img.setCoords();
  };

  const setBackgroundImage = useCallback(
    async (url: string, opts?: { keepDim?: boolean }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const img = await FabricImage.fromURL(assetUrl(url), { crossOrigin: 'anonymous' });
      if (canvasRef.current !== canvas) return;
      await batch(() => {
        ensureBgFill();
        canvas.getObjects().filter((o) => meta(o).role === 'bg-image').forEach((o) => canvas.remove(o));
        fitImage(img, 'cover');
        img.set({ selectable: false, evented: false, lockRotation: true });
        meta(img).role = 'bg-image';
        decorate(img);
        img.set({ selectable: false, evented: false });
        canvas.add(img);
        if (!canvas.getObjects().some((o) => meta(o).role === 'overlay')) {
          const { w, h } = sizeRef.current;
          const overlay = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width: w, height: h, fill: '#000000', opacity: opts?.keepDim ? 0 : 0.3, selectable: false, evented: false, objectCaching: false });
          meta(overlay).role = 'overlay';
          decorate(overlay);
          overlay.set({ selectable: false, evented: false });
          canvas.add(overlay);
        }
        enforceOrder();
        canvas.requestRenderAll();
      });
    },
    [batch, decorate, enforceOrder, ensureBgFill]
  );

  // A generated full design already contains its own typography, so show it as-is: hide the
  // editable text layers (kept in Layers) and drop the dim overlay.
  const applyFullDesign = useCallback(
    async (url: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await batch(async () => {
        await setBackgroundImage(url, { keepDim: true });
        canvas.getObjects().forEach((o) => {
          if (o.type === 'textbox') o.set({ visible: false });
          if (meta(o).role === 'overlay') o.set({ opacity: 0 });
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      });
    },
    [batch, setBackgroundImage]
  );

  const removeBackgroundImage = useCallback(
    () =>
      batch(() => {
        const canvas = canvasRef.current!;
        canvas.getObjects().filter((o) => ['bg-image', 'overlay'].includes(meta(o).role ?? '')).forEach((o) => canvas.remove(o));
        canvas.requestRenderAll();
      }),
    [batch]
  );

  const setDim = useCallback(
    (value: number, commit = true) => {
      const canvas = canvasRef.current;
      const overlay = canvas?.getObjects().find((o) => meta(o).role === 'overlay');
      if (!canvas || !overlay) return;
      overlay.set({ opacity: value });
      canvas.requestRenderAll();
      setBg((b) => ({ ...b, dim: value }));
      if (commit) recordChange();
    },
    [recordChange]
  );

  const fitBackground = useCallback(
    (mode: 'cover' | 'contain') => {
      const canvas = canvasRef.current;
      const img = canvas?.getObjects().find((o) => meta(o).role === 'bg-image') as FabricImage | undefined;
      if (!canvas || !img) return;
      fitImage(img, mode);
      canvas.requestRenderAll();
      recordChange();
    },
    [recordChange]
  );

  const setBackgroundAdjusting = useCallback(
    (on: boolean) => {
      const canvas = canvasRef.current;
      const img = canvas?.getObjects().find((o) => meta(o).role === 'bg-image');
      if (!canvas || !img) return;
      img.set({ selectable: on, evented: on, lockRotation: false });
      if (on) canvas.setActiveObject(img);
      else canvas.discardActiveObject();
      canvas.requestRenderAll();
      refreshAll();
    },
    [refreshAll]
  );

  // ----- adding things -----

  const placeNew = useCallback(
    (o: FabricObject) => {
      const canvas = canvasRef.current!;
      decorate(o);
      canvas.add(o);
      canvas.setActiveObject(o);
      canvas.requestRenderAll();
    },
    [decorate]
  );

  // Dark type on a light canvas, white on dark/photo backgrounds.
  const readableTextColor = useCallback((): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '#111111';
    if (canvas.getObjects().some((o) => meta(o).role === 'bg-image')) return '#ffffff';
    const fillObj = canvas.getObjects().find((o) => meta(o).role === 'bg-fill');
    const m = fillObj ? meta(fillObj) : null;
    const color = m?.gradFrom ?? (typeof fillObj?.fill === 'string' ? fillObj.fill : '#f9f9f9');
    const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
    if (!hex) return '#111111';
    const n = parseInt(hex, 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.55 ? '#111111' : '#ffffff';
  }, []);

  const addText = useCallback(
    async (preset: TextPreset | string, opts?: { text?: string; top?: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const p = typeof preset === 'string' ? (TEXT_PRESETS.find((x) => x.key === preset) ?? TEXT_PRESETS[0]) : preset;
      const { w, h } = sizeRef.current;
      const base = Math.min(w, h);
      await prepareFont(p.fontFamily);
      const raw = opts?.text ?? p.sample;
      const text = new Textbox(p.uppercase ? raw.toUpperCase() : raw, {
        left: w / 2,
        top: opts?.top ?? h / 2,
        originX: 'center',
        originY: 'center',
        width: w * 0.8,
        fontFamily: p.fontFamily,
        fontSize: Math.round(base * p.size),
        fontWeight: p.fontWeight,
        fontStyle: p.fontStyle ?? 'normal',
        fill: readableTextColor(),
        textAlign: 'center',
        lineHeight: p.lineHeight ?? 1.2,
        charSpacing: p.charSpacing ?? 0,
        splitByGrapheme: false,
      });
      await batch(() => placeNew(text));
    },
    [batch, placeNew, prepareFont, readableTextColor]
  );

  // Replaces the whole design with a template laid out for the current canvas size.
  const applyTemplate = useCallback(
    async (template: Template, content: TemplateContent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setBusy('Applying template…');
      try {
        const { w, h } = sizeRef.current;
        const built = await runTemplate(template, { w, h }, content);
        if (canvasRef.current !== canvas) return;
        await batch(() => {
          canvas.discardActiveObject();
          canvas.getObjects().slice().forEach((o) => canvas.remove(o));
          const rect = makeBgRect(built.bg, w, h);
          const m = meta(rect);
          m.role = 'bg-fill';
          m.tplId = template.id;
          if (built.bg.gradient) {
            m.gradFrom = built.bg.gradient.from;
            m.gradTo = built.bg.gradient.to;
            m.gradAngle = built.bg.gradient.angle;
          }
          decorate(rect);
          canvas.add(rect);
          built.objects.forEach((o) => {
            decorate(o);
            canvas.add(o);
          });
          enforceOrder();
          canvas.requestRenderAll();
        });
      } finally {
        setBusy('');
      }
    },
    [batch, decorate, enforceOrder]
  );

  const addImageLayer = useCallback(
    async (url: string, opts?: { circle?: boolean }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const img = await FabricImage.fromURL(assetUrl(url), { crossOrigin: 'anonymous' });
      if (canvasRef.current !== canvas) return;
      const { w, h } = sizeRef.current;
      const iw = img.width || 1;
      const ih = img.height || 1;
      if (opts?.circle) {
        // Square-crop from the centre, shown as a circle (pastor / profile photos).
        const side = Math.min(iw, ih);
        const scale = (Math.min(w, h) * 0.3) / side;
        img.set({ left: w / 2, top: h / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale });
        img.clipPath = new Circle({ radius: side / 2, originX: 'center', originY: 'center' });
      } else {
        const scale = Math.min((w * 0.6) / iw, (h * 0.6) / ih, 1.5);
        img.set({ left: w / 2, top: h / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale });
      }
      await batch(() => placeNew(img));
    },
    [batch, placeNew]
  );

  // A lower-third graphic: full width, docked to the bottom edge (it re-docks on every resize).
  // Only one at a time - adding another replaces it.
  const addLowerThird = useCallback(
    async (url: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const img = await FabricImage.fromURL(assetUrl(url), { crossOrigin: 'anonymous' });
      if (canvasRef.current !== canvas) return;
      const { w, h } = sizeRef.current;
      const scale = Math.min(w / (img.width || w), (h * 0.45) / (img.height || h));
      img.set({ scaleX: scale, scaleY: scale, originX: 'center', originY: 'bottom', left: w / 2, top: h });
      const m = meta(img);
      m.lowerThird = true;
      m.label = 'Lower third';
      await batch(() => {
        canvas.getObjects().filter((o) => meta(o).lowerThird).forEach((o) => canvas.remove(o));
        placeNew(img);
      });
    },
    [batch, placeNew]
  );

  // ----- data binding -----
  // Text and pictures can be tied to a data field (preacher name, message title, preacher photo,
  // ...). Bound layers are re-filled whenever the data changes, and are saved with the template.

  const dataRef = useRef<TemplateContent | null>(null);
  const setDataContent = useCallback((c: TemplateContent) => {
    dataRef.current = c;
  }, []);

  const refreshBound = useCallback(async () => {
    const canvas = canvasRef.current;
    const c = dataRef.current;
    if (!canvas || !c) return;
    await batch(async () => {
      const objs = canvas.getObjects();
      fillSlots(objs, c);
      await fillImageSlots(objs, c);
      relayoutText();
      canvas.requestRenderAll();
    });
    refreshAll();
  }, [batch, refreshAll, relayoutText]);

  // Binds (or, with null, unbinds) the selected text/picture. Returns a note when there is no
  // data for the field yet.
  const bindSelected = useCallback(
    async (slot: string | null): Promise<string> => {
      const canvas = canvasRef.current;
      const o = canvas?.getActiveObject();
      if (!canvas || !o || (o.type !== 'textbox' && o.type !== 'image') || meta(o).role) return '';
      const c = dataRef.current;
      const t = o as FabricObject & { slot?: string; slotUrl?: string; slotPre?: string };
      let note = '';
      await batch(async () => {
        if (!slot) {
          delete t.slot;
          delete t.slotUrl;
          return;
        }
        t.slot = slot;
        if (o.type === 'textbox') {
          t.slotPre = '';
          if (c && slotTextValue(c, slot).trim()) fillSlots([o], c);
          else note = 'There is no data for that yet. The text stays as it is and fills in once there is.';
        } else {
          const img = o as FabricImage;
          const url = c ? imageSlotValues(c)[slot] : '';
          if (url) {
            if (img.getSrc() !== assetUrl(url)) await swapImage(img as FabricImage & { slot?: string; slotUrl?: string }, url);
            t.slotUrl = url;
          } else {
            t.slotUrl = img.getSrc();
            note = 'There is no photo for that yet. It stays as it is and updates once there is one.';
          }
        }
        relayoutText();
        canvas.requestRenderAll();
      });
      refreshAll();
      return note;
    },
    [batch, refreshAll, relayoutText]
  );

  // Picks who the preacher is: updates the preacher's name and photo everywhere they are bound.
  const setPreacher = useCallback(
    async (p: { name?: string; imageUrl?: string }) => {
      const c = dataRef.current;
      if (!c) return;
      dataRef.current = { ...c, author: p.name ?? c.author, preacherImageUrl: p.imageUrl ?? '', preacherChosen: true };
      await refreshBound();
    },
    [refreshBound]
  );

  const hasData = useCallback((slot: string) => {
    const c = dataRef.current;
    if (!c) return false;
    return slot in imageSlotValues(c) ? Boolean(imageSlotValues(c)[slot]) : Boolean(slotTextValue(c, slot).trim());
  }, []);

  const uploadLowerThird = useCallback(
    async (file: File) => {
      setBusy('Uploading lower third…');
      try {
        const { url, asset } = await uploadEditorImage(file, 'lower-third');
        await addLowerThird(url);
        return asset;
      } finally {
        setBusy('');
      }
    },
    [addLowerThird]
  );

  const uploadAndAddImage = useCallback(
    async (file: File, as: 'layer' | 'background') => {
      setBusy('Uploading image…');
      try {
        const { url } = await uploadEditorImage(file);
        if (as === 'background') await setBackgroundImage(url);
        else await addImageLayer(url);
      } finally {
        setBusy('');
      }
    },
    [addImageLayer, setBackgroundImage]
  );

  const addShape = useCallback(
    async (kind: 'rect' | 'rounded' | 'circle' | 'triangle' | 'divider' | 'highlight') => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { w, h } = sizeRef.current;
      const base = Math.min(w, h);
      const common = { left: w / 2, top: h / 2, originX: 'center' as const, originY: 'center' as const, fill: '#ffffff', strokeWidth: 0 };
      let o: FabricObject;
      if (kind === 'circle') o = new Circle({ ...common, radius: base * 0.15 });
      else if (kind === 'triangle') o = new Triangle({ ...common, width: base * 0.3, height: base * 0.26 });
      else if (kind === 'divider') o = new Rect({ ...common, width: w * 0.4, height: Math.max(4, base * 0.006) });
      else if (kind === 'highlight') o = new Rect({ ...common, fill: '#facc15', opacity: 0.55, width: w * 0.6, height: base * 0.08 });
      else o = new Rect({ ...common, width: base * 0.4, height: base * 0.3, rx: kind === 'rounded' ? base * 0.04 : 0, ry: kind === 'rounded' ? base * 0.04 : 0 });
      await batch(() => placeNew(o));
    },
    [batch, placeNew]
  );

  // ----- editing the selection -----

  const updateText = useCallback(
    async (patch: TextPatch) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const targets = canvas.getActiveObjects().filter((o) => o.type === 'textbox') as Textbox[];
      if (!targets.length) return;
      const families = new Set<string>();
      if (patch.fontFamily) families.add(patch.fontFamily);
      await Promise.all([...families].map(prepareFont));
      for (const t of targets) {
        const partial = t.isEditing && t.selectionStart !== t.selectionEnd;
        const charPatch: Record<string, unknown> = {};
        const objPatch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) (CHAR_KEYS.includes(k) ? charPatch : objPatch)[k] = v;
        if (partial) {
          t.setSelectionStyles(charPatch, t.selectionStart, t.selectionEnd);
        } else {
          stripStyleKeys(t, Object.keys(charPatch));
          Object.assign(objPatch, charPatch);
        }
        t.set(objPatch);
        t.initDimensions();
        t.setCoords();
        t.dirty = true;
      }
      canvas.requestRenderAll();
      recordChange();
    },
    [prepareFont, recordChange]
  );

  const setTextContent = useCallback(
    (text: string) => {
      const canvas = canvasRef.current;
      const t = canvas?.getActiveObject();
      if (!canvas || !t || t.type !== 'textbox') return;
      (t as Textbox).set({ text });
      (t as Textbox).initDimensions();
      t.setCoords();
      canvas.requestRenderAll();
      recordChange();
    },
    [recordChange]
  );

  const transformCase = useCallback(
    (mode: 'upper' | 'lower' | 'title') => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getActiveObjects().forEach((o) => {
        if (o.type !== 'textbox') return;
        const t = o as Textbox;
        const src = t.text ?? '';
        const next = mode === 'upper' ? src.toUpperCase() : mode === 'lower' ? src.toLowerCase() : src.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
        t.set({ text: next });
        t.initDimensions();
      });
      canvas.requestRenderAll();
      recordChange();
    },
    [recordChange]
  );

  const setShadow = useCallback(
    (on: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const base = Math.min(sizeRef.current.w, sizeRef.current.h);
      canvas.getActiveObjects().forEach((o) => {
        o.set({ shadow: on ? new Shadow({ color: 'rgba(0,0,0,0.55)', blur: base * 0.012, offsetX: 0, offsetY: base * 0.004 }) : null });
        o.dirty = true;
      });
      canvas.requestRenderAll();
      recordChange();
    },
    [recordChange]
  );

  const updateObject = useCallback(
    (patch: Record<string, unknown>, commit = true) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getActiveObjects().forEach((o) => {
        o.set(patch);
        if (patch.stroke !== undefined || patch.strokeWidth !== undefined) o.set({ paintFirst: 'stroke' });
        o.dirty = true;
      });
      canvas.requestRenderAll();
      if (commit) recordChange();
      else refreshSelection();
    },
    [recordChange, refreshSelection]
  );

  const commit = recordChange;

  const flip = useCallback(
    (axis: 'x' | 'y') => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getActiveObjects().forEach((o) => o.set(axis === 'x' ? 'flipX' : 'flipY', !(axis === 'x' ? o.flipX : o.flipY)));
      canvas.requestRenderAll();
      recordChange();
    },
    [recordChange]
  );

  const align = useCallback(
    (dir: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      const canvas = canvasRef.current;
      const o = canvas?.getActiveObject();
      if (!canvas || !o) return;
      const { w, h } = sizeRef.current;
      const r = o.getBoundingRect();
      let dx = 0;
      let dy = 0;
      if (dir === 'left') dx = -r.left;
      if (dir === 'center') dx = w / 2 - (r.left + r.width / 2);
      if (dir === 'right') dx = w - (r.left + r.width);
      if (dir === 'top') dy = -r.top;
      if (dir === 'middle') dy = h / 2 - (r.top + r.height / 2);
      if (dir === 'bottom') dy = h - (r.top + r.height);
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
      o.setCoords();
      canvas.requestRenderAll();
      recordChange();
    },
    [recordChange]
  );

  const duplicate = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objs = canvas.getActiveObjects().filter((o) => !meta(o).role);
    if (!objs.length) return;
    canvas.discardActiveObject();
    const offset = Math.min(sizeRef.current.w, sizeRef.current.h) * 0.03;
    await batch(async () => {
      const clones: FabricObject[] = [];
      for (const o of objs) {
        const c = await o.clone(CUSTOM_PROPS);
        meta(c).uid = uid();
        c.set({ left: (o.left ?? 0) + offset, top: (o.top ?? 0) + offset });
        decorate(c);
        canvas.add(c);
        clones.push(c);
      }
      if (clones.length === 1) canvas.setActiveObject(clones[0]);
      else canvas.setActiveObject(new ActiveSelection(clones, { canvas }));
    });
  }, [batch, decorate]);

  const deleteSelected = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objs = canvas.getActiveObjects().filter((o) => meta(o).role !== 'bg-fill');
    if (!objs.length) return;
    canvas.discardActiveObject();
    batch(() => {
      objs.forEach((o) => canvas.remove(o));
      enforceOrder();
    });
  }, [batch, enforceOrder]);

  const moveLayer = useCallback(
    (target: 'forward' | 'backward' | 'front' | 'back', uidValue?: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const o = uidValue ? canvas.getObjects().find((x) => meta(x).uid === uidValue) : canvas.getActiveObject();
      if (!o || meta(o).role) return;
      if (target === 'forward') canvas.bringObjectForward(o);
      if (target === 'backward') canvas.sendObjectBackwards(o);
      if (target === 'front') canvas.bringObjectToFront(o);
      if (target === 'back') canvas.sendObjectToBack(o);
      enforceOrder();
      canvas.requestRenderAll();
      recordChange();
    },
    [enforceOrder, recordChange]
  );

  const setLocked = useCallback(
    (locked: boolean, uidValue?: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const objs = uidValue ? canvas.getObjects().filter((x) => meta(x).uid === uidValue) : canvas.getActiveObjects();
      if (!objs.length) return;
      if (!uidValue) canvas.discardActiveObject();
      objs.forEach((o) => {
        meta(o).locked = locked;
        o.set({ selectable: !locked, evented: !locked });
      });
      canvas.requestRenderAll();
      recordChange();
    },
    [recordChange]
  );

  const setVisible = useCallback(
    (uidValue: string, visible: boolean) => {
      const canvas = canvasRef.current;
      const o = canvas?.getObjects().find((x) => meta(x).uid === uidValue);
      if (!canvas || !o) return;
      o.set({ visible });
      if (!visible) canvas.discardActiveObject();
      canvas.requestRenderAll();
      recordChange();
    },
    [recordChange]
  );

  const selectLayer = useCallback(
    (uidValue: string) => {
      const canvas = canvasRef.current;
      const o = canvas?.getObjects().find((x) => meta(x).uid === uidValue);
      if (!canvas || !o || !o.selectable) return;
      canvas.setActiveObject(o);
      canvas.requestRenderAll();
      refreshAll();
    },
    [refreshAll]
  );

  const deleteLayer = useCallback(
    (uidValue: string) => {
      const canvas = canvasRef.current;
      const o = canvas?.getObjects().find((x) => meta(x).uid === uidValue);
      if (!canvas || !o) return;
      if (meta(o).role === 'bg-fill') return;
      canvas.discardActiveObject();
      batch(() => {
        canvas.remove(o);
      });
    },
    [batch]
  );

  const clearSelection = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.discardActiveObject();
    canvas?.requestRenderAll();
    refreshAll();
  }, [refreshAll]);

  // ----- canvas size -----

  // Re-lays-out every layer for a new canvas size (no history entry - callers batch it).
  // Each layer keeps its place as a fraction of the canvas, and is re-sized to suit the new shape
  // rather than shrunk by one blanket factor: text keeps its share of the width and its font follows
  // the area change (then shrinks until it fits), bars and dividers stretch with the edge they span,
  // pictures scale evenly but never past the canvas, and a lower third re-docks to the bottom edge.
  const resizeCore = useCallback((nw: number, nh: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w: ow, h: oh } = sizeRef.current;
    // Same size: nothing to adapt, and nothing may move (a template saved with a picture bleeding
    // off the edge must come back exactly as it was saved).
    if (nw === ow && nh === oh) return;
    const kx = nw / ow;
    const ky = nh / oh;
    const geo = Math.sqrt(kx * ky);
    // Must flip before the loop: re-fitting the background image reads the new size.
    sizeRef.current = { w: nw, h: nh };

    // Keeps a layer's bounding box on the canvas (a small margin when it's small enough to allow).
    const clampInside = (o: FabricObject) => {
      const r = o.getBoundingRect();
      const m = Math.min(nw, nh) * 0.02;
      let dx = 0;
      let dy = 0;
      if (r.width >= nw - 2 * m) dx = nw / 2 - (r.left + r.width / 2);
      else if (r.left < m) dx = m - r.left;
      else if (r.left + r.width > nw - m) dx = nw - m - (r.left + r.width);
      if (r.height >= nh - 2 * m) dy = nh / 2 - (r.top + r.height / 2);
      else if (r.top < m) dy = m - r.top;
      else if (r.top + r.height > nh - m) dy = nh - m - (r.top + r.height);
      if (dx || dy) o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
    };

    for (const o of canvas.getObjects()) {
      const m = meta(o);
      if (m.role === 'bg-fill' || m.role === 'overlay' || m.role === 'grain') {
        o.set({ left: 0, top: 0, originX: 'left', originY: 'top', width: nw, height: nh, scaleX: 1, scaleY: 1 });
        if (m.role === 'bg-fill' && m.gradFrom && m.gradTo) {
          o.set({ fill: makeGradient(nw, nh, m.gradFrom, m.gradTo, m.gradAngle ?? 160) });
        }
        o.setCoords();
        continue;
      }
      if (m.role === 'bg-image') {
        // Re-cover so there's never an empty strip after a ratio change.
        fitImage(o as FabricImage, 'cover');
        continue;
      }
      if (m.lowerThird) {
        // Full width, docked to the bottom edge, never taller than 45% of the canvas.
        const img = o as FabricImage;
        const iw = img.width || nw;
        const ih = img.height || nh;
        const scale = Math.min(nw / iw, (nh * 0.45) / ih);
        img.set({ scaleX: scale, scaleY: scale, originX: 'center', originY: 'bottom', left: nw / 2, top: nh, angle: 0 });
        img.setCoords();
        continue;
      }

      const before = o.getBoundingRect();
      // Anything that deliberately runs off the canvas keeps doing so: it's scaled and placed by
      // its centre like everything else but never pulled back inside or shrunk to fit.
      const bleeds = before.left < -1 || before.top < -1 || before.left + before.width > ow + 1 || before.top + before.height > oh + 1;
      const center = o.getCenterPoint();
      const fx = center.x / ow;
      const fy = center.y / oh;

      if (o.type === 'textbox') {
        const t = o as Textbox;
        const sx = t.scaleX ?? 1;
        const fullWidthFrac = ((t.width ?? 400) * sx) / ow;
        const newWidth = Math.min(fullWidthFrac * nw, nw * 0.94);
        t.set({
          fontSize: (t.fontSize ?? 40) * geo,
          strokeWidth: (t.strokeWidth ?? 0) * geo,
          width: newWidth / sx,
        });
        t.initDimensions();
        // Keep the block no taller than the share of the canvas it used to take (plus a little).
        const maxH = Math.min(nh * 0.92, Math.max((before.height / oh) * nh * 1.15, (t.fontSize ?? 40) * 1.4));
        for (let guard = 0; guard < 16 && t.getScaledHeight() > maxH && (t.fontSize ?? 0) > 10; guard += 1) {
          t.set({ fontSize: (t.fontSize ?? 40) * 0.93 });
          t.initDimensions();
        }
      } else {
        const fullW = before.width >= ow * 0.9;
        const fullH = before.height >= oh * 0.9;
        const isPicture = o.type === 'image';
        let sx = geo;
        let sy = geo;
        if (!isPicture && fullW && !fullH) {
          sx = kx;
        } else if (!isPicture && fullH && !fullW) {
          sy = ky;
        } else if (!isPicture && fullW && fullH) {
          sx = kx;
          sy = ky;
        } else {
          // Even scale, but never larger than the canvas allows.
          const cap = bleeds ? Infinity : Math.min((nw * 0.98) / Math.max(1, before.width), (nh * 0.98) / Math.max(1, before.height));
          sx = sy = Math.min(geo, cap);
        }
        o.set({ scaleX: (o.scaleX ?? 1) * sx, scaleY: (o.scaleY ?? 1) * sy });
      }
      o.setPositionByOrigin(new Point(fx * nw, fy * nh), 'center', 'center');
      o.setCoords();
      if (!bleeds) clampInside(o);
      o.setCoords();
    }
    setSize({ w: nw, h: nh });
    canvas.requestRenderAll();
  }, []);

  const resizeTo = useCallback(
    async (nw: number, nh: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      nw = Math.max(256, Math.min(4096, Math.round(nw)));
      nh = Math.max(256, Math.min(4096, Math.round(nh)));
      const { w: ow, h: oh } = sizeRef.current;
      if (nw === ow && nh === oh) return;
      canvas.discardActiveObject();
      await batch(() => resizeCore(nw, nh));
    },
    [batch, resizeCore]
  );

  // Applies a template the user saved/edited: loads its canvas, pours the current content into its
  // slots, then scales it to the current canvas size.
  const applySavedTemplate = useCallback(
    async (saved: Pick<SavedTemplate, 'width' | 'height' | 'editorState' | 'variants'> & { baseId?: string; _id: string }, content: TemplateContent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setBusy('Applying template…');
      try {
        const target = { ...sizeRef.current };
        // Use the version tuned for this size, or else the one closest in shape (then adapt it).
        const tpl = { ...saved, ...pickVariant(saved, target) };
        const families = new Set<string>();
        collectFamilies(tpl.editorState, families);
        await Promise.all([...families].map(prepareFont));
        await batch(async () => {
          canvas.discardActiveObject();
          // load at the size it was designed for, then scale
          sizeRef.current = { w: tpl.width, h: tpl.height };
          await canvas.loadFromJSON(JSON.parse(JSON.stringify(tpl.editorState)));
          canvas.getObjects().forEach(decorate);
          fillSlots(canvas.getObjects(), content);
          await fillImageSlots(canvas.getObjects(), content);
          relayoutText();
          const fillRect = canvas.getObjects().find((o) => meta(o).role === 'bg-fill');
          if (fillRect) meta(fillRect).tplId = tpl.baseId ?? tpl._id;
          resizeCore(target.w, target.h);
          setSize({ w: target.w, h: target.h });
          enforceOrder();
          canvas.requestRenderAll();
        });
      } finally {
        setBusy('');
      }
    },
    [batch, decorate, enforceOrder, prepareFont, relayoutText, resizeCore]
  );

  // ----- display scale -----

  const setZoomLevel = useCallback((z: number) => setZoom(Math.max(0.25, Math.min(4, z))), []);

  // Pinch / Ctrl+scroll / Cmd+scroll zoom, keeping the point under the cursor in place. Trackpad
  // pinch arrives as wheel events with ctrlKey set (Chrome, Firefox, Edge) or as gesture events
  // (Safari); two-finger pinch on touch screens is handled with touch events.
  const zoomRef = useRef(1);
  const anchorRef = useRef<{ x: number; y: number; ratio: number } | null>(null);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const a = anchorRef.current;
    if (!stage || !a) return;
    anchorRef.current = null;
    stage.scrollLeft = (stage.scrollLeft + a.x) * a.ratio - a.x;
    stage.scrollTop = (stage.scrollTop + a.y) * a.ratio - a.y;
  }, [zoom, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const clamp = (z: number) => Math.max(0.25, Math.min(4, z));
    const zoomTo = (next: number, clientX: number, clientY: number) => {
      const target = clamp(next);
      const current = zoomRef.current;
      if (target === current) return;
      const rect = stage.getBoundingClientRect();
      anchorRef.current = { x: clientX - rect.left, y: clientY - rect.top, ratio: target / current };
      zoomRef.current = target;
      setZoom(target);
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      // Trackpad pinches send small deltas; a mouse wheel notch sends ~100, so cap the step.
      const delta = Math.max(-40, Math.min(40, e.deltaY * (e.deltaMode === 1 ? 5 : 1)));
      zoomTo(zoomRef.current * Math.exp(-delta * 0.01), e.clientX, e.clientY);
    };

    let startDist = 0;
    let startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startZoom = zoomRef.current;
        e.stopPropagation();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      e.stopPropagation();
      const m = mid(e.touches);
      zoomTo(startZoom * (dist(e.touches) / startDist), m.x, m.y);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };

    let gestureStart = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = zoomRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      zoomTo(gestureStart * g.scale, g.clientX, g.clientY);
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    stage.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    stage.addEventListener('touchend', onTouchEnd, { capture: true });
    stage.addEventListener('gesturestart', onGestureStart);
    stage.addEventListener('gesturechange', onGestureChange);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('touchstart', onTouchStart, { capture: true });
      stage.removeEventListener('touchmove', onTouchMove, { capture: true });
      stage.removeEventListener('touchend', onTouchEnd, { capture: true });
      stage.removeEventListener('gesturestart', onGestureStart);
      stage.removeEventListener('gesturechange', onGestureChange);
    };
  }, [stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      // Desktop leaves room for the floating toolbar (top) and tool dock (bottom).
      const desktop = window.innerWidth >= 1024;
      const aw = Math.max(120, stage.clientWidth - (window.innerWidth < 640 ? 24 : 72));
      const ah = Math.max(120, stage.clientHeight - (desktop ? 184 : 32));
      setFitScale(Math.min(aw / size.w, ah / size.h, 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [size.w, size.h, stageRef]);

  // Render at the real on-screen resolution (css size x devicePixelRatio) instead of drawing at
  // design resolution and letting the browser rescale the bitmap, which is what made text soft.
  // Objects keep design-space coordinates; the zoom maps them onto the denser backing store.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.setDimensions({ width: size.w * displayScale * dpr, height: size.h * displayScale * dpr }, { backstoreOnly: true });
    canvas.setDimensions({ width: size.w * displayScale, height: size.h * displayScale }, { cssOnly: true });
    canvas.setZoom(displayScale * dpr);
    canvas.getObjects().forEach(styleControls);
    canvas.requestRenderAll();
  }, [displayScale, size.w, size.h, ready, styleControls]);

  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
  }, [snapEnabled]);
  useEffect(() => {
    gridVisibleRef.current = gridVisible;
    canvasRef.current?.requestRenderAll();
  }, [gridVisible]);

  // ----- init -----

  useEffect(() => {
    let cancelled = false;
    let canvas: Canvas | null = null;
    let disposePromise: Promise<unknown> | null = null;
    const host = hostRef.current;
    if (!host) return;

    (async () => {
      try {
        const el = document.createElement('canvas');
        host.appendChild(el);
        canvas = new Canvas(el, {
          width: design.width,
          height: design.height,
          backgroundColor: '#000000',
          enableRetinaScaling: false,
          preserveObjectStacking: true,
          selection: true,
          fireRightClick: false,
          stopContextMenu: true,
        });
        canvasRef.current = canvas;
        const c = canvas;

        snapRef.current = attachSnapping(c, {
          snapEnabled: () => snapEnabledRef.current,
          gridVisible: () => gridVisibleRef.current,
          scale: () => scaleRef.current || 1,
          size: () => sizeRef.current,
        });

        c.on('selection:created', refreshAll);
        c.on('selection:updated', refreshAll);
        c.on('selection:cleared', refreshAll);
        c.on('text:selection:changed', refreshSelection);
        c.on('object:modified', recordChange);
        c.on('text:editing:exited', recordChange);

        const state = design.editorState;
        if (state && Array.isArray((state as { objects?: unknown }).objects)) {
          const families = new Set<string>();
          collectFamilies(state, families);
          await Promise.all([...families].map(prepareFont));
          if (cancelled) return;
          await c.loadFromJSON(state);
          if (cancelled) return;
          c.getObjects().forEach(decorate);
          relayoutText();
        } else {
          await buildInitial(c);
          if (cancelled) return;
        }
        enforceOrder();
        c.requestRenderAll();
        historyRef.current = { stack: [], index: -1 };
        suspendRef.current = 0;
        pushHistory();
        setCanUndo(false);
        setCanRedo(false);
        refreshAll();
        setReady(true);
        // Brand-new designs have no saved state yet - persist the generated layout.
        if (!state) scheduleSave();
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to open the editor');
      }
    })();

    async function buildInitial(c: Canvas) {
      const { w, h } = sizeRef.current;
      const base = Math.min(w, h);
      const rect = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width: w, height: h, fill: '#f9f9f9', selectable: false, evented: false, objectCaching: false });
      meta(rect).role = 'bg-fill';
      decorate(rect);
      c.add(rect);

      // Plain light canvas by default; only a quote's own custom image is used as a photo background.
      let onPhoto = false;
      if (design.backgroundUrl) {
        try {
          const img = await FabricImage.fromURL(assetUrl(design.backgroundUrl), { crossOrigin: 'anonymous' });
          fitImage(img, 'cover');
          meta(img).role = 'bg-image';
          decorate(img);
          img.set({ selectable: false, evented: false });
          c.add(img);
          const overlay = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width: w, height: h, fill: '#000000', opacity: 0.35, selectable: false, evented: false, objectCaching: false });
          meta(overlay).role = 'overlay';
          decorate(overlay);
          c.add(overlay);
          onPhoto = true;
        } catch {
          // background failed to load; continue on the plain canvas
        }
      }
      const ink = onPhoto ? '#ffffff' : '#111111';

      const textValue = (design.text || '').trim();
      const isPost = design.source === 'post' && textValue.includes('\n');
      const [headText, ...rest] = isPost ? textValue.split(/\n\s*\n/) : [textValue];
      const bodyText = rest.join('\n\n').trim();

      const make = async (txt: string, preset: TextPreset, top: number, sizeFactor = 1) => {
        await prepareFont(preset.fontFamily);
        const t = new Textbox(txt, {
          left: w / 2,
          top,
          originX: 'center',
          originY: 'center',
          width: w * 0.8,
          fontFamily: preset.fontFamily,
          fontSize: Math.round(base * preset.size * sizeFactor),
          fontWeight: preset.fontWeight,
          fill: ink,
          textAlign: 'center',
          lineHeight: preset.lineHeight ?? 1.2,
        });
        decorate(t);
        c.add(t);
        return t;
      };
      const heading = TEXT_PRESETS[0];
      const body = TEXT_PRESETS[2];
      if (!textValue) {
        await make('Your headline here', heading, h / 2);
      } else if (isPost && bodyText) {
        await make(headText, heading, h * 0.32, 0.9);
        await make(bodyText, { ...body, size: 0.036 }, h * 0.6);
      } else {
        // Scale the size to the amount of text so a long quote still fits.
        const len = textValue.length;
        const factor = len < 50 ? 1.15 : len < 100 ? 0.95 : len < 170 ? 0.78 : len < 260 ? 0.64 : 0.52;
        await make(textValue, heading, h / 2, factor);
      }
    }

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      snapRef.current?.dispose();
      snapRef.current = null;
      canvasRef.current = null;
      if (canvas) {
        disposePromise = canvas.dispose();
        Promise.resolve(disposePromise).finally(() => {
          host.innerHTML = '';
        });
      }
    };
    // The canvas is built once per design; later state flows through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design._id]);

  // ----- keyboard -----

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const active = canvas.getActiveObject() as Textbox | undefined;
      if (active?.isEditing) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicate();
      } else if ((key === 'delete' || key === 'backspace') && active) {
        e.preventDefault();
        deleteSelected();
      } else if (key.startsWith('arrow') && active) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy });
        active.setCoords();
        canvas.requestRenderAll();
        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = setTimeout(recordChange, 400);
      } else if (key === 'escape') {
        clearSelection();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicate, deleteSelected, recordChange, clearSelection]);

  // ----- export -----

  // Exports must be taken at 100%: the on-screen zoom is a viewport transform, and fabric would
  // otherwise draw the design shrunk (or enlarged) inside the crop. Restored afterwards.
  const atFullScale = <T,>(canvas: Canvas, fn: () => T): T => {
    const vpt = canvas.viewportTransform.slice() as typeof canvas.viewportTransform;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    try {
      return fn();
    } finally {
      canvas.setViewportTransform(vpt);
    }
  };

  const renderDataUrl = useCallback(
    async (format: 'png' | 'jpeg', opts?: { quality?: number; maxSide?: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Editor is not ready yet');
      const families = new Set<string>();
      canvas.getObjects().forEach((o) => {
        if (o.type === 'textbox') families.add((o as Textbox).fontFamily ?? '');
      });
      await Promise.all([...families].filter(Boolean).map(prepareFont));
      relayoutText();
      canvas.discardActiveObject();
      snapRef.current?.setSuppressed(true);
      canvas.renderAll();
      try {
        const { w, h } = sizeRef.current;
        const multiplier = opts?.maxSide ? Math.min(1, opts.maxSide / Math.max(w, h)) : 1;
        // Explicit crop = the full design area, so the export is independent of the on-screen zoom.
        return atFullScale(canvas, () => canvas.toDataURL({ format, quality: opts?.quality ?? 0.92, multiplier, left: 0, top: 0, width: w, height: h, enableRetinaScaling: false }));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'SecurityError') {
          throw new Error('An image on the canvas blocks export (cross-origin). Re-upload it and try again.');
        }
        throw err;
      } finally {
        snapRef.current?.setSuppressed(false);
        canvas.requestRenderAll();
        refreshAll();
      }
    },
    [prepareFont, refreshAll, relayoutText]
  );

  // Splits the design into what animating needs: the background (colour, photo, dim, grain) as
  // one image, and every other element as its own transparent PNG with its position - so each
  // can be animated separately.
  const captureLayers = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Editor is not ready yet');
    const families = new Set<string>();
    canvas.getObjects().forEach((o) => {
      if (o.type === 'textbox') families.add((o as Textbox).fontFamily ?? '');
    });
    await Promise.all([...families].filter(Boolean).map(prepareFont));
    relayoutText();
    canvas.discardActiveObject();
    snapRef.current?.setSuppressed(true);
    const { w, h } = sizeRef.current;
    const objs = canvas.getObjects();
    const before = new Map(objs.map((o) => [o, o.visible]));
    const canvasBg = canvas.backgroundColor;
    const shot = (left: number, top: number, width: number, height: number) =>
      atFullScale(canvas, () => canvas.toDataURL({ format: 'png', multiplier: 1, left, top, width, height, enableRetinaScaling: false }));
    try {
      const all = objs.filter((o) => !meta(o).role && o.visible !== false);
      // Only 40 layers can be animated. When a design has more (lots of small decorations), the
      // text, pictures and big shapes become layers and the rest stay painted into the background,
      // instead of the first 40 objects in z-order winning and the real content vanishing.
      const MAX_LAYERS = 40;
      const rank = (o: FabricObject) => (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text' ? 0 : o.type === 'image' ? 1 : 2);
      const area = (o: FabricObject) => o.getScaledWidth() * o.getScaledHeight();
      const chosen = new Set([...all].sort((a, b) => rank(a) - rank(b) || area(b) - area(a)).slice(0, MAX_LAYERS));
      const fg = all.filter((o) => chosen.has(o));
      fg.forEach((o) => (o.visible = false));
      canvas.renderAll();
      const background = shot(0, 0, w, h);
      const layers: { dataUrl: string; x: number; y: number; w: number; h: number; kind: string; label: string }[] = [];
      // Elements are captured alone on a transparent canvas.
      canvas.backgroundColor = 'rgba(0,0,0,0)';
      for (const o of fg) {
        objs.forEach((x) => (x.visible = false));
        o.visible = true;
        o.setCoords();
        canvas.renderAll();
        const r = o.getBoundingRect();
        const pad = Math.ceil(Math.max(10, (o.shadow as { blur?: number } | null)?.blur ?? 0) + 6);
        const x = Math.max(0, Math.floor(r.left - pad));
        const y = Math.max(0, Math.floor(r.top - pad));
        const ww = Math.min(w - x, Math.ceil(r.width + pad * 2));
        const hh = Math.min(h - y, Math.ceil(r.height + pad * 2));
        if (ww < 2 || hh < 2) continue;
        const m = meta(o);
        const isText = o.type === 'textbox' || o.type === 'i-text' || o.type === 'text';
        layers.push({ dataUrl: shot(x, y, ww, hh), x, y, w: ww, h: hh, kind: isText ? 'text' : o.type === 'image' ? 'image' : 'shape', label: m.label ?? (isText ? ((o as Textbox).text ?? '').slice(0, 30) : o.type ?? '') });
      }
      return { width: w, height: h, background, layers };
    } finally {
      canvas.backgroundColor = canvasBg;
      objs.forEach((o) => (o.visible = before.get(o) ?? true));
      snapRef.current?.setSuppressed(false);
      canvas.requestRenderAll();
      refreshAll();
    }
  }, [prepareFont, refreshAll, relayoutText]);

  // Snapshot used to save the current design as (or into) a template.
  const captureTemplate = useCallback(async () => {
    const out = serialize();
    if (!out) throw new Error('Editor is not ready yet');
    const thumb = await renderDataUrl('jpeg', { quality: 0.8, maxSide: 420 });
    return { editorState: out.state, width: sizeRef.current.w, height: sizeRef.current.h, thumb };
  }, [serialize, renderDataUrl]);

  // Renders, uploads and stores the hosted JPEG (what Instagram and share links use).
  const exportToServer = useCallback(
    async (force = false): Promise<Design> => {
      if (!force && !exportDirtyRef.current && design.exportedImageUrl) {
        return { ...design };
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const dataUrl = await renderDataUrl('jpeg', { quality: 0.93 });
      const out = serialize();
      const updated = await exportDesign(design._id, { dataUrl, editorState: out?.state });
      exportDirtyRef.current = false;
      setSaveStatus('saved');
      onDesignChangeRef.current(updated);
      return updated;
    },
    [design, renderDataUrl, serialize]
  );

  const hasUnexportedChanges = useCallback(() => exportDirtyRef.current, []);

  const flush = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!canvasRef.current) return;
    if (exportDirtyRef.current) {
      try {
        await exportToServer(true);
        return;
      } catch {
        // fall through to a plain state save
      }
    }
    await saveNow();
  }, [exportToServer, saveNow]);

  const allText = useCallback((): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    return canvas
      .getObjects()
      .filter((o) => o.type === 'textbox' && o.visible !== false)
      .sort((a, b) => (a.top ?? 0) - (b.top ?? 0))
      .map((o) => ((o as Textbox).text ?? '').trim())
      .filter(Boolean)
      .join('\n\n');
  }, []);

  return {
    ready,
    loadError,
    size,
    displayScale,
    zoom,
    setZoom: setZoomLevel,
    selection,
    layers,
    bg,
    canUndo,
    canRedo,
    saveStatus,
    busy,
    snapEnabled,
    setSnapEnabled: setSnapEnabledState,
    gridVisible,
    setGridVisible: setGridVisibleState,
    undo,
    redo,
    addText,
    addImageLayer,
    addLowerThird,
    setDataContent,
    bindSelected,
    refreshBound,
    setPreacher,
    hasData,
    uploadLowerThird,
    applyTemplate,
    applySavedTemplate,
    captureTemplate,
    activeTemplateId,
    uploadAndAddImage,
    addShape,
    updateText,
    setTextContent,
    transformCase,
    setShadow,
    updateObject,
    commit,
    flip,
    align,
    duplicate,
    deleteSelected,
    moveLayer,
    setLocked,
    setVisible,
    selectLayer,
    deleteLayer,
    clearSelection,
    resizeTo,
    setBackgroundSolid,
    setBackgroundGradient,
    setBackgroundImage,
    removeBackgroundImage,
    applyFullDesign,
    setDim,
    fitBackground,
    setBackgroundAdjusting,
    renderDataUrl,
    captureLayers,
    exportToServer,
    hasUnexportedChanges,
    readableTextColor,
    flush,
    saveNow,
    allText,
    prepareFont,
  };
}

export type DesignCanvas = ReturnType<typeof useDesignCanvas>;
