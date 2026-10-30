'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { addMinister, assetUrl, deleteMinister, getBrand, updateBrand, updateMinister, uploadBrandImage } from '@/lib/api';
import type { Brand, Minister } from '@/lib/types';
import { Spinner, cx } from '@/components/editor/ui';

type Slot = 'logo' | 'logoLight' | 'pastor';

const field = 'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-neutral-900">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-neutral-500">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function ImageSlot({
  label,
  hint,
  url,
  dark,
  round,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  url: string;
  dark?: boolean;
  round?: boolean;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      <div
        role="button"
        tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'));
          if (f) onPick(f);
        }}
        className={cx(
          'relative grid aspect-[4/3] cursor-pointer place-items-center overflow-hidden border-2 border-dashed transition-colors',
          round ? 'rounded-3xl' : 'rounded-2xl',
          dark ? 'bg-neutral-900' : 'bg-neutral-50',
          over ? 'border-neutral-900' : url ? 'border-transparent' : 'border-neutral-300 hover:border-neutral-400'
        )}
      >
        {busy ? (
          <Spinner className={dark ? 'text-white' : 'text-neutral-500'} />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(url)} alt={label} className={cx('h-full w-full', round ? 'object-cover' : 'object-contain p-5')} />
        ) : (
          <span className={cx('flex flex-col items-center gap-1.5 px-3 text-center text-xs', dark ? 'text-neutral-400' : 'text-neutral-500')}>
            <ImagePlus size={22} />
            Drop an image or click to upload
          </span>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-2">
        <p className="text-xs text-neutral-500">{hint}</p>
        {url && (
          <button type="button" onClick={onClear} className="flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-500 hover:text-red-600">
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

// Other ministers and guest preachers. When a design's preacher name matches one of these (or the
// pastor above), templates show that person's photo in their "Preacher photo" slot.
function MinistersCard({ ministers, onChange }: { ministers: Minister[]; onChange: (b: Brand) => void }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const run = async (key: string, fn: () => Promise<Brand>) => {
    setBusy(key);
    setError('');
    try {
      onChange(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy('');
    }
  };
  return (
    <Card title="Ministers" hint="Guest preachers and other ministers. Add their photo once; designs use it whenever they are the preacher.">
      {ministers.length > 0 && (
        <ul className="mb-5 space-y-3">
          {ministers.map((m) => (
            <MinisterRow key={m._id} m={m} busy={busy.startsWith(m._id)} onSave={(patch) => run(`${m._id}:save`, () => updateMinister(m._id, patch))} onDelete={() => window.confirm(`Remove ${m.name}?`) && run(`${m._id}:del`, () => deleteMinister(m._id))} />
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <Labeled label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pastor Ada Obi" className={field} />
        </Labeled>
        <Labeled label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Guest minister" className={field} />
        </Labeled>
        <label className="flex h-[42px] cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-3 text-xs font-medium text-neutral-600 hover:border-neutral-500">
          <ImagePlus size={15} /> {photo ? photo.name.slice(0, 14) : 'Photo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <button
          type="button"
          disabled={!name.trim() || busy === 'add'}
          onClick={() =>
            run('add', async () => {
              const b = await addMinister({ name, title, image: photo });
              setName('');
              setTitle('');
              setPhoto(null);
              return b;
            })
          }
          className="h-[42px] rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy === 'add' ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function MinisterRow({ m, busy, onSave, onDelete }: { m: Minister; busy: boolean; onSave: (p: { name?: string; title?: string; image?: File; clearImage?: boolean }) => void; onDelete: () => void }) {
  const [name, setName] = useState(m.name);
  const [title, setTitle] = useState(m.title);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <li className="flex items-center gap-3">
      <button type="button" onClick={() => ref.current?.click()} className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-50 text-neutral-400 hover:border-neutral-500" title="Change photo">
        {busy ? <Spinner /> : m.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(m.imageUrl)} alt={m.name} className="h-full w-full object-cover" />
        ) : (
          <ImagePlus size={18} />
        )}
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSave({ image: f }); e.target.value = ''; }} />
      </button>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== m.name && onSave({ name })} className={cx(field, 'min-w-0 flex-1')} aria-label="Name" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== m.title && onSave({ title })} placeholder="Title" className={cx(field, 'min-w-0 flex-1')} aria-label="Title" />
      <button type="button" onClick={onDelete} className="shrink-0 rounded-md p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${m.name}`}>
        <Trash2 size={15} />
      </button>
    </li>
  );
}

export default function BrandPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [draft, setDraft] = useState<Brand | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busySlot, setBusySlot] = useState<Slot | null>(null);

  useEffect(() => {
    getBrand()
      .then((b) => {
        setBrand(b);
        setDraft(b);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load brand'));
  }, []);

  if (error && !draft) return <main className="mx-auto w-full max-w-8xl px-4 sm:px-20 py-12 text-sm text-red-600">{error}</main>;
  if (!draft || !brand) {
    return (
      <main className="mx-auto w-full flex max-w-8xl items-center gap-2 px-4 sm:px-20 py-12 text-sm text-neutral-400">
        <Spinner /> Loading…
      </main>
    );
  }

  const dirty = JSON.stringify({ ...draft, logoUrl: 0, logoLightUrl: 0, pastorImageUrl: 0, ministers: 0 }) !== JSON.stringify({ ...brand, logoUrl: 0, logoLightUrl: 0, pastorImageUrl: 0, ministers: 0 });
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => {
    setSaved(false);
    setDraft({ ...draft, [k]: v });
  };
  const setSocial = (k: keyof Brand['socials'], v: string) => {
    setSaved(false);
    setDraft({ ...draft, socials: { ...draft.socials, [k]: v } });
  };

  // Image changes persist immediately and merge into the draft without discarding typed text.
  const mergeImages = (b: Brand) => {
    setBrand((cur) => (cur ? { ...cur, logoUrl: b.logoUrl, logoLightUrl: b.logoLightUrl, pastorImageUrl: b.pastorImageUrl } : b));
    setDraft((cur) => (cur ? { ...cur, logoUrl: b.logoUrl, logoLightUrl: b.logoLightUrl, pastorImageUrl: b.pastorImageUrl } : cur));
  };
  async function upload(slot: Slot, file: File) {
    setBusySlot(slot);
    setError('');
    try {
      mergeImages(await uploadBrandImage(slot, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusySlot(null);
    }
  }
  async function clear(slot: Slot) {
    try {
      mergeImages(await updateBrand({ clear: [slot] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const { logoUrl: _a, logoLightUrl: _b, pastorImageUrl: _c, _id: _d, ministers: _e, ...rest } = draft;
      const updated = await updateBrand(rest);
      setBrand(updated);
      setDraft(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-8xl px-4 pb-28 pt-8 sm:px-20 sm:pt-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Church Profile</h1>
      <p className="mt-1 max-w-xl text-sm text-neutral-500">
        Set these up once. They&apos;re available in every design from the editor&apos;s <span className="font-medium text-neutral-700">Brand</span> tab, and templates use them for footers, pastor photos and accent colours.
      </p>

      <div className="mt-8 space-y-5">
        <Card title="Church" hint="Shown in template footers when there's no logo.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Church name">
              <input value={draft.churchName} onChange={(e) => set('churchName', e.target.value)} placeholder="Grace City Church" className={field} />
            </Labeled>
            <Labeled label="Tagline">
              <input value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="A church for the city" className={field} />
            </Labeled>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <ImageSlot label="Logo" hint="PNG with a transparent background works best." url={draft.logoUrl} busy={busySlot === 'logo'} onPick={(f) => upload('logo', f)} onClear={() => clear('logo')} />
            <ImageSlot label="Logo for dark backgrounds" hint="Optional white/light version, used on dark templates." url={draft.logoLightUrl} dark busy={busySlot === 'logoLight'} onPick={(f) => upload('logoLight', f)} onClear={() => clear('logoLight')} />
          </div>
        </Card>

        <Card title="Pastor" hint="Used on the Pastor Split template and available to drop into any design.">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <ImageSlot label="Photo" hint="A clear head-and-shoulders photo." url={draft.pastorImageUrl} round busy={busySlot === 'pastor'} onPick={(f) => upload('pastor', f)} onClear={() => clear('pastor')} />
            <div className="space-y-4">
              <Labeled label="Pastor name">
                <input value={draft.pastorName} onChange={(e) => set('pastorName', e.target.value)} placeholder="Pastor Daniel Okoye" className={field} />
              </Labeled>
              <Labeled label="Title">
                <input value={draft.pastorTitle} onChange={(e) => set('pastorTitle', e.target.value)} placeholder="Senior Pastor" className={field} />
              </Labeled>
            </div>
          </div>
        </Card>

        <MinistersCard
          ministers={draft.ministers ?? []}
          onChange={(b) => {
            setBrand((cur) => (cur ? { ...cur, ministers: b.ministers } : b));
            setDraft((cur) => (cur ? { ...cur, ministers: b.ministers } : cur));
          }}
        />

        <Card title="Social accounts" hint="Handles or links. The Instagram handle appears in template footers.">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['instagram', 'Instagram', '@yourchurch'],
                ['facebook', 'Facebook', 'facebook.com/yourchurch'],
                ['youtube', 'YouTube', '@yourchurch'],
                ['x', 'X (Twitter)', '@yourchurch'],
                ['tiktok', 'TikTok', '@yourchurch'],
              ] as const
            ).map(([k, label, ph]) => (
              <Labeled key={k} label={label}>
                <input value={draft.socials[k]} onChange={(e) => setSocial(k, e.target.value)} placeholder={ph} className={field} />
              </Labeled>
            ))}
          </div>
        </Card>

        <Card title="Contact & address">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Labeled label="Address">
                <textarea value={draft.address} onChange={(e) => set('address', e.target.value)} rows={2} placeholder="12 Adeola Odeku St, Victoria Island, Lagos" className={cx(field, 'resize-y')} />
              </Labeled>
            </div>
            <div className="sm:col-span-2">
              <Labeled label="Service times (shown on the closing card of every video)">
                <textarea value={draft.serviceTimes} onChange={(e) => set('serviceTimes', e.target.value)} rows={3} placeholder={'Sundays 8am & 10:30am\nWednesdays 6pm'} className={cx(field, 'resize-y')} />
              </Labeled>
            </div>
            <div className="sm:col-span-2">
              <Labeled label="Closing card headline">
                <input value={draft.outroCta} onChange={(e) => set('outroCta', e.target.value)} placeholder="Get the full message" className={field} />
              </Labeled>
            </div>
            <Labeled label="Website">
              <input value={draft.website} onChange={(e) => set('website', e.target.value)} placeholder="yourchurch.org" className={field} />
            </Labeled>
            <Labeled label="Phone">
              <input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+234 …" className={field} />
            </Labeled>
            <Labeled label="Email">
              <input value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="hello@yourchurch.org" className={field} />
            </Labeled>
          </div>
        </Card>

        <Card title="Giving details" hint="Used by the Offering template.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Account number">
              <input value={draft.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} placeholder="1014552529" className={field} />
            </Labeled>
            <Labeled label="Bank">
              <input value={draft.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Zenith Bank" className={field} />
            </Labeled>
            <div className="sm:col-span-2">
              <Labeled label="Account name">
                <input value={draft.accountName} onChange={(e) => set('accountName', e.target.value)} placeholder="Grace City Church" className={field} />
              </Labeled>
            </div>
          </div>
        </Card>

        <Card title="Brand colours" hint="Optional. Templates use the accent colour for rules, numbers and highlights.">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['primaryColor', 'Primary colour'],
                ['accentColor', 'Accent colour'],
              ] as const
            ).map(([k, label]) => (
              <Labeled key={k} label={label}>
                <div className="flex items-center gap-2">
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(draft[k]) ? draft[k] : '#111111'} onChange={(e) => set(k, e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl bg-white p-1" />
                  <input value={draft[k]} onChange={(e) => set(k, e.target.value)} placeholder="#000000" className={field} />
                  {draft[k] && (
                    <button type="button" onClick={() => set(k, '')} className="shrink-0 text-xs font-medium text-neutral-500 hover:text-neutral-900">
                      Clear
                    </button>
                  )}
                </div>
              </Labeled>
            ))}
          </div>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-8xl items-center justify-between gap-3 px-4 py-3 sm:px-20">
          <div className="min-w-0 text-sm">
            {error ? <span className="text-red-600">{error}</span> : saved ? (
              <span className="flex items-center gap-1.5 text-green-600">
                <Check size={15} /> Saved
              </span>
            ) : dirty ? (
              <span className="text-neutral-500">Unsaved changes</span>
            ) : (
              <Link href="/studio" className="text-neutral-500 hover:text-neutral-900">
                Open the design studio →
              </Link>
            )}
          </div>
          <button type="button" onClick={save} disabled={saving || !dirty} className="flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-40">
            {saving && <Spinner />} Save changes
          </button>
        </div>
      </div>
    </main>
  );
}
