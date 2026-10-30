"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { FontPicker } from "@/components/editor/FontPicker";
import { CHAT_SKINS } from "@/lib/chatSkins";
import { PRESENT_LAYOUTS } from "@/lib/presentLayouts";
import { ANNOUNCEMENT_TEMPLATES, BLANK_WRAPPER, deleteWrapper, QUOTE_LAYOUTS, saveWrapper, SECTIONS, wrapperPatch, type AnnouncementTemplateId, type Background, type PresentState, type SceneTemplate, type SectionKey, type Slide, type Wrapper, type WrapperInput } from "@/lib/present";
import { BackgroundField, BackgroundThumb } from "./BackgroundPicker";
import { Diagram } from "./PresentLayoutMenu";
import { Stage } from "./Stage";

// ---- the header control --------------------------------------------------------------------------------------

// "Wrapper" in the Present header: pick the service wrapper this schedule runs in, or manage them.
export function WrapperMenu({ wrappers, activeId, onPick, onManage }: { wrappers: Wrapper[]; activeId: string; onPick: (w: Wrapper | null) => void; onManage: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const active = wrappers.find((w) => w._id === activeId);
  const row = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-neutral-50";

  return (
    <div ref={box} className="relative hidden md:block">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="The service wrapper: themes, looks and layout for this service" className={`inline-flex max-w-[16rem] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${active ? "border-orange-300 bg-orange-50 text-orange-700" : "border-neutral-200 bg-white text-neutral-700 hover:border-orange-300 hover:text-orange-700"}`}>
        <Package size={16} className="shrink-0" />
        <span className="truncate">{active ? active.name : "Wrapper"}</span>
        <ChevronDown size={14} className="shrink-0" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-neutral-100 bg-white p-1.5 shadow-xl">
          <p className="px-3 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-widest text-neutral-400">Service wrapper</p>
          <button
            role="menuitemradio"
            aria-checked={!active}
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
            className={`${row} ${!active ? "bg-orange-50 text-orange-700" : "text-neutral-800"}`}
          >
            <span className="flex-1">No wrapper</span>
            {!active && <Check size={15} />}
          </button>
          <div className="max-h-64 overflow-y-auto">
            {wrappers.map((w) => (
              <button
                key={w._id}
                role="menuitemradio"
                aria-checked={w._id === activeId}
                onClick={() => {
                  onPick(w);
                  setOpen(false);
                }}
                className={`${row} ${w._id === activeId ? "bg-orange-50 text-orange-700" : "text-neutral-800"}`}
              >
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {w._id === activeId && <Check size={15} />}
              </button>
            ))}
          </div>
          {wrappers.length === 0 && <p className="px-3 py-2 text-xs text-neutral-400">None yet — make one to set up a whole service look in one go.</p>}
          <div className="mt-1 border-t border-neutral-100 pt-1">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className={`${row} font-medium text-orange-600`}
            >
              <Pencil size={14} /> Manage wrappers…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- the manager ---------------------------------------------------------------------------------------------

const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500";
const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`;
const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10";

interface ManagerProps {
  wrappers: Wrapper[];
  templates: SceneTemplate[];
  activeId: string;
  baseBackground: Background;
  onClose: () => void;
  onChanged: () => void;
  onApply: (w: Wrapper | null) => void;
}

// Cards for every wrapper (apply / edit / duplicate / delete) and the editor for one.
export function WrapperManager({ wrappers, templates, activeId, baseBackground, onClose, onChanged, onApply }: ManagerProps) {
  const [editing, setEditing] = useState<{ id?: string; draft: WrapperInput } | null>(null);
  const [deleting, setDeleting] = useState<Wrapper | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveWrapper(editing.draft, editing.id);
      setEditing(null);
      onChanged();
      // Editing the wrapper that is running puts the changes on the screen straight away.
      if (saved._id === activeId) onApply(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save the wrapper.");
    }
    setBusy(false);
  }
  async function remove(w: Wrapper) {
    setBusy(true);
    try {
      if (w._id === activeId) onApply(null);
      await deleteWrapper(w._id);
      setDeleting(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t delete it.");
    }
    setBusy(false);
  }
  const copy = (w: Wrapper) => {
    const { _id, ...rest } = w;
    void _id;
    setEditing({ draft: { ...rest, name: `${w.name} copy` } });
  };
  const tplName = (id: string | null) => templates.find((t) => t._id === id)?.name;

  const chipsOf = (w: Wrapper) =>
    [
      tplName(w.scripture) && `Scripture: ${tplName(w.scripture)}`,
      tplName(w.prayer) && `Prayer: ${tplName(w.prayer)}`,
      tplName(w.song) && `Song: ${tplName(w.song)}`,
      w.announcementTemplate && `Announcements: ${ANNOUNCEMENT_TEMPLATES.find((a) => a.id === w.announcementTemplate)?.label}`,
      w.quoteLayout && `Quotes: ${QUOTE_LAYOUTS.find((q) => q.id === w.quoteLayout)?.label}`,
      w.chatSkin && `Chat: ${CHAT_SKINS.find((s) => s.id === w.chatSkin)?.label}`,
      w.layout && `Layout: ${PRESENT_LAYOUTS.find((l) => l.id === w.layout)?.label}`,
      w.font && `Font: ${w.font}`,
      w.background && "Backdrop",
    ].filter(Boolean) as string[];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && (editing ? setEditing(null) : onClose())}>
      <div role="dialog" aria-modal="true" aria-label="Service wrappers" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4 sm:px-7">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 text-orange-700">
            <Package size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-neutral-900">{editing ? (editing.id ? "Edit wrapper" : "New wrapper") : "Service wrappers"}</h2>
            <p className="text-xs text-neutral-500">{editing ? "Choose how a whole service should look and feel" : "A wrapper sets a service’s themes, looks, chat skin and layout in one go"}</p>
          </div>
          {!editing && (
            <button onClick={() => setEditing({ draft: { ...BLANK_WRAPPER } })} className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
              <Plus size={16} /> New wrapper
            </button>
          )}
          <button onClick={() => (editing ? setEditing(null) : onClose())} aria-label="Close" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100">
            <X size={18} />
          </button>
        </div>

        {error && <p className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{error}</p>}

        {editing ? (
          <WrapperEditor draft={editing.draft} templates={templates} baseBackground={baseBackground} busy={busy} onChange={(draft) => setEditing({ ...editing, draft })} onCancel={() => setEditing(null)} onSave={() => void save()} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            {wrappers.length === 0 ? (
              <button onClick={() => setEditing({ draft: { ...BLANK_WRAPPER } })} className="w-full rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 hover:border-orange-300 hover:text-orange-700">
                <b className="block text-base text-neutral-800">Make your first wrapper</b>
                Pick a scripture, prayer and song theme, an announcement and quote look, a chat skin and a layout — then apply it to a service in one click.
              </button>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {wrappers.map((w) => {
                  const chips = chipsOf(w);
                  const on = w._id === activeId;
                  return (
                    <li key={w._id} className={`flex flex-col rounded-2xl border p-4 ${on ? "border-orange-300 bg-orange-50/40" : "border-neutral-200"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="min-w-0 truncate text-base font-semibold text-neutral-900">{w.name}</h3>
                        {on && <span className="shrink-0 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffffff]">In use</span>}
                      </div>
                      <div className="mt-2 flex flex-1 flex-wrap content-start gap-1.5">
                        {chips.length ? chips.map((c) => <span key={c} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-700">{c}</span>) : <span className="text-xs text-neutral-400">Sets nothing yet — edit it to choose.</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <button onClick={() => onApply(on ? null : w)} className={on ? "rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50" : "rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700"}>
                          {on ? "Take it off" : "Apply to this service"}
                        </button>
                        <button onClick={() => setEditing({ id: w._id, draft: { name: w.name, scripture: w.scripture, prayer: w.prayer, song: w.song, background: w.background, font: w.font, weight: w.weight, announcementTemplate: w.announcementTemplate, quoteLayout: w.quoteLayout, chatSkin: w.chatSkin, layout: w.layout } })} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700">
                          <Pencil size={13} /> Edit
                        </button>
                        <button onClick={() => copy(w)} aria-label={`Duplicate ${w.name}`} title="Duplicate" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                          <Copy size={15} />
                        </button>
                        <button onClick={() => setDeleting(w)} aria-label={`Delete ${w.name}`} title="Delete" className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {deleting && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setDeleting(null)}>
          <div role="alertdialog" aria-label="Delete wrapper" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-neutral-900">Delete “{deleting.name}”?</h3>
            <p className="mt-1.5 text-sm text-neutral-500">{deleting.name === wrappers.find((w) => w._id === activeId)?.name ? "It’s on this service right now, so the screen goes back to how it was. " : ""}Schedules that used it keep their own look.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button onClick={() => void remove(deleting)} disabled={busy} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-red-700 disabled:opacity-50">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ---- the editor ----------------------------------------------------------------------------------------------

const SAMPLE: Record<"scripture" | "song" | "prayer" | "announcement" | "quote", { label: string; slide: Slide }> = {
  scripture: { label: "Scripture", slide: { kind: "scripture", reference: "John 3:16", version: "KJV", text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." } },
  song: { label: "Song", slide: { kind: "song", title: "Amazing Grace", label: "Verse 1", text: "Amazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost, but now am found\nWas blind, but now I see" } },
  prayer: { label: "Prayer", slide: { kind: "text", variant: "prayer", text: "Father, we thank You for this day, for Your mercy that is new every morning." } },
  announcement: { label: "Announcement", slide: { kind: "text", title: "Youth Night", text: "Friday 6pm · Hall B — bring a friend", kicker: "This Friday" } },
  quote: { label: "Quote", slide: { kind: "quote", text: "Faith is taking the first step even when you can’t see the whole staircase.", attribution: "Martin Luther King Jr." } },
};

function TemplatePick({ title, section, value, templates, onChange }: { title: string; section: SectionKey; value: string | null; templates: SceneTemplate[]; onChange: (id: string | null) => void }) {
  // Scripture and song themes come from general templates; a prayer theme can also be a prayer template.
  const options = templates.filter((t) => (section === "prayer" ? true : t.kind !== "prayer"));
  return (
    <div>
      <span className={label}>{title}</span>
      <div className="flex flex-wrap gap-2">
        {[{ _id: "", name: "Leave as is", background: null } as { _id: string; name: string; background: Background | null; kind?: string; sections?: SceneTemplate["sections"] }, ...options].map((t) => {
          const on = (value ?? "") === t._id;
          const own = t._id && t.kind !== "prayer" && t.sections?.[section];
          return (
            <button key={t._id || "none"} type="button" onClick={() => onChange(t._id || null)} aria-pressed={on} className={`w-28 overflow-hidden rounded-xl border-2 text-left ${on ? "border-orange-500" : "border-neutral-200 hover:border-neutral-300"}`}>
              <span className="relative block aspect-video bg-[#1e293b]">{t.background && <BackgroundThumb bg={t.background} className="h-full w-full" />}</span>
              <span className="block truncate px-2 pt-1 text-xs font-medium text-neutral-900">{t.name}</span>
              <span className="block truncate px-2 pb-1 text-[10px] text-neutral-500">{!t._id ? "No change" : t.kind === "prayer" ? "Prayer template" : own ? `Own ${section} look` : "Default look"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WrapperEditor({ draft, templates, baseBackground, busy, onChange, onCancel, onSave }: { draft: WrapperInput; templates: SceneTemplate[]; baseBackground: Background; busy: boolean; onChange: (d: WrapperInput) => void; onCancel: () => void; onSave: () => void }) {
  const set = <K extends keyof WrapperInput>(k: K, v: WrapperInput[K]) => onChange({ ...draft, [k]: v });

  // What the screen would look like: each sample drawn through the real Stage with this wrapper's choices.
  const previews = useMemo(() => {
    const p = wrapperPatch({ ...draft, _id: "preview" }, templates);
    const base = { rev: 0, mode: "live", alert: null, logoUrl: "", logoKind: "logo", background: p.background ?? baseBackground, sectionStyles: p.sectionStyles } as const;
    const style = { align: "center", scale: 1, font: p.style.font ?? "", weight: p.style.weight ?? 500, imageFit: "contain", quoteLayout: p.style.quoteLayout ?? "classic", announcementTemplate: p.style.announcementTemplate ?? "", frame: null, frameBg: null } as PresentState["style"];
    return (Object.keys(SAMPLE) as (keyof typeof SAMPLE)[]).map((k) => ({ key: k, label: SAMPLE[k].label, state: { ...base, slide: SAMPLE[k].slide, style } as PresentState }));
  }, [draft, templates, baseBackground]);

  return (
    <>
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-5 py-5 sm:px-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div>
            <span className={label}>Wrapper name</span>
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={120} placeholder="e.g. Sunday celebration" className={field} />
          </div>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Themes for the screen</h3>
            {SECTIONS.map((s) => (
              <TemplatePick key={s.id} title={`${s.label} theme`} section={s.id} value={draft[s.id]} templates={templates} onChange={(id) => set(s.id, id)} />
            ))}
            <p className="text-xs text-neutral-400">A theme is a template: for each section the wrapper uses that template’s look for scripture, songs or prayers (its own look for that section if it has one). Build templates in the Templates tab, and prayer templates in Prayers.</p>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Announcements and quotes</h3>
            <div>
              <span className={label}>Announcement template</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => set("announcementTemplate", "")} aria-pressed={!draft.announcementTemplate} className={chip(!draft.announcementTemplate)}>
                  Leave as is
                </button>
                {ANNOUNCEMENT_TEMPLATES.map((a) => (
                  <button key={a.id} type="button" onClick={() => set("announcementTemplate", a.id as AnnouncementTemplateId)} aria-pressed={draft.announcementTemplate === a.id} title={a.hint} className={`inline-flex items-center gap-1.5 ${chip(draft.announcementTemplate === a.id)}`}>
                    <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: a.accent }} /> {a.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-neutral-400">Used for announcements that don’t pick a look of their own, and as the starting look for new ones.</p>
            </div>
            <div>
              <span className={label}>Quote template</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => set("quoteLayout", "")} aria-pressed={!draft.quoteLayout} className={chip(!draft.quoteLayout)}>
                  Leave as is
                </button>
                {QUOTE_LAYOUTS.map((q) => (
                  <button key={q.id} type="button" onClick={() => set("quoteLayout", q.id)} aria-pressed={draft.quoteLayout === q.id} className={chip(draft.quoteLayout === q.id)}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Type and backdrop</h3>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <span className={label}>Font</span>
                <FontPicker value={draft.font || "Default"} onChange={(f) => set("font", f === "Default" ? "" : f)} className="w-44" />
              </div>
              <div>
                <span className={label}>Weight</span>
                <div className="flex gap-1.5">
                  {([[null, "Leave"], [400, "Regular"], [500, "Medium"], [700, "Bold"]] as const).map(([w, l]) => (
                    <button key={l} type="button" onClick={() => set("weight", w)} aria-pressed={draft.weight === w} className={chip(draft.weight === w)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <BackgroundField value={draft.background} onChange={(b) => set("background", b ?? null)} label="Backdrop" hint={{ set: "Behind everything while this wrapper is on.", unset: "Optional. Without one, the screen keeps its own background." }} />
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Chat and layout</h3>
            <div>
              <span className={label}>Chat skin</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => set("chatSkin", "")} aria-pressed={!draft.chatSkin} className={`flex h-[3.75rem] w-24 items-center justify-center rounded-xl border-2 text-xs font-semibold text-neutral-700 ${!draft.chatSkin ? "border-orange-500" : "border-neutral-200 hover:border-neutral-300"}`}>
                  Leave as is
                </button>
                {CHAT_SKINS.map((s) => (
                  <button key={s.id} type="button" onClick={() => set("chatSkin", s.id)} aria-pressed={draft.chatSkin === s.id} title={s.hint} className={`w-24 overflow-hidden rounded-xl border-2 text-left ${draft.chatSkin === s.id ? "border-orange-500" : "border-neutral-200 hover:border-neutral-300"}`}>
                    <span className="block p-1.5" style={{ background: s.bg }}>
                      <span className="mb-1 block h-1.5 w-2/3 rounded-full" style={{ background: s.ink, opacity: 0.55 }} />
                      <span className="block h-3 w-full rounded" style={{ background: s.accent }} />
                    </span>
                    <span className="block truncate px-2 py-0.5 text-[11px] font-medium text-neutral-800">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Presenter layout</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => set("layout", "")} aria-pressed={!draft.layout} className={`flex h-[3.4rem] w-24 items-center justify-center rounded-xl border-2 text-xs font-semibold text-neutral-700 ${!draft.layout ? "border-orange-500" : "border-neutral-200 hover:border-neutral-300"}`}>
                  Leave as is
                </button>
                {PRESENT_LAYOUTS.map((l) => (
                  <button key={l.id} type="button" onClick={() => set("layout", l.id)} aria-pressed={draft.layout === l.id} title={l.hint} className={`flex items-center gap-2 rounded-xl border-2 p-1.5 pr-3 ${draft.layout === l.id ? "border-orange-500" : "border-neutral-200 hover:border-neutral-300"}`}>
                    <Diagram id={l.id} />
                    <span className="text-xs font-semibold text-neutral-800">{l.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start">
          <p className={label}>Preview</p>
          <div className="grid grid-cols-2 gap-2.5">
            {previews.map((p) => (
              <figure key={p.key} className={p.key === "scripture" ? "col-span-2" : ""}>
                <div className="overflow-hidden rounded-lg ring-1 ring-neutral-200">
                  <Stage state={p.state} monitor="preview" />
                </div>
                <figcaption className="mt-1 text-[11px] font-medium text-neutral-500">{p.label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-neutral-400">Drawn the way the screen draws them, with your choices. The chat skin and layout aren’t shown here.</p>
        </aside>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-4 sm:px-7">
        <button onClick={onCancel} disabled={busy} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          Cancel
        </button>
        <button onClick={onSave} disabled={busy || !draft.name.trim()} className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
          {busy ? "Saving…" : "Save wrapper"}
        </button>
      </div>
    </>
  );
}
