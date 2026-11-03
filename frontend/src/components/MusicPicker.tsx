'use client';

import { useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play, Upload, X } from 'lucide-react';
import { assetUrl, getMusicTracks, uploadMusicTrack } from '@/lib/api';
import type { MusicTrack, PostMusic } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

// Chooses a song from the app's music library to mix into a post. Instagram's API can't attach a song from Instagram's own
// library, so the track goes into the file itself. `credit` is the attribution a built-in track's licence asks for where
// the post is published; the page offers to add it to the caption.
export function MusicPicker({ value, onChange, onAddCredit, disabled }: { value?: PostMusic | null; onChange: (music: PostMusic | null) => void; onAddCredit?: (line: string) => void; disabled?: boolean }) {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState('');
  const [uploading, setUploading] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [level, setLevel] = useState(value?.level ?? 1);
  const [creditAdded, setCreditAdded] = useState(false);

  useEffect(() => {
    getMusicTracks().then(setTracks).catch(() => setError('Could not load the music library.'));
    return () => audio.current?.pause();
  }, []);

  function preview(t: MusicTrack) {
    if (playing === t.id) {
      audio.current?.pause();
      setPlaying('');
      return;
    }
    audio.current?.pause();
    const a = new Audio(assetUrl(t.url));
    a.currentTime = t.startSec || 0;
    a.onended = () => setPlaying('');
    audio.current = a;
    a.play().then(() => setPlaying(t.id)).catch(() => setPlaying(''));
  }

  function choose(t: MusicTrack) {
    setCreditAdded(false);
    onChange({ trackId: t.id, name: t.name, level, credit: t.credit });
  }

  async function addOwn(f: File) {
    setUploading(true);
    setError('');
    try {
      const t = await uploadMusicTrack(f.name.replace(/\.[^.]+$/, '').slice(0, 80), f);
      setTracks((l) => [t, ...(l ?? [])]);
      choose(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that track.');
    }
    setUploading(false);
  }

  const chosen = tracks?.find((t) => t.id === value?.trackId);
  const creditLine = chosen?.credit ? `Music: ${chosen.credit.replace(/\s*Licensed under.*$/, '').replace(/\.\s*$/, '')} — CC BY 4.0` : '';

  return (
    <div className="space-y-3 text-sm">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {tracks === null && !error && <p className="text-xs text-neutral-400">Loading the music library…</p>}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        <li>
          <button type="button" disabled={disabled} onClick={() => onChange(null)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${!value ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`}>
            <X size={14} /> No music
          </button>
        </li>
        {tracks?.map((t) => {
          const on = value?.trackId === t.id;
          return (
            <li key={t.id} className={`flex items-center gap-1 rounded-lg ${on ? 'bg-orange-50 ring-1 ring-orange-300' : 'hover:bg-neutral-50'}`}>
              <button type="button" aria-label={playing === t.id ? `Pause ${t.name}` : `Play ${t.name}`} onClick={() => preview(t)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-600 hover:text-orange-600">
                {playing === t.id ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button type="button" disabled={disabled} onClick={() => choose(t)} className="min-w-0 flex-1 py-1.5 pr-2 text-left">
                <span className="block truncate font-medium text-neutral-900">{t.name}</span>
                <span className="block truncate text-xs text-neutral-500">{t.description}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {user?.isAdmin && (
        <>
          <input ref={file} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addOwn(f); e.target.value = ''; }} />
          <button type="button" disabled={disabled || uploading} onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50">
            <Upload size={13} /> {uploading ? 'Adding…' : 'Add your own track'}
          </button>
        </>
      )}

      {value && (
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <span className="inline-flex items-center gap-1"><Music2 size={12} /> Music volume</span>
            <span className="tabular-nums normal-case">{Math.round(level * 100)}%</span>
          </span>
          <input
            type="range"
            min={0.3}
            max={1.5}
            step={0.05}
            value={level}
            disabled={disabled}
            onChange={(e) => setLevel(Number(e.target.value))}
            onMouseUp={() => onChange({ ...value, level })}
            onTouchEnd={() => onChange({ ...value, level })}
            onKeyUp={() => onChange({ ...value, level })}
            className="w-full accent-orange-600"
          />
        </label>
      )}

      {creditLine && onAddCredit && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This track’s licence asks for a credit where the post is published.{' '}
          <button type="button" disabled={creditAdded} onClick={() => (onAddCredit(creditLine), setCreditAdded(true))} className="font-semibold underline disabled:no-underline disabled:opacity-60">
            {creditAdded ? 'Added to the caption' : 'Add it to the caption'}
          </button>
        </div>
      )}
    </div>
  );
}
