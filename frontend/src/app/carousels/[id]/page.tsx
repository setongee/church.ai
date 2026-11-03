'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, ExternalLink, Download, Eye, Film, ImagePlus, Images, LayoutTemplate, Pencil, Plus, Save, Settings2, Sparkles, Trash2, Video } from 'lucide-react';
import {
  addCarouselAnimation,
  addCarouselMedia,
  assetUrl,
  createDesign,
  deleteDesign,
  exportDesign,
  generateCarouselPostCaption,
  getBrand,
  getCarouselPost,
  getSession,
  listSavedTemplates,
  listAllDesigns,
  listFinishedAnimations,
  publishCarouselPost,
  updateCarouselPost,
} from '@/lib/api';
import type { FinishedAnimation } from '@/lib/api';
import type { Brand, CarouselPost, CarouselPostSlide, Design, SavedTemplate, SessionDetail } from '@/lib/types';
import { CarouselOptions, DEFAULT_OPTIONS, resolveOptions, type OptionsState } from '@/components/carousel/CarouselOptions';
import { InstagramPreview } from '@/components/carousel/InstagramPreview';
import { regenerateCarousel, type CarouselSource } from '@/components/carousel/generate';
import { SIZE_PRESETS } from '@/components/editor/constants';
import { downloadBlob, exportSlidesZip, zipName, type ZipOptions } from '@/components/carousel/exportZip';
import { renderState } from '@/components/carousel/render';
import { Popover, Spinner, cx } from '@/components/editor/ui';
import { MusicPicker } from '@/components/MusicPicker';

const MAX = 10;

const toInput = (s: CarouselPostSlide) => ({ _id: s._id, kind: s.kind, design: s.design, owned: s.owned, imageUrl: s.imageUrl, videoUrl: s.videoUrl, label: s.label });

export default function CarouselBuilder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<CarouselPost | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [pickDesigns, setPickDesigns] = useState<Design[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [zipOpen, setZipOpen] = useState(false);
  const [zipOpts, setZipOpts] = useState<{ size: 'hd' | 'uhd' | 'hd720' | 'original' | 'original2x'; fit: ZipOptions['fit']; format: ZipOptions['format'] }>({ size: 'hd', fit: 'blur', format: 'png' });
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Animated designs from the editor that can be added as video slides (optionally just one design's, swapping a slide).
  const [animPicker, setAnimPicker] = useState<{ items: FinishedAnimation[]; design?: string; replaceIndex?: number } | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  // Settings: loaded the first time the panel is opened.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<{ opts: OptionsState; saved: SavedTemplate[]; detail: SessionDetail | null } | null>(null);
  const [rebuild, setRebuild] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    getCarouselPost(id)
      .then((p) => {
        if (!alive) return;
        setPost(p);
        setCaption(p.caption);
        setTitle(p.title);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Failed to load the carousel'));
    return () => {
      alive = false;
    };
  }, [id]);

  // Design slides are drawn from their saved state, so edits made in the editor always show here.
  useEffect(() => {
    if (!post) return;
    let alive = true;
    (async () => {
      for (const s of post.slides) {
        const info = s.designInfo;
        if (!info?.editorState) continue;
        const key = `${s._id}:${info.updatedAt}`;
        if (previews[key]) continue;
        try {
          const url = await renderState(info.editorState, { w: info.width, h: info.height }, { maxW: 480 });
          if (alive) setPreviews((p) => ({ ...p, [key]: url }));
        } catch {
          // falls back to the last exported image
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy('');
    }
  }

  const saveSlides = (slides: CarouselPostSlide[]) =>
    run('slides', async () => {
      // Show the new order at once, then settle on what the server stored.
      setPost((p) => (p ? { ...p, slides } : p));
      setPost(await updateCarouselPost(id, { slides: slides.map(toInput) }));
    });

  if (error && !post) return <main className="mx-auto w-full max-w-8xl px-4 sm:px-20 py-12 text-sm text-red-600">{error}</main>;
  if (!post) return <main className="mx-auto w-full flex max-w-8xl items-center gap-2 px-4 sm:px-20 py-12 text-sm text-neutral-400"><Spinner /> Loading…</main>;

  const slides = post.slides;
  const generated = slides.filter((s) => s.owned && s.kind === 'design').length;

  async function openSettings() {
    if (settingsOpen) return setSettingsOpen(false);
    setSettingsOpen(true);
    if (settings || !post) return;
    try {
      const [saved, b, detail] = await Promise.all([listSavedTemplates().catch(() => []), getBrand().catch(() => null), post.session ? getSession(post.session) : Promise.resolve(null)]);
      setBrand(b);
      const r = post.recipe;
      const preset = SIZE_PRESETS.find((p) => p.width === post.width && p.height === post.height);
      setSettings({
        saved,
        detail,
        opts: { ...DEFAULT_OPTIONS, ...(r ? { source: r.source as CarouselSource, count: r.count, cover: r.cover, closing: r.closing, bodyId: r.templateId, coverId: r.coverTemplateId ?? '' } : {}), sizeKey: preset?.key ?? DEFAULT_OPTIONS.sizeKey },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the settings');
    }
  }

  async function downloadZip() {
    if (!post) return;
    setError('');
    setZipProgress({ done: 0, total: post.slides.length });
    try {
      const target = zipOpts.size === 'hd' ? { w: 1920, h: 1080 } : zipOpts.size === 'uhd' ? { w: 3840, h: 2160 } : zipOpts.size === 'hd720' ? { w: 1280, h: 720 } : null;
      const blob = await exportSlidesZip(post.title, post.slides, { target, scale: zipOpts.size === 'original2x' ? 2 : 1, fit: zipOpts.fit, format: zipOpts.format }, (done, total) => setZipProgress({ done, total }));
      downloadBlob(blob, zipName(post.title));
      setZipOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the ZIP');
    } finally {
      setZipProgress(null);
    }
  }

  async function openPreview() {
    setPreviewOpen(true);
    if (!brand) getBrand().then(setBrand).catch(() => {});
  }

  async function applySettings() {
    if (!settings?.detail || !post) return;
    const r = resolveOptions(settings.opts, settings.saved);
    if (!r.body || !r.coverT || !r.size) return setError('Choose a template and a size first.');
    const msg = generated > 0 ? `Rebuild the ${generated} generated slide${generated === 1 ? '' : 's'}? Any edits you made to them are replaced. Slides you added yourself stay.` : 'Build the slides with these settings?';
    if (!window.confirm(msg)) return;
    setError('');
    setNotice('');
    setRebuild({ done: 0, total: 1 });
    try {
      await regenerateCarousel(id, post.slides, {
        detail: settings.detail,
        brand,
        source: settings.opts.source,
        count: settings.opts.count,
        cover: settings.opts.cover,
        closing: settings.opts.closing,
        size: { w: r.size.width, h: r.size.height },
        body: r.body.choice,
        coverChoice: r.coverT.choice,
        templateId: r.body.id,
        coverTemplateId: r.coverT.id,
        onProgress: (done, total) => setRebuild({ done, total }),
      });
      const fresh = await getCarouselPost(id);
      setPost(fresh);
      setPreviews({});
      setNotice('Carousel rebuilt.');
      setSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rebuild the carousel');
    } finally {
      setRebuild(null);
    }
  }
  const ratio = post.width / post.height;
  const asReel = post.postAs === 'reel';
  const ratioOk = asReel || (ratio >= 0.8 && ratio <= 1.91);
  const posted = Boolean(post.instagramPublishedAt);

  function move(i: number, to: number) {
    if (to < 0 || to >= slides.length || to === i) return;
    const next = [...slides];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item);
    saveSlides(next);
  }

  async function remove(i: number) {
    const s = slides[i];
    if (!window.confirm(`Remove slide ${i + 1}?`)) return;
    await saveSlides(slides.filter((_, k) => k !== i));
    if (s.kind === 'design' && s.owned && s.design) await deleteDesign(s.design).catch(() => {});
  }

  function duplicate(i: number) {
    if (slides.length >= MAX) return setError(`A carousel can have up to ${MAX} slides.`);
    const s = slides[i];
    run('slides', async () => {
      let copy: Partial<CarouselPostSlide> = { ...s, _id: undefined };
      if (s.kind === 'design' && s.design) {
        const { design } = await createDesign({ sessionId: post!.session, copyFrom: s.design });
        copy = { ...copy, design: design._id, owned: true };
      }
      const next = [...slides];
      next.splice(i + 1, 0, copy as CarouselPostSlide);
      setPost(await updateCarouselPost(id, { slides: next.map(toInput) }));
    });
  }

  const edit = (designId: string) => router.push(`/design/${designId}?returnTo=${encodeURIComponent(`/carousels/${id}`)}`);

  function addBlank() {
    if (slides.length >= MAX) return setError(`A carousel can have up to ${MAX} slides.`);
    run('slides', async () => {
      const { design } = await createDesign({ sessionId: post!.session, source: 'blank', width: post!.width, height: post!.height, title: `${post!.title} · slide ${slides.length + 1}` });
      await updateCarouselPost(id, { slides: [...slides.map(toInput), { kind: 'design', design: design._id, owned: true, label: `${slides.length + 1}` }] });
      edit(design._id);
    });
  }

  // One or several files at once; each becomes a slide, in the order picked.
  function upload(files: File[]) {
    const room = MAX - slides.length;
    if (room <= 0) return setError(`A carousel can have up to ${MAX} slides.`);
    const take = files.slice(0, room);
    run('upload', async () => {
      for (const [i, f] of take.entries()) {
        setBusy(`Adding ${i + 1}/${take.length}…`);
        setPost(await addCarouselMedia(id, f));
      }
      if (take.length < files.length) setNotice(`Added ${take.length}. A carousel holds up to ${MAX} slides, so the rest were left out.`);
    });
  }

  function openAnimations(opts?: { design?: string; replaceIndex?: number }) {
    if (opts?.replaceIndex === undefined && slides.length >= MAX) return setError(`A carousel can have up to ${MAX} slides.`);
    listFinishedAnimations()
      .then((items) => setAnimPicker({ items, ...opts }))
      .catch(() => setError('Could not load your animations.'));
  }

  function addAnimation(a: FinishedAnimation) {
    const at = animPicker?.replaceIndex;
    setAnimPicker(null);
    run('upload', async () => setPost(await addCarouselAnimation(id, { animationId: a._id, index: at ?? slides.length - 1, replace: at !== undefined })));
  }

  function addExisting(d: Design) {
    run('slides', async () => {
      setPickDesigns(null);
      setPost(await updateCarouselPost(id, { slides: [...slides.map(toInput), { kind: 'design', design: d._id, owned: false, label: d.title }] }));
    });
  }

  const saveCaption = () => caption !== post.caption && run('caption', async () => setPost(await updateCarouselPost(id, { caption })));
  const saveTitle = () => title.trim() && title !== post.title && run('title', async () => setPost(await updateCarouselPost(id, { title })));

  const writeCaption = () =>
    run('caption', async () => {
      const p = await generateCarouselPostCaption(id);
      setPost(p);
      setCaption(p.caption);
    });

  const saveRecipe = () =>
    run('recipe', async () => {
      const patch: Parameters<typeof updateCarouselPost>[1] = { savedAsRecipe: !post.savedAsRecipe };
      if (!post.recipe) patch.recipe = { source: 'keyPoints', count: Math.max(1, slides.filter((s) => s.kind === 'design').length - 2), templateId: '', cover: true, closing: true };
      setPost(await updateCarouselPost(id, patch));
      setNotice(post.savedAsRecipe ? 'Removed from your recipes.' : 'Saved as a recipe. Pick it when you start a new carousel to rebuild this structure for another service.');
    });

  function publish() {
    if (slides.length < (asReel ? 1 : 2)) return setError(asReel ? 'Add at least 1 slide.' : 'Add at least 2 slides.');
    if (!ratioOk) return setError('Slides must be between 4:5 and 1.91:1 for a carousel. Create a new carousel at a supported size.');
    if (!window.confirm(asReel ? `Publish these ${slides.length} slides to Instagram as a Reel now?` : `Publish ${slides.length} slides to Instagram now?`)) return;
    run('publish', async () => {
      // Re-export every design slide from its latest saved state so the post matches what is shown here.
      for (const [i, s] of slides.entries()) {
        if (s.kind !== 'design' || !s.designInfo) continue;
        setBusy(`Preparing slide ${i + 1}/${slides.length}…`);
        if (s.designInfo.editorState) {
          const dataUrl = await renderState(s.designInfo.editorState, { w: s.designInfo.width, h: s.designInfo.height });
          await exportDesign(s.design!, { dataUrl });
        } else if (!s.designInfo.exportedImageUrl) {
          throw new Error(`Slide ${i + 1} is empty. Open it in the editor first.`);
        }
      }
      setBusy('Publishing to Instagram… videos can take a few minutes.');
      setPost(await publishCarouselPost(id));
      setNotice('Published to Instagram.');
    });
  }

  const thumb = (s: CarouselPostSlide) => {
    if (s.kind === 'image') return { img: s.imageUrl ? assetUrl(s.imageUrl) : '' };
    if (s.kind === 'video') return { video: s.videoUrl ? assetUrl(s.videoUrl) : '' };
    const info = s.designInfo;
    return { img: (info && previews[`${s._id}:${info.updatedAt}`]) || (info?.exportedImageUrl ? assetUrl(info.exportedImageUrl) : '') };
  };

  return (
    <main className="mx-auto w-full max-w-8xl px-4 pb-24 pt-6 sm:px-20">
      <Link href="/carousels" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"><ArrowLeft size={15} /> Carousels</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} aria-label="Carousel name" className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight text-neutral-900 outline-none hover:border-neutral-200 focus:border-neutral-400" />
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {busy && busy !== 'slides' && <span className="flex items-center gap-1.5"><Spinner className="h-3 w-3" /> {busy.length > 12 ? busy : 'Saving…'}</span>}
          <span>{post.width}×{post.height} · {slides.length}/{MAX} slides</span>
          <button type="button" onClick={openPreview} disabled={slides.length === 0} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"><Eye size={13} /> Preview</button>
          <button type="button" onClick={() => setZipOpen(true)} disabled={slides.length === 0} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"><Download size={13} /> Export ZIP</button>
          <button type="button" onClick={openSettings} className={cx('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium', settingsOpen ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}><Settings2 size={13} /> Settings</button>
          <button type="button" onClick={saveRecipe} className={cx('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium', post.savedAsRecipe ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}>
            <Save size={13} /> {post.savedAsRecipe ? 'Saved as recipe' : 'Save as recipe'}
          </button>
        </div>
      </div>

      {!ratioOk && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This size can&apos;t be posted as an Instagram carousel (slides must be between 4:5 and 1.91:1). You can still post it as a Reel slideshow below.</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {settingsOpen && (
        <section className="mt-5 rounded-2xl bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Carousel settings</h2>
              <p className="text-xs text-neutral-500">Change what goes on the slides, how many, and the template, then apply to rebuild them.</p>
            </div>
          </div>
          {!settings ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !settings.detail ? (
            <p className="text-sm text-neutral-500">This carousel isn&apos;t linked to a session, so it can&apos;t be regenerated.</p>
          ) : (
            <>
              <CarouselOptions state={settings.opts} onChange={(p) => setSettings((cur) => (cur ? { ...cur, opts: { ...cur.opts, ...p } } : cur))} saved={settings.saved} detail={settings.detail} brand={brand} />
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
                <p className="text-xs text-neutral-500">{generated > 0 ? `${generated} generated slide${generated === 1 ? '' : 's'} will be replaced. Slides you added yourself stay.` : 'No generated slides yet.'}</p>
                <button type="button" onClick={applySettings} disabled={Boolean(rebuild)} className="flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
                  {rebuild ? <><Spinner /> Building {Math.min(rebuild.done + 1, rebuild.total)}/{rebuild.total}…</> : 'Apply & rebuild'}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {slides.map((s, i) => {
          const t = thumb(s);
          return (
            <li
              key={s._id}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null) move(dragFrom, i);
                setDragFrom(null);
              }}
              className={cx('overflow-hidden rounded-xl border bg-white', dragFrom === i ? 'border-neutral-900 opacity-60' : 'border-neutral-200')}
            >
              <div className="relative bg-neutral-100" style={{ aspectRatio: `${post.width} / ${post.height}` }}>
                {'video' in t && t.video ? (
                  <video src={t.video} muted loop playsInline controls className="h-full w-full object-cover" />
                ) : 'img' in t && t.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.img} alt={`Slide ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-neutral-400">{s.kind === 'design' ? 'Empty slide' : 'No media'}</div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">{i + 1}</span>
                {s.kind === 'video' && <span className="absolute right-2 top-2 rounded-full bg-black/65 p-1 text-white"><Video size={12} /></span>}
              </div>
              <div className="flex items-center justify-between gap-1 px-1.5 py-1.5">
                <span className="flex">
                  <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, i - 1)} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"><ChevronLeft size={15} /></button>
                  <button type="button" aria-label="Move later" disabled={i === slides.length - 1} onClick={() => move(i, i + 1)} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"><ChevronRight size={15} /></button>
                </span>
                <span className="flex">
                  {s.kind === 'design' && s.design && (
                    <button type="button" aria-label="Use animated version" title="Swap for an animated version" onClick={() => openAnimations({ design: s.design, replaceIndex: i })} className="rounded p-1 text-neutral-500 hover:bg-neutral-100"><Film size={14} /></button>
                  )}
                  {s.kind === 'design' && s.design && (
                    <button type="button" aria-label="Edit slide" title="Edit in the design editor" onClick={() => edit(s.design!)} className="rounded p-1 text-neutral-600 hover:bg-neutral-100"><Pencil size={14} /></button>
                  )}
                  <button type="button" aria-label="Duplicate slide" onClick={() => duplicate(i)} className="rounded p-1 text-neutral-500 hover:bg-neutral-100"><Copy size={14} /></button>
                  <button type="button" aria-label="Remove slide" onClick={() => remove(i)} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </span>
              </div>
            </li>
          );
        })}

        {slides.length < MAX && (
          <li className="self-start">
            <Popover
              className="w-60"
              trigger={(_, toggle) => (
                <button type="button" onClick={toggle} className="grid w-full place-items-center rounded-xl border-2 border-dashed border-neutral-300 text-sm font-medium text-neutral-500 hover:border-neutral-500 hover:text-neutral-800" style={{ aspectRatio: `${post.width} / ${post.height}` }}>
                  <span className="flex flex-col items-center gap-1.5">{busy === 'upload' || busy.startsWith('Adding') ? <Spinner /> : <Plus size={22} />} {busy.startsWith('Adding') ? busy : 'Add slide'}</span>
                </button>
              )}
            >
              {(close) => (
                <ul className="space-y-0.5 text-sm">
                  <li><button type="button" onClick={() => { close(); addBlank(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-neutral-100"><LayoutTemplate size={15} /> New design slide</button></li>
                  <li><button type="button" onClick={() => { close(); fileRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-neutral-100"><ImagePlus size={15} /> Upload images or videos</button></li>
                  <li><button type="button" onClick={() => { close(); openAnimations(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-neutral-100"><Film size={15} /> Animated design…</button></li>
                  <li><button type="button" onClick={() => { close(); listAllDesigns().then(setPickDesigns).catch(() => setError('Could not load your designs.')); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-neutral-100"><Images size={15} /> From my designs…</button></li>
                </ul>
              )}
            </Popover>
          </li>
        )}
      </ul>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) upload(f); e.target.value = ''; }} />
      <p className="mt-3 text-xs text-neutral-400">Drag slides to reorder. Slides are cropped to the first slide&apos;s shape by Instagram, so keep them all the same size. Videos are converted for Instagram (up to 60s each).</p>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="caption" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Caption</label>
            <button type="button" onClick={writeCaption} disabled={busy === 'caption'} className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 disabled:opacity-50"><Sparkles size={13} /> Write with AI</button>
          </div>
          <textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={saveCaption} rows={6} maxLength={2200} placeholder="Say something about this post…" className="w-full resize-y rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-500" />
          <p className="mt-1 text-right text-[11px] text-neutral-400">{caption.length}/2200</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 p-4">
            <p className="text-sm font-semibold text-neutral-900">Music</p>
            <p className="mb-3 mt-1 text-xs text-neutral-500">
              {asReel
                ? 'Plays over the whole Reel. The sound of any video slides is replaced by the music.'
                : 'Instagram can’t attach a song to a carousel from here, so the music is mixed into the video slides. Photo slides stay silent — post as a Reel slideshow to have the music over everything.'}
            </p>
            <MusicPicker
              value={post.music ?? null}
              disabled={Boolean(busy)}
              onChange={(music) => run('music', async () => setPost(await updateCarouselPost(id, { music })))}
              onAddCredit={(line) => {
                const next = caption.trim() ? `${caption.trim()}\n\n${line}` : line;
                setCaption(next);
                run('caption', async () => setPost(await updateCarouselPost(id, { caption: next })));
              }}
            />
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <p className="text-sm font-semibold text-neutral-900">Publish</p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 text-xs font-semibold">
              {([['carousel', 'Carousel'], ['reel', 'Reel slideshow']] as const).map(([k, l]) => (
                <button key={k} type="button" disabled={Boolean(busy)} onClick={() => (post.postAs ?? 'carousel') !== k && run('mode', async () => setPost(await updateCarouselPost(id, { postAs: k })))} className={cx('rounded-md px-2 py-1.5', (post.postAs ?? 'carousel') === k ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800')}>{l}</button>
              ))}
            </div>
            {asReel && (
              <label className="mt-3 block text-xs text-neutral-600">
                <span className="flex justify-between"><span>Time on each picture</span><span className="tabular-nums">{post.slideSeconds ?? 3}s</span></span>
                <input key={post.slideSeconds} type="range" min={1} max={8} step={0.5} defaultValue={post.slideSeconds ?? 3} disabled={Boolean(busy)} onPointerUp={(e) => run('mode', async () => setPost(await updateCarouselPost(id, { slideSeconds: Number((e.target as HTMLInputElement).value) })))} onKeyUp={(e) => run('mode', async () => setPost(await updateCarouselPost(id, { slideSeconds: Number((e.target as HTMLInputElement).value) })))} className="w-full accent-neutral-900" />
              </label>
            )}
            <p className="mt-2 text-xs text-neutral-500">{asReel ? `Plays all ${slides.length} slides in turn as one vertical Reel (up to 90 seconds).` : `Posts all ${slides.length} slides as one Instagram carousel.`}</p>
            {posted && post.instagramPermalink && (
              <a href={post.instagramPermalink} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline">Posted <ExternalLink size={13} /></a>
            )}
            <button type="button" onClick={publish} disabled={Boolean(busy) || slides.length < (asReel ? 1 : 2)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
              {busy === 'publish' || busy.startsWith('Prep') || busy.startsWith('Publishing') ? <><Spinner /> Working…</> : posted ? 'Publish again' : asReel ? 'Publish Reel to Instagram' : 'Publish to Instagram'}
            </button>
          </div>
        </div>
      </section>

      {zipOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !zipProgress && setZipOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <p className="text-sm font-semibold text-neutral-900">Export slides as a ZIP</p>
            <p className="mb-4 mt-0.5 text-xs text-neutral-500">Numbered files in slide order. Unzip it and add the folder to EasyWorship (or any presentation software).</p>
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Image size</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([['hd', '1920×1080'], ['uhd', '3840×2160 (4K)'], ['hd720', '1280×720'], ['original', 'Original'], ['original2x', 'Original ×2']] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setZipOpts((o) => ({ ...o, size: k }))} className={cx('rounded-lg border px-2 py-1.5 text-xs font-medium', zipOpts.size === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}>{l}</button>
                  ))}
                </div>
              </div>
              {zipOpts.size !== 'original' && zipOpts.size !== 'original2x' && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Slides that aren&apos;t 16:9</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([['blur', 'Blurred background'], ['black', 'Black bars']] as const).map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setZipOpts((o) => ({ ...o, fit: k }))} className={cx('rounded-lg border px-2 py-1.5 text-xs font-medium', zipOpts.fit === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}>{l}</button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-400">The slide is shown whole in the middle, never cropped.</p>
                </div>
              )}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Format</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {([['png', 'PNG (sharpest)'], ['jpeg', 'JPEG (smaller)']] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setZipOpts((o) => ({ ...o, format: k }))} className={cx('rounded-lg border px-2 py-1.5 text-xs font-medium', zipOpts.format === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50')}>{l}</button>
                  ))}
                </div>
              </div>
              {slides.some((s) => s.kind === 'video') && <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">Video slides are included as MP4 files, in their original shape.</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={Boolean(zipProgress)} onClick={() => setZipOpen(false)} className="rounded-full px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40">Cancel</button>
              <button type="button" onClick={downloadZip} disabled={Boolean(zipProgress)} className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
                {zipProgress ? <><Spinner /> {Math.min(zipProgress.done + 1, zipProgress.total)}/{zipProgress.total}…</> : 'Download ZIP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {animPicker && (() => {
        const list = animPicker.design ? animPicker.items.filter((a) => a.design._id === animPicker.design) : animPicker.items;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setAnimPicker(null)}>
            <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
              <p className="text-sm font-semibold text-neutral-900">{animPicker.design ? 'Animated versions of this slide' : 'Add an animated design'}</p>
              <p className="mb-3 mt-0.5 text-xs text-neutral-500">{animPicker.design ? 'Picking one replaces the still slide with the video.' : 'Animations you made with Animate in the design editor.'}</p>
              {list.length === 0 ? (
                <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No finished animations yet. Open a design in the editor, use Animate, then come back.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {list.map((a) => (
                    <button key={a._id} type="button" onClick={() => addAnimation(a)} className="overflow-hidden rounded-lg border border-neutral-200 text-left hover:ring-2 hover:ring-neutral-900">
                      <video src={assetUrl(a.videoUrl)} muted loop playsInline autoPlay className="w-full bg-neutral-900 object-cover" style={{ aspectRatio: `${a.width} / ${a.height}` }} />
                      <span className="block truncate px-2 py-1 text-[11px] text-neutral-600">{a.design.title} · {a.lengthSec}s</span>
                    </button>
                  ))}
                </div>
              )}
              {post.slides.some((s) => s.kind === 'design') && !animPicker.design && list.some((a) => a.width !== post.width || a.height !== post.height) && (
                <p className="mt-3 text-[11px] text-amber-700">Animations in a different shape than the carousel get cropped to fit.</p>
              )}
            </div>
          </div>
        );
      })()}

      {pickDesigns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setPickDesigns(null)}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <p className="mb-3 text-sm font-semibold text-neutral-900">Add one of your designs</p>
            {pickDesigns.length === 0 ? (
              <p className="text-sm text-neutral-500">You have no designs yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {pickDesigns.map((d) => (
                  <button key={d._id} type="button" onClick={() => addExisting(d)} className="overflow-hidden rounded-lg border border-neutral-200 text-left hover:ring-2 hover:ring-neutral-900">
                    <span className="grid place-items-center bg-neutral-100" style={{ aspectRatio: `${d.width} / ${d.height}` }}>
                      {d.exportedImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={assetUrl(d.exportedImageUrl)} alt={d.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="text-[11px] text-neutral-400">No preview</span>
                      )}
                    </span>
                    <span className="block truncate px-2 py-1 text-[11px] text-neutral-600">{d.title} · {d.width}×{d.height}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {previewOpen && (
        <InstagramPreview
          items={slides.map((s) => {
            const t = thumb(s);
            return 'video' in t ? { type: 'video' as const, src: t.video ?? '' } : { type: 'image' as const, src: t.img ?? '' };
          })}
          aspect={Math.min(1.91, Math.max(0.8, post.width / post.height))}
          caption={caption}
          name={brand?.socials.instagram ? brand.socials.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') : brand?.churchName || 'your_church'}
          logoUrl={brand?.logoUrl}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </main>
  );
}
