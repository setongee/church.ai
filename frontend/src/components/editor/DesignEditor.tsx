'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Grid3x3,
  BadgeCheck,
  ImageIcon,
  Layers,
  LayoutTemplate,
  FileText,
  Magnet,
  Minus,
  Plus,
  Redo2,
  Share2,
  Clapperboard,
  Tv,
  Shapes,
  Sparkles,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { getBrand, getDesign, patchDesign } from '@/lib/api';
import type { Brand, Design, Service, Session } from '@/lib/types';
import { ContextBar } from './ContextBar';
import { BrandPanel } from './BrandPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { ContentPanel } from './ContentPanel';
import { BackgroundPanel, ElementsPanel, GalleryPanel, LayersPanel, TextPanel } from './panels';
import { buildContent } from './dataFields';
import { CanvasContextMenu } from './CanvasContextMenu';
import { AnimateDialog } from './AnimateDialog';
import { ShareDialog } from './ShareDialog';
import { SizeMenu } from './SizeMenu';
import { IconButton, Spinner, cx } from './ui';
import { useDesignCanvas } from './useDesignCanvas';

type Tool = 'templates' | 'content' | 'text' | 'elements' | 'background' | 'ai' | 'brand' | 'layers';

const TOOLS: { key: Tool; label: string; icon: LucideIcon }[] = [
  { key: 'templates', label: 'Templates', icon: LayoutTemplate },
  { key: 'content', label: 'Content', icon: FileText },
  { key: 'text', label: 'Text', icon: Type },
  { key: 'elements', label: 'Elements', icon: Shapes },
  { key: 'background', label: 'Background', icon: ImageIcon },
  { key: 'ai', label: 'Image gallery', icon: Sparkles },
  { key: 'brand', label: 'Brand', icon: BadgeCheck },
  { key: 'layers', label: 'Layers', icon: Layers },
];

export function DesignEditor({
  designId,
  onBack,
  backLabel,
}: {
  designId: string;
  onBack: () => void;
  backLabel: string;
}) {
  const [data, setData] = useState<{ design: Design; session: Session | null; brand: Brand | null } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([getDesign(designId), getBrand().catch(() => null)])
      .then(([d, brand]) => alive && setData({ ...d, brand }))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Failed to load design'));
    return () => {
      alive = false;
    };
  }, [designId]);

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-red-600">{error}</p>
          <button type="button" onClick={onBack} className="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
            Go back
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid h-full place-items-center text-sm text-neutral-400">
        <span className="flex items-center gap-2">
          <Spinner /> Opening editor…
        </span>
      </div>
    );
  }
  const service = data.session && typeof data.session.service === 'object' ? (data.session.service as Service) : null;
  return (
    <Workspace
      key={data.design._id}
      initialDesign={data.design}
      service={service}
      session={data.session}
      brand={data.brand}
      onBack={onBack}
      backLabel={backLabel}
    />
  );
}

function Workspace({
  initialDesign,
  service,
  session,
  brand,
  onBack,
  backLabel,
}: {
  initialDesign: Design;
  service: Service | null;
  session: Session | null;
  brand: Brand | null;
  onBack: () => void;
  backLabel: string;
}) {
  const [design, setDesign] = useState(initialDesign);
  const [title, setTitle] = useState(initialDesign.title);
  const [tool, setTool] = useState<Tool | null>(() => (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'templates' : null));
  const [shareOpen, setShareOpen] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [generated, setGenerated] = useState<string[]>(initialDesign.generatedImages ?? []);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const ed = useDesignCanvas({ design, hostRef, stageRef, onDesignChange: setDesign });

  // What linked text and pictures draw their values from.
  useEffect(() => {
    if (ed.ready) ed.setDataContent(buildContent(design, session, brand));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed.ready, design._id, design.text, session, brand]);

  async function saveTitle() {
    const next = title.trim() || 'Untitled design';
    setTitle(next);
    if (next !== design.title) setDesign(await patchDesign(design._id, { title: next }).catch(() => design));
  }

  // Presentation designs are 16:9 (full HD) so they fill the screen. Turning the tag on for a design of
  // another shape offers to reshape it; turning it off frees the size again.
  const is16x9 = Math.abs(ed.size.w / ed.size.h - 16 / 9) < 0.01;
  async function togglePresentation() {
    const next = !design.presentation;
    if (next && !is16x9) {
      if (!window.confirm('Presentation designs are 16:9 (1920×1080). Resize this design to fit? Your layers are re-fitted to the new shape.')) return;
      ed.resizeTo(1920, 1080);
    }
    setDesign(await patchDesign(design._id, { presentation: next }).catch(() => design));
  }

  async function handleBack() {
    setLeaving(true);
    await ed.flush().catch(() => {});
    onBack();
  }

  const status =
    ed.saveStatus === 'saving' ? (
      <span className="flex items-center gap-1.5 text-neutral-500">
        <Spinner className="h-3 w-3" /> Saving…
      </span>
    ) : ed.saveStatus === 'saved' ? (
      <span className="flex items-center gap-1 text-green-600">
        <Check size={13} /> Saved
      </span>
    ) : ed.saveStatus === 'error' ? (
      <button type="button" onClick={ed.saveNow} className="text-red-600 underline">
        Save failed — retry
      </button>
    ) : null;

  const panel =
    tool === 'templates' ? (
      <TemplatesPanel ed={ed} design={design} session={session} brand={brand} />
    ) : tool === 'brand' ? (
      <BrandPanel ed={ed} brand={brand} />
    ) : tool === 'content' ? (
      <ContentPanel ed={ed} />
    ) : tool === 'text' ? (
      <TextPanel ed={ed} design={design} />
    ) : tool === 'elements' ? (
      <ElementsPanel ed={ed} />
    ) : tool === 'background' ? (
      <BackgroundPanel ed={ed} service={service} onOpenAi={() => setTool('ai')} />
    ) : tool === 'ai' ? (
      <GalleryPanel ed={ed} design={design} session={{ generated, onGenerated: (u) => setGenerated((g) => [...g.filter((x) => x !== u), u]) }} />
    ) : tool === 'layers' ? (
      <LayersPanel ed={ed} />
    ) : null;

  const activeTool = TOOLS.find((t) => t.key === tool);

  const dockButtons = (variant: 'dock' | 'bar') =>
    TOOLS.map(({ key, label, icon: Icon }) => (
      <button
        key={key}
        type="button"
        onClick={() => setTool((t) => (t === key ? null : key))}
        aria-pressed={tool === key}
        title={label}
        className={cx(
          'flex items-center justify-center gap-2 text-xs font-medium transition-colors',
          variant === 'dock'
            ? cx('h-10 rounded-full px-4', tool === key ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100')
            : cx('flex-1 flex-col gap-1 py-2.5 text-[11px]', tool === key ? 'text-neutral-900' : 'text-neutral-400')
        )}
      >
        <Icon size={variant === 'dock' ? 17 : 20} strokeWidth={tool === key && variant === 'bar' ? 2.3 : 1.9} />
        {variant === 'dock' ? <span className="hidden xl:inline">{label}</span> : label}
      </button>
    ));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f4f4f5] text-neutral-900">
      {/* top bar */}
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-black/5 bg-white px-3 py-2">
        <button type="button" onClick={handleBack} disabled={leaving} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-60">
          {leaving ? <Spinner /> : <ArrowLeft size={16} />}
          <span className="hidden max-w-40 truncate sm:inline">{backLabel}</span>
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Design name"
          className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold tracking-tight text-neutral-900 outline-none hover:border-neutral-200 focus:border-neutral-400 sm:max-w-xs sm:flex-none"
        />
        <div className="hidden text-xs sm:block">{status}</div>

        <div className="flex w-full items-center justify-between gap-1 sm:ml-auto sm:w-auto sm:justify-end">
          {design.presentation && is16x9 ? (
            <span className="flex h-9 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm" title="Presentation designs are always 16:9">
              <span className="font-medium text-orange-800">16:9</span>
              <span className="hidden text-xs text-orange-600 sm:inline">1920×1080</span>
            </span>
          ) : (
            <SizeMenu width={ed.size.w} height={ed.size.h} onChange={ed.resizeTo} />
          )}
          <button
            type="button"
            onClick={togglePresentation}
            aria-pressed={!!design.presentation}
            title={design.presentation ? 'Tagged for Present — click to remove' : 'Tag this design so it shows up in Present > Media'}
            className={cx('ml-1 flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors', design.presentation ? 'border-orange-300 bg-orange-600 text-white hover:bg-orange-700' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50')}
          >
            <Tv size={15} /> <span className="hidden sm:inline">Present</span>
          </button>
          <div className="mx-1 hidden h-5 w-px bg-neutral-200 sm:block" />
          <IconButton title="Undo (Ctrl/Cmd+Z)" disabled={!ed.canUndo} onClick={ed.undo}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!ed.canRedo} onClick={ed.redo}>
            <Redo2 size={17} />
          </IconButton>
          <div className="mx-1 hidden h-5 w-px bg-neutral-200 md:block" />
          <div className="hidden items-center md:flex">
            <IconButton title="Snap to guides" active={ed.snapEnabled} onClick={() => ed.setSnapEnabled(!ed.snapEnabled)}>
              <Magnet size={16} />
            </IconButton>
            <IconButton title="Safe area & thirds grid" active={ed.gridVisible} onClick={() => ed.setGridVisible(!ed.gridVisible)}>
              <Grid3x3 size={16} />
            </IconButton>
            <IconButton title="Zoom out" onClick={() => ed.setZoom(ed.zoom - 0.25)}>
              <Minus size={15} />
            </IconButton>
            <button type="button" title="Reset zoom" onClick={() => ed.setZoom(1)} className="w-12 text-center text-xs tabular-nums text-neutral-600 hover:text-neutral-900">
              {Math.round(ed.displayScale * 100)}%
            </button>
            <IconButton title="Zoom in" onClick={() => ed.setZoom(ed.zoom + 0.25)}>
              <Plus size={15} />
            </IconButton>
          </div>
          <button
            type="button"
            onClick={() => setAnimateOpen(true)}
            disabled={!ed.ready}
            title="Turn this design into a short looping video"
            className="ml-1 flex h-9 items-center gap-2 rounded-full border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100 disabled:opacity-50"
          >
            <Clapperboard size={15} /> Animate
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={!ed.ready}
            className="ml-1 flex h-9 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            <Share2 size={15} /> Share
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {tool && (
          <aside className="order-2 flex h-[46%] shrink-0 flex-col overflow-hidden border-t border-black/5 bg-white lg:order-1 lg:m-3 lg:mr-0 lg:h-auto lg:w-[22rem] lg:rounded-2xl lg:border lg:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]">
            <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
              <h2 className="text-sm font-semibold tracking-tight">{activeTool?.label}</h2>
              <button type="button" aria-label="Close panel" onClick={() => setTool(null)} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{panel}</div>
          </aside>
        )}

        <main className="relative order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
          {/* phones: toolbar sits in the flow above the canvas */}
          {ed.selection && (
            <div className="shrink-0 border-b border-black/5 bg-white lg:hidden">
              <ContextBar ed={ed} brand={brand} />
            </div>
          )}
          <div
            ref={stageRef}
            className="relative min-h-0 flex-1 overflow-auto bg-[#1c1d21] [background-image:radial-gradient(rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:20px_20px]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.stage) ed.clearSelection();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            <div data-stage="1" className="flex min-h-full min-w-full p-3 sm:p-7 lg:pb-24 lg:pt-20">
              <div ref={hostRef} className="m-auto shrink-0 bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.55)]" />
            </div>
            {(!ed.ready || ed.busy) && !ed.loadError && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[1px]">
                <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-neutral-600 shadow">
                  <Spinner /> {ed.busy || 'Preparing canvas…'}
                </span>
              </div>
            )}
            {ed.loadError && <div className="absolute inset-0 grid place-items-center p-6 text-sm text-red-600">{ed.loadError}</div>}
          </div>

          {/* desktop: floating contextual toolbar */}
          {ed.selection && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 hidden justify-center px-4 lg:flex">
              <div className="pointer-events-auto max-w-full overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                <ContextBar ed={ed} brand={brand} />
              </div>
            </div>
          )}

          {/* desktop: floating tool dock */}
          <nav aria-label="Editor tools" className="pointer-events-none absolute inset-x-0 bottom-5 z-10 hidden justify-center lg:flex">
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-black/5 bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.14)]">{dockButtons('dock')}</div>
          </nav>

          <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-white px-3 py-1 text-[11px] text-neutral-400 sm:hidden">
            <span>
              {ed.size.w}×{ed.size.h}
            </span>
            {status}
          </div>
        </main>

        {/* phones: tool bar along the bottom */}
        <nav aria-label="Editor tools" className="order-3 flex shrink-0 border-t border-black/5 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {dockButtons('bar')}
        </nav>
      </div>

      {ctxMenu && <CanvasContextMenu at={ctxMenu} ed={ed} design={design} sessionId={session?._id} onClose={() => setCtxMenu(null)} />}
      {animateOpen && <AnimateDialog ed={ed} design={design} onClose={() => setAnimateOpen(false)} />}
      {shareOpen && <ShareDialog ed={ed} design={design} onDesignChange={setDesign} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
