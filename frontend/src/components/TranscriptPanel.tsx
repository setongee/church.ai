'use client';

import type { TranscriptSegment } from '@/lib/types';

export function TranscriptPanel({
  transcript,
  interimText,
}: {
  transcript: TranscriptSegment[];
  interimText: string;
}) {
  if (transcript.length === 0 && !interimText) {
    return (
      <p className="py-6 text-center text-xs text-neutral-400">
        Start streaming to see the transcript appear here in real time.
      </p>
    );
  }

  return (
    <p className="text-[15px] leading-relaxed text-neutral-800">
      {transcript.map((seg) => (
        <span key={seg._id}>{seg.text} </span>
      ))}
      {interimText && <span className="text-neutral-400">{interimText}</span>}
    </p>
  );
}
