'use client';

import type { ReelStatus } from '@/lib/types';

export type TabId = string;

const DEFAULT_TABS: { id: TabId; label: string }[] = [
  { id: 'content', label: 'Content' },
  { id: 'design', label: 'Design' },
  { id: 'music', label: 'Music & soundtrack' },
  { id: 'render', label: 'Render' },
];

export const statusLabel = (status: ReelStatus, progress: number, stale: boolean) =>
  status === 'queued' ? 'Queued' : status === 'rendering' ? `Rendering ${progress}%` : status === 'error' ? 'Failed' : status === 'done' && !stale ? 'Rendered' : stale ? 'Needs re-render' : 'Draft';

const statusStyle = (status: ReelStatus, stale: boolean) =>
  status === 'rendering' || status === 'queued'
    ? 'bg-amber-100 text-amber-800'
    : status === 'error'
      ? 'bg-red-100 text-red-700'
      : status === 'done' && !stale
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-neutral-100 text-neutral-600';

// A full-width card with a header you can collapse and four tabs. The caller owns the draft
// state and the content of each tab; this only provides the frame and the unsaved-changes bar.
export function ProjectCard({
  badge,
  title,
  subtitle,
  status,
  progress,
  stale,
  open,
  onToggle,
  tab,
  onTab,
  dirty,
  saving,
  onSave,
  onDiscard,
  onDelete,
  deleteDisabled,
  tabs = DEFAULT_TABS,
  children,
}: {
  tabs?: { id: TabId; label: string }[];
  badge: React.ReactNode;
  title: string;
  subtitle: string;
  status: ReelStatus;
  progress: number;
  stale: boolean;
  open: boolean;
  onToggle: () => void;
  tab: TabId;
  onTab: (t: TabId) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
  children: React.ReactNode;
}) {
  const busy = status === 'queued' || status === 'rendering';
  return (
    <div className="overflow-hidden rounded-2xl bg-white">
      <div className="flex items-center gap-4 px-5 py-4">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-4 text-left" aria-expanded={open}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">{badge}</span>
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-neutral-900">{title}</span>
            <span className="block truncate text-xs text-neutral-500">{subtitle}</span>
          </span>
        </button>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusStyle(status, stale)}`}>{statusLabel(status, progress, stale)}</span>
        <button onClick={onToggle} className="shrink-0 px-1 text-neutral-400 hover:text-neutral-700" aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? '▾' : '▸'}
        </button>
      </div>

      {open && (
        <>
          <div className="flex gap-1 overflow-x-auto border-y border-neutral-200 bg-neutral-50 px-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                className={`relative whitespace-nowrap px-4 py-3 text-sm font-medium ${tab === t.id ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-800'}`}
              >
                {t.label}
                {t.id === 'render' && busy && <span className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />}
                {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-neutral-900" />}
              </button>
            ))}
          </div>

          <div className="p-5 sm:p-6">{children}</div>

          <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            {dirty ? (
              <>
                <span className="text-sm text-amber-700">You have unsaved changes</span>
                <button onClick={onSave} disabled={saving || busy} className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button onClick={onDiscard} disabled={saving} className="text-sm text-neutral-500 hover:text-neutral-800">
                  Discard
                </button>
              </>
            ) : (
              <span className="text-xs text-neutral-400">All changes saved</span>
            )}
            <button onClick={onDelete} disabled={deleteDisabled} className="ml-auto text-xs text-neutral-400 hover:text-red-600 disabled:opacity-40">
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
