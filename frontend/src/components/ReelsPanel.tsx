'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyTemplateToAllReels,
  createFullReel,
  deleteReel,
  generateReels,
  listReels,
  previewReelTemplate,
  publishReelToInstagram,
  renderAllReels,
  renderReel,
  updateReel,
} from '@/lib/api';
import type { Reel } from '@/lib/types';
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

// "12:30" or "750" -> seconds; empty -> 0; anything else -> null.
function parseClock(v: string): number | null {
  const t = v.trim();
  if (!t) return 0;
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  return m ? (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]) : null;
}

export function ReelsPanel({
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
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showFull, setShowFull] = useState(false);
  const [fullScope, setFullScope] = useState('');
  const [fullStart, setFullStart] = useState('');
  const [fullEnd, setFullEnd] = useState('');
  const [scope, setScope] = useState(''); // '' = whole service, else a section _id
  const [defaultTemplate, setDefaultTemplate] = useState('builtin:kinetic');
  const [pickingDefault, setPickingDefault] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { info, refresh: refreshInfo } = useAudioInfo(sessionId);
  const { catalog } = useTemplateCatalog();

  const upsert = useCallback((updated: Reel) => {
    setReels((prev) => prev?.map((r) => (r._id === updated._id ? { ...r, ...updated } : r)) ?? prev);
  }, []);

  useEffect(() => {
    listReels(sessionId)
      .then((list) => {
        setReels(list);
        const q = new URLSearchParams(window.location.search);
        const want = q.get('open');
        setOpenId(list.find((r) => r._id === want)?._id ?? list[0]?._id ?? null);
        if (q.get('full')) setShowFull(true);
      })
      .catch((err) => {
        setReels([]);
        setError(err instanceof Error ? err.message : 'Failed to load reels');
      });
  }, [sessionId]);

  // Renders happen on the server in the background, so poll while any reel is in flight.
  const anyBusy = reels?.some((r) => isBusyStatus(r.status)) ?? false;
  useEffect(() => {
    if (!anyBusy) return;
    const interval = setInterval(() => {
      listReels(sessionId)
        .then(setReels)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [anyBusy, sessionId]);

  async function handleGenerate() {
    setError('');
    setGenerating(true);
    try {
      const section = info?.sections.find((x) => x._id === scope);
      const list = await generateReels(sessionId, {
        count,
        template: defaultTemplate,
        ...(section && { startSec: section.startSec, endSec: section.endSec }),
      });
      setReels(list);
      setOpenId(list[0]?._id ?? null);
      refreshInfo().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find the top points');
    } finally {
      setGenerating(false);
    }
  }

  // One reel from the entire recording - for announcements, confessions or a short message.
  async function handleFull() {
    setError('');
    const start = parseClock(fullStart);
    const end = fullEnd.trim() ? parseClock(fullEnd) : null;
    if (start === null || (fullEnd.trim() && end === null)) {
      setError('Times look like 12:30 (minutes:seconds) or just seconds.');
      return;
    }
    setGenerating(true);
    try {
      const reel = await createFullReel(sessionId, {
        headline: title,
        template: defaultTemplate,
        ...(fullScope && { sectionId: fullScope }),
        ...(fullStart.trim() && { startSec: start }),
        ...(end !== null && { endSec: end }),
      });
      setShowFull(false);
      setReels((prev) => [...(prev ?? []), reel]);
      setOpenId(reel._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the reel');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRenderAll() {
    setError('');
    try {
      setReels(await renderAllReels(sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start rendering');
    }
  }

  async function handleDelete(id: string) {
    setError('');
    try {
      await deleteReel(id);
      setReels((prev) => prev?.filter((r) => r._id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  if (!audioUrl) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
        Reels are made from the session audio, which isn&apos;t available yet.
      </div>
    );
  }
  if (reels === null) return <p className="text-sm text-neutral-400">Loading...</p>;

  const renderable = reels.filter((r) => r.status === 'draft' || r.status === 'error').length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Audio reels</h2>
            <p className="mt-0.5 max-w-xl text-sm text-neutral-500">
              The strongest moments from this recording, each cut to a short vertical video with animated captions over the original audio.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {info && info.sections.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                From
                <select value={scope} onChange={(e) => setScope(e.target.value)} className="max-w-[10rem] rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-800">
                  <option value="">Whole service</option>
                  {info.sections.map((x) => (
                    <option key={x._id} value={x._id}>
                      {x.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={() => setPickingDefault(true)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100">
              Template: {templateName(catalog, defaultTemplate)}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              Points
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-800">
                {[3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={handleGenerate} disabled={generating} className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {generating ? 'Finding points…' : reels.length ? 'Find points again' : `Find top ${count} points`}
            </button>
            <button onClick={() => setShowFull((v) => !v)} disabled={generating} className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${showFull ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-800 hover:bg-neutral-100'}`} title="One reel from a whole message - up to 5 minutes, not just the highlights">
              Full message reel
            </button>
            {renderable > 1 && (
              <button onClick={handleRenderAll} className="rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700">
                Render all ({renderable})
              </button>
            )}
          </div>
        </div>
        {showFull && (
          <div className="mt-4 rounded-xl bg-neutral-50 p-4">
            <p className="text-sm font-medium text-neutral-900">Full message reel</p>
            <p className="mt-0.5 text-xs text-neutral-500">Keeps the whole stretch you choose instead of picking highlights - up to 5 minutes. On the Content tab you can still speed it up and cut long pauses.</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              {info && info.sections.length > 0 && (
                <label className="text-xs font-medium text-neutral-600">
                  Section
                  <select value={fullScope} onChange={(e) => { setFullScope(e.target.value); setFullStart(''); setFullEnd(''); }} className="mt-1 block max-w-[14rem] rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-normal text-neutral-800">
                    <option value="">Whole recording{info.durationSec ? ` (${fmtSec(info.durationSec)})` : ''}</option>
                    {info.sections.map((x) => (
                      <option key={x._id} value={x._id}>
                        {x.title} ({fmtSec(x.endSec - x.startSec)}){x.endSec - x.startSec > 300 ? ' - over 5 min' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs font-medium text-neutral-600">
                Start (optional)
                <input value={fullStart} onChange={(e) => setFullStart(e.target.value)} placeholder="e.g. 12:30" className="mt-1 block w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-normal" />
              </label>
              <label className="text-xs font-medium text-neutral-600">
                End (optional)
                <input value={fullEnd} onChange={(e) => setFullEnd(e.target.value)} placeholder="e.g. 17:30" className="mt-1 block w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-normal" />
              </label>
              <button onClick={handleFull} disabled={generating} className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                {generating ? 'Creating…' : 'Create reel'}
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-400">Start/end override the section. Leave both empty to use the section (or the whole recording, if it is under 5 minutes).</p>
          </div>
        )}
        {generating && <p className="mt-3 text-xs text-neutral-400">Transcribing the audio with word timings (first time only) and picking the best moments — this can take a minute for a long recording.</p>}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {reels.length === 0 && !generating && (
        <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">No reels yet. Pick how many points you want and click &ldquo;Find top points&rdquo;.</p>
      )}

      <div className="space-y-4">
        {reels.map((reel) => (
          <ReelCard
            key={reel._id}
            reel={reel}
            total={reels.length}
            audioUrl={audioUrl}
            title={title}
            serviceName={serviceName}
            preacher={preacher}
            open={openId === reel._id}
            onToggle={() => setOpenId(openId === reel._id ? null : reel._id)}
            onChange={upsert}
            onDelete={() => handleDelete(reel._id)}
            onError={setError}
          />
        ))}
      </div>

      {pickingDefault && (
        <TemplateModal
          title="Template for new reels"
          value={defaultTemplate}
          onClose={() => setPickingDefault(false)}
          onSelect={(id) => {
            setDefaultTemplate(id);
            setPickingDefault(false);
          }}
          applyAllLabel={reels.length ? 'Apply to all current reels' : undefined}
          onApplyAll={
            reels.length
              ? async (id) => {
                  setDefaultTemplate(id);
                  setPickingDefault(false);
                  try {
                    setReels(await applyTemplateToAllReels(sessionId, id));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to apply the template');
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ one reel

const toDraft = (r: Reel) => ({
  headline: r.headline,
  takeaway: r.takeaway,
  start: r.startSec.toFixed(1),
  end: r.endSec.toFixed(1),
  template: r.template ?? 'builtin:kinetic',
  options: withDefaults(r.options),
});

function ReelCard({
  reel,
  total,
  audioUrl,
  title,
  serviceName,
  preacher,
  open,
  onToggle,
  onChange,
  onDelete,
  onError,
}: {
  reel: Reel;
  total: number;
  audioUrl: string;
  title: string;
  serviceName: string;
  preacher: string;
  open: boolean;
  onToggle: () => void;
  onChange: (r: Reel) => void;
  onDelete: () => void;
  onError: (msg: string) => void;
}) {
  const [tab, setTab] = useState<TabId>('content');
  const [draft, setDraft] = useState(() => toDraft(reel));
  const [saving, setSaving] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [previewAt, setPreviewAt] = useState(3);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const churchName = useChurchName();
  const { tracks } = useMusicTracks(draft.options.music.trackId !== '');
  const busy = isBusyStatus(reel.status);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(reel));
  const stale = Boolean(reel.videoUrl) && (reel.status !== 'done' || dirty);
  const startN = Number(draft.start) || 0;
  const endN = Number(draft.end) || 0;

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const updated = await updateReel(reel._id, {
        headline: draft.headline,
        takeaway: draft.takeaway,
        startSec: startN,
        endSec: endN,
        template: draft.template,
        options: draft.options,
      });
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
      onChange(await renderReel(reel._id));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start rendering');
    }
  }

  function toggleListen() {
    const audio = audioRef.current;
    if (!audio) return;
    if (listening) {
      audio.pause();
      setListening(false);
      return;
    }
    audio.currentTime = startN;
    audio.play().then(() => setListening(true)).catch(() => onError('Could not play the audio.'));
  }

  const theme = draft.options;
  const credit = tracks?.find((t) => t.id === theme.music.trackId)?.credit;
  const caption = [draft.headline, draft.takeaway, [theme.texts.serviceTitle || serviceName, theme.texts.speaker || preacher].filter(Boolean).join(' — '), credit ? `Music: ${credit}` : '']
    .filter(Boolean)
    .join('\n\n');
  const previewKey = JSON.stringify([reel._id, draft.template, draft.options, previewAt, reel.headline, reel.takeaway, reel.startSec, reel.endSec]);
  const previewLoad = async () =>
    (await previewReelTemplate({ reelId: reel._id, templateId: draft.template, options: draft.options, atSec: previewAt })).url;

  return (
    <ProjectCard
      badge={reel.order}
      title={draft.headline || 'Untitled point'}
      subtitle={`Point ${reel.order} of ${total} · ${fmtDuration(reel.videoSec ?? reel.plannedSec ?? reel.endSec - reel.startSec)}${reel.options?.music?.trackId ? ' · ♪ music' : ''}`}
      status={reel.status}
      progress={reel.progress}
      stale={stale}
      open={open}
      onToggle={onToggle}
      tab={tab}
      onTab={setTab}
      dirty={dirty}
      saving={saving}
      onSave={save}
      onDiscard={() => setDraft(toDraft(reel))}
      onDelete={onDelete}
      deleteDisabled={busy}
    >
      {tab === 'content' && (
        <div className="max-w-3xl space-y-8">
          <section className="space-y-4">
            <label className="block text-sm font-medium text-neutral-700">
              Headline
              <input value={draft.headline} onChange={(e) => set('headline', e.target.value)} disabled={busy} maxLength={80} className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base font-semibold text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-50" />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Caption note <span className="font-normal text-neutral-400">(for the Instagram caption — not shown on the video)</span>
              <textarea value={draft.takeaway} onChange={(e) => set('takeaway', e.target.value)} disabled={busy} maxLength={200} rows={2} className="mt-1.5 w-full resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none disabled:bg-neutral-50" />
            </label>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-neutral-900">Clip</h3>
            <p className="mt-0.5 text-xs text-neutral-500">The part of the recording this reel uses.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
              <input value={draft.start} onChange={(e) => set('start', e.target.value)} disabled={busy} inputMode="decimal" aria-label="Start seconds" className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-center" />
              <span>to</span>
              <input value={draft.end} onChange={(e) => set('end', e.target.value)} disabled={busy} inputMode="decimal" aria-label="End seconds" className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-center" />
              <span className="text-xs text-neutral-400">seconds · {fmtSec(Math.max(0, endN - startN))} of recording</span>
              <button onClick={toggleListen} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
                {listening ? '■ Stop' : '▶ Listen'}
              </button>
              <button onClick={() => setTimelineOpen(true)} disabled={busy} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50">
                Edit on timeline
              </button>
            </div>
          </section>

          <PaceControls
            pace={draft.options.pace}
            onChange={(p) => set('options', { ...draft.options, pace: { ...draft.options.pace, ...p } })}
            plannedSec={dirty ? undefined : reel.plannedSec}
            sourceSec={endN - startN}
          />
          {dirty && <p className="-mt-4 text-xs text-neutral-400">Save your changes to see the final length with the new pace.</p>}
        </div>
      )}

      {tab === 'design' && (
        <DesignPanel
          template={draft.template}
          onTemplate={(id) => set('template', id)}
          options={draft.options}
          onOptions={(o) => set('options', o)}
          autoTexts={{ churchName, serviceTitle: serviceName, speaker: preacher }}
          previewLoad={previewLoad}
          previewKey={previewKey}
          duration={reel.videoSec ?? reel.plannedSec ?? endN - startN}
          previewAt={previewAt}
          onPreviewAt={setPreviewAt}
          headline={{ value: draft.headline, onChange: (v) => set('headline', v) }}
        />
      )}

      {tab === 'music' && <MusicPanel options={draft.options} onOptions={(o) => set('options', o)} mixTarget={{ reelId: reel._id }} template={draft.template} />}

      {tab === 'render' && (
        <RenderPanel
          key={caption}
          status={reel.status}
          progress={reel.progress}
          error={reel.error}
          videoUrl={reel.videoUrl}
          durationSec={reel.durationSec}
          plannedSec={reel.plannedSec}
          stale={stale}
          saving={saving}
          onRender={render}
          previewLoad={previewLoad}
          previewKey={previewKey}
          fileName={`${title} - point ${reel.order}`.replace(/[\\/:*?"<>|]/g, '')}
          defaultCaption={caption}
          instagramPermalink={reel.instagramPermalink}
          onPublish={async (c) => onChange(await publishReelToInstagram(reel._id, c))}
        />
      )}

      <audio
        ref={audioRef}
        src={audioUrl}
        preload="none"
        onTimeUpdate={(e) => {
          if (e.currentTarget.currentTime >= endN) {
            e.currentTarget.pause();
            setListening(false);
          }
        }}
        onEnded={() => setListening(false)}
      />

      {timelineOpen && (
        <TimelineEditor
          sessionId={reel.session}
          audioUrl={audioUrl}
          title={`Point ${reel.order} · ${draft.headline}`}
          startSec={startN}
          endSec={endN}
          templateId={draft.template}
          reelId={reel._id}
          onClose={() => setTimelineOpen(false)}
          onApplyRange={(a, b) => setDraft((d) => ({ ...d, start: a.toFixed(1), end: b.toFixed(1) }))}
        />
      )}
    </ProjectCard>
  );
}
