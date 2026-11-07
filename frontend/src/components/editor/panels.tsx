'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Eye,
  EyeOff,
  ImagePlus,
  Lock,
  LockOpen,
  Minus,
  MoveDown,
  MoveUp,
  RectangleHorizontal,
  Sparkles,
  Square,
  Trash2,
  Triangle,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { studioDraftEnabled } from '@/lib/draft';
import { assetUrl, deleteEditorImage, generateEditorImage, listEditorImages, uploadEditorImage } from '@/lib/api';
import { loadFontPreview } from '@/lib/fonts';
import type { Design, ImageAsset, Service } from '@/lib/types';
import { AI_STYLE_CHIPS, GRADIENT_PRESETS, SWATCHES, TEXT_PRESETS } from './constants';
import type { DesignCanvas } from './useDesignCanvas';
import { ColorInput, DropZone, Field, PanelSection, Slider, Spinner, cx, fileToDataUrl } from './ui';

function useAction() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError('');
    setPending(true);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }
  return { error, pending, run, setError };
}

// ---------------- Text ----------------

export function TextPanel({ ed, design }: { ed: DesignCanvas; design: Design }) {
  useEffect(() => {
    TEXT_PRESETS.forEach((p) => loadFontPreview(p.fontFamily));
  }, []);
  const t = ed.selection?.text;
  return (
    <div>
      <PanelSection title="Add text">
        <div className="grid gap-2">
          {TEXT_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => ed.addText(p)}
              className="rounded-xl border border-neutral-200 px-4 py-3 text-left transition-colors hover:border-neutral-400 hover:bg-neutral-100"
            >
              <span
                className="block truncate text-neutral-900"
                style={{
                  fontFamily: `"${p.fontFamily}", system-ui`,
                  fontWeight: p.fontWeight,
                  fontStyle: p.fontStyle,
                  fontSize: Math.min(30, Math.max(14, p.size * 220)),
                  letterSpacing: p.charSpacing ? `${p.charSpacing / 1000}em` : undefined,
                  textTransform: p.uppercase ? 'uppercase' : undefined,
                }}
              >
                {p.sample}
              </span>
            </button>
          ))}
        </div>
        {design.text.trim() && (
          <button
            type="button"
            onClick={() => ed.addText('body', { text: design.text.trim() })}
            className="mt-3 w-full rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Re-add original {design.source === 'post' ? 'post' : design.source === 'quote' ? 'quote' : 'text'}
          </button>
        )}
      </PanelSection>

      {t && (
        <PanelSection title="Selected text">
          <div className="space-y-4">
            <Field label="Content">
              <textarea
                value={t.text}
                rows={4}
                onChange={(e) => ed.setTextContent(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              />
            </Field>
            <Field label="Letter case">
              <div className="flex gap-1.5">
                {([['upper', 'AA'], ['lower', 'aa'], ['title', 'Aa']] as const).map(([m, l]) => (
                  <button key={m} type="button" onClick={() => ed.transformCase(m)} className="flex-1 rounded-lg border border-neutral-200 py-1.5 text-sm hover:bg-neutral-50">
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            <Slider label="Line height" value={t.lineHeight} min={0.8} max={2.4} step={0.05} onChange={(v) => ed.updateText({ lineHeight: v })} format={(v) => v.toFixed(2)} />
            <Slider label="Letter spacing" value={t.charSpacing} min={-100} max={800} step={10} onChange={(v) => ed.updateText({ charSpacing: v })} />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-600">Drop shadow</span>
              <button
                type="button"
                role="switch"
                aria-checked={t.shadow}
                onClick={() => ed.setShadow(!t.shadow)}
                className={cx('h-6 w-11 rounded-full p-0.5 transition-colors', t.shadow ? 'bg-neutral-900' : 'bg-neutral-300')}
              >
                <span className={cx('block h-5 w-5 rounded-full bg-white transition-transform', t.shadow && 'translate-x-5')} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-600">Outline</span>
              <ColorInput title="Outline colour" value={t.stroke} allowNone onChange={(c) => ed.updateText({ stroke: c, strokeWidth: c ? Math.max(t.strokeWidth, 3) : 0 })} />
            </div>
            {t.stroke && <Slider label="Outline width" value={t.strokeWidth} min={0} max={30} onChange={(v) => ed.updateText({ strokeWidth: v })} />}
            <p className="text-[11px] leading-snug text-neutral-400">
              Tip: double-click text on the canvas, select some words, then change the font, colour or highlight to style just that selection.
            </p>
          </div>
        </PanelSection>
      )}
    </div>
  );
}

// ---------------- Elements ----------------

export function ElementsPanel({ ed }: { ed: DesignCanvas }) {
  const { error, pending, run } = useAction();
  const lower = useImageBank('lower-third');
  const shapes = [
    ['rect', 'Rectangle', Square],
    ['rounded', 'Rounded', RectangleHorizontal],
    ['circle', 'Circle', Circle],
    ['triangle', 'Triangle', Triangle],
    ['divider', 'Divider', Minus],
  ] as const;
  return (
    <div>
      <PanelSection title="Shapes">
        <div className="grid grid-cols-3 gap-2">
          {shapes.map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => ed.addShape(k)} className="flex flex-col items-center gap-1.5 rounded-xl border border-neutral-200 py-3 text-xs text-neutral-600 hover:border-neutral-400 hover:bg-neutral-100">
              <Icon size={22} />
              {label}
            </button>
          ))}
          <button type="button" onClick={() => ed.addShape('highlight')} className="flex flex-col items-center gap-1.5 rounded-xl border border-neutral-200 py-3 text-xs text-neutral-600 hover:border-neutral-400 hover:bg-neutral-100">
            <span className="mt-1 block h-4 w-9 rounded-sm bg-yellow-300/80" />
            Highlight bar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-neutral-400">Drag a highlight bar behind a line of text to get a marker effect.</p>
      </PanelSection>
      <PanelSection title="Images">
        <DropZone onFiles={(f) => run(() => ed.uploadAndAddImage(f[0], 'layer'))}>
          {pending ? <Spinner /> : <ImagePlus size={20} />}
          <span className="font-medium">Add an image layer</span>
          <span className="text-neutral-400">Drop a file here or click to browse</span>
        </DropZone>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </PanelSection>
      <PanelSection title="Lower thirds">
        <DropZone
          onFiles={(f) =>
            run(async () => {
              const asset = await ed.uploadLowerThird(f[0]);
              if (asset) lower.add(asset);
            })
          }
        >
          {pending ? <Spinner /> : <RectangleHorizontal size={20} />}
          <span className="font-medium">Upload a lower third</span>
          <span className="text-neutral-400">PNG with transparency works best</span>
        </DropZone>
        <p className="mt-2 text-[11px] text-neutral-400">
          It snaps to the bottom of the design at full width and re-docks whenever you change the size - ideal for a service template band.
        </p>
        {lower.items.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {lower.items.map((a) => (
              <div key={a._id} className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:12px_12px]">
                <button type="button" onClick={() => run(() => ed.addLowerThird(a.url))} className="block w-full" title="Add to the bottom of the design">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(a.url)} alt={a.name || 'Lower third'} className="h-16 w-full object-contain" loading="lazy" />
                </button>
                <button type="button" aria-label="Remove from library" onClick={() => lower.remove(a._id)} className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-0.5 text-white group-hover:block">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}

// The saved pictures of one kind, with add/remove that keep the list in step.
function useImageBank(kind: 'gallery' | 'lower-third') {
  const [items, setItems] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listEditorImages(kind)
      .then((list) => !cancelled && setItems(list))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [kind]);
  return {
    items,
    loading,
    add: (a: ImageAsset) => setItems((l) => [a, ...l.filter((x) => x._id !== a._id)]),
    remove: (id: string) => {
      setItems((l) => l.filter((x) => x._id !== id));
      deleteEditorImage(id).catch(() => {});
    },
  };
}

// ---------------- Image gallery ----------------

// One place for pictures: everything uploaded or AI-generated lives in the bank and can be
// dropped into any design; "Create with AI" generates a new one (which then lands in the bank).
export function GalleryPanel({ ed, design, session }: { ed: DesignCanvas; design: Design; session: { generated: string[]; onGenerated: (url: string) => void } }) {
  const [tab, setTab] = useState<'library' | 'ai'>('library');
  const bank = useImageBank('gallery');
  const { error, pending, run } = useAction();
  const [filter, setFilter] = useState<'all' | 'upload' | 'ai'>('all');
  const shown = bank.items.filter((a) => filter === 'all' || a.kind === filter);

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 border-b border-neutral-100 p-3 text-xs font-medium">
        {([['library', 'My images'], ['ai', 'Create with AI']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cx('rounded-md px-2 py-1.5', tab === k ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'ai' ? (
        <AiPanel
          ed={ed}
          design={design}
          session={session}
          onCreated={(asset) => {
            if (asset) bank.add(asset);
          }}
        />
      ) : (
        <div>
          <PanelSection title="Add to your gallery">
            <DropZone
              multiple
              onFiles={(files) =>
                run(async () => {
                  for (const f of files.slice(0, 10)) {
                    const { asset } = await uploadEditorImage(f, 'upload');
                    if (asset) bank.add(asset);
                  }
                })
              }
            >
              {pending ? <Spinner /> : <Upload size={20} />}
              <span className="font-medium">Upload images</span>
              <span className="text-neutral-400">Drop files here or click to browse</span>
            </DropZone>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </PanelSection>
          <PanelSection
            title="Gallery"
            action={
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px]">
                <option value="all">All</option>
                <option value="upload">Uploaded</option>
                <option value="ai">AI generated</option>
              </select>
            }
          >
            {bank.loading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : shown.length === 0 ? (
              <p className="py-4 text-center text-xs text-neutral-400">
                {bank.items.length === 0 ? 'No images yet. Upload some, or create one with AI.' : 'Nothing in this filter.'}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {shown.map((a) => (
                  <div key={a._id} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetUrl(a.url)} alt={a.name || 'Gallery image'} title={a.prompt || a.name} className="h-full w-full object-cover" loading="lazy" />
                    {a.kind === 'ai' && <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">AI</span>}
                    <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-black/0 p-1 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100 focus-within:opacity-100 max-sm:bg-black/20 max-sm:opacity-100">
                      <button type="button" onClick={() => run(() => ed.setBackgroundImage(a.url))} className="rounded bg-white/95 py-0.5 text-[10px] font-semibold text-neutral-900">Background</button>
                      <button type="button" onClick={() => run(() => ed.addImageLayer(a.url))} className="rounded bg-white/95 py-0.5 text-[10px] font-semibold text-neutral-900">Layer</button>
                    </div>
                    <button type="button" aria-label="Remove from gallery" onClick={() => bank.remove(a._id)} className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-0.5 text-white group-hover:block">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PanelSection>
        </div>
      )}
    </div>
  );
}

// ---------------- Background ----------------

export function BackgroundPanel({
  ed,
  service,
  onOpenAi,
}: {
  ed: DesignCanvas;
  service: Service | null;
  onOpenAi: () => void;
}) {
  const { error, pending, run } = useAction();
  const templates = [
    service?.portraitTemplateUrl && { label: 'Portrait template', url: service.portraitTemplateUrl },
    service?.landscapeTemplateUrl && { label: 'Landscape template', url: service.landscapeTemplateUrl },
  ].filter(Boolean) as { label: string; url: string }[];
  const solid = !ed.bg.gradient ? ed.bg.fill : '';

  return (
    <div>
      <PanelSection title="Colour">
        <div className="grid grid-cols-8 gap-1.5">
          {SWATCHES.slice(0, 16).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Background ${c}`}
              onClick={() => ed.setBackgroundSolid(c)}
              className={cx('aspect-square rounded-full border border-neutral-200', solid.toLowerCase() === c && 'ring-2 ring-neutral-900 ring-offset-1')}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs font-medium text-neutral-600">
          Custom colour
          <ColorInput title="Custom background colour" value={solid || '#111111'} onChange={(c) => c && ed.setBackgroundSolid(c)} />
        </div>
      </PanelSection>

      <PanelSection title="Gradients">
        <div className="grid grid-cols-4 gap-2">
          {GRADIENT_PRESETS.map((g) => (
            <button
              key={g.name}
              type="button"
              title={g.name}
              aria-label={`${g.name} gradient`}
              onClick={() => ed.setBackgroundGradient(g.from, g.to, g.angle)}
              className={cx(
                'aspect-square rounded-xl border border-neutral-200',
                ed.bg.gradient?.from === g.from && ed.bg.gradient?.to === g.to && 'ring-2 ring-neutral-900 ring-offset-1'
              )}
              style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Image">
        <DropZone onFiles={(f) => run(() => ed.uploadAndAddImage(f[0], 'background'))}>
          {pending ? <Spinner /> : <Upload size={20} />}
          <span className="font-medium">Upload a background</span>
          <span className="text-neutral-400">Drop a file here or click to browse</span>
        </DropZone>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button type="button" onClick={onOpenAi} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white hover:opacity-95">
          <Sparkles size={16} /> Generate with AI
        </button>

        {templates.length > 0 && (
          <div className="mt-3 grid gap-1.5">
            {templates.map((t) => (
              <button key={t.url} type="button" onClick={() => run(() => ed.setBackgroundImage(t.url))} className="flex items-center gap-3 rounded-lg border border-neutral-200 p-2 text-left text-xs hover:bg-neutral-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(t.url)} alt="" className="h-10 w-10 rounded object-cover" />
                Use {t.label.toLowerCase()}
              </button>
            ))}
          </div>
        )}

        {ed.bg.hasImage && (
          <div className="mt-4 space-y-4 rounded-xl bg-neutral-50 p-3">
            <Slider label="Darken for readability" value={ed.bg.dim} min={0} max={0.9} step={0.05} onChange={(v) => ed.setDim(v, false)} onCommit={ed.commit} format={(v) => `${Math.round(v * 100)}%`} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => ed.fitBackground('cover')} className="rounded-lg border border-neutral-200 bg-white py-1.5 text-xs font-medium hover:bg-neutral-100">Fill</button>
              <button type="button" onClick={() => ed.fitBackground('contain')} className="rounded-lg border border-neutral-200 bg-white py-1.5 text-xs font-medium hover:bg-neutral-100">Fit</button>
            </div>
            <button
              type="button"
              onClick={() => ed.setBackgroundAdjusting(!ed.bg.adjusting)}
              className={cx('w-full rounded-lg border py-1.5 text-xs font-medium', ed.bg.adjusting ? 'border-neutral-900 bg-neutral-100 text-neutral-800' : 'border-neutral-200 bg-white hover:bg-neutral-100')}
            >
              {ed.bg.adjusting ? 'Done repositioning' : 'Reposition / zoom image'}
            </button>
            <button type="button" onClick={ed.removeBackgroundImage} className="w-full rounded-lg py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
              Remove image
            </button>
          </div>
        )}
      </PanelSection>
    </div>
  );
}

// ---------------- AI ----------------

interface RefImage {
  id: string;
  dataUrl: string;
}

type AiPanelProps = { ed: DesignCanvas; design: Design; session: { generated: string[]; onGenerated: (url: string) => void }; onCreated?: (asset: ImageAsset | null) => void };

// AI pictures are saved to the shared gallery the moment they're made, so they aren't available while work is kept on this device.
export function AiPanel(props: AiPanelProps) {
  if (studioDraftEnabled()) {
    return (
      <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">
        <p className="font-semibold text-neutral-900">AI pictures aren’t available here</p>
        <p className="mt-1">Your Image Studio work stays on this device until it’s approved, and an AI picture would be saved to the shared gallery straight away. Ask an admin to generate it, or upload your own picture.</p>
      </div>
    );
  }
  return <AiPanelInner {...props} />;
}

function AiPanelInner({ ed, design, session, onCreated }: AiPanelProps) {
  const [prompt, setPrompt] = useState(design.imagePrompt ?? '');
  const [refs, setRefs] = useState<RefImage[]>([]);
  const [mode, setMode] = useState<'background' | 'design' | 'free'>(() => (ed.allText() ? 'design' : 'background'));
  const [designText, setDesignText] = useState(() => ed.allText());
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [target, setTarget] = useState<'background' | 'layer'>('background');
  const [enhance, setEnhance] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function addRefs(files: File[]) {
    try {
      const next = await Promise.all(files.slice(0, 4 - refs.length).map(async (f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, dataUrl: await fileToDataUrl(f) })));
      setRefs((r) => [...r, ...next].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image');
    }
  }

  async function useCanvasAsRef() {
    try {
      const dataUrl = await ed.renderDataUrl('jpeg', { quality: 0.8, maxSide: 1024 });
      setRefs((r) => [...r, { id: `canvas-${Date.now()}`, dataUrl }].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture the canvas');
    }
  }

  async function apply(url: string, as = target) {
    if (as === 'background') await ed.setBackgroundImage(url);
    else await ed.addImageLayer(url);
  }

  async function generate() {
    if (!prompt.trim()) {
      setError(mode === 'design' ? 'Describe the look and feel of the design first.' : 'Describe the image you want first.');
      return;
    }
    if (mode === 'design' && !designText.trim()) {
      setError('Add the text you want on the design.');
      return;
    }
    setError('');
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { url, asset } = await generateEditorImage(
        {
          prompt: prompt.trim(),
          width: ed.size.w,
          height: ed.size.h,
          referenceImages: refs.map((r) => r.dataUrl),
          mode,
          text: mode === 'design' ? designText.trim() : undefined,
          enhance,
          quality,
          designId: design._id,
        },
        controller.signal
      );
      session.onGenerated(url);
      onCreated?.(asset);
      if (mode === 'design') await ed.applyFullDesign(url);
      else await apply(url);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Image generation failed');
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  const canvasText = ed.allText();

  return (
    <div>
      <PanelSection title="Options">
        <div className="space-y-3">
          <Field label="What to generate">
            <div className="grid gap-1.5">
              {(
                [
                  ['design', 'Full design with text', 'A finished, high-resolution graphic with your text typeset into it'],
                  ['background', 'Background only', 'Text-free artwork you place your own text over'],
                  ['free', 'Any image', 'Exactly what you describe, as a layer or background'],
                ] as const
              ).map(([k, l, d]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMode(k)}
                  className={cx('rounded-lg border px-3 py-2 text-left', mode === k ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-200 hover:bg-neutral-50')}
                >
                  <span className="block text-sm font-medium text-neutral-900">{l}</span>
                  <span className="block text-xs text-neutral-500">{d}</span>
                </button>
              ))}
            </div>
          </Field>
          {mode === 'design' && (
            <Field label="Text on the design">
              <textarea
                value={designText}
                onChange={(e) => setDesignText(e.target.value)}
                rows={4}
                placeholder="The exact words to put on the image"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <button type="button" onClick={() => setDesignText(ed.allText())} className="text-xs font-medium text-neutral-900 hover:underline">
                  Use the text on canvas
                </button>
                <span className="text-[11px] text-neutral-400">Your text layers are hidden after, not deleted</span>
              </div>
            </Field>
          )}
          {mode !== 'design' && (
            <Field label="Place result as">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 text-xs font-medium">
                {([['background', 'Background'], ['layer', 'Image layer']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTarget(k)} className={cx('rounded-md px-2 py-1.5', target === k ? 'bg-white shadow-sm' : 'text-neutral-500')}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <div className="flex items-start justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium text-neutral-900">Art-direct my prompt</span>
              <span className="block text-xs text-neutral-500">Expands a short idea into a detailed, premium brief (recommended)</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enhance}
              onClick={() => setEnhance((v) => !v)}
              className={cx('mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors', enhance ? 'bg-neutral-900' : 'bg-neutral-300')}
            >
              <span className={cx('block h-5 w-5 rounded-full bg-white transition-transform', enhance && 'translate-x-5')} />
            </button>
          </div>
          {mode !== 'design' && (
          <Field label="Quality">
            <select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)} className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm">
              <option value="low">Draft (fastest)</option>
              <option value="medium">Standard</option>
              <option value="high">Premium detail (recommended)</option>
            </select>
          </Field>
          )}
        </div>
      </PanelSection>

      <PanelSection title="Describe your image">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="e.g. Warm golden sunrise breaking over quiet hills, soft haze, hopeful mood"
          className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-500"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {canvasText && (
            <button
              type="button"
              onClick={() => setPrompt(`A visual that captures the meaning of: "${canvasText.slice(0, 400)}"`)}
              className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-200"
            >
              Use the text on canvas
            </button>
          )}
          {design.imagePrompt && design.imagePrompt !== prompt && (
            <button type="button" onClick={() => setPrompt(design.imagePrompt ?? '')} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">
              Suggested prompt
            </button>
          )}
          {AI_STYLE_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPrompt((p) => (p.toLowerCase().includes(c.toLowerCase()) ? p : `${p.trim()}${p.trim() ? ', ' : ''}${c.toLowerCase()}`))}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              + {c}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Reference images" action={<span className="text-[11px] text-neutral-400">{refs.length}/4</span>}>
        {refs.length > 0 && (
          <div className="mb-2 grid grid-cols-4 gap-2">
            {refs.map((r) => (
              <div key={r.id} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.dataUrl} alt="Reference" className="h-full w-full object-cover" />
                <button type="button" aria-label="Remove reference" onClick={() => setRefs((x) => x.filter((i) => i.id !== r.id))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {refs.length < 4 && (
          <DropZone multiple onFiles={addRefs} className="py-4">
            <ImagePlus size={18} />
            <span className="font-medium">Drop a reference image</span>
            <span className="text-neutral-400">Style, subject or composition to follow</span>
          </DropZone>
        )}
        {refs.length < 4 && (
          <button type="button" onClick={useCanvasAsRef} className="mt-2 w-full rounded-lg border border-neutral-200 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
            Use the current design as reference
          </button>
        )}
      </PanelSection>

      <div className="sticky bottom-0 border-t border-neutral-100 bg-white p-4">
        {generating ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white">
              <Spinner /> Generating… this can take up to a minute
            </div>
            <button type="button" onClick={() => abortRef.current?.abort()} className="w-full text-xs font-medium text-neutral-500 hover:text-neutral-800">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={generate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:opacity-95">
            <Sparkles size={16} /> Generate image
          </button>
        )}
        {error && <p className="mt-2 text-xs leading-snug text-red-600">{error}</p>}
        <p className="mt-2 text-center text-[11px] text-neutral-400">
          {mode === 'design' ? 'Generated in high resolution (best quality, can take a minute). ' : ''}Sized for {ed.size.w}×{ed.size.h}.
        </p>
      </div>

      {session.generated.length > 0 && (
        <PanelSection title="Previous generations">
          <div className="grid grid-cols-3 gap-2">
            {[...session.generated].reverse().map((url) => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(url)} alt="Generated" className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-black/0 p-1 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100 max-sm:bg-black/20">
                  <button type="button" onClick={() => apply(url, 'background')} className="rounded bg-white/95 py-0.5 text-[10px] font-semibold text-neutral-900">Background</button>
                  <button type="button" onClick={() => apply(url, 'layer')} className="rounded bg-white/95 py-0.5 text-[10px] font-semibold text-neutral-900">Layer</button>
                </div>
              </div>
            ))}
          </div>
        </PanelSection>
      )}
    </div>
  );
}

// ---------------- Layers ----------------

export function LayersPanel({ ed }: { ed: DesignCanvas }) {
  return (
    <div className="p-3">
      {ed.layers.length === 0 && <p className="p-4 text-center text-sm text-neutral-400">Nothing on the canvas yet.</p>}
      <ul className="space-y-1">
        {ed.layers.map((l) => {
          const structural = Boolean(l.role);
          return (
            <li
              key={l.uid}
              className={cx(
                'group flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm',
                l.selected ? 'border-neutral-400 bg-neutral-100' : 'border-transparent hover:bg-neutral-50'
              )}
            >
              <button type="button" onClick={() => ed.selectLayer(l.uid)} className="flex min-w-0 flex-1 items-center gap-2 text-left" disabled={l.locked || (structural && l.role !== 'bg-image')}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-neutral-100 text-neutral-500">
                  {l.kind === 'text' ? <Type size={13} /> : l.kind === 'image' ? <ImagePlus size={13} /> : l.kind === 'background' ? <Square size={13} /> : <Circle size={13} />}
                </span>
                <span className={cx('truncate', !l.visible && 'text-neutral-400 line-through', structural && 'text-neutral-500')}>{l.label}</span>
              </button>
              {!structural && (
                <>
                  <button type="button" title="Bring forward" aria-label="Bring forward" onClick={() => ed.moveLayer('forward', l.uid)} className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700">
                    <MoveUp size={14} />
                  </button>
                  <button type="button" title="Send backward" aria-label="Send backward" onClick={() => ed.moveLayer('backward', l.uid)} className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700">
                    <MoveDown size={14} />
                  </button>
                </>
              )}
              <button type="button" title={l.visible ? 'Hide' : 'Show'} aria-label={l.visible ? 'Hide layer' : 'Show layer'} onClick={() => ed.setVisible(l.uid, !l.visible)} className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700">
                {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              {!structural && (
                <button type="button" title={l.locked ? 'Unlock' : 'Lock'} aria-label={l.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => ed.setLocked(!l.locked, l.uid)} className={cx('rounded p-1 hover:bg-neutral-200', l.locked ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-700')}>
                  {l.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                </button>
              )}
              {l.role !== 'bg-fill' && (
                <button type="button" title="Delete" aria-label="Delete layer" onClick={() => ed.deleteLayer(l.uid)} className="rounded p-1 text-neutral-400 hover:bg-red-100 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
