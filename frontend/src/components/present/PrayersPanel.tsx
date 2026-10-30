"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, HandHeart, LayoutTemplate, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { appPrayers, deletePrayer, listPrayers, listSceneTemplates, prayerSlides, savePrayer, type AppTextItem, type Background, type Prayer, type PresentStyle, type SceneTemplate, type ScheduleItemInput, type Slide, type TemplateScene } from "@/lib/present";
import { BackgroundField, BackgroundThumb } from "./BackgroundPicker";
import { CustomTemplates } from "./CustomTemplates";
import { Chips, SearchBox, ViewTabs, type SourceView } from "./appSource";
import { SessionScope, useAppScope } from "./SessionScope";
import { btnGhost, btnPrimary, Empty, Field, inputCls, Modal } from "./ui";

interface Props {
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onAdd: (item: ScheduleItemInput) => void;
  // For the prayer templates: the screen's current look, and putting a template's look on screen to try it.
  look: { background: Background; style: PresentStyle };
  onScene: (scene: TemplateScene) => void;
}

const BLANK: { title: string; body: string; background: Background | null; template: string | null } = { title: "", body: "", background: null, template: null };
const APP_TPL_KEY = "present-prayer-app-template";

// Prayers to put on screen. A blank line in a prayer starts a new slide. "From the app" brings in the
// prayer points from message notes and declarations from sermons.
export function PrayersPanel({ onStage, onLive, onAdd, look, onScene }: Props) {
  const [view, setView] = useState<SourceView>("library");
  const [prayers, setPrayers] = useState<Prayer[] | null>(null);
  const [fromApp, setFromApp] = useState<AppTextItem[] | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState("");
  const [slideIdx, setSlideIdx] = useState(-1);
  const [editing, setEditing] = useState<{ id?: string; draft: typeof BLANK } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const { services, sessions, scope, change } = useAppScope();
  // Prayer templates: the look (backdrop, where the text sits, size, alignment) a prayer is shown in.
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [managing, setManaging] = useState(false);
  const [appTemplate, setAppTemplate] = useState(""); // used for prayer points taken from the app
  const loadTemplates = useCallback(() => listSceneTemplates("prayer").then(setTemplates).catch(() => setTemplates([])), []);
  useEffect(() => {
    void loadTemplates();
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      setAppTemplate(localStorage.getItem(APP_TPL_KEY) ?? "");
    } catch {}
  }, [loadTemplates]);
  const tplById = (id?: string | null) => templates.find((t) => t._id === id) ?? null;

  const refresh = useCallback(() => listPrayers().then(setPrayers).catch((e) => (setPrayers([]), setError(e.message))), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (view !== "app" || !scope) return;
    const t = setTimeout(() => appPrayers(q, scope).then(setFromApp).catch((e) => (setFromApp([]), setError(e.message))), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [view, q, scope]);

  const active = prayers?.find((p) => p._id === activeId) ?? null;
  const slides = useMemo(() => (active ? prayerSlides(active, templates.find((t) => t._id === active.template) ?? null) : []), [active, templates]);
  const filtered = (prayers ?? []).filter((p) => !q || `${p.title} ${p.body}`.toLowerCase().includes(q.toLowerCase()));

  function pick(i: number) {
    setSlideIdx(i);
    if (slides[i]) onStage(slides[i]);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    pick(["ArrowDown", "ArrowRight"].includes(e.key) ? Math.min(slides.length - 1, slideIdx + 1) : Math.max(0, slideIdx - 1));
  }
  async function save() {
    if (!editing) return;
    try {
      const p = await savePrayer(editing.draft, editing.id);
      setEditing(null);
      await refresh();
      setActiveId(p._id);
      setSlideIdx(-1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  }
  async function remove(p: Prayer) {
    if (!confirm(`Delete “${p.title}”?`)) return;
    await deletePrayer(p._id);
    if (activeId === p._id) setActiveId("");
    refresh();
  }

  const appSlide = (t: AppTextItem): Slide => prayerSlides({ body: t.text, background: null }, tplById(appTemplate))[0];
  const kinds = useMemo(() => {
    const c = new Map<string, number>();
    fromApp?.forEach((t) => c.set(t.label, (c.get(t.label) ?? 0) + 1));
    return [...c.entries()].map(([label, count]) => ({ id: label, label, count }));
  }, [fromApp]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewTabs value={view} onChange={setView} libraryLabel="My prayers" />
        <SearchBox value={q} onChange={setQ} placeholder={view === "app" ? "Search prayer points…" : "Search prayers"} />
        {view === "app" && <SessionScope services={services} sessions={sessions} scope={scope} onChange={change} />}
        <button onClick={() => setManaging(true)} className={`${btnGhost} ${view === "app" ? "ml-auto" : ""}`}>
          <LayoutTemplate size={15} /> Prayer templates
        </button>
        {view === "library" && (
          <button onClick={() => setEditing({ draft: BLANK })} className={`${btnPrimary} ml-auto`}>
            <Plus size={16} /> New prayer
          </button>
        )}
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {view === "library" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[16rem_1fr]">
          <div className="min-h-0 overflow-y-auto rounded-xl bg-white p-1.5">
            {prayers === null && <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>}
            {prayers && filtered.length === 0 && <p className="p-4 text-center text-sm text-neutral-400">{q ? "No prayers match." : "No prayers yet."}</p>}
            {filtered.map((p) => (
              <button
                key={p._id}
                onClick={() => {
                  setActiveId(p._id);
                  setSlideIdx(-1);
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left transition ${p._id === activeId ? "bg-orange-50" : "hover:bg-neutral-50"}`}
              >
                <span className={`block truncate text-sm font-medium ${p._id === activeId ? "text-orange-700" : "text-neutral-900"}`}>{p.title}</span>
                <span className="block truncate text-xs text-neutral-400">{p.body.replace(/\s+/g, " ").slice(0, 60)}</span>
              </button>
            ))}
          </div>
          <div tabIndex={0} onKeyDown={onKeyDown} className="min-h-0 overflow-y-auto rounded-xl bg-white p-4 outline-none">
            {!active ? (
              <Empty icon={<HandHeart size={22} />} title="Pick a prayer">
                Choose a prayer on the left, or add a new one. Separate slides with a blank line.
              </Empty>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-neutral-900">{active.title}</h3>
                    <p className="text-xs text-neutral-400">{slides.length} slide{slides.length === 1 ? "" : "s"}</p>
                    <label className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
                      Template
                      <select
                        value={active.template ?? ""}
                        onChange={async (e) => {
                          try {
                            await savePrayer({ title: active.title, body: active.body, background: active.background ?? null, template: e.target.value || null }, active._id);
                            await refresh();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Couldn't save");
                          }
                        }}
                        className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-800 outline-none focus:border-orange-400"
                      >
                        <option value="">Plain (scripture style)</option>
                        {templates.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => onAdd({ type: "prayer", title: active.title, subtitle: `${slides.length} slide${slides.length === 1 ? "" : "s"}`, slides })} className={btnGhost}>
                      <CalendarPlus size={15} /> Add to schedule
                    </button>
                    <button onClick={() => setEditing({ id: active._id, draft: { title: active.title, body: active.body, background: active.background ?? null, template: active.template ?? null } })} className={btnGhost}>
                      <Pencil size={15} /> Edit
                    </button>
                    <button onClick={() => remove(active)} aria-label="Delete prayer" className={`${btnGhost} text-red-600`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
                  {slides.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => pick(i)}
                      onDoubleClick={() => onLive(s)}
                      className={`rounded-xl border p-3.5 text-left transition ${i === slideIdx ? "border-orange-300 bg-orange-50 ring-2 ring-orange-500/10" : "border-neutral-100 bg-neutral-50/60 hover:border-neutral-200"}`}
                    >
                      {s.kind === "text" && <span className="line-clamp-6 whitespace-pre-line text-[13px] leading-snug text-neutral-800">{s.text || "(empty)"}</span>}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs text-neutral-400">Click to preview · Double-click or Enter to go live · Arrow keys to step through</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {kinds.length > 1 && <Chips options={[{ id: "all", label: "All" }, ...kinds]} value={kindFilter} onChange={setKindFilter} />}
            <label className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
              Show on screen with
              <select
                value={appTemplate}
                onChange={(e) => {
                  setAppTemplate(e.target.value);
                  try {
                    localStorage.setItem(APP_TPL_KEY, e.target.value);
                  } catch {}
                }}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-800 outline-none focus:border-orange-400"
              >
                <option value="">Plain (scripture style)</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {fromApp === null && <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>}
            {fromApp && fromApp.length === 0 && (
              <Empty icon={<HandHeart size={22} />} title="No prayer points yet">
                Prayer points from message notes and declarations from sermons show up here.
              </Empty>
            )}
            {(fromApp ?? [])
              .filter((t) => kindFilter === "all" || t.label === kindFilter)
              .map((t) => (
                <div
                  key={t.id}
                  onClick={() => onStage(appSlide(t))}
                  onDoubleClick={() => onLive(appSlide(t))}
                  className="group cursor-pointer rounded-xl bg-white p-4 transition hover:border-orange-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600">{t.label}</span>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-neutral-800">{t.text}</p>
                      {t.context && <p className="mt-1.5 truncate text-xs text-neutral-400">{t.context}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdd({ type: "prayer", title: t.context || t.label, subtitle: t.label, slides: [appSlide(t)] });
                        }}
                        title="Add to schedule"
                        aria-label="Add to schedule"
                        className="rounded-md p-1.5 text-neutral-400 hover:bg-orange-50 hover:text-orange-600"
                      >
                        <CalendarPlus size={15} />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await savePrayer({ title: t.context || t.label, body: t.text, background: null });
                            setSaved((s) => new Set(s).add(t.id));
                            refresh();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Couldn't save");
                          }
                        }}
                        disabled={saved.has(t.id)}
                        title="Save to my prayers"
                        aria-label="Save to my prayers"
                        className="rounded-md p-1.5 text-neutral-400 hover:bg-orange-50 hover:text-orange-600 disabled:text-green-600"
                      >
                        <Save size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {managing && (
        <Modal
          title="Prayer templates"
          onClose={() => {
            setManaging(false);
            void loadTemplates();
          }}
          wide
        >
          <CustomTemplates
            kind="prayer"
            h={{ onStage, onLive, onAdd, onLogo: () => {}, onBackground: () => {}, onScene, onClearLogo: () => {}, hasBackground: false, hasLogo: false, look }}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? "Edit prayer" : "New prayer"} onClose={() => setEditing(null)} wide>
          <div className="space-y-4">
            <Field label="Title">
              <input autoFocus value={editing.draft.title} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, title: e.target.value } })} placeholder="e.g. Opening prayer" className={inputCls} />
            </Field>
            <Field label="Prayer" hint="A blank line starts a new slide.">
              <textarea value={editing.draft.body} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, body: e.target.value } })} rows={12} className={`${inputCls} leading-relaxed`} />
            </Field>
            <Field label="Template" hint="How this prayer looks on screen. Make your own in Prayer templates.">
              <div className="flex flex-wrap gap-2">
                {[{ _id: "", name: "Plain", background: null } as SceneTemplate | { _id: string; name: string; background: null }, ...templates].map((t) => (
                  <button
                    key={t._id || "plain"}
                    type="button"
                    onClick={() => setEditing({ ...editing, draft: { ...editing.draft, template: t._id || null } })}
                    aria-pressed={(editing.draft.template ?? "") === t._id}
                    className={`w-28 overflow-hidden rounded-xl border text-left ${(editing.draft.template ?? "") === t._id ? "border-orange-400 ring-2 ring-orange-500/20" : "border-neutral-200 hover:border-neutral-300"}`}
                  >
                    <span className="relative block aspect-video bg-neutral-900">{t.background && <BackgroundThumb bg={t.background} className="h-full w-full" />}</span>
                    <span className="block truncate px-2 py-1 text-xs font-medium text-neutral-800">{t.name}</span>
                  </button>
                ))}
              </div>
            </Field>
            {!editing.draft.template && <BackgroundField value={editing.draft.background} onChange={(background) => setEditing({ ...editing, draft: { ...editing.draft, background } })} />}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className={btnGhost}>
                Cancel
              </button>
              <button onClick={save} disabled={!editing.draft.title.trim()} className={btnPrimary}>
                Save prayer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
