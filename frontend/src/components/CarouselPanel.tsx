'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CarouselSlide } from '@/lib/types';

export function CarouselPanel({
  slides,
  onEdit,
  sessionId,
}: {
  slides: CarouselSlide[];
  sessionId?: string;
  onEdit?: (slide: CarouselSlide, index: number) => Promise<void> | void;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);

  if (!slides || slides.length === 0) return null;

  async function copy(index: number, slide: CarouselSlide) {
    try {
      await navigator.clipboard.writeText(`${slide.title}\n\n${slide.body}`);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 1500);
    } catch {
      // clipboard not available, ignore
    }
  }

  return (
    <div className="rounded-xl bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">Carousel post</h2>
        {sessionId && (
          <Link href={`/carousels?session=${sessionId}`} className="text-xs font-medium text-indigo-600 hover:underline">
            Build an Instagram carousel →
          </Link>
        )}
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">
        Ready-to-post slides generated from this service&apos;s summary.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slides.map((slide, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-lg border border-indigo-200 bg-indigo-50 p-4"
          >
            <div>
              <span className="text-xs font-semibold text-indigo-500">Slide {i + 1}</span>
              <h3 className="mt-1 text-sm font-semibold text-neutral-900">{slide.title}</h3>
              <p className="mt-1.5 text-sm text-neutral-700">{slide.body}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => copy(i, slide)}
                className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
              >
                {copiedIndex === i ? 'Copied!' : 'Copy slide'}
              </button>
              {onEdit && (
                <button
                  disabled={openingIndex === i}
                  onClick={async () => {
                    setOpeningIndex(i);
                    try {
                      await onEdit(slide, i);
                    } finally {
                      setOpeningIndex(null);
                    }
                  }}
                  className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
                >
                  {openingIndex === i ? 'Opening…' : 'Create with editor'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
