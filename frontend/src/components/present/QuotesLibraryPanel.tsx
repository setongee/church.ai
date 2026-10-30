"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, GalleryHorizontal, Pencil, Play, Plus, Quote as QuoteIcon, Repeat, Save, Trash2 } from "lucide-react";
import { appQuotes, deleteQuote, deleteSlideshow, listQuotes, listSlideshows, playShow, saveQuote, saveSlideshow, showSlides, type AppTextItem, type Background, type PresentQuote, type PresentStyle, type ScheduleItemInput, type Slide, type Slideshow } from "@/lib/present";
import { BackgroundField, BackgroundThumb } from "./BackgroundPicker";
import { LayoutPicker } from "./LayoutPicker";
import { Chips, SearchBox, ViewTabs, type QuotesView } from "./appSource";
import { draftFromShow, newDraft, SlideshowEditor, toInput, type ShowDraft } from "./SlideshowEditor";
import { SessionScope, useAppScope } from "./SessionScope";
import { btnGhost, btnPrimary, Empty, Field, inputCls, Modal } from "./ui";

interface Props {
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onAdd: (item: ScheduleItemInput) => void;
  style: PresentStyle;
  background: Background;
  onStyle: (p: Partial<PresentStyle>) => void;
}

const BLANK: { text: string; attribution: string; background: Background | null } = { text: "", attribution: "", background: null };
const toSlide = (text: string, attribution?: string, background?: Background | null): Slide => ({ kind: "quote", text, attribution: attribution || undefined, background: background ?? undefined });
const titleOf = (text: string) => (text.length > 48 ? `${text.slice(0, 47)}…` : text);

// Quotes & excerpts. "From the app" pulls in the quotes being generated from sermons, plus key points,
// declarations and pull quotes from message notes - so what the app finds can go straight on screen.
export function QuotesLibraryPanel({ onStage, onLive, onAdd, style, background, onStyle }: Props) {
  const [view, setView] = useState<QuotesView>("library");
  const [quotes, setQuotes] = useState<PresentQuote[] | null>(null);
  const [fromApp, setFromApp] = useState<AppTextItem[] | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState("");
  const [editing, setEditing] = useState<{ id?: string; draft: typeof BLANK } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const { services, sessions, scope, change } = useAppScope();
  // Quotes ticked to turn into a slide show (library ones by id, app ones by their own id).
  const [selected, setSelected] = useState<Map<string, { text: string; attribution: string; background: Background | null }>>(new Map());
  const [shows, setShows] = useState<Slideshow[] | null>(null);
  const [showEditor, setShowEditor] = useState<ShowDraft | null>(null);
  const [showSaving, setShowSaving] = useState(false);
  const [showError, setShowError] = useState("");

  const refresh = useCallback(() => listQuotes().then(setQuotes).catch((e) => (setQuotes([]), setError(e.message))), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const refreshShows = useCallback(() => listSlideshows().then(setShows).catch((e) => (setShows([]), setError(e.message))), []);
  useEffect(() => {
    refreshShows();
  }, [refreshShows]);
  useEffect(() => {
    if (view !== "app" || !scope) return;
    const t = setTimeout(() => appQuotes(q, scope).then(setFromApp).catch((e) => (setFromApp([]), setError(e.message))), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [view, q, scope]);

  const kinds = useMemo(() => {
    const c = new Map<string, number>();
    fromApp?.forEach((t) => c.set(t.label, (c.get(t.label) ?? 0) + 1));
    return [...c.entries()].map(([label, count]) => ({ id: label, label, count }));
  }, [fromApp]);

  async function save() {
    if (!editing) return;
    try {
      await saveQuote(editing.draft, editing.id);
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  const toggle = (key: string, quote: { text: string; attribution?: string; background?: Background | null }) =>
    setSelected((cur) => {
      const n = new Map(cur);
      if (n.has(key)) n.delete(key);
      else n.set(key, { text: quote.text, attribution: quote.attribution || "", background: quote.background ?? null });
      return n;
    });
  const pickBox = (key: string, quote: { text: string; attribution?: string; background?: Background | null }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggle(key, quote);
      }}
      aria-pressed={selected.has(key)}
      aria-label={selected.has(key) ? "Remove from selection" : "Select for a slide show"}
      title="Select for a slide show"
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition ${selected.has(key) ? "border-orange-600 bg-orange-600 text-[#ffffff]" : "border-neutral-300 text-transparent hover:border-orange-400"}`}
    >
      ✓
    </button>
  );

  async function saveShow(d: ShowDraft) {
    setShowSaving(true);
    setShowError("");
    try {
      await saveSlideshow(toInput(d), d.id);
      setShowEditor(null);
      setSelected(new Map());
      setView("shows");
      refreshShows();
    } catch (e) {
      setShowError(e instanceof Error ? e.message : "Couldn't save the slide show");
    } finally {
      setShowSaving(false);
    }
  }

  const mine = (quotes ?? []).filter((x) => !q || `${x.text} ${x.attribution}`.toLowerCase().includes(q.toLowerCase()));

  const actions = (add: () => void, extra?: React.ReactNode) => (
    <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
      <button
        onClick={(e) => {
          e.stopPropagation();
          add();
        }}
        title="Add to schedule"
        aria-label="Add to schedule"
        className="rounded-md p-1.5 text-neutral-400 hover:bg-orange-50 hover:text-orange-600"
      >
        <CalendarPlus size={15} />
      </button>
      {extra}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewTabs<QuotesView> value={view} onChange={setView} libraryLabel="My quotes" extra={[{ id: "shows", label: "Slide shows" }]} />
        {view !== "shows" && <SearchBox value={q} onChange={setQ} placeholder={view === "app" ? "Search sermon quotes…" : "Search quotes"} />}
        {view === "app" && <SessionScope services={services} sessions={sessions} scope={scope} onChange={change} />}
        {view === "library" && (
          <button onClick={() => setEditing({ draft: BLANK })} className={`${btnPrimary} ml-auto`}>
            <Plus size={16} /> New quote
          </button>
        )}
        {view === "shows" && (
          <button
            onClick={() => {
              setShowError("");
              setShowEditor(newDraft([]));
            }}
            className={`${btnPrimary} ml-auto`}
          >
            <Plus size={16} /> New slide show
          </button>
        )}
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <LayoutPicker style={style} background={background} onStyle={onStyle} />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {view === "shows" ? (
          <>
            {shows === null && <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>}
            {shows?.length === 0 && (
              <Empty icon={<GalleryHorizontal size={22} />} title="No slide shows yet">
                Tick a few quotes in <b>My quotes</b> or <b>From the app</b>, then press <b>Create slide show</b> — or start one here.
              </Empty>
            )}
            {shows?.map((sh) => {
              const slides = showSlides(sh);
              const run = () => playShow(slides, { seconds: sh.seconds, loop: sh.loop, name: sh.name });
              return (
                <div key={sh._id} className="group rounded-xl bg-white p-4 transition hover:border-orange-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-neutral-900">{sh.name}</h3>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                        <span>{slides.length} slide{slides.length === 1 ? "" : "s"}</span>
                        <span>{sh.seconds}s each</span>
                        {sh.loop && (
                          <span className="inline-flex items-center gap-1 text-orange-600">
                            <Repeat size={11} /> Loops
                          </span>
                        )}
                        {sh.closing.enabled && <span>Closing slide</span>}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm text-neutral-500">“{sh.quotes[0]?.text}”</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={run} className={`${btnPrimary} px-3.5 py-2`}>
                        <Play size={14} fill="currentColor" /> Play
                      </button>
                      <button
                        onClick={() => onAdd({ type: "slideshow", title: sh.name, subtitle: `${slides.length} slides · ${sh.seconds}s each${sh.loop ? " · loops" : ""}`, slides, show: { seconds: sh.seconds, loop: sh.loop } })}
                        title="Add to schedule"
                        aria-label="Add to schedule"
                        className="rounded-lg p-2 text-neutral-400 hover:bg-orange-50 hover:text-orange-600"
                      >
                        <CalendarPlus size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setShowError("");
                          setShowEditor(draftFromShow(sh));
                        }}
                        aria-label="Edit"
                        className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Delete “${sh.name}”?`)) {
                            await deleteSlideshow(sh._id);
                            refreshShows();
                          }
                        }}
                        aria-label="Delete"
                        className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : view === "library" ? (
          <>
            {quotes && mine.length === 0 && (
              <Empty icon={<QuoteIcon size={22} />} title={q ? "No quotes match" : "No quotes yet"}>
                Add a quote or excerpt, or open <b>From the app</b> to use the ones generated from your sermons.
              </Empty>
            )}
            {mine.map((x) => (
              <div
                key={x._id}
                onClick={() => {
                  setActiveId(x._id);
                  onStage(toSlide(x.text, x.attribution, x.background));
                }}
                onDoubleClick={() => onLive(toSlide(x.text, x.attribution, x.background))}
                className={`group cursor-pointer rounded-xl bg-white p-4 transition ${x._id === activeId ? "border-orange-300 ring-2 ring-orange-500/10" : "border-neutral-100 hover:border-neutral-200"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  {pickBox(x._id, x)}
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-900">“{x.text}”</p>
                    {x.attribution && <p className="mt-1.5 text-xs font-semibold text-neutral-500">— {x.attribution}</p>}
                    {x.background && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-neutral-100 py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-neutral-500"><BackgroundThumb bg={x.background} className="h-4 w-6 rounded-full" /> Own background</span>}
                  </div>
                  {actions(
                    () => onAdd({ type: "quote", title: titleOf(x.text), subtitle: x.attribution || "Quote", slides: [toSlide(x.text, x.attribution, x.background)] }),
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing({ id: x._id, draft: { text: x.text, attribution: x.attribution, background: x.background ?? null } });
                        }}
                        aria-label="Edit"
                        className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm("Delete this quote?")) {
                            await deleteQuote(x._id);
                            refresh();
                          }
                        }}
                        aria-label="Delete"
                        className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>,
                  )}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {kinds.length > 1 && <Chips options={[{ id: "all", label: "All" }, ...kinds]} value={kindFilter} onChange={setKindFilter} />}
            {fromApp === null && <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>}
            {fromApp && fromApp.length === 0 && (
              <Empty icon={<QuoteIcon size={22} />} title="Nothing here yet">
                Quotes generated from sermons, plus key points and pull quotes from message notes, show up here.
              </Empty>
            )}
            {(fromApp ?? [])
              .filter((t) => kindFilter === "all" || t.label === kindFilter)
              .map((t) => (
                <div key={t.id} onClick={() => onStage(toSlide(t.text, t.attribution))} onDoubleClick={() => onLive(toSlide(t.text, t.attribution))} className="group cursor-pointer rounded-xl bg-white p-4 transition hover:border-orange-200">
                  <div className="flex items-start justify-between gap-3">
                    {pickBox(t.id, { text: t.text, attribution: t.attribution })}
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600">{t.label}</span>
                      <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-neutral-900">{t.text}</p>
                      <p className="mt-1.5 truncate text-xs text-neutral-400">{[t.attribution, t.context].filter(Boolean).join(" · ")}</p>
                    </div>
                    {actions(
                      () => onAdd({ type: "quote", title: titleOf(t.text), subtitle: t.attribution || t.label, slides: [toSlide(t.text, t.attribution)] }),
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await saveQuote({ text: t.text, attribution: t.attribution || "", background: null });
                            setSaved((s) => new Set(s).add(t.id));
                            refresh();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Couldn't save");
                          }
                        }}
                        disabled={saved.has(t.id)}
                        title="Save to my quotes"
                        aria-label="Save to my quotes"
                        className="rounded-md p-1.5 text-neutral-400 hover:bg-orange-50 hover:text-orange-600 disabled:text-green-600"
                      >
                        <Save size={15} />
                      </button>,
                    )}
                  </div>
                </div>
              ))}
          </>
        )}
      </div>

      {selected.size > 0 && view !== "shows" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5">
          <p className="text-sm font-semibold text-orange-800">{selected.size} quote{selected.size === 1 ? "" : "s"} selected</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Map())} className="rounded-lg px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100">
              Clear
            </button>
            <button
              onClick={() => {
                setShowError("");
                setShowEditor(newDraft([...selected.entries()].map(([key, v]) => ({ key, ...v }))));
              }}
              className={`${btnPrimary} px-4 py-2`}
            >
              <GalleryHorizontal size={15} /> Create slide show
            </button>
          </div>
        </div>
      )}

      {showEditor && <SlideshowEditor initial={showEditor} library={quotes ?? []} saving={showSaving} error={showError} onSave={saveShow} onClose={() => setShowEditor(null)} />}

      {editing && (
        <Modal title={editing.id ? "Edit quote" : "New quote"} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <Field label="Quote">
              <textarea autoFocus value={editing.draft.text} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, text: e.target.value } })} rows={6} className={`${inputCls} leading-relaxed`} />
            </Field>
            <Field label="Said by (optional)">
              <input value={editing.draft.attribution} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, attribution: e.target.value } })} placeholder="e.g. Pastor Yemi Avoseh" className={inputCls} />
            </Field>
            <BackgroundField value={editing.draft.background} onChange={(background) => setEditing({ ...editing, draft: { ...editing.draft, background } })} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className={btnGhost}>
                Cancel
              </button>
              <button onClick={save} disabled={!editing.draft.text.trim()} className={btnPrimary}>
                Save quote
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
