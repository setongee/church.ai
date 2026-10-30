'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clapperboard, Plus, Tv } from 'lucide-react';
import { assetUrl, createDesign, deleteDesign, getService, listAllDesigns, listFinishedAnimations, listServices, patchDesign, type FinishedAnimation } from '@/lib/api';
import type { Design, Service, Session } from '@/lib/types';
import { DesignCard } from '@/components/editor/EditorLibrary';
import { Spinner } from '@/components/editor/ui';

const select = 'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-500 disabled:opacity-50';

// The presentation studio: the same editor, but for 16:9 slides that fill the screen in Present. Link a
// message when you start and the editor's Content panel has that message's points, quotes and scriptures.
export default function PresentationStudioPage() {
  const router = useRouter();
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [animations, setAnimations] = useState<FinishedAnimation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listAllDesigns(true)
      .then(setDesigns)
      .catch((e) => (setError(e instanceof Error ? e.message : 'Failed to load'), setDesigns([])));
    listFinishedAnimations(true).then(setAnimations).catch(() => {});
    listServices().then(setServices).catch(() => {});
  }, []);

  function pickService(id: string) {
    setServiceId(id);
    setSessionId('');
    setSessions([]);
    if (id) getService(id).then((d) => setSessions([...d.sessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()))).catch(() => {});
  }

  async function create() {
    setCreating(true);
    setError('');
    try {
      const { design } = await createDesign({ presentation: true, source: 'blank', sessionId: sessionId || undefined, title: 'Untitled slide' });
      router.push(`/design/${design._id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the design');
      setCreating(false);
    }
  }

  async function duplicate(d: Design) {
    try {
      const sid = typeof d.session === 'object' && d.session ? d.session._id : (d.session ?? undefined);
      const { design } = await createDesign({ sessionId: sid || undefined, copyFrom: d._id });
      setDesigns((l) => [design, ...(l ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to duplicate');
    }
  }

  async function untag(d: Design) {
    await patchDesign(d._id, { presentation: false }).catch(() => {});
    setDesigns((l) => (l ?? []).filter((x) => x._id !== d._id));
    setAnimations((a) => a.filter((x) => x.design._id !== d._id));
  }

  async function remove(d: Design) {
    if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return;
    await deleteDesign(d._id).catch(() => {});
    setDesigns((l) => (l ?? []).filter((x) => x._id !== d._id));
    setAnimations((a) => a.filter((x) => x.design._id !== d._id));
  }

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-20 sm:py-12">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <Tv size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Presentation studio</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-neutral-500">
            Design 16:9 slides and animations for the screen. Anything made here is tagged for <b>Present</b> and shows up under Media there.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-2xl bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-neutral-900">New slide</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Optional: link a message to use its points, quotes and scriptures in the editor.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select value={serviceId} onChange={(e) => pickService(e.target.value)} className={select} aria-label="Service">
            <option value="">No message — blank slide</option>
            {services.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!serviceId} className={select} aria-label="Session">
            <option value="">{serviceId ? (sessions.length ? 'Choose a session…' : 'No sessions yet') : 'Choose a service first'}</option>
            {sessions.map((s) => (
              <option key={s._id} value={s._id}>
                {s.title} — {s.preacher}
              </option>
            ))}
          </select>
          <button type="button" onClick={create} disabled={creating} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-60">
            {creating ? <Spinner /> : <Plus size={17} />} Create 16:9 slide
          </button>
        </div>
      </section>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <h2 className="mt-10 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        Slides <span className="font-normal text-neutral-400">({designs?.length ?? 0})</span>
      </h2>
      {designs === null ? (
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-neutral-400">
          <Spinner /> Loading…
        </div>
      ) : designs.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-neutral-300 px-6 py-14 text-center">
          <Tv size={32} className="mx-auto text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-700">No presentation slides yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-400">
            Create one above, or tag any existing design with the <b>Tv</b> button in the <a className="underline" href="/studio">design studio</a>.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {designs.map((d) => (
            <DesignCard key={d._id} design={d} onOpen={() => router.push(`/design/${d._id}`)} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} onTogglePresentation={() => untag(d)} />
          ))}
        </div>
      )}

      <h2 className="mt-10 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <Clapperboard size={15} /> Animations <span className="font-normal text-neutral-400">({animations.length})</span>
      </h2>
      <p className="mt-0.5 text-xs text-neutral-500">Made with the editor&rsquo;s Animate button on a presentation slide. They appear in Present &gt; Media automatically.</p>
      {animations.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">No animations yet — open a slide and press Animate.</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {animations.map((a) => (
            <div key={a._id} className="overflow-hidden rounded-2xl bg-white">
              <video src={assetUrl(a.videoUrl)} muted loop playsInline controls preload="metadata" className="aspect-video w-full bg-black object-contain" />
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-neutral-900">{a.design.title}</p>
                <p className="text-xs text-neutral-500">
                  {a.effect} · {a.lengthSec}s
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
