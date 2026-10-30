'use client';

import { useRef, useState } from 'react';
import { deleteMusicTrack, previewAudioMix, uploadMusicTrack } from '@/lib/api';
import type { MusicTrack, ReelOptions } from '@/lib/types';
import { useMusicTracks, useTemplateCatalog } from './hooks';
import { Field, Slider, Toggle } from './ui';

// Music & soundtrack tab: choose the track, set how it sits under the voice, and hear the real
// mix before rendering.
export function MusicPanel({
  options,
  onOptions,
  mixTarget,
  hideMix = false,
  template,
}: {
  options: ReelOptions;
  onOptions: (o: ReelOptions) => void;
  // Which saved item to build the audition mix from.
  mixTarget: { reelId?: string; compilationId?: string };
  // Photo reels have no voice to mix against, so there is nothing to audition.
  hideMix?: boolean;
  // The chosen template; the Handwritten one gets a paper-writing sound control.
  template?: string;
}) {
  const { catalog } = useTemplateCatalog();
  const writes = template ? catalog?.templates.find((t) => t.id === template)?.theme.layout === 'handwriting' : false;
  const { tracks, error: loadError, update } = useMusicTracks();
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mixing, setMixing] = useState(false);
  const [mixUrl, setMixUrl] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const m = options.music;
  const chosen = tracks?.find((t) => t.id === m.trackId);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const secs = (v: number) => `${v.toFixed(1)}s`;
  const set = (patch: Partial<ReelOptions['music']>) => onOptions({ ...options, music: { ...m, ...patch } });

  function choose(t: MusicTrack | null) {
    set(t ? { trackId: t.id, startSec: t.startSec } : { trackId: '' });
    setMixUrl('');
  }

  function toggleAudition(t: MusicTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === t.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = t.url;
    audio.currentTime = t.startSec || 0;
    audio.volume = 0.8;
    audio.play().then(() => setPlayingId(t.id)).catch(() => setError('Could not play that track.'));
  }

  async function hearMix() {
    setError('');
    setMixing(true);
    try {
      setMixUrl((await previewAudioMix({ ...mixTarget, options })).url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the preview');
    } finally {
      setMixing(false);
    }
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const track = await uploadMusicTrack(file.name.replace(/\.[^.]+$/, ''), file);
      update([track, ...(tracks ?? [])]);
      choose(track);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(t: MusicTrack) {
    if (!confirm(`Delete "${t.name}"? Anything using it will play without music.`)) return;
    try {
      await deleteMusicTrack(t.id);
      update((tracks ?? []).filter((x) => x.id !== t.id));
      if (m.trackId === t.id) set({ trackId: '' });
      if (playingId === t.id) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Field title="Soundtrack" hint="Plays under the pastor for the whole video, and loops if the video is longer than the track.">
        <div className="space-y-2">
          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${m.trackId === '' ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
            <input type="radio" name={`music-${mixTarget.reelId ?? mixTarget.compilationId}`} checked={m.trackId === ''} onChange={() => choose(null)} className="accent-neutral-900" />
            No music
          </label>
          {!tracks && !loadError && <p className="px-1 text-sm text-neutral-400">Loading tracks… (the first time, they download)</p>}
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {tracks?.map((t) => (
            <div key={t.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${m.trackId === t.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
              <input type="radio" name={`music-${mixTarget.reelId ?? mixTarget.compilationId}`} checked={m.trackId === t.id} onChange={() => choose(t)} aria-label={`Use ${t.name}`} className="accent-neutral-900" />
              <button onClick={() => choose(t)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-neutral-900">{t.name}</span>
                <span className="block truncate text-xs text-neutral-500">{t.description}</span>
              </button>
              <button onClick={() => toggleAudition(t)} className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100">
                {playingId === t.id ? '■ Stop' : '▶ Listen'}
              </button>
              {!t.builtin && (
                <button onClick={() => handleDelete(t)} className="px-1 text-xs text-neutral-400 hover:text-red-600" aria-label={`Delete ${t.name}`}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label className="inline-block cursor-pointer rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100">
            {uploading ? 'Uploading…' : '+ Upload your own track'}
            <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" className="hidden" disabled={uploading} onChange={(e) => handleUpload(e.target.files?.[0])} />
          </label>
          <p className="mt-2 text-xs text-neutral-400">Built-in tracks are real recordings by Kevin MacLeod (free with credit). You can also upload music you have the rights to.</p>
        </div>

        {chosen?.credit && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <p className="font-medium">Credit required when you publish</p>
            <p className="mt-0.5 select-all">{chosen.credit}</p>
            <button onClick={() => navigator.clipboard?.writeText(chosen.credit).catch(() => {})} className="mt-1 underline">
              Copy credit
            </button>
          </div>
        )}
      </Field>

      <div className="space-y-8">
        <Field title="Mix" hint={m.trackId ? undefined : 'Choose a track to adjust how it sounds.'}>
          <div className={`space-y-4 rounded-xl border border-neutral-200 p-4 ${m.trackId ? '' : 'pointer-events-none opacity-40'}`}>
            <Slider label="Music level" value={m.volume} min={0} max={1.5} step={0.05} format={pct} onChange={(v) => set({ volume: v })} hint="100% = a clear bed just under the pastor's voice. Raise it if you want it more present." />
            <Slider label="Fade in" value={m.fadeIn} min={0} max={8} step={0.1} format={secs} onChange={(v) => set({ fadeIn: v })} />
            <Slider label="Fade out" value={m.fadeOut} min={0} max={8} step={0.1} format={secs} onChange={(v) => set({ fadeOut: v })} />
            <label className="flex items-center gap-3 text-sm text-neutral-700">
              <span className="w-36 shrink-0">Start track at</span>
              <input type="number" min={0} step={1} value={m.startSec} onChange={(e) => set({ startSec: Math.max(0, Number(e.target.value) || 0) })} className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
              seconds in
            </label>
            <Toggle checked={m.build} onChange={(v) => set({ build: v })} hint="Starts softer and swells toward the end, like a crescendo.">
              Rise with the message
            </Toggle>
            <Toggle checked={m.duck} onChange={(v) => set({ duck: v })} hint="Dips a few dB while the pastor speaks and comes back up in the pauses.">
              Ease the music down under the voice
            </Toggle>
          </div>
        </Field>

        {writes && (
          <Field title="Paper writing sound" hint="Soft pencil-on-paper scratching that follows the pen as the headline and each word are written. Heard in the final video.">
            <div className="space-y-4 rounded-xl border border-neutral-200 p-4">
              <Toggle checked={options.writing.enabled} onChange={(v) => onOptions({ ...options, writing: { ...options.writing, enabled: v } })}>
                Play the writing sound
              </Toggle>
              <div className={options.writing.enabled ? '' : 'pointer-events-none opacity-40'}>
                <Slider label="Writing volume" value={options.writing.volume} min={0} max={2} step={0.05} format={pct} onChange={(v) => onOptions({ ...options, writing: { ...options.writing, volume: v } })} hint="100% = a soft scratch well under the voice. Raise it if you want it more present." />
              </div>
            </div>
          </Field>
        )}

        {!hideMix && (
        <Field title="Hear the mix" hint="The first ~30 seconds of the pastor's voice with this music at these settings, including the speed and pause trimming from the Content tab.">
          <button
            onClick={hearMix}
            disabled={mixing || !m.trackId}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {mixing ? 'Mixing…' : '▶ Hear the mix'}
          </button>
          {mixUrl && <audio key={mixUrl} src={mixUrl} controls autoPlay className="mt-4 w-full" />}
        </Field>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
    </div>
  );
}
