'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteCompilation,
  detectSections,
  generateCompilation,
  listCompilations,
  previewReelTemplate,
  publishCompilationToInstagram,
  renderCompilation,
  saveSections,
  updateCompilation,
} from '@/lib/api';
import type { Compilation, CompilationKind, CompilationSegment, ServiceSection } from '@/lib/types';
import { DesignPanel } from './reels/DesignPanel';
import { MusicPanel } from './reels/MusicPanel';
import { PaceControls } from './reels/PaceControls';
import { ProjectCard, type TabId } from './reels/ProjectCard';
import { RenderPanel } from './reels/RenderPanel';
import { TemplateModal } from './reels/TemplateModal';
import { TimelineEditor } from './reels/TimelineEditor';
import { fmtDuration, withDefaults } from './reels/options';
import { fmtSec, isBusyStatus, templateName, useAudioInfo, useChurchName, useMusicTracks, useTemplateCatalog } from './reels/hooks';

const POLL_MS = 2000;

const KINDS: { id: CompilationKind; label: string; hint: string }[] = [
  { id: 'key-points', label: 'Key points', hint: 'Finds the list the speaker gave ("four things…") and joins each item in order.' },
  { id: 'top-moments', label: 'Top moments', hint: 'The strongest standalone moments of the message, joined in order.' },
  { id: 'custom', label: 'Custom', hint: 'Describe what to gather, e.g. "everything said about forgiveness".' },
];

const LENGTHS = [30, 45, 60, 90, 120, 180, 300];
const lengthLabel = (s: number) => (s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export function MergedPanel({
  sessionId,
  audioUrl,
  title,
  serviceName,
  preacher,
}: {
  sessionId: string;
  audioUrl?: string;
  title: string;
  serviceName: string;
  preacher: string;
}) {
  const [items, setItems] = useState<Compilation[] | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<CompilationKind>('key-points');
  const [targetSec, setTargetSec] = useState(60);
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState('');
  const [template, setTemplate] = useState('builtin:kinetic');
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { info, refresh: refreshInfo } = useAudioInfo(sessionId);
  const { catalog } = useTemplateCatalog();

  const upsert = useCallback((updated: Compilation) => {
    setItems((prev) => prev?.map((c) => (c._id === updated._id ? { ...c, ...updated } : c)) ?? prev);
  }, []);

  useEffect(() => {
    listCompilations(sessionId)
      .then((list) => {
        setItems(list);
        const want = new URLSearchParams(window.location.search).get('open');
        setOpenId(list.find((c) => c._id === want)?._id ?? list[0]?._id ?? null);
      })
      .catch((err) => {
        setItems([]);
        setError(err instanceof Error ? err.message : 'Failed to load merged reels');
      });
  }, [sessionId]);

  const anyBusy = items?.some((c) => isBusyStatus(c.status)) ?? false;
  useEffect(() => {
    if (!anyBusy) return;
    const interval = setInterval(() => {
      listCompilations(sessionId)
        .then(setItems)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [anyBusy, sessionId]);

  async function handleGenerate() {
    setError('');
    if (kind === 'custom' && !prompt.trim()) return setError('Describe what to gather for a custom merge.');
    setGenerating(true);
    try {
      const section = info?.sections.find((x) => x._id === scope);
      const created = await generateCompilation(sessionId, {
        kind,
        targetSec,
        prompt: prompt.trim() || undefined,
        template,
        ...(section && { startSec: section.startSec, endSec: section.endSec }),
      });
      setItems((prev) => [created, ...(prev ?? [])]);
      setOpenId(created._id);
      refreshInfo().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the merged reel');
    } finally {
      setGenerating(false);
    }
  }

  if (!audioUrl) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
        Merged reels are made from the session audio, which isn&apos;t available yet.
      </div>
    );
  }
  if (items === null) return <p className="text-sm text-neutral-400">Loading...</p>;

  return (
    <div className="space-y-5">
      <SectionsCard sessionId={sessionId} info={info} refresh={refreshInfo} onError={setError} />

      <div className="rounded-2xl bg-white p-5">
        <h2 className="text-base font-semibold text-neutral-900">Merge into one video</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-neutral-500">
          Join several moments into ONE continuous video — a single background and audio track with no cards or slides in between. Tell it how long you want the video to be and it picks the clips to fit.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-md border px-3.5 py-1.5 text-xs font-medium ${kind === k.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-400">{KINDS.find((k) => k.id === kind)?.hint}</p>

        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={300}
          placeholder={kind === 'custom' ? 'What should it gather? (required)' : 'Optional: steer it, e.g. "the four prayer points"'}
          className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none"
        />

        <div className="mt-5">
          <p className="text-sm font-medium text-neutral-800">Desired length</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {LENGTHS.map((s) => (
              <button
                key={s}
                onClick={() => setTargetSec(s)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${targetSec === s ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}
              >
                {lengthLabel(s)}
              </button>
            ))}
            <label className="ml-1 flex items-center gap-1.5 text-xs text-neutral-500">
              or
              <input
                type="number"
                min={15}
                max={600}
                step={5}
                value={targetSec}
                onChange={(e) => setTargetSec(Math.min(600, Math.max(15, Number(e.target.value) || 60)))}
                className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
              seconds
            </label>
          </div>
          <p className="mt-2 text-xs text-neutral-400">The final video lands close to this (after any pause-trimming). If the message doesn&apos;t have enough strong material, you&apos;ll get a bit less rather than padding.</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {info && info.sections.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              From
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="max-w-[12rem] rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-800">
                <option value="">Whole service</option>
                {info.sections.map((x) => (
                  <option key={x._id} value={x._id}>
                    {x.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={() => setPickingTemplate(true)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100">
            Template: {templateName(catalog, template)}
          </button>
          <button onClick={handleGenerate} disabled={generating} className="ml-auto rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {generating ? 'Building…' : `Build a ${lengthLabel(targetSec)} video`}
          </button>
        </div>
        {generating && <p className="mt-3 text-xs text-neutral-400">Transcribing the audio with word timings (first time only) and choosing the clips — this can take a minute for a long recording.</p>}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {items.length === 0 && !generating && <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">No merged reels yet.</p>}

      <div className="space-y-4">
        {items.map((c) => (
          <CompilationCard
            key={c._id}
            comp={c}
            sessionId={sessionId}
            audioUrl={audioUrl}
            sessionTitle={title}
            serviceName={serviceName}
            preacher={preacher}
            open={openId === c._id}
            onToggle={() => setOpenId(openId === c._id ? null : c._id)}
            onChange={upsert}
            onDelete={() => {
              deleteCompilation(c._id)
                .then(() => setItems((prev) => prev?.filter((x) => x._id !== c._id) ?? prev))
                .catch((err) => setError(err instanceof Error ? err.message : 'Failed to delete'));
            }}
            onError={setError}
          />
        ))}
      </div>

      {pickingTemplate && (
        <TemplateModal
          title="Template for the merged video"
          value={template}
          onClose={() => setPickingTemplate(false)}
          onSelect={(id) => {
            setTemplate(id);
            setPickingTemplate(false);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ sections

function SectionsCard({
  sessionId,
  info,
  refresh,
  onError,
}: {
  sessionId: string;
  info: ReturnType<typeof useAudioInfo>['info'];
  refresh: () => Promise<unknown>;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ServiceSection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const sections = draft ?? info?.sections ?? [];
  const dirty = draft !== null;

  async function detect() {
    onError('');
    setBusy(true);
    try {
      await detectSections(sessionId);
      setDraft(null);
      await refresh();
      setOpen(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to detect sections');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    onError('');
    setBusy(true);
    try {
      await saveSections(sessionId, sections);
      setDraft(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save sections');
    } finally {
      setBusy(false);
    }
  }

  function edit(index: number, patch: Partial<ServiceSection>) {
    setDraft(sections.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  }

  return (
    <div className="rounded-xl bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Service sections</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Split the recording into its parts (worship, prayer, message…) so reels and merges can focus on one part.
          </p>
        </div>
        <div className="flex gap-2">
          {sections.length > 0 && (
            <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100">
              {open ? 'Hide' : `Show ${sections.length}`}
            </button>
          )}
          <button
            onClick={detect}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? 'Working…' : sections.length ? 'Detect again' : 'Detect sections'}
          </button>
        </div>
      </div>

      {open && sections.length > 0 && (
        <div className="mt-3 space-y-2">
          {sections.map((x, i) => (
            <div key={x._id ?? i} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-2">
              <input
                value={x.title}
                onChange={(e) => edit(i, { title: e.target.value })}
                aria-label="Section title"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm font-medium"
              />
              <NumberField value={x.startSec} onChange={(v) => edit(i, { startSec: v })} label="Start" />
              <span className="text-xs text-neutral-400">to</span>
              <NumberField value={x.endSec} onChange={(v) => edit(i, { endSec: v })} label="End" />
              <button
                onClick={() => setDraft(sections.filter((_, j) => j !== i))}
                className="px-1 text-xs text-neutral-400 hover:text-red-600"
                aria-label="Remove section"
              >
                ✕
              </button>
              {x.summary && <p className="w-full text-[11px] text-neutral-400">{x.summary}</p>}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const last = sections.at(-1);
                const start = last?.endSec ?? 0;
                setDraft([...sections, { title: 'New section', startSec: start, endSec: Math.min(info?.durationSec ?? start + 60, start + 60) }]);
              }}
              className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
            >
              + Add section
            </button>
            {dirty && (
              <button onClick={save} disabled={busy} className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                Save sections
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NumberField({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(value.toFixed(1));
  const last = useRef(value);
  // Follow outside changes (e.g. re-detect) without fighting the user's typing.
  useEffect(() => {
    if (Math.abs(last.current - value) > 0.001) {
      last.current = value;
      setText(value.toFixed(1));
    }
  }, [value]);
  return (
    <input
      value={text}
      inputMode="decimal"
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (Number.isFinite(n)) {
          last.current = n;
          onChange(n);
        }
      }}
      className="w-16 rounded-md border border-neutral-300 px-1.5 py-1 text-center text-xs"
    />
  );
}

// ------------------------------------------------------------------ one merged video

const toDraft = (c: Compilation) => ({
  title: c.title,
  segments: c.segments.map((s) => ({ _id: s._id, headline: s.headline, takeaway: s.takeaway, startSec: s.startSec, endSec: s.endSec })),
  template: c.template ?? 'builtin:kinetic',
  options: withDefaults(c.options),
});

function CompilationCard({
  comp,
  sessionId,
  audioUrl,
  sessionTitle,
  serviceName,
  preacher,
  open,
  onToggle,
  onChange,
  onDelete,
  onError,
}: {
  comp: Compilation;
  sessionId: string;
  audioUrl: string;
  sessionTitle: string;
  serviceName: string;
  preacher: string;
  open: boolean;
  onToggle: () => void;
  onChange: (c: Compilation) => void;
  onDelete: () => void;
  onError: (msg: string) => void;
}) {
  const [tab, setTab] = useState<TabId>('content');
  const [draft, setDraft] = useState(() => toDraft(comp));
  const [saving, setSaving] = useState(false);
  const [timelineFor, setTimelineFor] = useState<number | null>(null);
  const [previewAt, setPreviewAt] = useState(3);
  const churchName = useChurchName();
  const { tracks } = useMusicTracks(draft.options.music.trackId !== '');
  const busy = isBusyStatus(comp.status);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(comp));
  const stale = Boolean(comp.videoUrl) && (comp.status !== 'done' || dirty);
  const rawSec = draft.segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
  const finalSec = dirty ? undefined : comp.plannedSec;

  function editSegment(i: number, patch: Partial<CompilationSegment>) {
    setDraft((d) => ({ ...d, segments: d.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }
  function move(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const next = [...d.segments];
      const j = i + dir;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, segments: next };
    });
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const updated = await updateCompilation(comp._id, { title: draft.title, segments: draft.segments, template: draft.template, options: draft.options });
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
      onChange(await renderCompilation(comp._id));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start rendering');
    }
  }

  const o = draft.options;
  const credit = tracks?.find((t) => t.id === o.music.trackId)?.credit;
  const caption = [
    draft.title,
    draft.segments.map((s, i) => `${i + 1}. ${s.headline}`).join('\n'),
    [o.texts.serviceTitle || serviceName, o.texts.speaker || preacher].filter(Boolean).join(' — '),
    credit ? `Music: ${credit}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const previewKey = JSON.stringify([comp._id, draft.template, o, previewAt, comp.title, comp.segments.length]);
  const previewLoad = async () => (await previewReelTemplate({ compilationId: comp._id, templateId: draft.template, options: o, atSec: previewAt })).url;
  const short = comp.targetSec && comp.plannedSec && comp.plannedSec < comp.targetSec * 0.8;

  return (
    <ProjectCard
      badge="▶"
      title={draft.title}
      subtitle={`${draft.segments.length} clips · about ${fmtDuration(comp.videoSec ?? comp.plannedSec ?? rawSec)}${comp.targetSec ? ` (asked for ${fmtDuration(comp.targetSec)})` : ''}${o.music.trackId ? ' · ♪ music' : ''}`}
      status={comp.status}
      progress={comp.progress}
      stale={stale}
      open={open}
      onToggle={onToggle}
      tab={tab}
      onTab={setTab}
      dirty={dirty}
      saving={saving}
      onSave={save}
      onDiscard={() => setDraft(toDraft(comp))}
      onDelete={onDelete}
      deleteDisabled={busy}
    >
      {tab === 'content' && (
        <div className="max-w-4xl space-y-8">
          <section>
            <label className="block text-sm font-medium text-neutral-700">
              Title
              <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} disabled={busy} maxLength={80} className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base font-semibold text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-50" />
            </label>
            <p className="mt-2 text-xs text-neutral-500">
              {draft.segments.length} clips · {fmtDuration(rawSec)} of recording
              {finalSec !== undefined && <> · final video <strong>{fmtDuration(finalSec)}</strong></>}
              {finalSec !== undefined && finalSec > 90 && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">Over 90s — fine for YouTube/TikTok, trim for a short Reel</span>}
            </p>
            {short && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">You asked for {fmtDuration(comp.targetSec!)} but this message only had about {fmtDuration(comp.plannedSec!)} of strong material for that. You can slow it down below, or add more by building again with a different focus.</p>}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-neutral-900">Clips</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Played back to back as one video. Reorder, trim or remove them, and fix spelling on each clip&apos;s timeline.</p>
            <ol className="mt-3 space-y-3">
              {draft.segments.map((s, i) => (
                <li key={s._id ?? i} className="rounded-xl border border-neutral-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{i + 1}</span>
                    <input value={s.headline} onChange={(e) => editSegment(i, { headline: e.target.value })} disabled={busy} maxLength={80} aria-label="Clip headline" className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm font-medium disabled:bg-neutral-50" />
                    <span className="font-mono text-xs text-neutral-400">
                      {fmtSec(s.startSec).replace(/\.\d$/, '')}–{fmtSec(s.endSec).replace(/\.\d$/, '')} · {Math.round(s.endSec - s.startSec)}s
                    </span>
                    <button onClick={() => setTimelineFor(i)} disabled={busy} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50">Edit timeline</button>
                    <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="px-1.5 text-neutral-400 hover:text-neutral-800 disabled:opacity-30" aria-label="Move up">↑</button>
                    <button onClick={() => move(i, 1)} disabled={busy || i === draft.segments.length - 1} className="px-1.5 text-neutral-400 hover:text-neutral-800 disabled:opacity-30" aria-label="Move down">↓</button>
                    <button onClick={() => setDraft((d) => ({ ...d, segments: d.segments.filter((_, j) => j !== i) }))} disabled={busy || draft.segments.length <= 1} className="px-1.5 text-neutral-400 hover:text-red-600 disabled:opacity-30" aria-label="Remove clip">✕</button>
                  </div>
                  <input value={s.takeaway} onChange={(e) => editSegment(i, { takeaway: e.target.value })} disabled={busy} maxLength={200} placeholder="Caption note (for the Instagram caption, not shown on the video)" aria-label="Clip caption note" className="mt-2 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-700 disabled:bg-neutral-50" />
                </li>
              ))}
            </ol>
          </section>

          <PaceControls
            pace={draft.options.pace}
            onChange={(p) => setDraft((d) => ({ ...d, options: { ...d.options, pace: { ...d.options.pace, ...p } } }))}
            plannedSec={finalSec}
            sourceSec={rawSec}
          />
          {dirty && <p className="-mt-4 text-xs text-neutral-400">Save your changes to see the final length with the new clips and pace.</p>}
        </div>
      )}

      {tab === 'design' && (
        <DesignPanel
          template={draft.template}
          onTemplate={(id) => setDraft((d) => ({ ...d, template: id }))}
          options={draft.options}
          onOptions={(opt) => setDraft((d) => ({ ...d, options: opt }))}
          autoTexts={{ churchName, serviceTitle: serviceName, speaker: preacher }}
          previewLoad={previewLoad}
          previewKey={previewKey}
          duration={comp.videoSec ?? comp.plannedSec ?? rawSec}
          previewAt={previewAt}
          onPreviewAt={setPreviewAt}
        />
      )}

      {tab === 'music' && <MusicPanel options={draft.options} onOptions={(opt) => setDraft((d) => ({ ...d, options: opt }))} mixTarget={{ compilationId: comp._id }} template={draft.template} />}

      {tab === 'render' && (
        <RenderPanel
          key={caption}
          status={comp.status}
          progress={comp.progress}
          error={comp.error}
          videoUrl={comp.videoUrl}
          durationSec={comp.durationSec}
          plannedSec={comp.plannedSec}
          stale={stale}
          saving={saving}
          onRender={render}
          previewLoad={previewLoad}
          previewKey={previewKey}
          fileName={`${sessionTitle} - ${comp.title}`.replace(/[\\/:*?"<>|]/g, '')}
          defaultCaption={caption}
          instagramPermalink={comp.instagramPermalink}
          onPublish={async (c) => onChange(await publishCompilationToInstagram(comp._id, c))}
        />
      )}

      {timelineFor !== null && draft.segments[timelineFor] && (
        <TimelineEditor
          sessionId={sessionId}
          audioUrl={audioUrl}
          title={`Clip ${timelineFor + 1} · ${draft.segments[timelineFor].headline}`}
          startSec={draft.segments[timelineFor].startSec}
          endSec={draft.segments[timelineFor].endSec}
          onClose={() => setTimelineFor(null)}
          onApplyRange={(a, b) => editSegment(timelineFor, { startSec: a, endSec: b })}
        />
      )}
    </ProjectCard>
  );
}
