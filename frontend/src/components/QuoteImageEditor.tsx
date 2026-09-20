'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Line, Rect, Textbox, type FabricObject } from 'fabric';
import { assetUrl, saveQuoteEditorExport, setQuoteCustomImage } from '@/lib/api';
import type { Quote, Service } from '@/lib/types';

type Orientation = 'portrait' | 'landscape';

const DIMENSIONS: Record<Orientation, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1920, height: 1080 },
};

const MAX_DISPLAY_HEIGHT = 640;
const FONT_FAMILIES = [
  'Georgia',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Plus Jakarta Sans',
  'Lufga',
  'Bricolage Grotesque',
  'Bebas Neue',
];
// Fonts that need an explicit document.fonts.load() before Fabric measures/paints them -
// the browser only fetches an @font-face file the first time it's actually used, and canvas
// text painted before that fetch resolves falls back to a system font until a re-render.
const CUSTOM_FONT_FAMILIES = new Set(['Plus Jakarta Sans', 'Lufga', 'Bricolage Grotesque', 'Bebas Neue']);
const HISTORY_LIMIT = 50;
const AUTOSAVE_DELAY_MS = 1500;

// Fraction of width/height inset from each edge marking the boundary text shouldn't cross -
// keeps captions clear of the crop/UI overlays most social platforms apply near the edges.
const SAFE_AREA_MARGIN_RATIO = 0.06;

interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fill: string;
  textBackgroundColor: string;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
}

const DEFAULT_STYLE: TextStyle = {
  fontFamily: 'Georgia',
  fontSize: 56,
  fontWeight: 'bold',
  fill: '#ffffff',
  textBackgroundColor: '',
  lineHeight: 1.25,
  textAlign: 'center',
};

// Only fetches/constructs the image - no canvas mutation - so a caller whose canvas was
// disposed while this was in flight can safely discard the result instead of writing into it.
//
// This is added as a regular (non-interactive) canvas object sent to the back, rather than via
// Fabric's `canvas.backgroundImage`. That built-in background slot silently ignored the scale/
// position set on the image in this Fabric version - the same left/top/scaleX/scaleY applied to
// a normal object renders exactly as expected, so background duty is handled that way instead.
async function createBackgroundImage(url: string, width: number, height: number) {
  const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
  const scale = Math.max(width / (img.width ?? width), height / (img.height ?? height));
  img.set({
    scaleX: scale,
    scaleY: scale,
    left: width / 2,
    top: height / 2,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    hasControls: false,
  });
  return img;
}

type GuideObject = FabricObject & { isSafeAreaGuide?: boolean };

// Non-interactive overlay marking the region text should stay within: a dashed margin box plus
// rule-of-thirds lines. Built fresh per canvas init/orientation change rather than persisted -
// `excludeFromExport` keeps these out of both the saved editorState JSON and (once hidden just
// before rasterizing, since that flag alone doesn't stop them from being *drawn*) the exported PNG.
function buildSafeAreaGuides(width: number, height: number): GuideObject[] {
  const marginX = width * SAFE_AREA_MARGIN_RATIO;
  const marginY = height * SAFE_AREA_MARGIN_RATIO;
  const shared = {
    stroke: '#00e5ff',
    selectable: false,
    evented: false,
    excludeFromExport: true,
    hoverCursor: 'default' as const,
    objectCaching: false,
  };

  const guides: GuideObject[] = [
    new Rect({
      ...shared,
      left: marginX,
      top: marginY,
      width: width - marginX * 2,
      height: height - marginY * 2,
      fill: 'transparent',
      strokeWidth: 2,
      strokeDashArray: [10, 8],
    }),
    new Line([width / 3, 0, width / 3, height], { ...shared, strokeWidth: 1, opacity: 0.35 }),
    new Line([(width / 3) * 2, 0, (width / 3) * 2, height], { ...shared, strokeWidth: 1, opacity: 0.35 }),
    new Line([0, height / 3, width, height / 3], { ...shared, strokeWidth: 1, opacity: 0.35 }),
    new Line([0, (height / 3) * 2, width, (height / 3) * 2], { ...shared, strokeWidth: 1, opacity: 0.35 }),
  ];
  guides.forEach((g) => {
    g.isSafeAreaGuide = true;
  });
  return guides;
}

export function QuoteImageEditor({ quote, service }: { quote: Quote; service: Service | null }) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  // Fabric's dispose() is async; React's cleanup functions are not awaited before the next
  // effect run (notably under dev-mode Strict Mode's double-invoke), so the next mount must
  // wait for any disposal already in flight before wrapping the same <canvas> element again.
  const pendingDisposeRef = useRef<Promise<unknown> | null>(null);
  // Undo/redo: a stack of serialized canvas states plus a pointer into it. isRestoringRef guards
  // against undo/redo's own loadFromJSON call re-recording itself as a new change.
  const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
  const isRestoringRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kept outside React state since guides are re-added imperatively on every canvas
  // (re)init and only ever need their visibility flipped, never a re-render trigger of their own.
  const safeAreaGuidesRef = useRef<GuideObject[]>([]);
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [style, setStyle] = useState<TextStyle>(DEFAULT_STYLE);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [hasSelection, setHasSelection] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [exportedUrl, setExportedUrl] = useState(quote.exportedImageUrl ?? '');
  const [statusMessage, setStatusMessage] = useState('');

  // Shared by live selection events and by undo/redo restoration - both need the style panel to
  // reflect whatever the canvas's active text object actually looks like right now.
  function syncStyleFromActiveObject(canvas: Canvas) {
    const active = canvas.getActiveObject() as (FabricObject & Partial<TextStyle>) | undefined;
    if (active && 'text' in active) {
      setHasSelection(true);
      setStyle({
        fontFamily: (active.fontFamily as string) ?? DEFAULT_STYLE.fontFamily,
        fontSize: (active.fontSize as number) ?? DEFAULT_STYLE.fontSize,
        fontWeight: String(active.fontWeight ?? DEFAULT_STYLE.fontWeight),
        fill: (active.fill as string) ?? DEFAULT_STYLE.fill,
        textBackgroundColor: (active.textBackgroundColor as string) ?? '',
        lineHeight: (active.lineHeight as number) ?? DEFAULT_STYLE.lineHeight,
        textAlign: (active.textAlign as TextStyle['textAlign']) ?? DEFAULT_STYLE.textAlign,
      });
    } else {
      setHasSelection(false);
    }
  }

  // Builds and adds the safe-area overlay to a freshly (re)created canvas, always on top so it
  // stays visible over the background image and text while editing.
  function addSafeAreaGuides(canvas: Canvas, width: number, height: number) {
    const guides = buildSafeAreaGuides(width, height);
    guides.forEach((g) => {
      g.set('visible', showSafeArea);
      canvas.add(g);
    });
    safeAreaGuidesRef.current = guides;
  }

  // A custom font's file is only fetched by the browser the first time something on the page
  // actually needs it, and Fabric caches each object's render to its own offscreen bitmap that
  // only gets redrawn once `dirty` is set - so a Textbox painted before the font finishes
  // loading gets stuck showing the fallback font's cached bitmap forever, even after later
  // renderAll() calls, unless something explicitly re-dirties it once the font is ready. Needed
  // both right after the user changes the font and on initial load/undo-redo of a saved layout
  // that already used one.
  function ensureFontRendered(canvas: Canvas, obj: FabricObject & Partial<TextStyle>) {
    const family = obj.fontFamily;
    if (!family || !CUSTOM_FONT_FAMILIES.has(family)) return;
    document.fonts
      .load(`${obj.fontWeight || 'normal'} 16px "${family}"`)
      .then(() => {
        obj.set('dirty', true);
        canvas.renderAll();
      })
      .catch(() => {});
  }

  // Flips the already-built guides' visibility in place when the user toggles the checkbox,
  // without tearing down and recreating the whole canvas.
  useEffect(() => {
    safeAreaGuidesRef.current.forEach((g) => g.set('visible', showSafeArea));
    canvasRef.current?.renderAll();
  }, [showSafeArea]);

  useEffect(() => {
    // React (dev-mode Strict Mode) double-invokes effects: mount, cleanup, mount again - and
    // Fabric's dispose() is asynchronous, so the cleanup below can't finish tearing down the
    // <canvas> element before this guard's mount runs again. Wait for any disposal already in
    // flight before wrapping the same DOM node in a new Fabric canvas.
    let cancelled = false;

    (async () => {
      if (pendingDisposeRef.current) await pendingDisposeRef.current;
      if (cancelled || !canvasElRef.current) return;

      const { width, height } = DIMENSIONS[orientation];
      const canvas = new Canvas(canvasElRef.current, { width, height, backgroundColor: '#111111' });
      canvasRef.current = canvas;

      // Keep the backing store at the true design resolution (needed for a crisp export) and
      // only shrink the on-screen CSS box - the browser downsamples the full-resolution render
      // for display. Also calling setZoom() here would additionally shrink where content draws
      // *within* that backing store, compounding with this and roughly halving everything again.
      const zoom = Math.min(1, MAX_DISPLAY_HEIGHT / height);
      canvas.setDimensions({ width: width * zoom, height: height * zoom }, { cssOnly: true });

      canvas.on('selection:created', () => syncStyleFromActiveObject(canvas));
      canvas.on('selection:updated', () => syncStyleFromActiveObject(canvas));
      canvas.on('selection:cleared', () => setHasSelection(false));
      // object:modified covers drag/resize/rotate via the canvas's own selection handles;
      // editing:exited covers finishing an inline text edit (not text:changed, which fires per
      // keystroke and would flood the undo stack with one entry per character typed).
      canvas.on('object:modified', () => recordChange(canvas));
      canvas.on('text:editing:exited', () => recordChange(canvas));

      const savedState = quote.editorState as Record<string, unknown> | undefined;
      if (savedState) {
        await canvas.loadFromJSON(savedState);
        if (cancelled) return;
        // loadFromJSON restores objects but not which one was selected - reselect the text
        // layer so style controls are immediately usable without an extra click.
        const restoredText = canvas.getObjects().find((o) => o.type === 'textbox');
        if (restoredText) {
          canvas.setActiveObject(restoredText);
          ensureFontRendered(canvas, restoredText as FabricObject & Partial<TextStyle>);
        }
        addSafeAreaGuides(canvas, width, height);
        canvas.renderAll();
        syncStyleFromActiveObject(canvas);
        initHistory(canvas);
        return;
      }

      const bgUrl =
        quote.customImageUrl ||
        (orientation === 'portrait' ? service?.portraitTemplateUrl : service?.landscapeTemplateUrl);
      if (bgUrl) {
        try {
          const img = await createBackgroundImage(assetUrl(bgUrl), width, height);
          if (cancelled) return;
          canvas.add(img);
          canvas.sendObjectToBack(img);
        } catch {
          // background image failed to load (e.g. missing template); continue with plain canvas
        }
      }
      if (cancelled) return;

      const text = new Textbox(quote.text, {
        left: width / 2,
        top: height / 2,
        originX: 'center',
        originY: 'center',
        width: width * 0.8,
        ...DEFAULT_STYLE,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      ensureFontRendered(canvas, text as FabricObject & Partial<TextStyle>);
      addSafeAreaGuides(canvas, width, height);
      canvas.renderAll();
      syncStyleFromActiveObject(canvas);
      initHistory(canvas);
    })();

    return () => {
      cancelled = true;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvasRef.current = null;
        pendingDisposeRef.current = canvas.dispose();
      }
    };
    // Re-create the canvas from scratch when orientation changes; editorState is intentionally
    // only consulted on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation]);

  // Resets history to a single baseline entry - the state right after initial load/orientation
  // switch - so the very first undo always lands back on the pristine loaded state.
  function initHistory(canvas: Canvas) {
    historyRef.current = { stack: [JSON.stringify(canvas.toJSON())], index: 0 };
    setCanUndo(false);
    setCanRedo(false);
  }

  function scheduleAutosave(canvas: Canvas) {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus('saving');
      try {
        await saveQuoteEditorExport(quote._id, { editorState: canvas.toJSON() });
        setAutosaveStatus('saved');
      } catch {
        setAutosaveStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);
  }

  // Called after any user-driven change (style tweak, drag/resize, text edit, background swap).
  // Records a new undo point and kicks off a debounced autosave.
  function recordChange(canvas: Canvas) {
    if (isRestoringRef.current) return;
    const h = historyRef.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(JSON.stringify(canvas.toJSON()));
    if (h.stack.length > HISTORY_LIMIT) {
      h.stack.shift();
    } else {
      h.index += 1;
    }
    h.index = Math.min(h.index, h.stack.length - 1);
    setCanUndo(h.index > 0);
    setCanRedo(false);
    setAutosaveStatus('idle');
    scheduleAutosave(canvas);
  }

  async function restoreHistoryIndex(canvas: Canvas, index: number) {
    const h = historyRef.current;
    isRestoringRef.current = true;
    try {
      await canvas.loadFromJSON(JSON.parse(h.stack[index]));
      // loadFromJSON restores objects but not which one was selected - reselect the text layer
      // so the style panel (font size, color, etc.) reflects the restored state immediately.
      const restoredText = canvas.getObjects().find((o) => o.type === 'textbox');
      if (restoredText) {
        canvas.setActiveObject(restoredText);
        ensureFontRendered(canvas, restoredText as FabricObject & Partial<TextStyle>);
      }
      // Guides are excludeFromExport so loadFromJSON's fresh object list never includes them -
      // they need to be rebuilt every time it runs, same as on initial load.
      const { width, height } = DIMENSIONS[orientation];
      addSafeAreaGuides(canvas, width, height);
      canvas.renderAll();
      syncStyleFromActiveObject(canvas);
    } finally {
      isRestoringRef.current = false;
    }
    setCanUndo(index > 0);
    setCanRedo(index < h.stack.length - 1);
    setAutosaveStatus('idle');
    scheduleAutosave(canvas);
  }

  function undo() {
    const canvas = canvasRef.current;
    const h = historyRef.current;
    if (!canvas || h.index <= 0) return;
    h.index -= 1;
    restoreHistoryIndex(canvas, h.index);
  }

  function redo() {
    const canvas = canvasRef.current;
    const h = historyRef.current;
    if (!canvas || h.index >= h.stack.length - 1) return;
    h.index += 1;
    restoreHistoryIndex(canvas, h.index);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTypingInField =
        target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (isTypingInField) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateStyle(patch: Partial<TextStyle>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    active.set(patch as Record<string, unknown>);
    canvas.renderAll();
    setStyle((prev) => ({ ...prev, ...patch }));
    recordChange(canvas);

    if (patch.fontFamily) ensureFontRendered(canvas, active as FabricObject & Partial<TextStyle>);
  }

  async function handleCustomImage(file: File) {
    setStatusMessage('Uploading image...');
    try {
      const updated = await setQuoteCustomImage(quote._id, file);
      const canvas = canvasRef.current;
      const { width, height } = DIMENSIONS[orientation];
      if (canvas && updated.customImageUrl) {
        const img = await createBackgroundImage(assetUrl(updated.customImageUrl), width, height);
        if (canvasRef.current === canvas) {
          const existingBg = canvas.getObjects().find((o) => o.type === 'image');
          if (existingBg) canvas.remove(existingBg);
          canvas.add(img);
          canvas.sendObjectToBack(img);
          canvas.renderAll();
          recordChange(canvas);
        }
      }
      setStatusMessage('');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to upload image');
    }
  }

  async function handleSaveLayout() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setStatusMessage('');
    try {
      await saveQuoteEditorExport(quote._id, { editorState: canvas.toJSON() });
      setStatusMessage('Layout saved.');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to save layout');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setStatusMessage('');
    // excludeFromExport only keeps the guides out of the JSON below; toDataURL still rasterizes
    // whatever's on the canvas, so they have to be hidden for this render and restored after.
    const guides = safeAreaGuidesRef.current;
    guides.forEach((g) => g.set('visible', false));
    canvas.renderAll();
    try {
      const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 });
      const updated = await saveQuoteEditorExport(quote._id, {
        dataUrl,
        editorState: canvas.toJSON(),
      });
      setExportedUrl(updated.exportedImageUrl ?? '');
      setStatusMessage('Image exported.');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to export image');
    } finally {
      guides.forEach((g) => g.set('visible', showSafeArea));
      canvas.renderAll();
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between">
          <div className="flex gap-2">
            {(['portrait', 'landscape'] as Orientation[]).map((o) => (
              <button
                key={o}
                onClick={() => setOrientation(o)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  orientation === o
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {o === 'portrait' ? 'Portrait 1080×1350' : 'Landscape 16:9'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-neutral-600">
              <input
                type="checkbox"
                checked={showSafeArea}
                onChange={(e) => setShowSafeArea(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Safe area grid
            </label>
            <div className="flex gap-1">
              <button
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl/Cmd+Z)"
                className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
              >
                Undo
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl/Cmd+Shift+Z)"
                className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
              >
                Redo
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-3">
          <canvas ref={canvasElRef} />
        </div>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer text-xs font-medium text-neutral-600 hover:underline">
            Use a different image for this quote
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCustomImage(file);
              }}
            />
          </label>
          <span className="text-xs text-neutral-400">
            {autosaveStatus === 'saving' && 'Saving…'}
            {autosaveStatus === 'saved' && 'Saved'}
            {autosaveStatus === 'error' && (
              <span className="text-red-500">Autosave failed</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className={hasSelection ? '' : 'pointer-events-none opacity-40'}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Text style</h3>

          <label className="mt-3 block text-xs font-medium text-neutral-600">Font</label>
          <select
            value={style.fontFamily}
            onChange={(e) => updateStyle({ fontFamily: e.target.value })}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <label className="mt-3 block text-xs font-medium text-neutral-600">Font size</label>
          <input
            type="number"
            min={12}
            max={200}
            value={style.fontSize}
            onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />

          <label className="mt-3 block text-xs font-medium text-neutral-600">Weight</label>
          <select
            value={style.fontWeight}
            onChange={(e) => updateStyle({ fontWeight: e.target.value })}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
          </select>

          <label className="mt-3 block text-xs font-medium text-neutral-600">Line height</label>
          <input
            type="number"
            step={0.05}
            min={0.8}
            max={3}
            value={style.lineHeight}
            onChange={(e) => updateStyle({ lineHeight: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />

          <label className="mt-3 block text-xs font-medium text-neutral-600">Alignment</label>
          <div className="mt-1 flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => updateStyle({ textAlign: align })}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs ${
                  style.textAlign === align
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {align}
              </button>
            ))}
          </div>

          <label className="mt-3 block text-xs font-medium text-neutral-600">Text color</label>
          <input
            type="color"
            value={style.fill}
            onChange={(e) => updateStyle({ fill: e.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300"
          />

          <label className="mt-3 block text-xs font-medium text-neutral-600">Highlight</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={style.textBackgroundColor || '#000000'}
              onChange={(e) => updateStyle({ textBackgroundColor: e.target.value })}
              className="h-9 w-full rounded-md border border-neutral-300"
            />
            <button
              onClick={() => updateStyle({ textBackgroundColor: '' })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
            >
              None
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4">
          <button
            onClick={handleSaveLayout}
            disabled={saving}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            Save layout
          </button>
          <button
            onClick={handleExport}
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? 'Working...' : 'Export image'}
          </button>
          {statusMessage && <p className="text-xs text-neutral-500">{statusMessage}</p>}
          {exportedUrl && (
            <a
              href={assetUrl(exportedUrl)}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              Open exported image
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
