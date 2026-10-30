"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAME_FILLS, FRAME_MIN, FRAME_PRESETS, type Background, type Frame, type PresentState, type PresentStyle, type SectionKey, type Slide } from "@/lib/present";
import { BackgroundField } from "./BackgroundPicker";
import { Stage } from "./Stage";
import { btnPrimary, Modal } from "./ui";

const W = 1920;
const H = 1080;
const SNAP = 16;

// Realistic text for each kind of section, so the preview looks like what will really be on screen.
export const SAMPLE_SLIDES: Record<SectionKey, { label: string; slide: Slide }> = {
  scripture: {
    label: "Scripture",
    slide: { kind: "scripture", reference: "John 3:16", version: "KJV", text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
  },
  song: { label: "Song", slide: { kind: "song", title: "Amazing Grace", label: "Verse 1", text: "Amazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost, but now am found\nWas blind, but now I see" } },
  prayer: { label: "Prayer", slide: { kind: "text", variant: "prayer", text: "Father, we thank You for this day, for Your mercy that is new every morning, and for the gift of gathering in Your name." } },
};

type Mode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: { mode: Mode; cls: string; cursor: string }[] = [
  { mode: "nw", cls: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { mode: "n", cls: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { mode: "ne", cls: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { mode: "e", cls: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { mode: "se", cls: "-bottom-1.5 -right-1.5", cursor: "nwse-resize" },
  { mode: "s", cls: "-bottom-1.5 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
  { mode: "sw", cls: "-bottom-1.5 -left-1.5", cursor: "nesw-resize" },
  { mode: "w", cls: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

// Pull a value onto a guide (screen edge / centre) when it's close.
const snap = (v: number, guides: number[]) => {
  for (const g of guides) if (Math.abs(v - g) <= SNAP) return g;
  return v;
};

const same = (a: Frame | null, b: Frame | null) => (a === null || b === null ? a === b : a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
const sameBg = (a: Background | null, b: Background | null) => (!a || !b ? a === b : a.type === b.type && a.value === b.value);

// Drag a box on a 16:9 miniature of the screen to say where the text goes. Pair it with a fill (a colour bar,
// or a picture/video such as a lower-third graphic) and a picture or video background becomes a lower third.
export function FrameEditor({ state, onChange, onClose, title = "Text frame", doneLabel = "Done", onDone, extra, intro, header, canSave = true, samples = ["scripture", "song", "prayer"], locked = false }: { state: PresentState; onChange: (p: Partial<PresentStyle>) => void; onClose: () => void; title?: string; doneLabel?: string; onDone?: () => void; extra?: React.ReactNode; intro?: React.ReactNode; header?: React.ReactNode; canSave?: boolean; samples?: SectionKey[]; locked?: boolean }) {
  const list = samples.map((k) => SAMPLE_SLIDES[k]);
  const [sampleAt, setSample] = useState(0);
  const sample = Math.min(sampleAt, list.length - 1);
  const [frame, setFrame] = useState<Frame | null>(state.style.frame ?? null);
  const [fill, setFill] = useState<Background | null>(state.style.frameBg ?? null);
  const canvas = useRef<HTMLDivElement>(null);
  const pending = useRef<Frame | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFrame = useRef<Frame>(state.style.frame ?? FRAME_PRESETS[1].frame!);

  // While dragging, send the frame to the screen a few times a second, and once more when it's let go.
  const send = useCallback(
    (f: Frame | null, now = false) => {
      pending.current = f;
      if (now) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        onChange({ frame: f });
      } else if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          onChange({ frame: pending.current });
        }, 70);
      }
    },
    [onChange],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const apply = (f: Frame | null) => {
    setFrame(f);
    if (f) lastFrame.current = f;
    send(f, true);
  };

  function begin(mode: Mode, e: React.PointerEvent) {
    if (!frame || !canvas.current) return;
    e.preventDefault();
    e.stopPropagation();
    const k = W / canvas.current.getBoundingClientRect().width;
    const start = frame;
    const px = e.clientX;
    const py = e.clientY;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - px) * k;
      const dy = (ev.clientY - py) * k;
      let left = start.x;
      let top = start.y;
      let right = start.x + start.w;
      let bottom = start.y + start.h;
      if (mode === "move") {
        const w = start.w;
        const h = start.h;
        left = start.x + dx;
        top = start.y + dy;
        // snap the left edge, the centre, or the right edge - whichever is nearest a guide
        const sx = [snap(left, [0, W - w]), snap(left + w / 2, [W / 2]) - w / 2, snap(left + w, [W]) - w].reduce((a, b) => (Math.abs(a - left) <= Math.abs(b - left) ? a : b));
        const sy = [snap(top, [0, H - h]), snap(top + h / 2, [H / 2]) - h / 2, snap(top + h, [H]) - h].reduce((a, b) => (Math.abs(a - top) <= Math.abs(b - top) ? a : b));
        left = Math.min(W - w, Math.max(0, sx));
        top = Math.min(H - h, Math.max(0, sy));
        right = left + w;
        bottom = top + h;
      } else {
        if (mode.includes("w")) left = snap(start.x + dx, [0, W / 2]);
        if (mode.includes("e")) right = snap(start.x + start.w + dx, [W, W / 2]);
        if (mode.includes("n")) top = snap(start.y + dy, [0, H / 2]);
        if (mode.includes("s")) bottom = snap(start.y + start.h + dy, [H, H / 2]);
        left = Math.max(0, left);
        top = Math.max(0, top);
        right = Math.min(W, right);
        bottom = Math.min(H, bottom);
        // keep a usable minimum by pushing the edge being dragged back
        if (right - left < FRAME_MIN.w) {
          if (mode.includes("w")) left = right - FRAME_MIN.w;
          else right = left + FRAME_MIN.w;
        }
        if (bottom - top < FRAME_MIN.h) {
          if (mode.includes("n")) top = bottom - FRAME_MIN.h;
          else bottom = top + FRAME_MIN.h;
        }
      }
      const next = { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) };
      setFrame(next);
      lastFrame.current = next;
      send(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      send(lastFrame.current, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const setFillBg = (bg: Background | null) => {
    setFill(bg);
    onChange({ frameBg: bg });
  };

  const preview: PresentState = { ...state, mode: "live", slide: list[sample].slide, alert: null, style: { ...state.style, frame, frameBg: fill } };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const activePreset = FRAME_PRESETS.find((p) => same(p.frame, frame));

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-5">
        {header}
        <div className={locked ? "pointer-events-none select-none space-y-5 opacity-45" : "space-y-5"} aria-disabled={locked}>
        <p className="text-sm text-neutral-500">
          {intro ?? (
            <>
              Drag the box to place the text, and pull its edges to resize it. Give it a fill and put a picture or video behind everything, and you have a <b>lower third</b>. Pictures and videos on screen stay full screen.
            </>
          )}
        </p>

        <div ref={canvas} className="relative aspect-video w-full touch-none select-none overflow-hidden rounded-xl bg-black ring-1 ring-neutral-200">
          <div className="pointer-events-none">
            <Stage state={preview} monitor="preview" />
          </div>
          {frame ? (
            <div
              onPointerDown={(e) => begin("move", e)}
              className="absolute cursor-move border-2 border-dashed border-orange-400 bg-orange-400/10"
              style={{ left: pct(frame.x, W), top: pct(frame.y, H), width: pct(frame.w, W), height: pct(frame.h, H) }}
            >
              {HANDLES.map((h) => (
                <span key={h.mode} onPointerDown={(e) => begin(h.mode, e)} className={`absolute h-3 w-3 rounded-sm border border-orange-500 bg-white ${h.cls}`} style={{ cursor: h.cursor }} />
              ))}
              <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#ffffff]">
                {frame.w} × {frame.h}
              </span>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
              <span className="rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-[#ffffff]">Full-screen text — pick a frame below</span>
            </div>
          )}
        </div>

        {list.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold uppercase tracking-widest text-neutral-400">Preview with</span>
          {list.map((sm, i) => (
            <button key={sm.label} onClick={() => setSample(i)} className={`rounded-full px-3 py-1 font-semibold ${sample === i ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
              {sm.label}
            </button>
          ))}
        </div>
        )}

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Placement</h3>
          <div className="flex flex-wrap gap-1.5">
            {FRAME_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => apply(p.frame)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${activePreset?.id === p.id ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
              >
                {p.label}
              </button>
            ))}
            {frame && !activePreset && <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">Custom</span>}
          </div>
        </section>

        <section className={frame ? "" : "pointer-events-none opacity-40"}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Frame fill</h3>
          <div className="flex flex-wrap gap-2.5">
            {FRAME_FILLS.map((f) => {
              const on = sameBg(f.bg, fill);
              return (
                <button key={f.name} onClick={() => setFillBg(f.bg)} title={f.name} aria-label={f.name} className="w-20 text-left">
                  <span
                    className={`relative block aspect-[3/2] overflow-hidden rounded-lg border-2 ${on ? "border-orange-500" : "border-neutral-200 hover:border-neutral-300"}`}
                    style={f.bg ? { background: f.bg.value } : { backgroundImage: "linear-gradient(45deg,#d4d4d8 25%,transparent 25%,transparent 75%,#d4d4d8 75%),linear-gradient(45deg,#d4d4d8 25%,#fafafa 25%,#fafafa 75%,#d4d4d8 75%)", backgroundSize: "10px 10px", backgroundPosition: "0 0,5px 5px" }}
                  />
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-500">{f.name}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <BackgroundField value={fill && (fill.type === "image" || fill.type === "video") ? fill : null} onChange={(bg) => setFillBg(bg ?? null)} label="Or a picture / video fill" hint={{ set: "Stretches to fit the frame exactly — handy for a lower-third graphic.", unset: "Choose a picture, GIF or video (a lower-third graphic, for example) to fill the frame." }} />
          </div>
        </section>

        {extra}
        </div>

        <div className="flex justify-end gap-2">
          {onDone && (
            <button onClick={onClose} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50">
              Cancel
            </button>
          )}
          <button onClick={onDone ?? onClose} disabled={!canSave} className={`${btnPrimary} disabled:opacity-40`}>
            {doneLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
