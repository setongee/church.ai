'use client';

import { useEffect, useRef } from 'react';

const BAR_COUNT = 5;

export function MicPulse({ stream }: { stream: MediaStream | null }) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!stream) return;

    const audioContext = new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId: number;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.floor((i + 1) * (data.length / (BAR_COUNT + 1)));
        const level = data[idx] / 255;
        const bar = barRefs.current[i];
        if (bar) {
          bar.style.height = `${12 + level * 88}%`;
          bar.style.opacity = `${0.55 + level * 0.45}`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5">
      <div className="flex h-4 items-end gap-0.5">
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="w-1 rounded-full bg-red-500"
            style={{ height: '12%' }}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-red-600">Listening</span>
    </div>
  );
}
