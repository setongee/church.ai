'use client';

import { useState } from 'react';
import type { ReelOptions, ReelTheme, ShowKey } from '@/lib/types';
import { SHOW_SWITCHES } from './options';
import { Thumb, TemplateModal } from './TemplateModal';
import { useTemplateCatalog } from './hooks';
import { OutroEditor } from './OutroEditor';
import { Field, PreviewFrame, Slider, Toggle } from './ui';

// Design tab: pick a template, edit the on-screen text, sizes and which labels show - with a
// large live preview beside the controls.
export function DesignPanel({
  template,
  onTemplate,
  options,
  onOptions,
  autoTexts,
  previewLoad,
  previewKey,
  duration,
  previewAt,
  onPreviewAt,
  headline,
}: {
  template: string;
  onTemplate: (id: string) => void;
  options: ReelOptions;
  onOptions: (o: ReelOptions) => void;
  autoTexts: { churchName: string; serviceTitle: string; speaker: string };
  previewLoad: () => Promise<string>;
  previewKey: string;
  duration: number;
  previewAt: number;
  onPreviewAt: (n: number) => void;
  // A reel has one headline to edit here; a merged video edits each clip's headline on its Content tab.
  headline?: { value: string; onChange: (v: string) => void };
}) {
  const { catalog } = useTemplateCatalog();
  const [managing, setManaging] = useState(false);
  const theme: ReelTheme | undefined = catalog?.templates.find((t) => t.id === template)?.theme;
  const effective = (k: ShowKey) => options.show[k] ?? (theme ? (theme[k] as boolean) : true);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const set = <K extends keyof ReelOptions>(key: K, value: Partial<ReelOptions[K]>) => onOptions({ ...options, [key]: { ...options[key], ...value } });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-8">
        <Field title="Template" hint="The overall look. Customise any of them, or create your own with your colours and background image.">
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {!catalog && <p className="text-sm text-neutral-400">Loading templates…</p>}
            {catalog?.templates.map((t) => (
              <button
                key={t.id}
                onClick={() => onTemplate(t.id)}
                className={`w-32 shrink-0 rounded-xl border p-1.5 text-left transition ${template === t.id ? 'border-neutral-900 ring-2 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-400'}`}
              >
                <Thumb templateId={t.id} />
                <p className="mt-1.5 truncate px-0.5 text-xs font-medium text-neutral-900">{t.name}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setManaging(true)} className="mt-2 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100">
            Customise or create a template…
          </button>
        </Field>

        <Field title="Text" hint="Leave a box empty to use the automatic value shown in grey. The headline and takeaway are on the Content tab.">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['churchName', 'Church name', autoTexts.churchName],
                ['serviceTitle', 'Service title', autoTexts.serviceTitle],
                ['speaker', 'Preacher name', autoTexts.speaker],
                ['footerText', 'Footer line', 'e.g. Sundays 9am · Lagos'],
              ] as const
            ).map(([key, label, auto]) => (
              <label key={key} className="block text-xs font-medium text-neutral-600">
                {label}
                <input
                  value={options.texts[key]}
                  onChange={(e) => set('texts', { [key]: e.target.value })}
                  placeholder={auto}
                  maxLength={120}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900 focus:border-neutral-900 focus:outline-none"
                />
              </label>
            ))}
          </div>
        </Field>

        <Field title="Headline" hint={headline ? 'The big title on the video.' : "Each clip's headline is edited on the Content tab."}>
          <Toggle checked={effective('showHeadline')} onChange={(v) => set('show', { showHeadline: v })}>
            Show the headline
          </Toggle>
          {headline && (
            <input
              value={headline.value}
              onChange={(e) => headline.onChange(e.target.value)}
              maxLength={80}
              disabled={!effective('showHeadline')}
              placeholder="Headline"
              className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base font-semibold text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
            />
          )}
        </Field>

        <Field title="Text sizes">
          <div className="space-y-3">
            <Slider label="Headline" value={options.sizes.headline} min={0.5} max={1.8} step={0.05} format={pct} onChange={(v) => set('sizes', { headline: v })} />
            <Slider label="Captions" value={options.sizes.captions} min={0.5} max={1.8} step={0.05} format={pct} onChange={(v) => set('sizes', { captions: v })} />
            <Slider label="Names & takeaway" value={options.sizes.info} min={0.5} max={1.8} step={0.05} format={pct} onChange={(v) => set('sizes', { info: v })} />
          </div>
        </Field>

        <OutroEditor options={options} onOptions={onOptions} templateId={template} />

        <Field title="Show on the video" hint={theme ? 'Starts from the template; tick or untick to override for this video.' : undefined}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {SHOW_SWITCHES.map((s) => (
              <Toggle key={s.key} checked={effective(s.key)} onChange={(v) => set('show', { [s.key]: v })}>
                {s.label}
              </Toggle>
            ))}
          </div>
          {Object.keys(options.show).length > 0 && (
            <button onClick={() => onOptions({ ...options, show: {} })} className="mt-3 text-xs text-neutral-500 underline hover:text-neutral-800">
              Reset to the template&apos;s choices
            </button>
          )}
        </Field>
      </div>

      <div>
        <div className="lg:sticky lg:top-4">
          <PreviewFrame load={previewLoad} watch={previewKey} />
          <label className="mx-auto mt-3 flex max-w-[360px] items-center gap-2 text-xs text-neutral-500">
            Frame at
            <input type="range" min={0.5} max={Math.max(1, Math.floor(duration))} step={0.5} value={previewAt} onChange={(e) => onPreviewAt(Number(e.target.value))} className="flex-1 accent-neutral-900" />
            {previewAt.toFixed(1)}s
          </label>
        </div>
      </div>

      {managing && (
        <TemplateModal
          title="Templates"
          value={template}
          onClose={() => setManaging(false)}
          onSelect={(id) => {
            onTemplate(id);
            setManaging(false);
          }}
        />
      )}
    </div>
  );
}
