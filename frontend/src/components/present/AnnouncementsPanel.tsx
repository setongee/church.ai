"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { CalendarPlus, ImagePlus, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { ANNOUNCEMENT_TEMPLATES, deleteAnnouncement, listAnnouncements, mediaSrc, saveAnnouncement, uploadMedia, type Announcement, type AnnouncementTemplateId, type PresentState, type ScheduleItemInput, type Slide } from "@/lib/present";
import { Stage } from "./Stage";
import { btnGhost, btnPrimary, Empty, Field, inputCls, Modal } from "./ui";

interface Props {
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onAdd: (item: ScheduleItemInput) => void;
  // The look new announcements start with (a service wrapper's announcement template).
  defaultTemplate?: AnnouncementTemplateId;
}

const BLANK: { title: string; body: string; imageUrl: string; template: AnnouncementTemplateId; kicker: string; accent: string } = { title: "", body: "", imageUrl: "", template: "bold", kicker: "", accent: "" };
const ACCENTS = ["", "#ea580c", "#dc2626", "#16a34a", "#0ea5e9", "#8b5cf6", "#ec4899", "#f59e0b", "#14b8a6"];
const SAMPLE = { title: "Youth Night", body: "Friday 6pm · Hall B — bring a friend", kicker: "This Friday" };

const toSlide = (a: Pick<Announcement, "title" | "body" | "imageUrl" | "template" | "kicker" | "accent">): Slide => ({
  kind: "text",
  title: a.title,
  text: a.body,
  imageUrl: a.imageUrl || undefined,
  layout: a.template && a.template !== "classic" ? a.template : undefined,
  kicker: a.kicker || undefined,
  accent: a.accent || undefined,
});

// A whole-screen preview of a slide, for thumbnails.
const preview = (slide: Slide): PresentState => ({
  rev: 0,
  mode: "live",
  slide,
  background: { type: "gradient", value: "linear-gradient(135deg,#0f172a,#1e293b)" },
  alert: null,
  logoUrl: "",
  logoKind: "logo",
  style: { align: "center", scale: 1, font: "", weight: 500, imageFit: "contain", quoteLayout: "classic", frame: null, frameBg: null },
});

export function AnnouncementsPanel({ onStage, onLive, onAdd, defaultTemplate }: Props) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [activeId, setActiveId] = useState("");
  const [editing, setEditing] = useState<{ id?: string; draft: typeof BLANK } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const refresh = () => listAnnouncements().then(setItems).catch((e) => (setItems([]), setError(e.message)));
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      await saveAnnouncement(editing.draft, editing.id);
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function pickImage(f: File | undefined) {
    if (!f || !editing) return;
    setBusy(true);
    try {
      const m = await uploadMedia(f, "media");
      setEditing((cur) => cur && { ...cur, draft: { ...cur.draft, imageUrl: m.url } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Notices for the congregation — click to preview, double-click to show.</p>
        <button onClick={() => setEditing({ draft: { ...BLANK, template: defaultTemplate ?? BLANK.template } })} className={btnPrimary}>
          <Plus size={16} /> New announcement
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items?.length === 0 && (
          <Empty icon={<Megaphone size={22} />} title="No announcements yet">
            Add events, reminders or a welcome message, with an optional picture.
          </Empty>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items?.map((a) => (
            <div
              key={a._id}
              onClick={() => {
                setActiveId(a._id);
                onStage(toSlide(a));
              }}
              onDoubleClick={() => onLive(toSlide(a))}
              className={`group cursor-pointer overflow-hidden rounded-xl border bg-white transition ${a._id === activeId ? "border-orange-300 ring-2 ring-orange-500/10" : "border-neutral-100 hover:border-neutral-200"}`}
            >
              <Stage state={preview(toSlide(a))} monitor="preview" className="rounded-none" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-neutral-900">{a.title}</h3>
                  <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdd({ type: "announcement", title: a.title, subtitle: ANNOUNCEMENT_TEMPLATES.find((t) => t.id === (a.template ?? "classic"))?.label ?? "Announcement", slides: [toSlide(a)] });
                      }}
                      aria-label="Add to schedule"
                      title="Add to schedule"
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-orange-50 hover:text-orange-600"
                    >
                      <CalendarPlus size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing({ id: a._id, draft: { title: a.title, body: a.body, imageUrl: a.imageUrl, template: a.template ?? "classic", kicker: a.kicker ?? "", accent: a.accent ?? "" } });
                      }}
                      aria-label="Edit"
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete “${a.title}”?`)) {
                          await deleteAnnouncement(a._id);
                          refresh();
                        }
                      }}
                      aria-label="Delete"
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {a.body && <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[13px] leading-snug text-neutral-500">{a.body}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? "Edit announcement" : "New announcement"} onClose={() => setEditing(null)} wide>
          <div className="space-y-4">
            <Field label="Title">
              <input autoFocus value={editing.draft.title} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, title: e.target.value } })} className={inputCls} />
            </Field>
            <Field label="Small label above the title (optional)" hint="e.g. “This Sunday”, “Save the date”, “Youth”">
              <input value={editing.draft.kicker} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, kicker: e.target.value } })} className={inputCls} maxLength={40} />
            </Field>
            <Field label="Details">
              <textarea value={editing.draft.body} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, body: e.target.value } })} rows={5} className={inputCls} />
            </Field>
            <div>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
              {editing.draft.imageUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-neutral-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaSrc(editing.draft.imageUrl)} alt="" className="h-36 w-full object-cover" />
                  <button onClick={() => setEditing({ ...editing, draft: { ...editing.draft, imageUrl: "" } })} className="absolute right-2 top-2 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                    Remove
                  </button>
                </div>
              ) : (
                <button onClick={() => file.current?.click()} disabled={busy} className={btnGhost}>
                  <ImagePlus size={16} /> {busy ? "Uploading…" : "Add picture"}
                </button>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Accent colour</p>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c || "auto"}
                    onClick={() => setEditing({ ...editing, draft: { ...editing.draft, accent: c } })}
                    aria-label={c ? `Accent ${c}` : "Template's own colour"}
                    aria-pressed={editing.draft.accent === c}
                    title={c ? c : "Template's own colour"}
                    className={`h-8 w-8 rounded-full border-2 text-[10px] font-bold ${editing.draft.accent === c ? "scale-110 border-neutral-900" : "border-white ring-1 ring-neutral-300"}`}
                    style={{ background: c || "linear-gradient(135deg,#f97316,#8b5cf6,#14b8a6)", color: "#fff" }}
                  >
                    {c ? "" : "A"}
                  </button>
                ))}
              </div>
            </div>
            <TemplatePicker draft={editing.draft} onPick={(template) => setEditing({ ...editing, draft: { ...editing.draft, template } })} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className={btnGhost}>
                Cancel
              </button>
              <button onClick={save} disabled={busy || !editing.draft.title.trim()} className={btnPrimary}>
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// The ten looks, each previewed with the announcement being written (or an example while it's empty).
function TemplatePicker({ draft, onPick }: { draft: typeof BLANK; onPick: (t: AnnouncementTemplateId) => void }) {
  const live = useDeferredValue(draft);
  const hasText = Boolean(live.title.trim());
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Template</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ANNOUNCEMENT_TEMPLATES.map((t) => {
          const slide = toSlide({ ...live, title: hasText ? live.title : SAMPLE.title, body: hasText ? live.body : SAMPLE.body, kicker: hasText ? live.kicker : SAMPLE.kicker, template: t.id });
          const on = draft.template === t.id;
          return (
            <button key={t.id} type="button" onClick={() => onPick(t.id)} aria-pressed={on} title={t.hint} className="text-left">
              <span className={`block overflow-hidden rounded-lg ring-2 transition ${on ? "ring-orange-500" : "ring-transparent hover:ring-neutral-300"}`}>
                <Stage state={preview(slide)} monitor="preview" />
              </span>
              <span className={`mt-1 block truncate text-xs font-semibold ${on ? "text-orange-700" : "text-neutral-700"}`}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
