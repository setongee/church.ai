"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Columns2, Eye, EyeOff, Send } from "lucide-react";
import type { PresentPatch, Slide, SplitDeck, SplitPage } from "@/lib/present";
import { rememberScripture } from "@/lib/scriptureSession";
import { btnPrimary, inputCls } from "./ui";

const DRAFT_KEY = "present-split-draft";
const TITLE_KEY = "present-split-title";

const SAMPLE = `# God's love
He loved us first
Love is shown, not just said
---
# Our response
Receive it
Pass it on`;

// "# Heading" starts a slide (optional); every other line is a point; a line of --- starts the next slide.
// With no --- the whole thing is one slide.
export function parsePages(text: string): SplitPage[] {
  const pages: SplitPage[] = [];
  let cur: SplitPage = { points: [] };
  const flush = () => {
    if (cur.heading || cur.points.length) pages.push(cur);
    cur = { points: [] };
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (/^-{3,}$/.test(line)) flush();
    else if (/^#\s*/.test(line) && !cur.heading && !cur.points.length) cur.heading = line.replace(/^#\s*/, "");
    else if (line) cur.points.push(line.replace(/^[-*•]\s+/, ""));
  }
  flush();
  return pages;
}

interface Props {
  deck: SplitDeck | null | undefined;
  patch: (p: PresentPatch) => void;
  // What is on the live screen: if it's two scriptures side by side, the key points replace that split.
  liveSlide?: Slide | null;
}

// Key points for the left half of the screen. The scripture on the right is changed from the Scripture tab
// as usual - these points stay put until you change or turn them off.
export function SplitPanel({ deck, patch, liveSlide }: Props) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      setText(localStorage.getItem(DRAFT_KEY) ?? "");
      setTitle(localStorage.getItem(TITLE_KEY) ?? "");
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text);
      localStorage.setItem(TITLE_KEY, title);
    } catch {}
  }, [text, title]);

  const pages = useMemo(() => parsePages(text), [text]);
  const on = Boolean(deck?.on);
  const total = deck?.pages.length ?? 0;
  const inSync = Boolean(deck) && JSON.stringify(deck!.pages) === JSON.stringify(pages) && (deck!.title ?? "") === title.trim();

  // The newest split wins: switching the points on replaces a two-scriptures split (in the Scripture tab and on the live screen).
  function takeOver(): Partial<PresentPatch> {
    rememberScripture({ split: false });
    return liveSlide?.kind === "scripture2" ? { mode: "live", slide: { kind: "scripture", ...liveSlide.left } } : {};
  }
  function apply(show = on) {
    if (!pages.length) return;
    // Brand-new points start from the first slide; a small edit to the same slides keeps your place.
    const sameSlides = Boolean(deck) && deck!.pages.length === pages.length && deck!.pages.every((p, i) => (p.heading ?? "") === (pages[i].heading ?? ""));
    patch({ split: { on: show, title: title.trim() || undefined, pages, index: sameSlides ? Math.min(deck!.index, pages.length - 1) : 0 }, ...(show ? takeOver() : {}) });
  }
  const go = (index: number) => deck && patch({ split: { ...deck, index: Math.min(total - 1, Math.max(0, index)) } });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <Columns2 size={18} className="text-orange-600" /> Split screen — points beside the scripture
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500">Type the key points for the left side. The scripture on the right can be changed any time from the Scripture tab without touching these.</p>
        </div>
        <button
          onClick={() => (deck && inSync ? patch({ split: { ...deck, on: !on }, ...(on ? {} : takeOver()) }) : apply(true))}
          disabled={!pages.length && !deck}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${on ? "bg-[#171717] text-white hover:bg-[#262626]" : "bg-orange-600 text-[#ffffff] hover:bg-orange-700"}`}
        >
          {on ? <EyeOff size={16} /> : <Eye size={16} />} {on ? "Turn split off" : "Turn split on"}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_16rem]">
        <div className="flex min-h-0 flex-col gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Small title above the points (optional) — e.g. the message title" className={inputCls} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={SAMPLE}
            spellCheck
            className={`${inputCls} min-h-48 flex-1 resize-none font-mono text-[13px] leading-relaxed`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-400">
              One point per line · <code className="rounded bg-neutral-100 px-1">---</code> starts the next slide · <code className="rounded bg-neutral-100 px-1"># Heading</code> titles a slide
            </p>
            <button onClick={() => apply()} disabled={!pages.length || inSync} className={`${btnPrimary} disabled:opacity-40`}>
              <Send size={15} /> {deck ? (inSync ? "Up to date" : "Update screen") : "Save points"}
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Slides</p>
          <p className="text-sm text-neutral-600">
            {pages.length === 0 ? "Nothing typed yet." : pages.length === 1 ? "One slide with all the points." : `${pages.length} slides — step through them as you preach.`}
          </p>
          {deck && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 p-1.5">
              <button onClick={() => go(deck.index - 1)} disabled={deck.index <= 0} aria-label="Previous slide of points" className="rounded-md p-2 text-neutral-600 hover:bg-white hover:text-orange-600 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold tabular-nums text-neutral-700">
                {Math.min(deck.index + 1, total)} / {total}
              </span>
              <button onClick={() => go(deck.index + 1)} disabled={deck.index >= total - 1} aria-label="Next slide of points" className="rounded-md p-2 text-neutral-600 hover:bg-white hover:text-orange-600 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <ol className="max-h-52 space-y-1 overflow-y-auto text-xs text-neutral-500">
            {pages.map((p, i) => (
              <li key={i}>
                <button onClick={() => deck && inSync && go(i)} className={`w-full truncate rounded-md px-2 py-1 text-left ${deck && inSync && deck.index === i ? "bg-orange-50 font-semibold text-orange-700" : "hover:bg-neutral-50"}`}>
                  {i + 1}. {p.heading || p.points[0] || "—"}
                </button>
              </li>
            ))}
          </ol>
          <p className="text-[11px] leading-snug text-neutral-400">The split shows while a single scripture is on screen. Songs, videos and other slides show full screen, then the split returns with the next scripture.</p>
        </div>
      </div>
    </div>
  );
}
