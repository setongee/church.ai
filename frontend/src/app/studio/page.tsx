'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, LayoutTemplate, Plus } from 'lucide-react';
import { createDesign, deleteDesign, listAllDesigns, patchDesign } from '@/lib/api';
import type { Design } from '@/lib/types';
import { useCached } from '@/lib/queries';
import { DesignCard } from '@/components/editor/EditorLibrary';
import { Spinner } from '@/components/editor/ui';

export default function StudioPage() {
  const router = useRouter();
  // Cached: the library opens instantly from the last fetch and re-checks in the background.
  const { data: designsData, set: setDesigns, error: loadError } = useCached<Design[]>(['designs'], listAllDesigns);
  const designs = designsData ?? (loadError ? [] : null);
  const [actionError, setError] = useState('');
  const error = actionError || (loadError && !designsData ? loadError.message : '');
  const [creating, setCreating] = useState(false);


  async function createBlank() {
    setCreating(true);
    try {
      const { design } = await createDesign({ source: 'blank', width: 1080, height: 1350, title: 'Untitled design' });
      router.push(`/design/${design._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create design');
      setCreating(false);
    }
  }

  async function duplicate(d: Design) {
    try {
      const sid = typeof d.session === 'object' && d.session ? d.session._id : (d.session ?? undefined);
      const { design } = await createDesign({ sessionId: sid || undefined, copyFrom: d._id });
      setDesigns((list) => [design, ...(list ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate');
    }
  }

  async function togglePresentation(d: Design) {
    try {
      const updated = await patchDesign(d._id, { presentation: !d.presentation });
      setDesigns((list) => (list ?? []).map((x) => (x._id === d._id ? { ...x, presentation: updated.presentation } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the tag');
    }
  }

  async function remove(d: Design) {
    if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return;
    await deleteDesign(d._id).catch(() => {});
    setDesigns((list) => (list ?? []).filter((x) => x._id !== d._id));
  }

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-20 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Design studio</h1>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">Make graphics any time — no service or quote needed. Start blank or pick a template inside the editor.</p>
        </div>
        <button type="button" onClick={createBlank} disabled={creating} className="flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-60">
          {creating ? <Spinner /> : <Plus size={17} />} New blank design
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {designs === null ? (
        <div className="mt-16 flex items-center justify-center gap-2 text-sm text-neutral-400">
          <Spinner /> Loading designs…
        </div>
      ) : designs.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-neutral-300 px-6 py-16 text-center">
          <LayoutTemplate size={34} className="mx-auto text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-700">Nothing here yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-400">Create your first design — templates for quotes and service points are waiting in the editor.</p>
        </div>
      ) : (
        <>
          <h2 className="mt-10 flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <ImageIcon size={15} /> All designs <span className="font-normal text-neutral-400">({designs.length})</span>
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {designs.map((d) => (
              <DesignCard key={d._id} design={d} onOpen={() => router.push(`/design/${d._id}`)} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} onTogglePresentation={() => togglePresentation(d)} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
