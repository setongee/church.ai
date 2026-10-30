'use client';

import Link from 'next/link';
import { ExternalLink, ImageIcon, Plus, UserRound } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import type { Brand } from '@/lib/types';
import type { DesignCanvas } from './useDesignCanvas';
import { PanelSection } from './ui';

function handle(v: string) {
  return v ? (/^https?:\/\//.test(v) ? v : `@${v.replace(/^@/, '')}`) : '';
}

export function BrandPanel({ ed, brand }: { ed: DesignCanvas; brand: Brand | null }) {
  const b = brand;
  const empty = !b || (!b.logoUrl && !b.logoLightUrl && !b.pastorImageUrl && !b.pastorName && !b.churchName && !b.address && !Object.values(b.socials).some(Boolean));

  if (empty || !b) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm font-medium text-neutral-900">No brand assets yet</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-sm text-neutral-500">Upload your logo, pastor photo, socials and address once and use them in every design.</p>
        <Link href="/brand" target="_blank" className="mt-4 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
          Set up brand assets <ExternalLink size={14} />
        </Link>
      </div>
    );
  }

  const texts: { label: string; value: string }[] = [
    { label: 'Church name', value: b.churchName },
    { label: 'Tagline', value: b.tagline },
    { label: 'Pastor', value: [b.pastorName, b.pastorTitle].filter(Boolean).join('\n') },
    { label: 'Instagram', value: handle(b.socials.instagram) },
    { label: 'Facebook', value: b.socials.facebook },
    { label: 'YouTube', value: b.socials.youtube },
    { label: 'X', value: handle(b.socials.x) },
    { label: 'TikTok', value: handle(b.socials.tiktok) },
    { label: 'Website', value: b.website },
    { label: 'Address', value: b.address },
    { label: 'Phone', value: b.phone },
    { label: 'Email', value: b.email },
  ].filter((t) => t.value);

  const contactBlock = [b.address, b.website, b.phone, handle(b.socials.instagram)].filter(Boolean).join('\n');

  return (
    <div>
      <PanelSection title="Images" action={<Link href="/brand" target="_blank" className="text-xs font-medium text-neutral-500 hover:text-neutral-900">Edit</Link>}>
        <div className="grid grid-cols-3 gap-2">
          {b.logoUrl && (
            <button type="button" onClick={() => ed.addImageLayer(b.logoUrl)} className="group text-center">
              <span className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-neutral-200 bg-white p-2 group-hover:ring-2 group-hover:ring-neutral-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(b.logoUrl)} alt="Logo" className="max-h-full max-w-full object-contain" />
              </span>
              <span className="mt-1 block text-[11px] text-neutral-600">Logo</span>
            </button>
          )}
          {b.logoLightUrl && (
            <button type="button" onClick={() => ed.addImageLayer(b.logoLightUrl)} className="group text-center">
              <span className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-800 p-2 group-hover:ring-2 group-hover:ring-neutral-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(b.logoLightUrl)} alt="Light logo" className="max-h-full max-w-full object-contain" />
              </span>
              <span className="mt-1 block text-[11px] text-neutral-600">Light logo</span>
            </button>
          )}
          {b.pastorImageUrl && (
            <button type="button" onClick={() => ed.addImageLayer(b.pastorImageUrl, { circle: true })} className="group text-center">
              <span className="block aspect-square overflow-hidden rounded-xl border border-neutral-200 group-hover:ring-2 group-hover:ring-neutral-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(b.pastorImageUrl)} alt="Pastor" className="h-full w-full object-cover" />
              </span>
              <span className="mt-1 block text-[11px] text-neutral-600">Pastor (round)</span>
            </button>
          )}
          {b.pastorImageUrl && (
            <button type="button" onClick={() => ed.addImageLayer(b.pastorImageUrl)} className="group text-center">
              <span className="grid aspect-square place-items-center rounded-xl border border-dashed border-neutral-300 text-neutral-400 group-hover:border-neutral-900 group-hover:text-neutral-900">
                <UserRound size={22} />
              </span>
              <span className="mt-1 block text-[11px] text-neutral-600">Pastor (full)</span>
            </button>
          )}
          {!b.logoUrl && !b.logoLightUrl && !b.pastorImageUrl && (
            <p className="col-span-3 flex items-center gap-2 text-xs text-neutral-400">
              <ImageIcon size={14} /> No images uploaded yet.
            </p>
          )}
        </div>
      </PanelSection>

      <PanelSection title="Details">
        {contactBlock && (
          <button type="button" onClick={() => ed.addText('body', { text: contactBlock })} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
            <Plus size={13} /> Add contact block (address, website, phone, Instagram)
          </button>
        )}
        <ul className="space-y-1">
          {texts.map((t) => (
            <li key={t.label}>
              <button type="button" onClick={() => ed.addText('body', { text: t.value })} className="flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-neutral-100">
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{t.label}</span>
                  <span className="block whitespace-pre-line break-words text-sm text-neutral-800">{t.value}</span>
                </span>
                <Plus size={15} className="mt-3 shrink-0 text-neutral-400" />
              </button>
            </li>
          ))}
        </ul>
      </PanelSection>
    </div>
  );
}
