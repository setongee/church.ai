'use client';

import type { ReelOptions } from '@/lib/types';
import { fmtDuration } from './options';
import { Field, Slider, Toggle } from './ui';

const SPEEDS = [0.75, 1, 1.25, 1.5];

// Playback speed + automatic cutting of long silences. Both apply to the voice, the captions
// and the video together, so everything stays in sync.
export function PaceControls({
  pace,
  onChange,
  plannedSec,
  sourceSec,
}: {
  pace: ReelOptions['pace'];
  onChange: (p: Partial<ReelOptions['pace']>) => void;
  // Length with these settings, as last calculated by the server (only known for saved settings).
  plannedSec?: number;
  sourceSec?: number;
}) {
  return (
    <Field title="Pace" hint="Speed the video up or slow it down, and trim awkward silences.">
      <div className="space-y-4 rounded-xl border border-neutral-200 p-4">
        <div>
          <Slider label="Playback speed" value={pace.speed} min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => onChange({ speed: v })} />
          <div className="ml-[9.75rem] mt-2 flex flex-wrap gap-1.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => onChange({ speed: s })}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${Math.abs(pace.speed - s) < 0.01 ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}
              >
                {s === 1 ? 'Normal' : `${s}×`}
              </button>
            ))}
          </div>
          <p className="ml-[9.75rem] mt-1.5 text-xs text-neutral-400">The voice keeps its natural pitch.</p>
        </div>

        <div className="border-t border-neutral-100 pt-4">
          <Toggle checked={pace.trimPauses} onChange={(v) => onChange({ trimPauses: v })} hint="Silences longer than the limit are cut down to a short natural beat.">
            Remove long pauses
          </Toggle>
          <label className={`mt-3 flex items-center gap-3 text-sm text-neutral-700 ${pace.trimPauses ? '' : 'opacity-40'}`}>
            <span className="w-36 shrink-0">Longer than</span>
            <input
              type="number"
              min={0.3}
              max={10}
              step={0.1}
              disabled={!pace.trimPauses}
              value={pace.maxPause}
              onChange={(e) => onChange({ maxPause: Math.min(10, Math.max(0.3, Number(e.target.value) || 1.5)) })}
              className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            seconds
          </label>
        </div>

        <div className="space-y-3 border-t border-neutral-100 pt-4">
          <Toggle checked={pace.finishSentence} onChange={(v) => onChange({ finishSentence: v })} hint="If a clip would stop mid-sentence it runs on to the end of that sentence (or starts at the beginning of one).">
            Always finish the sentence
          </Toggle>
          <Toggle checked={pace.echo} onChange={(v) => onChange({ echo: v })} hint="A cinematic echo on the very last word, so the audio rings out instead of stopping abruptly.">
            Echo on the last word
          </Toggle>
        </div>

        {plannedSec !== undefined && (
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Final length with these settings: <strong>{fmtDuration(plannedSec)}</strong>
            {sourceSec !== undefined && Math.abs(sourceSec - plannedSec) > 0.5 && <span className="text-neutral-400"> (from {fmtDuration(sourceSec)} of recording)</span>}
          </p>
        )}
      </div>
    </Field>
  );
}
