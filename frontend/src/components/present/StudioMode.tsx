"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, GalleryHorizontal, LayoutTemplate, Moon, Play, X } from "lucide-react";
import { isTranslationLine, mediaSrc, sessionColor, type Schedule, type ScheduleItem, type Slide } from "@/lib/present";

// What a slide card shows: lyrics large, with (translation) lines small beneath; other kinds a readable line or two.
function SlideText({ s }: { s: Slide }) {
  if (s.kind === "song") {
    return (
      <span className="block whitespace-pre-line text-lg font-medium leading-snug text-neutral-900">
        {s.text.split("\n").map((l, i) => (isTranslationLine(l) ? <span key={i} className="block text-sm italic text-neutral-400">{l.trim()}</span> : <span key={i} className="block">{l}</span>))}
      </span>
    );
  }
  if (s.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaSrc(s.url)} alt="" className="h-24 w-full rounded-md object-cover" />;
  }
  if (s.kind === "video") return <span className="text-base text-neutral-700">Video</span>;
  if (s.kind === "scripture") return <span className="block text-base leading-snug text-neutral-800"><span className="mb-1 block text-sm font-bold text-orange-700">{s.reference} · {s.version}</span>{s.text}</span>;
  if (s.kind === "scripture2") return <span className="block text-base text-neutral-800">{s.left.reference} {s.left.version} | {s.right.reference} {s.right.version}</span>;
  if (s.kind === "welcome") return <span className="text-base text-neutral-800">Welcome — {s.main ?? ""}</span>;
  if (s.kind === "giving") return <span className="text-base text-neutral-800">Offering &amp; Tithe — {s.accountNo}</span>;
  if (s.kind === "ministering") return <span className="text-base text-neutral-800">Speaker intro — {s.name}</span>;
  return <span className="block whitespace-pre-line text-base leading-snug text-neutral-800">{s.text}</span>;
}

const same = (a?: Slide | null, b?: Slide | null) => !!a && !!b && (a === b || JSON.stringify(a) === JSON.stringify(b));

// Studio mode: take a session (or the whole schedule) live from one screen. Items on the left, the selected item's slides on
// the right. Clicking a slide - or stepping with the keyboard - puts it on the screen at once, so there is no more
// double-clicking up and down a song.
//   ↓ → Space  next slide (carries on into the next item)      ↑ ←  previous slide
//   Shift+↓ / Shift+↑  next / previous item                      Esc  leave Studio mode
export function StudioMode({ schedule, scope: initialScope, liveSlide, onLive, onPick, onTrigger, onPlayShow, onScreen, onClose }: {
  schedule: Schedule;
  scope: string; // a session id, or "" for the whole schedule
  liveSlide: Slide | null;
  onLive: (s: Slide) => void;
  onPick: (it: ScheduleItem) => void;
  onTrigger: (it: ScheduleItem) => void;
  onPlayShow: (it: ScheduleItem) => void;
  onScreen: (mode: "black" | "clear") => void;
  onClose: () => void;
}) {
  const sessions = useMemo(() => schedule.sessions ?? [], [schedule.sessions]);
  const [scope, setScope] = useState(initialScope);
  const [selId, setSelId] = useState("");
  const [slideIdx, setSlideIdx] = useState(-1);
  const slidesPane = useRef<HTMLDivElement>(null);

  // The items in scope, in the schedule's session order.
  const items = useMemo(() => {
    const all = schedule.items;
    if (scope) return all.filter((i) => i.session === scope);
    const order = (i: ScheduleItem) => {
      const k = sessions.findIndex((s) => s._id === i.session);
      return k < 0 ? -1 : k;
    };
    return [...all].sort((a, b) => order(a) - order(b));
  }, [schedule.items, scope, sessions]);
  const sel = items.find((i) => i._id === selId) ?? items[0];
  const selIndex = sel ? items.indexOf(sel) : -1;
  // Template and slide show items don't have slides to step through: they get one "Go live" / "Play" card.
  const special = sel?.type === "template" || sel?.type === "slideshow";

  function choose(it: ScheduleItem, slide = -1) {
    setSelId(it._id);
    setSlideIdx(slide);
    onPick(it);
  }
  function fire(it: ScheduleItem, slide: number) {
    setSelId(it._id);
    setSlideIdx(slide);
    if (it.type === "template") onTrigger(it);
    else if (it.type === "slideshow") onPlayShow(it);
    else if (it.slides[slide]) onLive(it.slides[slide]);
  }

  // Steps through every slide in order, across items. dir = ±1.
  function step(dir: 1 | -1) {
    if (!sel) return;
    if (special) {
      const j = selIndex + dir;
      if (items[j]) go(items[j], dir);
      return;
    }
    const next = slideIdx + dir;
    if (next >= 0 && next < sel.slides.length) return fire(sel, next);
    const j = selIndex + dir;
    if (items[j]) go(items[j], dir);
  }
  // Lands on an item: its first slide (stepping forward) or last (stepping back); template/slide show items just select.
  function go(it: ScheduleItem, dir: 1 | -1) {
    onPick(it);
    if (it.type === "template" || it.type === "slideshow" || !it.slides.length) {
      setSelId(it._id);
      setSlideIdx(-1);
      return;
    }
    fire(it, dir === 1 ? 0 : it.slides.length - 1);
  }
  function jump(dir: 1 | -1) {
    const j = Math.min(items.length - 1, Math.max(0, selIndex + dir));
    if (items[j] && j !== selIndex) go(items[j], 1);
  }

  // Keys are taken before the page's own shortcuts (Esc here leaves Studio mode instead of clearing the screen).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "") || e.metaKey || e.ctrlKey || e.altKey) return;
      const take = () => (e.preventDefault(), e.stopImmediatePropagation());
      if (e.key === "Escape") {
        take();
        onClose();
      } else if (["ArrowDown", "ArrowRight", " ", "PageDown"].includes(e.key)) {
        take();
        if (e.shiftKey && e.key.startsWith("Arrow")) jump(1);
        else step(1);
      } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) {
        take();
        if (e.shiftKey && e.key.startsWith("Arrow")) jump(-1);
        else step(-1);
      } else if (e.key === "Enter") {
        // Enter on a selected slide (or a template / slide show) takes it live again.
        take();
        if (sel) fire(sel, special ? 0 : Math.max(0, slideIdx));
      }
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);
  useEffect(() => {
    slidesPane.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selId, slideIdx]);

  const scopeName = scope ? (sessions.find((s) => s._id === scope)?.name ?? "Session") : schedule.name;
  const liveItemId = items.find((i) => i.slides.some((s) => same(s, liveSlide)))?._id;

  return (
    <div className="fixed inset-0 z-[66] flex flex-col bg-neutral-50" role="dialog" aria-modal="true" aria-label="Studio mode">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2.5 sm:px-5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-red-100 text-red-700">
          <Play size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-neutral-900">Studio mode · {scopeName}</h2>
          <p className="hidden text-xs text-neutral-500 sm:block">Click a slide or use ↑ ↓ to go live · Shift + ↑ ↓ jumps item · Esc to leave</p>
        </div>
        <button onClick={() => onScreen("clear")} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
          <Eraser size={14} /> Clear
        </button>
        <button onClick={() => onScreen("black")} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
          <Moon size={14} /> Black
        </button>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-[#ffffff] hover:bg-neutral-700">
          <X size={14} /> Exit
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Items */}
        <aside className="flex max-h-[38%] shrink-0 flex-col border-b border-neutral-200 bg-white md:max-h-none md:w-80 md:border-b-0 md:border-r">
          {sessions.length > 0 && (
            <div className="flex gap-1 overflow-x-auto border-b border-neutral-100 p-2">
              {[{ _id: "", name: "Everything" }, ...sessions].map((s) => (
                <button key={s._id || "all"} onClick={() => (setScope(s._id), setSelId(""), setSlideIdx(-1))} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${scope === s._id ? "bg-neutral-900 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                  {s._id && <span className="h-2 w-2 rounded-full" style={{ background: sessionColor(sessions, s._id) }} />}
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {items.length === 0 && <p className="p-4 text-center text-sm text-neutral-400">Nothing here yet.</p>}
            {items.map((it, i) => {
              const color = sessionColor(sessions, it.session);
              const on = it._id === sel?._id;
              return (
                <button
                  key={it._id}
                  onClick={() => choose(it)}
                  style={color ? { borderLeftColor: color, borderLeftWidth: 4 } : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${color ? "rounded-l-none" : ""} ${on ? "border-orange-300 bg-orange-50" : "border-neutral-100 bg-white hover:border-neutral-200"}`}
                >
                  <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-neutral-300">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-900">{it.title || "Untitled"}</span>
                    <span className="block truncate text-xs text-neutral-400">{[it.subtitle, it.slides.length > 1 && `${it.slides.length} slides`].filter(Boolean).join(" · ") || it.type}</span>
                  </span>
                  {liveItemId === it._id && <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffffff]">Live</span>}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Slides of the selected item */}
        <section ref={slidesPane} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {!sel ? (
            <p className="py-16 text-center text-sm text-neutral-400">Add items to the schedule, then take them live from here.</p>
          ) : (
            <>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-neutral-900">{sel.title || "Untitled"}</h3>
                <p className="text-sm text-neutral-500">{[sel.subtitle, sessions.find((s) => s._id === sel.session)?.name].filter(Boolean).join(" · ")}</p>
              </div>
              {special ? (
                <button onClick={() => fire(sel, 0)} className="flex w-full max-w-md items-center gap-3 rounded-2xl border-2 border-orange-300 bg-white p-5 text-left hover:bg-orange-50">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-orange-600 text-[#ffffff]">{sel.type === "template" ? <LayoutTemplate size={22} /> : <GalleryHorizontal size={22} />}</span>
                  <span>
                    <span className="block text-base font-semibold text-neutral-900">{sel.type === "template" ? "Go live with this template" : "Play this slide show"}</span>
                    <span className="text-sm text-neutral-500">Press Enter or click. ↓ moves to the next item.</span>
                  </span>
                </button>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sel.slides.map((s, i) => {
                    const live = same(s, liveSlide);
                    const active = i === slideIdx;
                    return (
                      <button
                        key={i}
                        data-active={active}
                        onClick={() => fire(sel, i)}
                        className={`relative rounded-2xl border-2 p-4 text-left transition ${live ? "border-red-500 bg-red-50 shadow-md" : active ? "border-orange-400 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-300"}`}
                      >
                        <span className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-orange-600">
                          <span>{s.kind === "song" && s.label ? s.label : `Slide ${i + 1}`}</span>
                          {live && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] text-[#ffffff]">On screen</span>}
                        </span>
                        <SlideText s={s} />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
