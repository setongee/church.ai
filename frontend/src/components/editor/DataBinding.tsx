'use client';

import { useState } from 'react';
import { Link2, Unlink, UserRound } from 'lucide-react';
import { assetUrl, listEditorImages } from '@/lib/api';
import type { Brand, ImageAsset } from '@/lib/types';
import { IMAGE_FIELDS, TEXT_FIELDS, allPeople, slotLabel } from './dataFields';
import type { DesignCanvas } from './useDesignCanvas';
import { Popover, cx } from './ui';

// "Link to data" for the selected text or picture: pick which piece of data it shows (message
// title, preacher name, preacher photo...). Linked layers follow the data and are saved that way
// in templates. For the preacher there is also a picker for who is preaching.
export function DataBinding({ ed, brand }: { ed: DesignCanvas; brand: Brand | null }) {
  const sel = ed.selection;
  // The note belongs to the selection state it was raised for, so it clears itself on change.
  const [noted, setNoted] = useState<{ key: string; text: string }>({ key: '', text: '' });
  const [gallery, setGallery] = useState<ImageAsset[] | null>(null);
  const kind = sel?.kind === 'text' ? 'text' : sel?.kind === 'image' ? 'image' : null;
  const slot = sel?.slot;
  const people = allPeople(brand);
  const preacherRelated = slot === 'preacher' || slot === 'author';

  if (!sel || sel.count !== 1 || !kind || sel.structural) return null;
  const fields = kind === 'text' ? TEXT_FIELDS : IMAGE_FIELDS;

  const noteKey = `${kind}:${slot ?? ''}`;
  const note = noted.key === noteKey ? noted.text : '';
  const choose = async (key: string | null) => {
    const text = await ed.bindSelected(key);
    setNoted({ key: `${kind}:${key ?? ''}`, text });
  };

  return (
    <Popover
      className="w-72"
      trigger={(_, toggle) => (
        <button
          type="button"
          onClick={toggle}
          title="Link this to data, so it updates when the data changes"
          className={cx('mx-1 flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium', slot ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50')}
        >
          <Link2 size={14} />
          {slot ? slotLabel(slot) : 'Link to data'}
        </button>
      )}
    >
      {() => (
        <div className="max-h-[70vh] overflow-y-auto">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Show {kind === 'text' ? 'text from' : 'picture of'}</p>
          <ul className="space-y-0.5">
            <li>
              <button type="button" onClick={() => choose(null)} className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-100', !slot && 'bg-neutral-100 font-medium')}>
                <Unlink size={13} className="text-neutral-400" /> Fixed (not linked)
              </button>
            </li>
            {fields.map((f) => (
              <li key={f.key}>
                <button type="button" onClick={() => choose(f.key)} className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-100', slot === f.key && 'bg-blue-50 font-medium text-blue-700')}>
                  {f.label}
                  {!ed.hasData(f.key) && <span className="text-[10px] font-normal text-neutral-400">empty</span>}
                </button>
              </li>
            ))}
          </ul>
          {note && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{note}</p>}

          {preacherRelated && (
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Who is preaching?</p>
              {people.length === 0 ? (
                <p className="text-xs text-neutral-500">Add your ministers in the Church Profile and they will show up here.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {people.map((p) => (
                    <button key={p.name} type="button" onClick={() => ed.setPreacher({ name: p.name, imageUrl: p.imageUrl })} title={p.name} className="group text-center">
                      <span className="grid aspect-square place-items-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-50 text-neutral-400 group-hover:ring-2 group-hover:ring-neutral-900">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={assetUrl(p.imageUrl)} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <UserRound size={18} />
                        )}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-neutral-600">{p.name.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mb-1.5 mt-3 text-xs font-medium text-neutral-600">Or use a photo from your gallery</p>
              {gallery === null ? (
                <button type="button" onClick={() => listEditorImages('gallery').then(setGallery).catch(() => setGallery([]))} className="w-full rounded-lg border border-neutral-200 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                  Show gallery
                </button>
              ) : gallery.length === 0 ? (
                <p className="text-xs text-neutral-400">Your gallery is empty.</p>
              ) : (
                <div className="grid grid-cols-5 gap-1.5">
                  {gallery.slice(0, 20).map((a) => (
                    <button key={a._id} type="button" onClick={() => ed.setPreacher({ imageUrl: a.url })} className="aspect-square overflow-hidden rounded-md border border-neutral-200 hover:ring-2 hover:ring-neutral-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={assetUrl(a.url)} alt={a.name || 'Gallery image'} className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
