import type { ReelOptions, ShowKey } from '@/lib/types';

export const DEFAULT_OPTIONS: ReelOptions = {
  texts: { churchName: '', serviceTitle: '', speaker: '', footerText: '' },
  sizes: { headline: 1, captions: 1, info: 1 },
  show: {},
  pace: { speed: 1, trimPauses: true, maxPause: 1.5, finishSentence: true, echo: true },
  outro: { enabled: true, seconds: 5, style: 'thanks', thanks: '', linkText: '', bg: '', accent: '', mediaUrl: '', mediaType: 'image', mediaSec: 0, mediaOverlay: false, cta: '', serviceTimes: '', address: '', follow: '' },
  writing: { enabled: true, volume: 1 },
  music: { trackId: '', volume: 1, fadeIn: 1.5, fadeOut: 2.5, startSec: 0, duck: true, build: true },
};

export function withDefaults(o?: Partial<ReelOptions>): ReelOptions {
  return {
    texts: { ...DEFAULT_OPTIONS.texts, ...(o?.texts ?? {}) },
    sizes: { ...DEFAULT_OPTIONS.sizes, ...(o?.sizes ?? {}) },
    show: { ...(o?.show ?? {}) },
    pace: { ...DEFAULT_OPTIONS.pace, ...(o?.pace ?? {}) },
    outro: { ...DEFAULT_OPTIONS.outro, ...(o?.outro ?? {}) },
    writing: { ...DEFAULT_OPTIONS.writing, ...(o?.writing ?? {}) },
    // Music saved by the first version used a different scale; treat it as the new default.
    music: {
      ...DEFAULT_OPTIONS.music,
      ...(o?.music ?? {}),
      ...(o?.music && o.music.build === undefined ? { volume: DEFAULT_OPTIONS.music.volume } : {}),
    },
  };
}

export const SHOW_SWITCHES: { key: ShowKey; label: string }[] = [
  { key: 'showLogo', label: 'Church logo' },
  { key: 'showChurch', label: 'Church name (only if there is no logo)' },
  { key: 'showHeadline', label: 'Headline' },
  { key: 'showSpeaker', label: 'Preacher name' },
  { key: 'showSessionTitle', label: 'Service title (top right)' },
  { key: 'showWaveform', label: 'Audio waveform' },
  { key: 'showProgress', label: 'Progress bar' },
];

export const fmtDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s === 60 ? 59 : s).padStart(2, '0')}`;
};
