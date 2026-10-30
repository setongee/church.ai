'use client';

import { useState } from 'react';
import { TranscriptPanel } from './TranscriptPanel';
import type { TranscriptSegment } from '@/lib/types';

const stamp = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// One "[mm:ss] text" line per sentence. Uploaded audio has exact positions in the recording; live
// sessions fall back to when each line arrived, counted from the start of the session.
export function timestampedTranscript(transcript: TranscriptSegment[], startedAt?: string): string {
  const base = startedAt ? new Date(startedAt).getTime() : transcript[0] ? new Date(transcript[0].createdAt).getTime() : 0;
  return transcript
    .filter((t) => t.isFinal !== false && t.text.trim())
    .map((t) => `[${stamp(t.startMs ?? new Date(t.createdAt).getTime() - base)}] ${t.text.trim()}`)
    .join('\n');
}

// Streaming keeps writing to `transcript` regardless of whether this is open - it's just a
// visibility toggle over state the parent already holds, not a separate subscription.
export function TranscriptDrawer({
  open,
  onClose,
  transcript,
  interimText,
  startedAt,
  title,
}: {
  open: boolean;
  onClose: () => void;
  transcript: TranscriptSegment[];
  interimText: string;
  startedAt?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = timestampedTranscript(transcript, startedAt);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'transcript').replace(/[^\w\- ]+/g, '').trim() || 'transcript'}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
          <div className="flex items-center gap-1">
            <button
              onClick={copy}
              disabled={!text}
              className="rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {copied ? 'Copied!' : 'Copy with timestamps'}
            </button>
            <button
              onClick={download}
              disabled={!text}
              className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              .txt
            </button>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <TranscriptPanel transcript={transcript} interimText={interimText} />
        </div>
      </aside>
    </>
  );
}
