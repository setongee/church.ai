'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addPhotoReelPhotos,
  createPhotoReel,
  deletePhotoReel,
  enhancePhotoReelPhoto,
  generatePhotoCarousel,
  getPhotoTemplates,
  listPhotoReels,
  photoTemplatePreviews,
  previewPhotoReel,
  publishPhotoReelToInstagram,
  removePhotoReelPhoto,
  renderPhotoCarousel,
  renderPhotoReel,
  revertPhotoReelPhoto,
  savePhotoCarousel,
  updatePhotoReel,
  type PhotoReelPatch,
} from '@/lib/api';
import type { CarouselLayoutInfo, LowerThirdInfo, PhotoEnhancement, PhotoReel, PhotoSlide, PhotoTemplate } from '@/lib/types';
import { MusicPanel } from './reels/MusicPanel';
import { OutroEditor } from './reels/OutroEditor';
import { ProjectCard } from './reels/ProjectCard';
import { RenderPanel } from './reels/RenderPanel';
import { Overlay } from './reels/TemplateModal';
import { isBusyStatus, useBrand } from './reels/hooks';
import { fmtDuration, withDefaults } from './reels/options';
import { Field, PreviewFrame, Slider, Toggle } from './reels/ui';

const POLL_MS = 2000;
const TABS = [
  { id: 'photos', label: 'Photos & text' },
  { id: 'design', label: 'Design' },
  { id: 'music', label: 'Music & soundtrack' },
  { id: 'render', label: 'Render' },
  { id: 'carousel', label: 'Carousel' },
];

export function PhotoStudio({ focusId }: { focusId?: string }) {
  const [reels, setReels] = useState<PhotoReel[] | null>(null);
  const [templates, setTemplates] = useState<PhotoTemplate[]>([]);
  const [layouts, setLayouts] = useState<CarouselLayoutInfo[]>([]);
  const [enhancements, setEnhancements] = useState<PhotoEnhancement[]>([]);
  const [lowerThirds, setLowerThirds] = useState<LowerThirdInfo[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);

  const upsert = useCallback((updated: PhotoReel) => {
    setReels((prev) => prev?.map((r) => (r._id === updated._id ? { ...r, ...updated } : r)) ?? prev);
  }, []);

  useEffect(() => {
    Promise.all([listPhotoReels(), getPhotoTemplates()])
      .then(([list, t]) => {
        setReels(list);
        setTemplates(t.templates);
        setLayouts(t.layouts);
        setEnhancements(t.enhancements);
        setLowerThirds(t.lowerThirds);
        setOpenId(list.find((r) => r._id === focusId)?._id ?? list[0]?._id ?? null);
      })
      .catch((err) => {
        setReels([]);
        setError(err instanceof Error ? err.message : 'Failed to load');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyBusy = reels?.some((r) => isBusyStatus(r.status) || isBusyStatus(r.carousel?.status ?? '')) ?? false;
  useEffect(() => {
    if (!anyBusy) return;
    const interval = setInterval(() => {
      listPhotoReels()
        .then(setReels)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [anyBusy]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError('Give the reel a title.');
    setCreating(true);
    try {
      let reel = await createPhotoReel(title.trim());
      if (files.length) reel = await addPhotoReelPhotos(reel._id, files);
      setReels((prev) => [reel, ...(prev ?? [])]);
      setOpenId(reel._id);
      setTitle('');
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the reel');
    } finally {
      setCreating(false);
    }
  }

  if (reels === null) return <p className="text-sm text-neutral-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="rounded-2xl bg-white p-5">
        <h2 className="text-base font-semibold text-neutral-900">New photo reel</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-neutral-500">
          Throw in the photos from a service or event. They become an animated reel with an opening title and a closing card, and you can also turn them into a ready-to-post carousel.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-sm font-medium text-neutral-700">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday Service Recap" maxLength={80} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none" />
          </label>
          <label className="block text-sm font-medium text-neutral-700">
            Photos <span className="font-normal text-neutral-400">(you can add more later)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
            />
          </label>
          <button type="submit" disabled={creating} className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {creating ? (files.length ? `Uploading ${files.length}…` : 'Creating…') : 'Create'}
          </button>
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>

      {reels.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">No photo reels yet.</p>}

      <div className="space-y-4">
        {reels.map((r) => (
          <PhotoReelCard
            key={r._id}
            reel={r}
            templates={templates}
            layouts={layouts}
            enhancements={enhancements}
            lowerThirds={lowerThirds}
            open={openId === r._id}
            onToggle={() => setOpenId(openId === r._id ? null : r._id)}
            onChange={upsert}
            onDelete={() => {
              deletePhotoReel(r._id)
                .then(() => setReels((prev) => prev?.filter((x) => x._id !== r._id) ?? prev))
                .catch((err) => setError(err instanceof Error ? err.message : 'Failed to delete'));
            }}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- one photo reel

const toDraft = (r: PhotoReel) => ({
  title: r.title,
  template: r.template,
  intro: r.intro,
  lengthSec: r.lengthSec ?? 8,
  colors: r.colors ?? { accent: '', tintA: '', tintB: '' },
  lowerThird: r.lowerThird ?? { style: 'none', title: '', subtitle: '', left: '', right: '' },
  options: withDefaults(r.options),
});
type Draft = ReturnType<typeof toDraft>;

const patchOf = (d: Draft): PhotoReelPatch => ({ title: d.title, template: d.template, intro: d.intro, lengthSec: d.lengthSec, colors: d.colors, lowerThird: d.lowerThird, options: d.options });

function PhotoReelCard({
  reel,
  templates,
  layouts,
  enhancements,
  lowerThirds,
  open,
  onToggle,
  onChange,
  onDelete,
  onError,
}: {
  reel: PhotoReel;
  templates: PhotoTemplate[];
  layouts: CarouselLayoutInfo[];
  enhancements: PhotoEnhancement[];
  lowerThirds: LowerThirdInfo[];
  open: boolean;
  onToggle: () => void;
  onChange: (r: PhotoReel) => void;
  onDelete: () => void;
  onError: (m: string) => void;
}) {
  const [tab, setTab] = useState('photos');
  const [draft, setDraft] = useState(() => toDraft(reel));
  const [saving, setSaving] = useState(false);
  const [previewAt, setPreviewAt] = useState(4);
  const brand = useBrand();
  const busy = isBusyStatus(reel.status) || isBusyStatus(reel.carousel?.status ?? '');
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(reel));
  const stale = Boolean(reel.videoUrl) && (reel.status !== 'done' || dirty);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const updated = await updatePhotoReel(reel._id, patchOf(draft));
      onChange(updated);
      setDraft(toDraft(updated));
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function render() {
    onError('');
    if (dirty && !(await save())) return;
    try {
      onChange(await renderPhotoReel(reel._id));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start rendering');
    }
  }

  const previewKey = JSON.stringify([reel._id, draft, reel.images.map((i) => i._id), previewAt]);
  const previewLoad = async () => (await previewPhotoReel(reel._id, patchOf(draft), previewAt)).url;
  const caption = [draft.intro.title || draft.title, draft.intro.subtitle, draft.options.texts.churchName || brand?.churchName || ''].filter(Boolean).join('\n\n');
  const length = reel.videoSec ?? 0;

  return (
    <ProjectCard
      badge="▣"
      title={draft.title}
      subtitle={`${reel.images.length} photo${reel.images.length === 1 ? '' : 's'} · ${fmtDuration(length)}${draft.options.music.trackId ? ' · ♪ music' : ''} · ${templates.find((t) => t.id === draft.template)?.name ?? ''}`}
      status={reel.status}
      progress={reel.progress}
      stale={stale}
      open={open}
      onToggle={onToggle}
      tab={tab}
      onTab={setTab}
      tabs={TABS}
      dirty={dirty}
      saving={saving}
      onSave={save}
      onDiscard={() => setDraft(toDraft(reel))}
      onDelete={onDelete}
      deleteDisabled={busy}
    >
      {tab === 'photos' && <PhotosTab reel={reel} draft={draft} set={set} busy={busy} enhancements={enhancements} onChange={onChange} onError={onError} />}
      {tab === 'design' && <DesignTab reel={reel} draft={draft} setDraft={setDraft} templates={templates} lowerThirds={lowerThirds} previewLoad={previewLoad} previewKey={previewKey} previewAt={previewAt} onPreviewAt={setPreviewAt} />}
      {tab === 'music' && (
        <div className="space-y-4">
          <MusicPanel options={draft.options} onOptions={(o) => set('options', o)} mixTarget={{}} hideMix />
          <p className="text-xs text-neutral-400">Music plays under the photos at a comfortable level and carries on through the closing card. Use Listen to audition a track.</p>
        </div>
      )}
      {tab === 'render' && (
        <RenderPanel
          key={caption}
          status={reel.status}
          progress={reel.progress}
          error={reel.error}
          videoUrl={reel.videoUrl}
          durationSec={reel.durationSec}
          plannedSec={length}
          stale={stale}
          saving={saving}
          onRender={render}
          previewLoad={previewLoad}
          previewKey={previewKey}
          fileName={draft.title.replace(/[\\/:*?"<>|]/g, '')}
          defaultCaption={caption}
          instagramPermalink={reel.instagramPermalink}
          onPublish={async (c) => onChange(await publishPhotoReelToInstagram(reel._id, c))}
        />
      )}
      {tab === 'carousel' && <CarouselTab reel={reel} layouts={layouts} dirtyReel={dirty} options={draft.options} onOptions={(o) => set('options', o)} onChange={onChange} onError={onError} />}
    </ProjectCard>
  );
}

// ----------------------------------------------------------------------------- photos & text

function PhotosTab({ reel, draft, set, busy, enhancements, onChange, onError }: { reel: PhotoReel; draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; busy: boolean; enhancements: PhotoEnhancement[]; onChange: (r: PhotoReel) => void; onError: (m: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuSide, setMenuSide] = useState<'left' | 'right'>('right');
  const [working, setWorking] = useState<string | null>(null);
  const [compare, setCompare] = useState<string | null>(null);
  const [extra, setExtra] = useState('');
  const [bulkPreset, setBulkPreset] = useState('polish');
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const stopBulk = useRef(false);
  const input = useRef<HTMLInputElement | null>(null);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    onError('');
    setUploading(true);
    try {
      const updated = await addPhotoReelPhotos(reel._id, Array.from(list));
      onChange(updated);
      if (updated.warnings?.length) onError(updated.warnings.join(' · '));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = reel.images.map((i) => i._id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      onChange(await updatePhotoReel(reel._id, { imageOrder: ids }));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reorder');
    }
  }

  // One photo through the image model. The edit always starts from the original upload.
  async function enhance(imageId: string, preset: string, withCompare = true) {
    onError('');
    setMenuFor(null);
    setWorking(imageId);
    try {
      onChange(await enhancePhotoReelPhoto(reel._id, imageId, preset, extra || undefined));
      if (withCompare) setCompare(imageId);
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'AI editing failed');
      return false;
    } finally {
      setWorking(null);
    }
  }

  async function revert(imageId: string) {
    setMenuFor(null);
    setWorking(imageId);
    try {
      onChange(await revertPhotoReelPhoto(reel._id, imageId));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to revert');
    } finally {
      setWorking(null);
    }
  }

  async function enhanceAll() {
    const todo = reel.images.filter((i) => !i.enhancedWith);
    if (todo.length === 0) return;
    const label = enhancements.find((e) => e.id === bulkPreset)?.label ?? bulkPreset;
    if (!confirm(`Run "${label}" on ${todo.length} photo${todo.length === 1 ? '' : 's'}?\n\nEach photo is one call to your AI image model (roughly 20-60 seconds and a small charge each). Originals are kept, so you can revert any of them.`)) return;
    stopBulk.current = false;
    setBulk({ done: 0, total: todo.length });
    for (let n = 0; n < todo.length; n += 1) {
      if (stopBulk.current) break;
      const ok = await enhance(todo[n]._id, bulkPreset, false);
      setBulk({ done: n + 1, total: todo.length });
      if (!ok) break;
    }
    setBulk(null);
  }

  async function remove(imageId: string) {
    try {
      onChange(await removePhotoReelPhoto(reel._id, imageId));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to remove');
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Photos</h3>
            <p className="mt-0.5 text-xs text-neutral-500">They play in this order. Up to 60 photos, JPEG, PNG or WebP.</p>
          </div>
          <label className={`cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800 ${busy || uploading ? 'pointer-events-none opacity-50' : ''}`}>
            {uploading ? 'Uploading…' : '+ Add photos'}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={busy || uploading} onChange={(e) => upload(e.target.files)} />
          </label>
        </div>

        {reel.images.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 px-4 py-3">
            <span className="text-sm font-medium text-violet-900">✨ AI photo editing</span>
            <span className="text-xs text-violet-800/80">Click ✨ on any photo, or edit them all:</span>
            <select value={bulkPreset} onChange={(e) => setBulkPreset(e.target.value)} disabled={bulk !== null} className="rounded-md border border-violet-200 bg-white px-2 py-1 text-xs">
              {enhancements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            {bulk ? (
              <>
                <span className="text-xs text-violet-900">
                  Editing {bulk.done}/{bulk.total}…
                </span>
                <button onClick={() => (stopBulk.current = true)} className="text-xs text-violet-900 underline">
                  Stop after this one
                </button>
              </>
            ) : (
              <button onClick={enhanceAll} disabled={busy || working !== null || reel.images.every((i) => i.enhancedWith)} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40">
                Enhance all
              </button>
            )}
            <span className="w-full text-[11px] text-violet-800/70">
              The AI redraws each photo, so faces can shift slightly - always check the before/after. Originals are kept and every edit can be reverted.
            </span>
          </div>
        )}

        {reel.images.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">No photos yet — add some to get started.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {reel.images.map((img, i) => (
              <li key={img._id} className="group relative aspect-[3/4] rounded-xl border border-neutral-200 bg-neutral-100">
                <div className="h-full w-full overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </div>
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">{i + 1}</span>
                {img.enhancedWith && <span className="absolute left-1.5 top-7 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">AI</span>}
                <button
                  onClick={(e) => {
                    // Open towards whichever side has room, so the menu never runs off the card.
                    const r = e.currentTarget.closest('li')!.getBoundingClientRect();
                    const bounds = e.currentTarget.closest('section')!.getBoundingClientRect();
                    setMenuSide(r.right - 264 < bounds.left ? 'left' : 'right');
                    setMenuFor(menuFor === img._id ? null : img._id);
                  }}
                  disabled={busy || working !== null || bulk !== null}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-white disabled:opacity-40"
                  aria-label="AI edit this photo"
                >
                  ✨
                </button>
                {working === img._id && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/60 text-xs text-white">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Editing…
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-between rounded-b-xl bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <span>
                    <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="px-1.5 text-white disabled:opacity-30" aria-label="Move earlier">←</button>
                    <button onClick={() => move(i, 1)} disabled={busy || i === reel.images.length - 1} className="px-1.5 text-white disabled:opacity-30" aria-label="Move later">→</button>
                  </span>
                  <button onClick={() => remove(img._id)} disabled={busy} className="px-1.5 text-white hover:text-red-300 disabled:opacity-30" aria-label="Remove photo">✕</button>
                </div>

                {menuFor === img._id && (
                  <div className={`absolute top-9 z-30 w-64 rounded-xl border border-neutral-200 bg-white p-2 text-left shadow-xl ${menuSide === 'left' ? 'left-0' : 'right-0'}`}>
                    <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">AI edit</p>
                    {enhancements.map((e) => (
                      <button key={e.id} onClick={() => enhance(img._id, e.id)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-neutral-50">
                        <span className="block text-sm font-medium text-neutral-900">{e.label}</span>
                        <span className="block text-[11px] text-neutral-500">{e.hint}</span>
                      </button>
                    ))}
                    <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={200} placeholder="Extra instruction (optional)" className="mx-1 mb-1 mt-2 w-[calc(100%-0.5rem)] rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
                    {img.enhancedWith && (
                      <button onClick={() => revert(img._id)} className="mt-1 block w-full rounded-lg border-t border-neutral-100 px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                        Revert to original
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
          Reel name
          <input value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={80} className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-semibold focus:border-neutral-900 focus:outline-none" />
        </label>
        <div className="sm:col-span-2">
          <Toggle checked={draft.intro.enabled} onChange={(v) => set('intro', { ...draft.intro, enabled: v })} hint="A title that opens the reel over the first photos.">
            Opening title
          </Toggle>
        </div>
        <label className={`block text-sm font-medium text-neutral-700 ${draft.intro.enabled ? '' : 'opacity-40'}`}>
          Title text
          <input value={draft.intro.title} onChange={(e) => set('intro', { ...draft.intro, title: e.target.value })} disabled={!draft.intro.enabled} maxLength={80} placeholder={draft.title} className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none" />
        </label>
        <label className={`block text-sm font-medium text-neutral-700 ${draft.intro.enabled ? '' : 'opacity-40'}`}>
          Subtitle
          <input value={draft.intro.subtitle} onChange={(e) => set('intro', { ...draft.intro, subtitle: e.target.value })} disabled={!draft.intro.enabled} maxLength={100} placeholder="Day 2 · Morning Session" className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none" />
        </label>
        <div className="sm:col-span-2">
          <Slider
            label="Reel length"
            value={draft.lengthSec}
            min={4}
            max={30}
            step={1}
            format={(v) => `${v}s`}
            onChange={(v) => set('lengthSec', v)}
            hint={
              reel.images.length === 0
                ? 'The photos share this time equally.'
                : draft.lengthSec / reel.images.length < 0.8
                  ? `That's ${(Math.max(0.5, draft.lengthSec / reel.images.length)).toFixed(1)}s per photo - quick! Raise the length or use fewer photos.`
                  : `${reel.images.length} photo${reel.images.length === 1 ? '' : 's'} · about ${(draft.lengthSec / reel.images.length).toFixed(1)}s each.`
            }
          />
        </div>
      </section>

      {compare && (() => {
        const img = reel.images.find((i) => i._id === compare);
        if (!img) return null;
        return (
          <Overlay onClose={() => setCompare(null)} wide>
            <div className="p-5">
              <h2 className="text-base font-semibold text-neutral-900">Before &amp; after</h2>
              <p className="mt-0.5 text-xs text-neutral-500">Check the faces and details carefully - the AI redraws the whole picture.</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {[
                  ['Original', img.originalUrl ?? img.url],
                  ['AI edit', img.url],
                ].map(([label, src]) => (
                  <figure key={label}>
                    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={label} className="max-h-[70vh] w-full object-contain" />
                    </div>
                    <figcaption className="mt-1.5 text-center text-xs font-medium text-neutral-600">{label}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-4">
                <button onClick={() => { setCompare(null); setMenuFor(img._id); }} className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
                  Try another style
                </button>
                <button onClick={async () => { await revert(img._id); setCompare(null); }} className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
                  Revert to original
                </button>
                <button onClick={() => setCompare(null)} className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
                  Keep the edit
                </button>
              </div>
            </div>
          </Overlay>
        );
      })()}
    </div>
  );
}

// --------------------------------------------------------------------------------------- design

function DesignTab({ reel, draft, setDraft, templates, lowerThirds, previewLoad, previewKey, previewAt, onPreviewAt }: { reel: PhotoReel; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; templates: PhotoTemplate[]; lowerThirds: LowerThirdInfo[]; previewLoad: () => Promise<string>; previewKey: string; previewAt: number; onPreviewAt: (n: number) => void }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const brand = useBrand();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const o = draft.options;
  const tpl = templates.find((t) => t.id === draft.template);
  const setOptions = (opt: Draft['options']) => setDraft((d) => ({ ...d, options: opt }));

  // Thumbnails are real frames of THIS reel's photos in each style (one shared browser, ~10s).
  const thumbKey = useMemo(() => JSON.stringify([reel.images.map((i) => i._id), draft.colors]), [reel.images, draft.colors]);
  const patchRef = useRef(patchOf(draft));
  useEffect(() => {
    patchRef.current = patchOf(draft);
  });
  useEffect(() => {
    if (reel.images.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // Already-rendered thumbnails show immediately; only the missing ones wait on a render.
        const cached = await photoTemplatePreviews(reel._id, patchRef.current, true);
        if (cancelled) return;
        setThumbs(Object.fromEntries(cached.map((x) => [x.id, x.url])));
        if (cached.length >= templates.length) return;
        setLoadingThumbs(true);
        const list = await photoTemplatePreviews(reel._id, patchRef.current);
        if (!cancelled) setThumbs(Object.fromEntries(list.map((x) => [x.id, x.url])));
      } catch (e) {
        console.warn('style thumbnails failed', e);
      } finally {
        if (!cancelled) setLoadingThumbs(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [thumbKey, reel._id, reel.images.length, templates.length]);

  const colorField = (key: 'accent' | 'tintA' | 'tintB', label: string, fallback: string) => (
    <label className="flex items-center gap-2 text-xs text-neutral-600">
      <input type="color" value={draft.colors[key] || fallback} onChange={(e) => setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: e.target.value } }))} className="h-8 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-0.5" />
      {label}
    </label>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-8">
        <Field title="Style" hint="Each one is a different way of moving your photos. These thumbnails use your own photos.">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {templates.map((t) => (
              <button key={t.id} onClick={() => setDraft((d) => ({ ...d, template: t.id }))} className={`rounded-xl border p-1.5 text-left transition ${draft.template === t.id ? 'border-neutral-900 ring-2 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-400'}`} title={t.description}>
                <div className="aspect-[9/16] overflow-hidden rounded-md bg-neutral-200">
                  {thumbs[t.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[t.id]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-neutral-400">{reel.images.length === 0 ? 'Add photos' : loadingThumbs ? 'Rendering…' : ''}</div>
                  )}
                </div>
                <p className="mt-1.5 truncate px-0.5 text-xs font-medium text-neutral-900">{t.name}</p>
              </button>
            ))}
          </div>
          {tpl && <p className="mt-3 text-xs text-neutral-500">{tpl.description}</p>}
        </Field>

        <Field title="Colours" hint="Override the style's colours. The tint washes over every photo.">
          <div className="flex flex-wrap items-center gap-5">
            {colorField('accent', 'Accent', tpl?.palette.accent ?? '#e0561f')}
            {colorField('tintA', 'Tint (warm)', tpl?.palette.tintA ?? '#ff7a1a')}
            {colorField('tintB', 'Tint (cool)', tpl?.palette.tintB ?? '#2a6df4')}
            {(draft.colors.accent || draft.colors.tintA || draft.colors.tintB) && (
              <button onClick={() => setDraft((d) => ({ ...d, colors: { accent: '', tintA: '', tintB: '' } }))} className="text-xs text-neutral-500 underline hover:text-neutral-800">
                Reset colours
              </button>
            )}
          </div>
        </Field>

        <Field title="Lower third" hint="A caption bar across the bottom of the photos - an event name, time and place. Off unless you want it. It also appears on the carousel photo slides.">
          <div className="flex flex-wrap gap-2">
            {lowerThirds.map((l) => (
              <button key={l.id} onClick={() => setDraft((d) => ({ ...d, lowerThird: { ...d.lowerThird, style: l.id } }))} title={l.hint} className={`rounded-md border px-3.5 py-1.5 text-xs font-medium ${draft.lowerThird.style === l.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}>
                {l.label}
              </button>
            ))}
          </div>
          {draft.lowerThird.style !== 'none' && (
            <>
              <p className="mt-2 text-xs text-neutral-500">{lowerThirds.find((l) => l.id === draft.lowerThird.style)?.hint}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(
                  draft.lowerThird.style === 'bar'
                    ? ([['title', 'Title (on the logo tab)', draft.intro.title || draft.title], ['subtitle', 'Small line under it', 'Tarry'], ['left', 'Left text', 'MDWK / Tarry'], ['right', 'Right text', 'Queens Park Events Centre, VI']] as const)
                    : draft.lowerThird.style === 'block'
                      ? ([['title', 'Big title', draft.intro.title || draft.title], ['subtitle', 'Script lead-in word', 'One'], ['left', 'Time / session (big)', 'Morning'], ['right', 'Address', '6A Cocoa Industries Rd, Ogba, Lagos']] as const)
                      : ([['title', 'Label', 'Day 2 Morning Session'], ['subtitle', 'Wordmark', 'FaithConf'], ['right', 'Address strip', 'Sango-Eleyele Road, Ibadan']] as const)
                ).map(([key, label, ph]) => (
                  <label key={key} className="block text-xs font-medium text-neutral-600">
                    {label}
                    <input value={draft.lowerThird[key]} onChange={(e) => setDraft((d) => ({ ...d, lowerThird: { ...d.lowerThird, [key]: e.target.value } }))} placeholder={ph} maxLength={90} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900 focus:border-neutral-900 focus:outline-none" />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">Your church logo moves into the overlay while it is on.</p>
            </>
          )}
        </Field>

        <Field title="Text">
          <label className="block text-xs font-medium text-neutral-600">
            Church name <span className="font-normal text-neutral-400">(used on the closing card)</span>
            <input value={o.texts.churchName} onChange={(e) => setOptions({ ...o, texts: { ...o.texts, churchName: e.target.value } })} placeholder={brand?.churchName || 'Your church'} maxLength={80} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal focus:border-neutral-900 focus:outline-none" />
          </label>
          <div className="mt-4 space-y-3">
            <Slider label="Title size" value={o.sizes.headline} min={0.5} max={1.8} step={0.05} format={pct} onChange={(v) => setOptions({ ...o, sizes: { ...o.sizes, headline: v } })} />
            <Slider label="Subtitle size" value={o.sizes.info} min={0.5} max={1.8} step={0.05} format={pct} onChange={(v) => setOptions({ ...o, sizes: { ...o.sizes, info: v } })} />
          </div>
          <div className="mt-4">
            <Toggle checked={o.show.showLogo ?? true} onChange={(v) => setOptions({ ...o, show: { ...o.show, showLogo: v } })}>
              Show the church logo along the bottom
            </Toggle>
          </div>
        </Field>

      </div>

      <div>
        <div className="lg:sticky lg:top-4">
          <PreviewFrame load={previewLoad} watch={previewKey} />
          <label className="mx-auto mt-3 flex max-w-[360px] items-center gap-2 text-xs text-neutral-500">
            Frame at
            <input type="range" min={0.5} max={Math.max(1, Math.floor(reel.videoSec ?? 10))} step={0.5} value={previewAt} onChange={(e) => onPreviewAt(Number(e.target.value))} className="flex-1 accent-neutral-900" />
            {previewAt.toFixed(1)}s
          </label>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ carousel

function CarouselTab({ reel, layouts, dirtyReel, options, onOptions, onChange, onError }: { reel: PhotoReel; layouts: CarouselLayoutInfo[]; dirtyReel: boolean; options: Draft['options']; onOptions: (o: Draft['options']) => void; onChange: (r: PhotoReel) => void; onError: (m: string) => void }) {
  const [count, setCount] = useState(Math.max(3, reel.carousel.slides.length || 6));
  const [slides, setSlides] = useState<PhotoSlide[]>(reel.carousel.slides);
  const [busy, setBusy] = useState<'' | 'generate' | 'save' | 'render'>('');
  const [allSec, setAllSec] = useState(8);
  const cstatus = reel.carousel.status ?? 'idle';
  const rendering = cstatus === 'queued' || cstatus === 'rendering';
  const [picking, setPicking] = useState<{ slide: number; slot: number } | null>(null);
  const strip = (list: PhotoSlide[]) => JSON.stringify(list.map(({ layout, images, title, subtitle, lengthSec }) => ({ layout, images, title, subtitle, lengthSec })));
  const dirty = strip(slides) !== strip(reel.carousel.slides);
  const rendered = reel.carousel.renderedUrls;
  const layoutOf = (id: string) => layouts.find((l) => l.id === id);

  async function run<T>(kind: 'generate' | 'save' | 'render', fn: () => Promise<T>) {
    onError('');
    setBusy(kind);
    try {
      return await fn();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Something went wrong');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function generate() {
    if (slides.length && !confirm('Replace the current slides with a fresh set?')) return;
    const updated = await run('generate', () => generatePhotoCarousel(reel._id, count));
    if (updated) {
      onChange(updated);
      setSlides(updated.carousel.slides);
    }
  }

  async function saveSlides() {
    const updated = await run('save', () => savePhotoCarousel(reel._id, slides));
    if (updated) {
      onChange(updated);
      setSlides(updated.carousel.slides);
    }
    return updated;
  }

  async function renderSlides() {
    if (dirty && !(await saveSlides())) return;
    // The slide videos render in the background; the card polls for progress.
    const updated = await run('render', () => renderPhotoCarousel(reel._id));
    if (updated) onChange(updated);
  }

  function editSlide(i: number, patch: Partial<PhotoSlide>) {
    setSlides((prev) =>
      prev.map((s, j) => {
        if (j !== i) return s;
        const next = { ...s, ...patch };
        // Changing the layout changes how many photos it shows; keep what fits, fill the rest.
        if (patch.layout) {
          const need = layoutOf(patch.layout)?.photos ?? 0;
          const pool = reel.images.map((x) => x.url);
          const imgs = next.images.slice(0, need);
          for (let k = 0; imgs.length < need && pool.length; k += 1) imgs.push(pool[(i + k) % pool.length]);
          next.images = imgs;
        }
        return next;
      })
    );
  }

  async function download(url: string, n: number) {
    try {
      const blob = await (await fetch(url)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${reel.title} - slide ${n}.${url.endsWith('.png') ? 'png' : 'mp4'}`.replace(/[\\/:*?"<>|]/g, '');
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  }

  async function downloadAll() {
    for (let i = 0; i < rendered.length; i += 1) {
      await download(rendered[i], i + 1);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  if (reel.images.length === 0) return <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">Add photos on the first tab, then build a carousel from them.</p>;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-neutral-900">Carousel post</h3>
          <p className="mt-0.5 max-w-xl text-xs text-neutral-500">Swipeable 4:5 slides in the collage style, each one a short looping video (8 seconds by default) with the photo boxes in motion. Choose how many, then edit any slide - including its length - before you render.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          Slides
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button onClick={generate} disabled={busy !== ''} className="rounded-md bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {busy === 'generate' ? 'Building…' : slides.length ? 'Rebuild slides' : 'Build slides'}
        </button>
      </section>

      <div className="max-w-3xl">
        <OutroEditor options={options} onOptions={onOptions} carousel />
      </div>

      {dirtyReel && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">You have unsaved design changes (colours, church info). Save them first so the slides use them.</p>}

      {slides.length > 0 && (
        <>
          <ol className="space-y-3">
            {slides.map((s, i) => {
              const info = layoutOf(s.layout);
              return (
                <li key={s._id ?? i} className="flex flex-wrap items-start gap-4 rounded-xl border border-neutral-200 p-3">
                  <div className="aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                    {rendered[i] && !dirty ? (
                      rendered[i].endsWith('.png') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rendered[i]} alt={`Slide ${i + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <video src={rendered[i]} muted loop autoPlay playsInline className="h-full w-full object-cover" />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-neutral-400">Slide {i + 1}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{i + 1}</span>
                      <select value={s.layout} onChange={(e) => editSlide(i, { layout: e.target.value })} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
                        {layouts.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                        Length
                        <input type="number" min={3} max={30} step={1} value={s.lengthSec ?? 8} onChange={(e) => editSlide(i, { lengthSec: Math.min(30, Math.max(3, Math.round(Number(e.target.value)) || 8)) })} className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
                        s
                      </label>
                      <button onClick={() => setSlides((prev) => prev.filter((_, j) => j !== i))} disabled={slides.length <= 1} className="ml-auto text-xs text-neutral-400 hover:text-red-600 disabled:opacity-30">
                        Remove slide
                      </button>
                    </div>
                    {s.layout !== 'info' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input value={s.title} onChange={(e) => editSlide(i, { title: e.target.value })} maxLength={80} placeholder="Slide text (optional)" className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm" />
                        <input value={s.subtitle} onChange={(e) => editSlide(i, { subtitle: e.target.value })} maxLength={100} placeholder="Smaller line (optional)" className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm" />
                      </div>
                    )}
                    {(info?.photos ?? 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-neutral-500">Photos (click to swap):</span>
                        {Array.from({ length: info!.photos }, (_, slot) => (
                          <button key={slot} onClick={() => setPicking({ slide: i, slot })} className="h-14 w-11 overflow-hidden rounded-md border border-neutral-300 bg-neutral-100 hover:border-neutral-900" aria-label={`Change photo ${slot + 1}`}>
                            {s.images[slot] && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.images[slot]} alt="" className="h-full w-full object-cover" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {s.layout === 'info' && <p className="text-xs text-neutral-500">Shows your church logo, service times, address and where to follow — from the closing card settings on the Design tab.</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
            Set every slide to
            <input type="number" min={3} max={30} step={1} value={allSec} onChange={(e) => setAllSec(Math.min(30, Math.max(3, Math.round(Number(e.target.value)) || 8)))} className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
            seconds
            <button onClick={() => setSlides((prev) => prev.map((x) => ({ ...x, lengthSec: allSec })))} className="rounded-md border border-neutral-300 px-3 py-1 font-medium text-neutral-800 hover:bg-neutral-100">
              Apply
            </button>
            <span className="text-neutral-400">· total {slides.reduce((n, x) => n + (x.lengthSec ?? 8), 0)}s</span>
          </div>

          {rendering && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">{cstatus === 'queued' ? 'Waiting in the queue…' : `Rendering slide videos… ${reel.carousel.progress ?? 0}%`}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-200">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.max(4, reel.carousel.progress ?? 0)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-amber-800/80">Takes about 10 seconds per slide. You can switch tabs while it works.</p>
            </div>
          )}
          {cstatus === 'error' && reel.carousel.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{reel.carousel.error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={saveSlides} disabled={!dirty || busy !== '' || rendering} className="rounded-md border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40">
              {busy === 'save' ? 'Saving…' : 'Save slide edits'}
            </button>
            <button onClick={renderSlides} disabled={busy !== '' || rendering} className="rounded-md bg-red-600 px-5 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {rendering ? 'Rendering…' : rendered.length && !dirty ? 'Render slide videos again' : 'Render slide videos'}
            </button>
            {rendered.length > 0 && !dirty && !rendering && (
              <button onClick={downloadAll} className="rounded-md bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800">
                ⬇ Download all ({rendered.length})
              </button>
            )}
          </div>
        </>
      )}

      {rendered.length > 0 && !dirty && !rendering && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-900">Ready to post</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {rendered.map((u, i) => (
              <div key={u}>
                <div className="aspect-[4/5] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                  {u.endsWith('.png') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u} alt={`Slide ${i + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <video src={u} muted loop autoPlay playsInline controls className="h-full w-full object-cover" />
                  )}
                </div>
                <button onClick={() => download(u, i + 1)} className="mt-1.5 text-xs text-neutral-500 underline hover:text-neutral-800">
                  Download slide {i + 1}{slides[i] ? ` (${slides[i].lengthSec ?? 8}s)` : ''}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-neutral-400">Add these to Instagram in order as one carousel post - Instagram carousels accept video slides.</p>
        </section>
      )}

      {picking && (
        <Overlay onClose={() => setPicking(null)}>
          <div className="p-5">
            <h2 className="text-base font-semibold text-neutral-900">Choose a photo</h2>
            <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
              {reel.images.map((img) => (
                <button
                  key={img._id}
                  onClick={() => {
                    const s = slides[picking.slide];
                    const images = [...s.images];
                    images[picking.slot] = img.url;
                    editSlide(picking.slide, { images });
                    setPicking(null);
                  }}
                  className="aspect-[3/4] overflow-hidden rounded-lg border border-neutral-200 hover:border-neutral-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
