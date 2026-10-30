'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Images, Plus, Trash2 } from 'lucide-react';
import { assetUrl, deleteCarouselPost, listCarouselPosts } from '@/lib/api';
import type { CarouselPost } from '@/lib/types';
import { useCached } from '@/lib/queries';
import { NewCarouselDialog } from '@/components/carousel/NewCarouselDialog';
import { Spinner } from '@/components/editor/ui';

function CarouselsList() {
  const router = useRouter();
  const params = useSearchParams();
  const fromSession = params.get('session') ?? undefined;
  // Cached: the list opens instantly from the last fetch and re-checks in the background.
  const { data: itemsData, set: setItems, error: loadError } = useCached<CarouselPost[]>(['carousels'], listCarouselPosts);
  const items = itemsData ?? (loadError ? [] : null);
  const [creating, setCreating] = useState(Boolean(fromSession));
  const error = loadError && !itemsData ? loadError.message : '';


  async function remove(c: CarouselPost) {
    if (!window.confirm(`Delete “${c.title}”? The slides it generated are deleted with it.`)) return;
    await deleteCarouselPost(c._id).catch(() => {});
    setItems((l) => (l ?? []).filter((x) => x._id !== c._id));
  }

  return (
    <main className="mx-auto w-full max-w-8xl px-4 pb-16 pt-8 sm:px-20 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Carousels</h1>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">Swipeable Instagram posts from a service&apos;s key points, quotes and scriptures. Mix in your own images and videos, edit every slide, publish once.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">
          <Plus size={16} /> New carousel
        </button>
      </div>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {items === null ? (
        <div className="mt-12 flex justify-center"><Spinner /></div>
      ) : items.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
          <Images className="mx-auto mb-2 text-neutral-400" />
          No carousels yet. Build one from a session.
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {items.map((c) => (
            <li key={c._id} className="group relative overflow-hidden rounded-2xl bg-white">
              <button type="button" onClick={() => router.push(`/carousels/${c._id}`)} className="block w-full text-left">
                <div className="grid aspect-[4/5] place-items-center overflow-hidden bg-neutral-100">
                  {c.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(c.coverUrl)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Images className="text-neutral-300" />
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-neutral-900">{c.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {c.slides.length} slide{c.slides.length === 1 ? '' : 's'} · {c.width}×{c.height}
                    {c.instagramPublishedAt ? ' · Posted' : ''}
                    {c.savedAsRecipe ? ' · Recipe' : ''}
                  </p>
                </div>
              </button>
              <button type="button" aria-label="Delete carousel" onClick={() => remove(c)} className="absolute right-2 top-2 hidden rounded-full bg-white/90 p-1.5 text-neutral-500 hover:text-red-600 group-hover:block">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && <NewCarouselDialog initialSessionId={fromSession} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/carousels/${id}`)} />}
    </main>
  );
}

export default function CarouselsPage() {
  return (
    <Suspense fallback={null}>
      <CarouselsList />
    </Suspense>
  );
}
