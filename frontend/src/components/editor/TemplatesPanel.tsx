'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, RotateCcw, Save, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getPointScriptures, createCarouselPost, createDesign, exportDesign, updateCarouselPost, createSavedTemplate, updateBrand, deleteSavedTemplate, deleteTemplateOverride, listSavedTemplates, saveTemplateOverride, updateSavedTemplate } from '@/lib/api';
import type { Brand, CarouselPostSlide, Design, SavedTemplate, Session, SessionDetail } from '@/lib/types';
import { SessionPicker, sessionSources } from './ContentPanel';
import { build, type TemplateChoice } from '../carousel/generate';
import { TEMPLATES } from './templates/catalog';
import { findPerson } from './dataFields';
import { renderThumb, type Template, type TemplateContent, type TemplateKind } from './templates/engine';
import type { DesignCanvas } from './useDesignCanvas';
import { Spinner, cx } from './ui';

// Thumbnails are rendered with the same code that applies a template, one at a time, so opening
// the panel never blocks the editor and previews always match the real result.
const thumbCache = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

function useThumb(template: Template, size: { w: number; h: number }, content: TemplateContent, skip = false) {
  const key = `${template.id}|${size.w}x${size.h}|${JSON.stringify([content.quote, content.author, content.title, content.part, content.service, content.points, content.useBrand, content.brand])}`;
  const [thumb, setThumb] = useState<{ key: string; url: string } | null>(() => (thumbCache.has(key) ? { key, url: thumbCache.get(key)! } : null));
  useEffect(() => {
    if (skip || thumbCache.has(key)) return;
    let alive = true;
    queue = queue
      .then(() => (alive ? renderThumb(template, size, content, 360) : null))
      .then((url) => {
        if (!url) return;
        thumbCache.set(key, url);
        if (alive) setThumb({ key, url });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return thumbCache.get(key) ?? (thumb?.key === key ? thumb.url : null);
}

function TemplateTile({
  template,
  size,
  content,
  onApply,
  disabled,
  savedThumb,
  badge,
  onDelete,
  name,
  blurb,
  aspect,
}: {
  template?: Template;
  size: { w: number; h: number };
  content: TemplateContent;
  onApply: () => void;
  disabled: boolean;
  savedThumb?: string;
  badge?: string;
  onDelete?: () => void;
  name?: string;
  blurb?: string;
  aspect?: { w: number; h: number };
}) {
  const live = useThumb(template ?? TEMPLATES[0], size, content, !template || Boolean(savedThumb));
  const url = savedThumb || live;
  const box = aspect ?? size;
  return (
    <div className="group relative text-left">
      <button type="button" disabled={disabled} onClick={onApply} className="block w-full text-left disabled:opacity-60" title={`Apply ${name ?? template?.name}`}>
        <span
          className="relative block overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 transition-shadow group-hover:shadow-md group-hover:ring-2 group-hover:ring-neutral-900"
          style={{ aspectRatio: `${box.w} / ${box.h}` }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name ?? template?.name} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-neutral-300">
              <Spinner />
            </span>
          )}
          {badge && <span className="absolute left-1.5 top-1.5 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-white">{badge}</span>}
        </span>
        <span className="mt-1.5 block text-xs font-semibold text-neutral-900">{name ?? template?.name}</span>
        {(blurb ?? template?.blurb) && <span className="block truncate text-[11px] text-neutral-500">{blurb ?? template?.blurb}</span>}
      </button>
      {onDelete && (
        <button type="button" aria-label="Delete template" onClick={onDelete} className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-neutral-500 opacity-0 shadow hover:text-red-600 group-hover:opacity-100 max-sm:opacity-100">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function hasBrand(b: Brand | null) {
  return Boolean(b && (b.logoUrl || b.logoLightUrl || b.pastorImageUrl || b.pastorName || b.churchName || b.socials.instagram || b.website));
}

const KIND_TABS: { key: TemplateKind; label: string }[] = [
  { key: 'quote', label: 'Quotes' },
  { key: 'excerpt', label: 'Points' },
  { key: 'title', label: 'Titles' },
  { key: 'give', label: 'Giving' },
];

const KIND_HINT: Record<TemplateKind, string> = {
  quote: 'One powerful line, beautifully set.',
  excerpt: 'Several takeaways from the message on one graphic.',
  title: 'Message and series title graphics.',
  give: 'Offering and giving cards with your account details.',
};

export function TemplatesPanel({ ed, design, session, brand }: { ed: DesignCanvas; design: Design; session: Session | null; brand: Brand | null }) {
  const router = useRouter();
  const [kind, setKind] = useState<TemplateKind>('quote');
  const [quote, setQuote] = useState(() => (design.text || ed.allText()).trim());
  // The preacher always comes from the session; the brand's pastor is only a fallback.
  const [author, setAuthor] = useState(() => session?.preacher || brand?.pastorName || '');
  // The word/message title (distinct from the service/session name).
  const [title, setTitle] = useState(() => session?.summary?.topics?.[0] ?? '');
  const [part, setPart] = useState('');
  const [giveTitle, setGiveTitle] = useState('Offering');
  const [service, setService] = useState(() => session?.title ?? '');
  const [pointsText, setPointsText] = useState(() => (session?.summary?.keyPoints ?? []).join('\n'));
  // Scripture reference suggested per point, keyed by the point's text so it survives editing the list.
  const [refMap, setRefMap] = useState<Record<string, string>>({});
  const [showRefs, setShowRefs] = useState(false);
  const [refsBusy, setRefsBusy] = useState(false);
  const [useBrand, setUseBrand] = useState(() => hasBrand(brand));
  const [showContent, setShowContent] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState('');
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [working, setWorking] = useState('');
  const [hidden, setHidden] = useState<string[]>(() => brand?.hiddenTemplates ?? []);

  useEffect(() => {
    listSavedTemplates().then(setSaved).catch(() => {});
  }, []);

  // Content changes re-render thumbnails; wait for a pause in typing first.
  const live = useMemo<TemplateContent>(
    () => ({
      quote,
      author,
      title: kind === 'give' ? giveTitle : title,
      part,
      service,
      points: pointsText.split('\n').map((p) => p.trim()).filter(Boolean),
      pointRefs: showRefs ? pointsText.split('\n').map((p) => p.trim()).filter(Boolean).map((p) => refMap[p] ?? '') : undefined,
      preacherImageUrl: findPerson(brand, author)?.imageUrl || '',
      brand,
      useBrand,
    }),
    [quote, author, title, giveTitle, kind, part, service, pointsText, brand, useBrand, showRefs, refMap]
  );
  const [content, setContent] = useState(live);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setContent(live), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [live]);

  const summary = session?.summary;
  const [pickedDetail, setPickedDetail] = useState<SessionDetail | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const ownSources: { label: string; items: string[] }[] = [
    { label: 'Key points', items: summary?.keyPoints ?? [] },
    { label: 'Declarations', items: summary?.declarations ?? [] },
    { label: 'Topics', items: summary?.topics ?? [] },
    { label: 'Post slides', items: (session?.carousel ?? []).map((s) => `${s.title}: ${s.body}`) },
  ].filter((s) => s.items.length > 0);
  // A session picked in the Points section takes over from the design's own session.
  const sources = pickedDetail ? sessionSources(pickedDetail) : ownSources;
  const activeSource = sources.find((s) => s.label === sourceLabel) ?? sources[0];
  const addPoint = (text: string) => setPointsText((t) => [...t.split('\n').map((x) => x.trim()).filter(Boolean), text].join('\n'));

  const overrides = useMemo(() => new Map(saved.filter((t) => t.baseId).map((t) => [t.baseId as string, t])), [saved]);
  const mine = saved.filter((t) => !t.baseId && t.kind === kind);
  const list = TEMPLATES.filter((t) => t.kind === kind && !hidden.includes(t.id));
  const hiddenInKind = TEMPLATES.filter((t) => t.kind === kind && hidden.includes(t.id));
  const active = ed.activeTemplateId;
  const activeBuiltIn = active ? TEMPLATES.find((t) => t.id === active) : undefined;
  const activeSaved = active && !activeBuiltIn ? saved.find((t) => t._id === active) : undefined;
  const activeOverride = activeBuiltIn ? overrides.get(activeBuiltIn.id) : undefined;

  function validate(k: TemplateKind) {
    if (k === 'excerpt' && live.points.length === 0) return 'Add a few points first (one per line).';
    if (k === 'quote' && !live.quote) return 'Add the quote text first.';
    if (k === 'title' && !live.title) return 'Add the title first.';
    return '';
  }

  async function run(label: string, fn: () => Promise<void>) {
    setWorking(label);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setWorking('');
    }
  }

  // One image holds at most 5 points; the rest go to further slides of a carousel.
  // Word Capsule's card is narrow; at its 32px type it holds 3 points, other layouts hold 5.
  const POINTS_PER_IMAGE = (activeBuiltIn?.id ?? activeSaved?.baseId ?? activeOverride?.baseId) === 'word-capsule' ? 3 : 5;
  const firstPage = useMemo(() => ({ ...live, points: live.points.slice(0, POINTS_PER_IMAGE), pointRefs: live.pointRefs?.slice(0, POINTS_PER_IMAGE) }), [live, POINTS_PER_IMAGE]);
  const pages = Math.ceil(live.points.length / POINTS_PER_IMAGE);

  // Re-pours the template that is already on the canvas with new content.
  async function reapply(c: TemplateContent) {
    try {
      if (activeSaved) await ed.applySavedTemplate(activeSaved, c);
      else if (activeBuiltIn) {
        if (activeOverride) await ed.applySavedTemplate(activeOverride, c);
        else await ed.applyTemplate(activeBuiltIn, c);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the design');
    }
  }

  async function suggestRefs() {
    const sid = pickedDetail?.session._id ?? session?._id;
    if (!sid) {
      setError('Pick a session under "Add points from a session" first, so the references can be matched to its scriptures.');
      return;
    }
    setError('');
    setRefsBusy(true);
    try {
      const pts = live.points;
      const { refs } = await getPointScriptures(sid, pts);
      setRefMap((m) => ({ ...m, ...Object.fromEntries(pts.map((p, i) => [p, refs[i] ?? ''])) }));
      setShowRefs(true);
      // Put them on the design right away instead of waiting for the template to be re-applied.
      await reapply({ ...firstPage, pointRefs: refs.slice(0, POINTS_PER_IMAGE) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find scripture references');
    } finally {
      setRefsBusy(false);
    }
  }

  async function makeCarousel() {
    const choice: TemplateChoice | null = activeSaved ? { kind: 'saved', saved: activeSaved } : activeBuiltIn ? (activeOverride ? { kind: 'saved', saved: activeOverride } : { kind: 'builtin', template: activeBuiltIn }) : null;
    if (!choice) {
      setError('Pick a points template below first, then make the carousel.');
      return;
    }
    if (pages > 10) {
      setError('A carousel holds 10 images (50 points). Remove some points first.');
      return;
    }
    setError('');
    setWorking('carousel');
    const created: CarouselPostSlide[] = [];
    try {
      const carousel = await createCarouselPost({ sessionId: session?._id, width: ed.size.w, height: ed.size.h, title: `${title || session?.title || 'Points'} · points` });
      try {
        for (let i = 0; i < pages; i += 1) {
          const chunk = live.points.slice(i * POINTS_PER_IMAGE, (i + 1) * POINTS_PER_IMAGE);
          const label = `Points ${i * POINTS_PER_IMAGE + 1}-${i * POINTS_PER_IMAGE + chunk.length}`;
          setWorking(`carousel:${i + 1}/${pages}`);
          const { design: d } = await createDesign({ sessionId: session?._id, source: 'blank', text: chunk.join('\n'), title: `${session?.title ?? 'Points'} · ${label}`.slice(0, 100), width: ed.size.w, height: ed.size.h });
          created.push({ kind: 'design', design: d._id, owned: true, label } as CarouselPostSlide);
          const built = await build(choice, ed.size, { ...live, points: chunk, pointRefs: live.pointRefs?.slice(i * POINTS_PER_IMAGE, (i + 1) * POINTS_PER_IMAGE), part: live.part || `${i + 1}/${pages}` });
          await exportDesign(d._id, { dataUrl: built.dataUrl, editorState: built.state });
        }
      } finally {
        await updateCarouselPost(carousel._id, { slides: created });
      }
      await ed.flush().catch(() => {});
      router.push(`/carousels/${carousel._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the carousel');
      setWorking('');
    }
  }

  async function apply(t: Template) {
    const problem = validate(t.kind);
    if (problem) {
      setShowContent(true);
      setError(problem);
      return;
    }
    setError('');
    try {
      const override = overrides.get(t.id);
      if (override) await ed.applySavedTemplate(override, firstPage);
      else await ed.applyTemplate(t, firstPage);
      setApplied(override ? `${t.name} (your edited version)` : t.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply that template');
    }
  }

  async function applySaved(t: SavedTemplate) {
    setError('');
    try {
      await ed.applySavedTemplate(t, firstPage);
      setApplied(t.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply that template');
    }
  }

  const saveToCurrent = () =>
    run('save', async () => {
      const snap = await ed.captureTemplate();
      if (activeBuiltIn) {
        const doc = await saveTemplateOverride(activeBuiltIn.id, { ...snap, name: activeBuiltIn.name, kind: activeBuiltIn.kind });
        setSaved((l) => [doc, ...l.filter((x) => x._id !== doc._id && x.baseId !== activeBuiltIn.id)]);
        setApplied(`${activeBuiltIn.name} saved for ${ed.size.w}×${ed.size.h} — it will use your edits from now on.`);
      } else if (activeSaved) {
        const doc = await updateSavedTemplate(activeSaved._id, snap);
        setSaved((l) => l.map((x) => (x._id === doc._id ? doc : x)));
        setApplied(`${activeSaved.name} saved for ${ed.size.w}×${ed.size.h}.`);
      }
    });

  const resetOverride = () =>
    run('reset', async () => {
      if (!activeBuiltIn) return;
      await deleteTemplateOverride(activeBuiltIn.id);
      setSaved((l) => l.filter((x) => x.baseId !== activeBuiltIn.id));
      setApplied(`${activeBuiltIn.name} restored to the original. Apply it again to see it.`);
    });

  const saveAsNew = () =>
    run('new', async () => {
      const snap = await ed.captureTemplate();
      const k = activeBuiltIn?.kind ?? activeSaved?.kind ?? kind;
      const doc = await createSavedTemplate({ ...snap, name: newName.trim() || 'My template', kind: k });
      setSaved((l) => [doc, ...l]);
      setNaming(false);
      setNewName('');
      setApplied(`Saved “${doc.name}” under My templates.`);
    });

  async function saveHidden(next: string[]) {
    const prev = hidden;
    setHidden(next);
    try {
      await updateBrand({ hiddenTemplates: next });
    } catch {
      setHidden(prev);
      setError('Could not save that change.');
    }
  }

  async function removeBuiltIn(t: Template) {
    if (!window.confirm(`Delete the built-in template “${t.name}”? You can bring it back from “Deleted templates” below.`)) return;
    await saveHidden([...hidden, t.id]);
  }

  async function removeSaved(t: SavedTemplate) {
    if (!window.confirm(`Delete “${t.name}”?`)) return;
    await deleteSavedTemplate(t._id).catch(() => {});
    setSaved((l) => l.filter((x) => x._id !== t._id));
  }

  const input = 'w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-500';
  const field = (label: string, value: string, set: (v: string) => void, placeholder?: string) => (
    <label className="block text-xs font-medium text-neutral-600">
      {label}
      <input value={value} onChange={(e) => set(e.target.value)} className={cx(input, 'mt-1')} placeholder={placeholder} />
    </label>
  );

  return (
    <div className="pb-6">
      <div className="px-4 pt-2">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-neutral-100 p-1 text-xs font-medium">
          {KIND_TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setKind(t.key)} className={cx('rounded-lg py-1.5', kind === t.key ? 'bg-white shadow-sm' : 'text-neutral-500')}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {KIND_HINT[kind]} Adapts to the current size ({ed.size.w}×{ed.size.h}).
        </p>

        {kind === 'excerpt' && (
          <div className="mt-3 rounded-xl border border-neutral-200 p-3">
            <p className="mb-2 text-xs text-neutral-500">Print the Bible verse under each point.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={suggestRefs}
                disabled={refsBusy || live.points.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {refsBusy ? <Spinner /> : null} {showRefs ? 'Refresh scripture references' : 'Add scripture references'}
              </button>
              {showRefs && (
                <>
                  <button type="button" onClick={() => void reapply(firstPage)} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700">
                    Update design
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRefs(false);
                      void reapply({ ...firstPage, pointRefs: undefined });
                    }}
                    className="text-xs text-neutral-500 underline hover:text-neutral-800"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
            {showRefs && live.points.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-neutral-500">
                {live.points.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{p}</span>
                    <input
                      value={refMap[p] ?? ''}
                      onChange={(e) => setRefMap((m) => ({ ...m, [p]: e.target.value }))}
                      placeholder="no reference"
                      className="w-32 shrink-0 rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-800 outline-none focus:border-neutral-500"
                    />
                  </li>
                ))}
              </ul>
            )}
            {!(activeBuiltIn || activeSaved) && <p className="mt-2 text-[11px] text-neutral-400">Pick a points template below to see them on the design.</p>}
          </div>
        )}

        {kind === 'excerpt' && pages > 1 && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs text-amber-900">
              You have {live.points.length} points. One image fits {POINTS_PER_IMAGE}, so this will be split into <b>{pages} images</b> as a carousel.
            </p>
            <button type="button" onClick={makeCarousel} disabled={Boolean(working) || Boolean(ed.busy)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
              {working.startsWith('carousel') ? (
                <>
                  <Spinner /> Building {working.split(':')[1] ?? ''}…
                </>
              ) : (
                <>Make carousel ({pages} images)</>
              )}
            </button>
            {!(activeBuiltIn || activeSaved) && <p className="mt-1.5 text-[11px] text-amber-800">Choose a points template below first — it styles every image.</p>}
          </div>
        )}

        {(activeBuiltIn || activeSaved) && (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-xs text-neutral-500">Current template</p>
            <p className="text-sm font-semibold text-neutral-900">
              {activeBuiltIn?.name ?? activeSaved?.name}
              {activeOverride && <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-white">Edited</span>}
            </p>
            <div className="mt-2 grid gap-1.5">
              <button type="button" disabled={Boolean(working)} onClick={saveToCurrent} className="flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
                {working === 'save' ? <Spinner /> : <Save size={13} />} Save my edits for {ed.size.w}×{ed.size.h}
              </button>
              <p className="text-[11px] leading-snug text-neutral-400">
                Each size is saved separately: tune the layout at another size and save again to give this template a version for it. Pictures that bleed off the edge stay exactly as you placed them.
              </p>
              {!naming ? (
                <button type="button" onClick={() => setNaming(true)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium hover:bg-neutral-100">
                  Save as a new template…
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveAsNew()} placeholder="Template name" className={cx(input, 'py-1.5')} />
                  <button type="button" disabled={Boolean(working)} onClick={saveAsNew} className="shrink-0 rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-white disabled:opacity-60">
                    {working === 'new' ? <Spinner /> : 'Save'}
                  </button>
                </div>
              )}
              {activeOverride && (
                <button type="button" disabled={Boolean(working)} onClick={resetOverride} className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900">
                  <RotateCcw size={12} /> Reset to the original design
                </button>
              )}
            </div>
          </div>
        )}
        {!activeBuiltIn && !activeSaved && (
          <div className="mt-3">
            {!naming ? (
              <button type="button" onClick={() => setNaming(true)} className="w-full rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                Save this design as a template…
              </button>
            ) : (
              <div className="flex gap-1.5">
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveAsNew()} placeholder="Template name" className={cx(input, 'py-1.5')} />
                <button type="button" disabled={Boolean(working)} onClick={saveAsNew} className="shrink-0 rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-white disabled:opacity-60">
                  {working === 'new' ? <Spinner /> : 'Save'}
                </button>
              </div>
            )}
          </div>
        )}

        <button type="button" onClick={() => setShowContent((v) => !v)} className="mt-3 flex w-full items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50">
          Customise content
          <ChevronDown size={16} className={cx('transition-transform', showContent && 'rotate-180')} />
        </button>
        {showContent && (
          <div className="mt-3 space-y-3">
            {kind === 'quote' && (
              <label className="block text-xs font-medium text-neutral-600">
                Quote
                <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={4} className={cx(input, 'mt-1')} />
              </label>
            )}
            {kind === 'give' && field('Headline', giveTitle, setGiveTitle, 'Offering')}
            {(kind === 'excerpt' || kind === 'title') && field('Word title', title, setTitle, 'e.g. Weeds of spiritual laziness')}
            {kind === 'title' && field('Series part', part, setPart, 'e.g. Pt. 4A')}
            {kind === 'excerpt' && (
              <>
                <label className="block text-xs font-medium text-neutral-600">
                  Points (one per line — more than 5 become a carousel)
                  <textarea value={pointsText} onChange={(e) => setPointsText(e.target.value)} rows={6} className={cx(input, 'mt-1')} />
                </label>
                <details className="rounded-lg border border-neutral-200 p-2.5" open={!!pickedDetail || sources.length > 0}>
                  <summary className="cursor-pointer text-xs font-medium text-neutral-600">Add points from a session</summary>
                  <div className="mt-2.5 space-y-2.5">
                    <SessionPicker onLoaded={(d) => { setPickedDetail(d); setSourceLabel(''); }} />
                    {sources.length > 0 && (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sources.map((s) => (
                            <button key={s.label} type="button" onClick={() => setSourceLabel(s.label)} className={cx('rounded-full border px-2.5 py-1 text-xs', activeSource?.label === s.label ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}>
                              {s.label} ({s.items.length})
                            </button>
                          ))}
                        </div>
                        {activeSource && (
                          <>
                            <button type="button" onClick={() => setPointsText(activeSource.items.join('\n'))} className="text-xs font-medium text-neutral-600 underline hover:text-neutral-900">
                              Use these as the points
                            </button>
                            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                              {activeSource.items.map((it, i) => (
                                <li key={i} className="flex items-start gap-2 rounded-lg border border-neutral-200 p-2">
                                  <p className="min-w-0 flex-1 text-xs leading-snug text-neutral-800">{it}</p>
                                  <button type="button" title="Add as a point" onClick={() => addPoint(it)} className="shrink-0 rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-700">
                                    Add
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </details>
              </>
            )}
            {kind !== 'give' && field('Service name', service, setService, 'e.g. Day 4 - Word 2')}
            {kind !== 'give' && field('Preacher', author, setAuthor, 'Taken from the session')}
            {kind === 'give' && (
              <p className="text-[11px] leading-snug text-neutral-500">
                Account number, account name and bank come from your{' '}
                <Link href="/brand" target="_blank" className="font-medium text-neutral-900 underline">
                  brand assets
                </Link>
                .
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-neutral-900">Use my brand</span>
            <span className="block text-xs text-neutral-500">
              {hasBrand(brand) ? 'Adds your logo, church name, pastor photo and accent colour' : (
                <>
                  Nothing set up yet.{' '}
                  <Link href="/brand" target="_blank" className="font-medium text-neutral-900 underline">
                    Add brand assets
                  </Link>
                </>
              )}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={useBrand}
            onClick={() => setUseBrand((v) => !v)}
            className={cx('mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors', useBrand ? 'bg-neutral-900' : 'bg-neutral-300')}
          >
            <span className={cx('block h-5 w-5 rounded-full bg-white transition-transform', useBrand && 'translate-x-5')} />
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {applied && !error && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-neutral-500">
            <Sparkles size={12} className="mt-0.5 shrink-0" /> <span>{applied}</span>
          </p>
        )}
      </div>

      {mine.length > 0 && (
        <>
          <h3 className="mt-5 px-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">My templates</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 px-4">
            {mine.map((t) => (
              <TemplateTile key={t._id} size={{ w: t.width, h: t.height }} content={content} disabled={Boolean(ed.busy)} onApply={() => applySaved(t)} savedThumb={t.thumb} name={t.name} blurb={[`${t.width}×${t.height}`, ...(t.variants ?? []).map((v) => `${v.width}×${v.height}`)].join(' · ')} onDelete={() => removeSaved(t)} />
            ))}
          </div>
          <h3 className="mt-5 px-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">Built-in</h3>
        </>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 px-4">
        {list.map((t) => {
          const o = overrides.get(t.id);
          return (
            <TemplateTile key={t.id} template={t} size={ed.size} content={content} disabled={Boolean(ed.busy)} onApply={() => apply(t)} savedThumb={o?.thumb} badge={o ? 'Edited' : undefined} aspect={o ? { w: o.width, h: o.height } : undefined} onDelete={() => removeBuiltIn(t)} />
          );
        })}
      </div>
      {hiddenInKind.length > 0 && (
        <div className="mt-5 px-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Deleted templates</h3>
          <ul className="mt-2 space-y-1">
            {hiddenInKind.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-xs">
                <span className="text-neutral-700">{t.name}</span>
                <button type="button" onClick={() => saveHidden(hidden.filter((x) => x !== t.id))} className="font-medium text-neutral-900 underline">
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
