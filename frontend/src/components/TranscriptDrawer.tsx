'use client';

import { TranscriptPanel } from './TranscriptPanel';
import type { TranscriptSegment } from '@/lib/types';

// Streaming keeps writing to `transcript` regardless of whether this is open - it's just a
// visibility toggle over state the parent already holds, not a separate subscription.
export function TranscriptDrawer({
  open,
  onClose,
  transcript,
  interimText,
}: {
  open: boolean;
  onClose: () => void;
  transcript: TranscriptSegment[];
  interimText: string;
}) {
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Transcript</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <TranscriptPanel transcript={transcript} interimText={interimText} />
        </div>
      </aside>
    </>
  );
}
