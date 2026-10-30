'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAudioInfo, getBrand, getMusicTracks, getReelTemplates, previewReelTemplate } from '@/lib/api';
import type { AudioInfo, Brand, MusicTrack, ReelTemplateCatalog } from '@/lib/types';

let catalogCache: ReelTemplateCatalog | null = null;

// The template list is tiny and shared by every picker on the page, so fetch it once and keep
// it; `refresh` re-fetches after a template is created/edited/deleted.
export function useTemplateCatalog() {
  const [catalog, setCatalog] = useState<ReelTemplateCatalog | null>(catalogCache);

  const refresh = useCallback(async () => {
    const fresh = await getReelTemplates();
    catalogCache = fresh;
    setCatalog(fresh);
    return fresh;
  }, []);

  useEffect(() => {
    if (catalogCache) return;
    getReelTemplates()
      .then((fresh) => {
        catalogCache = fresh;
        setCatalog(fresh);
      })
      .catch(() => {});
  }, []);

  return { catalog, refresh };
}

export function templateName(catalog: ReelTemplateCatalog | null, id?: string): string {
  return catalog?.templates.find((t) => t.id === id)?.name ?? 'Midnight Gold';
}

export function useAudioInfo(sessionId: string) {
  const [info, setInfo] = useState<AudioInfo | null>(null);
  const refresh = useCallback(async () => {
    const fresh = await getAudioInfo(sessionId);
    setInfo(fresh);
    return fresh;
  }, [sessionId]);

  useEffect(() => {
    getAudioInfo(sessionId)
      .then(setInfo)
      .catch(() => {});
  }, [sessionId]);

  return { info, refresh };
}

// Preview stills render on the server one at a time (each launches a browser), so the client
// also asks one at a time and remembers sample-content previews of saved templates.
const sampleCache = new Map<string, string>();
let previewChain: Promise<unknown> = Promise.resolve();

export function fetchTemplatePreview(templateId: string, reelId?: string): Promise<string> {
  const key = reelId ? '' : templateId;
  if (key && sampleCache.has(key)) return Promise.resolve(sampleCache.get(key)!);
  const run = previewChain.then(() => previewReelTemplate({ templateId, reelId }));
  previewChain = run.catch(() => {});
  return run.then(({ url }) => {
    if (key) sampleCache.set(key, url);
    return url;
  });
}

export function forgetTemplatePreview(templateId: string) {
  sampleCache.delete(templateId);
}

export const fmtSec = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

export const isBusyStatus = (status: string) => status === 'queued' || status === 'rendering';

let brandCache: Brand | null = null;

// The Brand page values, used as the grey placeholders for text the user can override.
export function useBrand() {
  const [brand, setBrand] = useState<Brand | null>(brandCache);
  useEffect(() => {
    if (brandCache) return;
    getBrand()
      .then((b) => {
        brandCache = b;
        setBrand(b);
      })
      .catch(() => {});
  }, []);
  return brand;
}

export function useChurchName() {
  return useBrand()?.churchName ?? '';
}

let trackCache: MusicTrack[] | null = null;

// The music library (built-in tracks download on first request, so this can take a few seconds
// once). Shared so every card and the caption builder reuse one list.
export function useMusicTracks(enabled = true) {
  const [tracks, setTracks] = useState<MusicTrack[] | null>(trackCache);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || trackCache) return;
    getMusicTracks()
      .then((t) => {
        trackCache = t;
        setTracks(t);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load music'));
  }, [enabled]);

  const update = useCallback((next: MusicTrack[]) => {
    trackCache = next;
    setTracks(next);
  }, []);

  return { tracks, error, update };
}
