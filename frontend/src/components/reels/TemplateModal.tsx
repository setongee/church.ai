'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createReelTemplate,
  deleteReelTemplate,
  previewReelTemplate,
  updateReelTemplate,
} from '@/lib/api';
import type { ReelTemplateCatalog, ReelTemplateInfo, ReelTheme } from '@/lib/types';
import { fetchTemplatePreview, forgetTemplatePreview, useTemplateCatalog } from './hooks';

function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full rounded-xl bg-white ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}
      >
        {children}
      </div>
    </div>
  );
}
export { Overlay };

export function Thumb({ templateId, reelId, version }: { templateId: string; reelId?: string; version?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTemplatePreview(templateId, reelId)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [templateId, reelId, version]);

  return (
    <div className="aspect-[9/16] w-full overflow-hidden rounded-md bg-neutral-100">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[11px] text-neutral-400">
          {failed ? 'No preview' : 'Rendering…'}
        </div>
      )}
    </div>
  );
}

export function TemplateModal({
  value,
  onSelect,
  onClose,
  reelId,
  title = 'Choose a template',
  applyAllLabel,
  onApplyAll,
}: {
  value?: string;
  onSelect: (templateId: string) => void;
  onClose: () => void;
  // When set, previews use this reel's real words and headline instead of sample text.
  reelId?: string;
  title?: string;
  applyAllLabel?: string;
  onApplyAll?: (templateId: string) => void;
}) {
  const { catalog, refresh } = useTemplateCatalog();
  const [selected, setSelected] = useState(value ?? 'builtin:kinetic');
  const [editing, setEditing] = useState<{ id?: string; name: string; theme: ReelTheme } | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  async function handleDelete(t: ReelTemplateInfo) {
    if (!confirm(`Delete the template "${t.name}"? Anything using it switches back to Midnight Gold.`)) return;
    try {
      await deleteReelTemplate(t.id);
      forgetTemplatePreview(t.id);
      if (selected === t.id) setSelected('builtin:kinetic');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <Overlay onClose={onClose} wide>
      {editing ? (
        <TemplateEditor
          seed={editing}
          catalog={catalog}
          onCancel={() => setEditing(null)}
          onSaved={async (id) => {
            forgetTemplatePreview(id);
            await refresh();
            setVersion((v) => v + 1);
            setSelected(id);
            setEditing(null);
          }}
        />
      ) : (
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                Pick a look, or create your own with your colours, background image and labels.
              </p>
            </div>
            <button
              onClick={() =>
                setEditing({
                  name: '',
                  theme: catalog?.templates.find((t) => t.id === selected)?.theme ?? catalog!.templates[0].theme,
                })
              }
              disabled={!catalog}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              + Create template
            </button>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {!catalog ? (
            <p className="mt-6 text-sm text-neutral-400">Loading…</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {catalog.templates.map((t) => (
                <div
                  key={t.id}
                  className={`flex flex-col gap-2 rounded-lg border p-2 ${
                    selected === t.id ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'
                  }`}
                >
                  <button onClick={() => setSelected(t.id)} className="text-left">
                    <Thumb templateId={t.id} reelId={reelId} version={version} />
                  </button>
                  <div className="px-0.5">
                    <p className="text-sm font-medium text-neutral-900">{t.name}</p>
                    <p className="line-clamp-2 text-[11px] text-neutral-500">{t.description}</p>
                  </div>
                  <div className="mt-auto flex gap-1.5 px-0.5 text-[11px]">
                    <button
                      onClick={() => setEditing({ id: t.builtin ? undefined : t.id, name: t.builtin ? `${t.name} copy` : t.name, theme: t.theme })}
                      className="rounded border border-neutral-300 px-1.5 py-0.5 text-neutral-700 hover:bg-neutral-100"
                    >
                      {t.builtin ? 'Customise' : 'Edit'}
                    </button>
                    {!t.builtin && (
                      <button onClick={() => handleDelete(t)} className="px-1 py-0.5 text-neutral-400 hover:text-red-600">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 pt-4">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
              Cancel
            </button>
            {onApplyAll && (
              <button
                onClick={() => onApplyAll(selected)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
              >
                {applyAllLabel ?? 'Use for all'}
              </button>
            )}
            <button
              onClick={() => onSelect(selected)}
              className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Use this template
            </button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

// ------------------------------------------------------------------ editor

const TOGGLES: { key: keyof ReelTheme; label: string }[] = [
  { key: 'showLogo', label: 'Church logo' },
  { key: 'showChurch', label: 'Church name (if no logo)' },
  { key: 'showHeadline', label: 'Headline' },
  { key: 'showSpeaker', label: 'Preacher name' },
  { key: 'showSessionTitle', label: 'Service title (top right)' },
  { key: 'showWaveform', label: 'Audio waveform' },
  { key: 'showProgress', label: 'Progress bar' },
];

const COLORS: { key: keyof ReelTheme; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'bg2', label: 'Background 2' },
  { key: 'text', label: 'Text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentText', label: 'Text on accent' },
];

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

function TemplateEditor({
  seed,
  catalog,
  onCancel,
  onSaved,
}: {
  seed: { id?: string; name: string; theme: ReelTheme };
  catalog: ReelTemplateCatalog | null;
  onCancel: () => void;
  onSaved: (id: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(seed.name);
  const [theme, setTheme] = useState<ReelTheme>(seed.theme);
  // A newly picked image is held as a data URI only until the first preview uploads it.
  const [pendingImage, setPendingImage] = useState<string | undefined>();
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  function patch(p: Partial<ReelTheme>) {
    setTheme((t) => ({ ...t, ...p }));
  }

  // Live preview: re-render a still shortly after the last change.
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await previewReelTemplate({ theme, backgroundImage: pendingImage });
        if (id !== requestId.current) return;
        setPreviewUrl(res.url);
        if (pendingImage && res.backgroundImageUrl) {
          setPendingImage(undefined);
          setTheme((t) => ({ ...t, backgroundImageUrl: res.backgroundImageUrl }));
        }
      } catch (err) {
        if (id === requestId.current) setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        if (id === requestId.current) setPreviewing(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [theme, pendingImage]);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError('Use a PNG, JPEG or WebP image.');
    if (file.size > 8 * 1024 * 1024) return setError('That image is over 8 MB.');
    setError('');
    setPendingImage(await readAsDataUri(file));
  }

  async function save() {
    if (!name.trim()) return setError('Give the template a name.');
    setSaving(true);
    setError('');
    try {
      const input = { name: name.trim(), theme, backgroundImage: pendingImage };
      const saved = seed.id ? await updateReelTemplate(seed.id, input) : await createReelTemplate(input);
      await onSaved(saved._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  }

  const hasImage = Boolean(pendingImage || theme.backgroundImageUrl);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-900">{seed.id ? 'Edit template' : 'Create template'}</h2>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Back
        </button>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          <label className="block text-sm font-medium text-neutral-700">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday Service Gold"
              maxLength={60}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>

          <div>
            <p className="text-sm font-medium text-neutral-700">Layout</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {catalog?.layouts.map((l) => (
                <button
                  key={l.id}
                  onClick={() => patch({ layout: l.id })}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    theme.layout === l.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-700">Colours</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {COLORS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="color"
                    value={theme[c.key] as string}
                    onChange={(e) => patch({ [c.key]: e.target.value } as Partial<ReelTheme>)}
                    className="h-8 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700">
              Font
              <select
                value={theme.font}
                onChange={(e) => patch({ font: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {catalog?.fonts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Footer line
              <input
                value={theme.footerText}
                onChange={(e) => patch({ footerText: e.target.value })}
                placeholder="Sundays 9am · Lagos"
                maxLength={80}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-700">Background image</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => pickImage(e.target.files?.[0])}
                className="text-xs text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
              />
              {hasImage && (
                <button
                  onClick={() => {
                    setPendingImage(undefined);
                    patch({ backgroundImageUrl: '' });
                  }}
                  className="text-xs text-neutral-500 hover:text-red-600"
                >
                  Remove image
                </button>
              )}
            </div>
            {hasImage && (
              <label className="mt-3 flex items-center gap-3 text-xs text-neutral-600">
                Darken image
                <input
                  type="range"
                  min={0}
                  max={90}
                  value={Math.round(theme.overlay * 100)}
                  onChange={(e) => patch({ overlay: Number(e.target.value) / 100 })}
                  className="w-40"
                />
                {Math.round(theme.overlay * 100)}%
              </label>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-700">Show on the video</p>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {TOGGLES.map((t) => (
                <label key={t.key} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={theme[t.key] as boolean}
                    onChange={(e) => patch({ [t.key]: e.target.checked } as Partial<ReelTheme>)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
              Church logo and name come from the Church Profile; the preacher and service title come from the session and can be edited per video.
            </p>
          </div>
        </div>

        <div>
          <div className="sticky top-4">
            <p className="mb-1.5 text-xs font-medium text-neutral-500">Preview {previewing && '· updating…'}</p>
            <div className="aspect-[9/16] w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Template preview" className={`h-full w-full object-cover ${previewing ? 'opacity-60' : ''}`} />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-neutral-400">Rendering…</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-neutral-200 pt-4">
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : seed.id ? 'Save changes' : 'Save template'}
        </button>
      </div>
    </div>
  );
}
