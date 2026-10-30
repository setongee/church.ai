'use client';

import { useEffect, useRef, useState } from 'react';
import { previewOutros, uploadOutroMedia } from '@/lib/api';
import type { OutroStyleId, ReelOptions } from '@/lib/types';
import { useBrand } from './hooks';
import { Field, Slider, Toggle } from './ui';

const STYLES: { id: OutroStyleId; label: string }[] = [
  { id: 'thanks', label: 'Thank you' },
  { id: 'script', label: 'Handwritten note' },
  { id: 'bold', label: 'Bold block' },
  { id: 'glass', label: 'Glass cards' },
  { id: 'info', label: 'Church info' },
  { id: 'media', label: 'Your image / video' },
];

const input = 'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900 focus:border-neutral-900 focus:outline-none';

function ColorPick({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-neutral-600">
      <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-0.5" aria-label={label} />
      {label}
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-neutral-400 underline hover:text-neutral-700">
          reset
        </button>
      )}
    </div>
  );
}

// The closing card shown after a video: pick one of five designs, then customise its text,
// social handles and colours. Empty boxes use your Church Profile.
// `carousel` mode: the card is only the last slide of a carousel, so no on/off switch or length.
export function OutroEditor({ options, onOptions, carousel = false, templateId }: { options: ReelOptions; onOptions: (o: ReelOptions) => void; carousel?: boolean; templateId?: string }) {
  const brand = useBrand();
  const o = options.outro;
  const set = (value: Partial<ReelOptions['outro']>) => onOptions({ ...options, outro: { ...o, ...value } });
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const m = await uploadOutroMedia(file);
      set({ style: 'media', mediaUrl: m.url, mediaType: m.type, mediaSec: m.sec });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  // Thumbnails are real renders using your text and colours, so refresh them (debounced) as
  // the text changes. Seconds / on-off don't affect how a card looks.
  const look = JSON.stringify({ t: templateId, thanks: o.thanks, linkText: o.linkText, bg: o.bg, accent: o.accent, follow: o.follow, cta: o.cta, mu: o.mediaUrl, mo: o.mediaOverlay, st: o.serviceTimes, ad: o.address, tx: options.texts.churchName, s: options.sizes });
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      previewOutros({ templateId, options: latest.current })
        .then((r) => alive && setThumbs(Object.fromEntries(r.previews.map((p) => [p.id, p.url]))))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    }, 700);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [look, templateId]);

  const classic = o.style === 'info';
  const media = o.style === 'media';
  return (
    <Field title={carousel ? 'Closing slide' : 'Closing card'} hint={carousel ? 'The last slide of the carousel. Empty boxes use your Church Profile.' : 'Shown after every video, with the music playing through it. Empty boxes use your Church Profile.'}>
      {!carousel && (
        <Toggle checked={o.enabled} onChange={(v) => set({ enabled: v })}>
          Add a closing card
        </Toggle>
      )}
      <div className={`${carousel ? '' : 'mt-4'} space-y-5 ${carousel || o.enabled ? '' : 'pointer-events-none opacity-40'}`}>
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-600">Design {loading && <span className="font-normal text-neutral-400">- updating previews…</span>}</p>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => set({ style: s.id })}
                className={`w-28 shrink-0 rounded-xl border p-1.5 text-left transition ${o.style === s.id ? 'border-neutral-900 ring-2 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-400'}`}
              >
                <div className="aspect-[9/16] w-full overflow-hidden rounded-lg bg-neutral-100">
                  {thumbs[s.id] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumbs[s.id]} alt={s.label} className="h-full w-full object-cover" />}
                </div>
                <p className="mt-1.5 truncate px-0.5 text-xs font-medium text-neutral-900">{s.label}</p>
              </button>
            ))}
          </div>
        </div>

        {media && (
          <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-block cursor-pointer rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800">
                {uploading ? 'Uploading…' : o.mediaUrl ? 'Replace image / video' : 'Upload image or video'}
                <input type="file" accept="image/*,video/*" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              {o.mediaUrl && (
                <>
                  <span className="text-xs text-neutral-500">{o.mediaType === 'video' ? 'Video' : 'Image'} added</span>
                  <button type="button" onClick={() => set({ mediaUrl: '' })} className="text-xs text-neutral-400 underline hover:text-red-600">
                    Remove
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-neutral-400">Portrait 9:16 works best (1080×1920); anything else is cropped to fill. A video plays (muted) for the length of the card and loops if it is shorter; your music keeps playing. Up to 300 MB.</p>
            {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
            <Toggle checked={o.mediaOverlay} onChange={(v) => set({ mediaOverlay: v })} hint="Puts the thank-you line, link line and handles on top of your media.">
              Show thanks text and handles on top
            </Toggle>
          </div>
        )}

        {!carousel && <Slider label="How long" value={o.seconds} min={3} max={12} step={1} format={(v) => `${v}s`} onChange={(v) => set({ seconds: v })} />}

        {media && !o.mediaOverlay ? null : classic ? (
          <>
            <label className="block text-xs font-medium text-neutral-600">
              Headline
              <input value={o.cta} onChange={(e) => set({ cta: e.target.value })} maxLength={80} placeholder={brand?.outroCta || 'Get the full message'} className={input} />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Service times (one per line)
              <textarea value={o.serviceTimes} onChange={(e) => set({ serviceTimes: e.target.value })} rows={3} maxLength={300} placeholder={brand?.serviceTimes || 'Sundays 8am & 10:30am'} className={`${input} resize-y`} />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Address
              <input value={o.address} onChange={(e) => set({ address: e.target.value })} maxLength={200} placeholder={brand?.address || '12 Adeola Odeku St, Lagos'} className={input} />
            </label>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-600">
              Thank-you line
              <input value={o.thanks} onChange={(e) => set({ thanks: e.target.value })} maxLength={60} placeholder="Thanks for watching" className={input} />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Link line
              <input value={o.linkText} onChange={(e) => set({ linkText: e.target.value })} maxLength={90} placeholder="Get the full message - link in our bio" className={input} />
            </label>
          </div>
        )}

        {media && !o.mediaOverlay ? null : <label className="block text-xs font-medium text-neutral-600">
          Social handles (one per line, up to 4)
          <textarea
            value={o.follow}
            onChange={(e) => set({ follow: e.target.value })}
            rows={3}
            maxLength={240}
            placeholder={brand?.socials.instagram ? `Instagram  ${brand.socials.instagram}` : 'Instagram  @yourchurch\nYouTube  Your Church TV'}
            className={`${input} resize-y`}
          />
          <span className="mt-1 block font-normal text-neutral-400">Start a line with Instagram, YouTube, Facebook, TikTok or X to get its icon. Empty = the handles on your Church Profile.</span>
        </label>}

        {!classic && !(media && !o.mediaOverlay) && (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <ColorPick label="Background" value={o.bg} fallback="#0f172a" onChange={(v) => set({ bg: v })} />
            <ColorPick label="Accent" value={o.accent} fallback="#f59e0b" onChange={(v) => set({ accent: v })} />
          </div>
        )}
      </div>
    </Field>
  );
}
