'use client';

import { useState } from 'react';
import type { ReelStatus } from '@/lib/types';
import { fmtDuration } from './options';
import { PreviewFrame } from './ui';

const isLocal = (url: string) => /^(https?:\/\/)?(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(url);

// Render tab: the large preview (a live still while rendering, the finished video when done),
// the render button, download and sharing.
export function RenderPanel({
  status,
  progress,
  error,
  videoUrl,
  durationSec,
  plannedSec,
  stale,
  saving,
  onRender,
  previewLoad,
  previewKey,
  fileName,
  defaultCaption,
  instagramPermalink,
  onPublish,
}: {
  status: ReelStatus;
  progress: number;
  error?: string;
  videoUrl?: string;
  durationSec?: number;
  plannedSec?: number;
  // True when settings changed (saved or not) after the last render.
  stale: boolean;
  saving: boolean;
  onRender: () => void;
  previewLoad: () => Promise<string>;
  previewKey: string;
  fileName: string;
  defaultCaption: string;
  instagramPermalink?: string;
  onPublish: (caption: string) => Promise<void>;
}) {
  const busy = status === 'queued' || status === 'rendering';
  const [caption, setCaption] = useState(defaultCaption);
  const [posting, setPosting] = useState(false);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const hasVideo = Boolean(videoUrl) && !busy;
  const shareable = hasVideo && !stale;
  const localOnly = Boolean(videoUrl) && isLocal(videoUrl!);

  async function fetchFile() {
    const blob = await (await fetch(videoUrl!)).blob();
    return new File([blob], `${fileName}.mp4`, { type: 'video/mp4' });
  }

  async function download() {
    try {
      const file = await fetchFile();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(videoUrl, '_blank');
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${what} copied`);
      setTimeout(() => setNote(''), 1800);
    } catch {
      setProblem('Could not copy.');
    }
  }

  async function post() {
    if (!confirm('Post this video to your connected Instagram account as a Reel now?')) return;
    setPosting(true);
    setProblem('');
    try {
      await onPublish(caption);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Posting failed');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* ------------------------------------------------ preview / player */}
      <div>
        {busy || !hasVideo ? (
          <PreviewFrame load={previewLoad} watch={previewKey}>
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-5 text-white">
                <p className="text-sm font-medium">{status === 'queued' ? 'Waiting in the queue…' : `Rendering… ${progress}%`}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div className="h-full bg-amber-400 transition-all" style={{ width: `${status === 'queued' ? 4 : Math.max(4, progress)}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-white/70">This is a preview frame - the finished video appears here.</p>
              </div>
            )}
            {!busy && !hasVideo && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white">Not rendered yet</span>}
          </PreviewFrame>
        ) : (
          <div>
            <video key={videoUrl} src={videoUrl} controls playsInline className="mx-auto aspect-[9/16] w-full max-w-[360px] rounded-2xl bg-black object-cover" />
            {stale && (
              <p className="mx-auto mt-3 max-w-[360px] rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Your settings changed after this video was rendered. Render again to update it.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------ actions */}
      <div className="min-w-0 space-y-8">
        <section>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onRender}
              disabled={busy || saving}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : busy ? 'Rendering…' : status === 'error' ? 'Try again' : hasVideo ? 'Render again' : 'Render video'}
            </button>
            <div className="text-sm text-neutral-600">
              {busy ? (
                <span>{status === 'queued' ? 'Queued' : `${progress}% done`}</span>
              ) : hasVideo ? (
                <span>
                  {stale ? 'Out of date' : 'Ready'}
                  {durationSec ? ` · ${fmtDuration(durationSec)} long` : ''}
                </span>
              ) : (
                <span>{plannedSec ? `Will be about ${fmtDuration(plannedSec)} long` : 'Not rendered yet'}</span>
              )}
            </div>
          </div>
          {status === 'error' && error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <p className="mt-3 text-xs text-neutral-400">Rendering takes roughly as long as the video itself. You can switch tabs or cards while it works.</p>
        </section>

        {shareable ? (
          <>
            <section>
              <h3 className="text-sm font-semibold text-neutral-900">Download</h3>
              <div className="mt-3">
                <button onClick={download} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
                  ⬇ Download MP4
                </button>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-neutral-900">Post to Instagram</h3>
              <p className="mt-0.5 text-xs text-neutral-500">Publishes this video as a Reel on the connected Instagram account.</p>
              {localOnly && (
                <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                  Instagram downloads the video itself, so it must be reachable on the internet. Set <code>PUBLIC_BASE_URL</code> in the backend settings to a public address (a deployed URL or a tunnel like ngrok) before posting.
                </p>
              )}
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                maxLength={2200}
                className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400">
                <span>Music credit is included automatically when a built-in track is used.</span>
                <span>{caption.length}/2200</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={post} disabled={posting} className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {posting ? 'Posting… (can take a few minutes)' : 'Post as Reel'}
                </button>
                <button onClick={() => copy(caption, 'Caption')} className="text-xs text-neutral-500 underline hover:text-neutral-800">
                  Copy caption
                </button>
                {note && <span className="text-xs text-emerald-700">{note}</span>}
                {instagramPermalink && (
                  <a href={instagramPermalink} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 underline">
                    Posted — view on Instagram ↗
                  </a>
                )}
              </div>
            </section>
          </>
        ) : (
          hasVideo && stale && <p className="text-sm text-neutral-500">Render again to download or post the updated version.</p>
        )}
        {problem && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
      </div>
    </div>
  );
}
