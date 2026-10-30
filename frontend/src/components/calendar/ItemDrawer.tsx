"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ExternalLink, ImageOff, ListChecks, Loader2, Send, Trash2, Unlink, UploadCloud, X, Zap } from "lucide-react";
import { Avatar } from "@/components/notify/ToastHost";
import { Field, Modal, btnGhost, btnPrimary, inputCls } from "@/components/present/ui";
import { assetUrl } from "@/lib/api";
import {
  DEFAULT_POST_TIME,
  FLOW,
  FORMAT_LABEL,
  PLATFORM_LABEL,
  createBoardTask,
  createContent,
  dayKey,
  fmtWhen,
  fromParts,
  getContent,
  isLocked,
  linkContentTask,
  listAvailableUploads,
  listSprintTasks,
  listSprints,
  publishContentNow,
  removeContent,
  scheduleContent,
  statusMeta,
  timeKey,
  tzLabel,
  unlinkContentTask,
  unscheduleContent,
  updateContent,
  type BoardSprint,
  type BoardTaskLite,
  type ContentFormat,
  type ContentItem,
  type ContentPlatform,
  type ContentStatus,
  type LinkedUpload,
  type Person,
  type UploadChoice,
} from "@/lib/content";
import { FormatIcon, StatusBadge } from "./parts";

export interface DrawerTarget {
  item?: ContentItem; // editing this one; absent = a new item
  defaults?: { date?: string; time?: string; status?: ContentStatus; title?: string };
}

interface Form {
  title: string;
  caption: string;
  format: ContentFormat;
  platform: ContentPlatform;
  campaign: string;
  notes: string;
  owners: string[];
  date: string;
  time: string;
}

const formOf = (item?: ContentItem, d?: DrawerTarget["defaults"]): Form => {
  const at = item?.scheduledAt ? new Date(item.scheduledAt) : null;
  return {
    title: item?.title ?? d?.title ?? "",
    caption: item?.caption ?? "",
    format: item?.format ?? "post",
    platform: item?.platform ?? "instagram",
    campaign: item?.campaign ?? "",
    notes: item?.notes ?? "",
    owners: item?.owners.map((o) => o._id) ?? [],
    date: at ? dayKey(at) : (d?.date ?? ""),
    time: at ? timeKey(at) : d?.date ? (d.time ?? DEFAULT_POST_TIME) : "",
  };
};

const card = "rounded-2xl bg-neutral-50 p-4";
const label = "mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400";

interface Props {
  target: DrawerTarget;
  canWrite: boolean;
  isAdmin: boolean;
  team: Person[];
  campaigns: string[];
  onClose: () => void;
  onChanged: (item: ContentItem) => void;
  onDeleted: (id: string) => void;
  say: (text: string) => void;
}

export function ItemDrawer(props: Props) {
  const { target, canWrite, isAdmin, team, campaigns, onClose, onChanged, onDeleted, say } = props;
  const [item, setItem] = useState<ContentItem | undefined>(target.item);
  const [form, setForm] = useState<Form>(() => formOf(target.item, target.defaults));
  const [base, setBase] = useState<Form>(form); // what's saved, to know if there are unsaved changes
  const [pendingUpload, setPendingUpload] = useState<UploadChoice | null>(null); // chosen before the item exists
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "publish" | null>(null);
  const [picking, setPicking] = useState(false);
  const [choices, setChoices] = useState<UploadChoice[] | null>(null);

  const editable = canWrite && !(item && isLocked(item));
  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  const upload: LinkedUpload | UploadChoice | null = item?.upload ?? pendingUpload;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Escape closes, and the page behind doesn't scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !confirm && close();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, dirty]);

  function close() {
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  }

  function adopt(next: ContentItem) {
    setItem(next);
    const f = formOf(next);
    setForm(f);
    setBase(f);
    setPendingUpload(null);
    onChanged(next);
  }

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
    }
    setBusy("");
  };

  const payload = () => ({
    title: form.title,
    caption: form.caption,
    format: form.format,
    platform: form.platform,
    campaign: form.campaign,
    notes: form.notes,
    owners: form.owners,
    scheduledAt: form.date ? fromParts(form.date, form.time || DEFAULT_POST_TIME).toISOString() : null,
  });

  // Saves the fields (creating the item the first time) and returns the saved item.
  async function persist(): Promise<ContentItem> {
    const saved = item ? await updateContent(item._id, payload()) : await createContent({ ...payload(), upload: pendingUpload?._id });
    adopt(saved);
    return saved;
  }

  const save = () =>
    run("save", async () => {
      const wasNew = !item;
      await persist();
      say(wasNew ? "Added to the calendar" : "Saved");
    });

  const missing = [!upload && form.platform === "instagram" ? "attach the video or picture" : "", !form.caption.trim() ? "write a caption" : "", !form.date ? "pick a date and time" : ""].filter(Boolean);
  const canSchedule = editable && form.platform === "instagram" && missing.length === 0 && item?.status !== "scheduled";

  const schedule = () =>
    run("schedule", async () => {
      const saved = await persist();
      const done = await scheduleContent(saved._id, { scheduledAt: fromParts(form.date, form.time || DEFAULT_POST_TIME).toISOString(), caption: form.caption });
      adopt(done);
      say(`Scheduled — it will post by itself on ${fmtWhen(done.scheduledAt as string)}`);
    });

  const unschedule = () =>
    run("unschedule", async () => {
      if (!item) return;
      adopt(await unscheduleContent(item._id));
      say("Taken out of the queue");
    });

  const publishNow = () =>
    run("publish", async () => {
      if (!item) return;
      try {
        await persist();
        adopt(await publishContentNow(item._id, form.caption));
        say("Posted to Instagram");
      } catch (e) {
        // A refused post leaves the item marked as failed on the server; show that, not the old state.
        await getContent(item._id).then(adopt).catch(() => {});
        throw e;
      }
    }).finally(() => setConfirm(null));

  const setStatus = (s: ContentStatus) =>
    run("status", async () => {
      if (!item || item.status === s) return;
      adopt(await updateContent(item._id, { status: s }));
    });

  const attach = (u: UploadChoice) =>
    run("attach", async () => {
      if (item) adopt(await updateContent(item._id, { upload: u._id }));
      else {
        setPendingUpload(u);
        if (!form.caption.trim() && u.caption) set("caption", u.caption);
        if (u.kind === "video" && form.format === "post") set("format", "reel");
      }
      setPicking(false);
    });

  const detach = () =>
    run("attach", async () => {
      if (item) adopt(await updateContent(item._id, { upload: null }));
      else setPendingUpload(null);
    });

  const remove = () =>
    run("delete", async () => {
      if (!item) return;
      await removeContent(item._id);
      onDeleted(item._id);
      say("Deleted");
      onClose();
    }).finally(() => setConfirm(null));

  // Loads the media choices the first time the picker opens.
  useEffect(() => {
    if (!picking || choices) return;
    listAvailableUploads(item?._id)
      .then(setChoices)
      .catch(() => setChoices([]));
  }, [picking, choices, item?._id]);

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={item ? "Content item" : "New content"}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onMouseDown={close} />
      <aside className="present-slide-up absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl" style={{ animationName: "calendar-drawer-in" }}>
        <header className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 text-orange-700">
            <FormatIcon format={form.format} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">{item ? "Content item" : "New content"}</p>
            {item && <StatusBadge status={item.status} className="mt-0.5" />}
          </div>
          <button onClick={close} aria-label="Close" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          {item?.status === "failed" && item.error && !error && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {item.error}
            </p>
          )}

          <input value={form.title} onChange={(e) => set("title", e.target.value)} disabled={!editable} placeholder="What’s this post? e.g. Sunday recap reel" className={`${inputCls} !border-transparent !bg-transparent !px-0 !text-xl !font-semibold focus:!ring-0`} maxLength={200} />

          {item && <Stepper item={item} editable={editable} onPick={setStatus} />}

          {/* When it goes out */}
          <section className={card}>
            <p className={label}>When it goes out</p>
            {item?.status === "published" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium text-[#16a34a]">
                  <Check size={16} /> Posted {item.publishedAt ? fmtWhen(item.publishedAt) : ""}
                </span>
                {item.instagramPermalink && (
                  <a href={item.instagramPermalink} target="_blank" rel="noreferrer" className={btnGhost}>
                    <ExternalLink size={14} /> View on Instagram
                  </a>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date">
                    <input type="date" value={form.date} onChange={(e) => (set("date", e.target.value), !form.time && e.target.value && set("time", DEFAULT_POST_TIME))} disabled={!editable} className={inputCls} />
                  </Field>
                  <Field label="Time">
                    <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} disabled={!editable || !form.date} className={inputCls} />
                  </Field>
                </div>
                <p className="mt-2 text-xs text-neutral-400">Your time zone{tzLabel() ? ` (${tzLabel()})` : ""}. It posts automatically at exactly this time.</p>

                {item?.status === "scheduled" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[rgba(124,58,237,0.1)] px-3.5 py-3 text-sm">
                    <Zap size={16} className="text-[#7c3aed]" />
                    <span className="min-w-0 flex-1 font-medium text-[#7c3aed]">Scheduled for {item.scheduledAt ? fmtWhen(item.scheduledAt) : ""} — posts by itself</span>
                    {editable && (
                      <button onClick={unschedule} disabled={!!busy} className={btnGhost}>
                        {busy === "unschedule" ? <Loader2 size={14} className="animate-spin" /> : null} Unschedule
                      </button>
                    )}
                  </div>
                ) : (
                  editable && (
                    <div className="mt-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={schedule} disabled={!canSchedule || !!busy} className={btnPrimary}>
                          {busy === "schedule" ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} {item?.status === "failed" ? "Schedule again" : "Schedule post"}
                        </button>
                        {item && item.upload && form.platform === "instagram" && (
                          <button onClick={() => setConfirm("publish")} disabled={!!busy} className={btnGhost}>
                            <Send size={14} /> Post now…
                          </button>
                        )}
                      </div>
                      {form.platform !== "instagram" ? (
                        <p className="mt-2 text-xs text-neutral-400">Automatic posting is for Instagram. For {PLATFORM_LABEL[form.platform]}, plan it here and post it by hand.</p>
                      ) : (
                        missing.length > 0 && <p className="mt-2 text-xs text-[#d97706]">To schedule: {missing.join(", ")}.</p>
                      )}
                    </div>
                  )
                )}
              </>
            )}
          </section>

          {/* The video or picture that gets posted */}
          <section className={card}>
            <p className={label}>Media</p>
            {upload ? (
              <div className="flex items-center gap-3">
                <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-200">
                  {upload.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(upload.posterUrl)} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-900">{upload.title}</span>
                  <span className="block text-xs text-neutral-500">
                    {upload.kind === "video" ? `Video · ${Math.round(upload.durationSec)}s` : "Picture"}
                  </span>
                </span>
                {editable && (
                  <span className="flex gap-1.5">
                    <button onClick={() => setPicking((p) => !p)} className={btnGhost}>
                      Change
                    </button>
                    <button onClick={detach} disabled={!!busy} aria-label="Remove media" className={btnGhost}>
                      <X size={14} />
                    </button>
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-neutral-500">
                <ImageOff size={18} className="text-neutral-400" />
                <span className="flex-1">{form.platform === "instagram" ? "Nothing attached yet — this is what gets posted." : "Optional for this platform."}</span>
                {editable && (
                  <button onClick={() => setPicking((p) => !p)} className={btnGhost}>
                    Attach
                  </button>
                )}
              </div>
            )}
            {picking && editable && (
              <div className="mt-3 border-t border-neutral-200/70 pt-3">
                {choices === null ? (
                  <p className="text-xs text-neutral-400">Loading your uploads…</p>
                ) : choices.length === 0 ? (
                  <p className="text-xs text-neutral-500">No ready uploads waiting. Upload a video or picture first, then come back and attach it.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {choices.map((u) => (
                      <button key={u._id} onClick={() => attach(u)} className="group text-left" title={u.title}>
                        <span className="block aspect-square overflow-hidden rounded-xl bg-neutral-200 ring-orange-400 transition group-hover:ring-2">
                          {u.posterUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={assetUrl(u.posterUrl)} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="mt-1 block truncate text-[11px] font-medium text-neutral-600">{u.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                <Link href="/upload-post" target="_blank" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:underline">
                  <UploadCloud size={14} /> Upload new media (opens in a new tab)
                </Link>
              </div>
            )}
          </section>

          <Field label="Caption">
            <textarea value={form.caption} onChange={(e) => set("caption", e.target.value)} disabled={!editable} rows={6} maxLength={2200} placeholder="What the post says…" className={`${inputCls} resize-y leading-relaxed`} />
            <span className="mt-1.5 flex items-center justify-between text-xs text-neutral-400">
              <span>
                {upload && "caption" in upload && upload.caption && upload.caption !== form.caption && editable ? (
                  <button type="button" onClick={() => set("caption", (upload as { caption: string }).caption)} className="font-semibold text-orange-600 hover:underline">
                    Use the media’s caption
                  </button>
                ) : null}
              </span>
              <span className="tabular-nums">{form.caption.length} / 2200</span>
            </span>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <select value={form.format} onChange={(e) => set("format", e.target.value as ContentFormat)} disabled={!editable} className={inputCls}>
                {(Object.keys(FORMAT_LABEL) as ContentFormat[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Platform">
              <select value={form.platform} onChange={(e) => set("platform", e.target.value as ContentPlatform)} disabled={!editable} className={inputCls}>
                {(Object.keys(PLATFORM_LABEL) as ContentPlatform[]).map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Campaign" hint="A theme or series. Everything in the same campaign shares a colour on the calendar.">
            <input value={form.campaign} onChange={(e) => set("campaign", e.target.value)} disabled={!editable} list="content-campaigns" maxLength={80} placeholder="e.g. Easter, Youth Night, Sunday recaps" className={inputCls} />
            <datalist id="content-campaigns">
              {campaigns.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <div>
            <p className={label}>Who’s responsible</p>
            <div className="flex flex-wrap gap-1.5">
              {team.map((p) => {
                const on = form.owners.includes(p._id);
                return (
                  <button key={p._id} type="button" disabled={!editable} onClick={() => set("owners", on ? form.owners.filter((x) => x !== p._id) : [...form.owners, p._id])} aria-pressed={on} className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold transition ${on ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"} disabled:opacity-60`}>
                    <Avatar name={p.name} size={22} /> {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={!editable} rows={3} maxLength={4000} placeholder="Brief, references, links, who to tag…" className={`${inputCls} resize-y`} />
          </Field>

          {item && <TaskCard item={item} form={form} canLink={editable} isAdmin={isAdmin} team={team} onItem={adopt} say={say} setError={setError} />}
        </div>

        <footer className="flex items-center gap-2 border-t border-neutral-100 px-5 py-3.5">
          {item && editable && (
            <button onClick={() => setConfirm("delete")} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 size={15} /> Delete
            </button>
          )}
          <span className="flex-1" />
          <button onClick={close} className={btnGhost}>
            {editable ? "Cancel" : "Close"}
          </button>
          {canWrite && (!item || editable) && (
            <button onClick={save} disabled={!!busy || !form.title.trim() || (!!item && !dirty)} className={btnPrimary}>
              {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : null} {item ? "Save changes" : "Add to calendar"}
            </button>
          )}
        </footer>
      </aside>

      {confirm === "delete" && (
        <Modal title="Delete this content?" onClose={() => setConfirm(null)}>
          <p className="text-sm text-neutral-600">“{item?.title}” will be removed from the calendar{item?.task ? " and unlinked from its task" : ""}. The uploaded media and the task stay where they are.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirm(null)} className={btnGhost}>
              Keep it
            </button>
            <button onClick={remove} disabled={!!busy} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-red-700 disabled:opacity-50">
              {busy === "delete" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete
            </button>
          </div>
        </Modal>
      )}
      {confirm === "publish" && (
        <Modal title="Post to Instagram now?" onClose={() => !busy && setConfirm(null)}>
          <p className="text-sm text-neutral-600">
            This goes live on your <b className="text-neutral-900">real Instagram account</b> right now, instead of waiting for its scheduled time. A video can take a minute or two.
          </p>
          <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-line rounded-xl bg-neutral-50 p-3 text-[13px] leading-relaxed text-neutral-800">{form.caption || "(no caption)"}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirm(null)} disabled={busy === "publish"} className={btnGhost}>
              Cancel
            </button>
            <button onClick={publishNow} disabled={busy === "publish"} className={btnPrimary}>
              {busy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {busy === "publish" ? "Posting… don’t close this" : "Post now"}
            </button>
          </div>
        </Modal>
      )}
    </div>,
    document.body,
  );
}

// The journey of an item. The first four steps can be clicked; "Scheduled" and "Posted" happen through scheduling.
function Stepper({ item, editable, onPick }: { item: ContentItem; editable: boolean; onPick: (s: ContentStatus) => void }) {
  const at = FLOW.indexOf(item.status === "failed" || item.status === "publishing" ? "scheduled" : item.status);
  return (
    <ol className="flex items-center gap-1" aria-label="Progress">
      {FLOW.map((s, i) => {
        const m = statusMeta(s);
        const done = i < at || item.status === "published";
        const now = i === at;
        const clickable = editable && i <= 3 && !now;
        return (
          <li key={s} className="min-w-0 flex-1">
            <button type="button" disabled={!clickable} onClick={() => onPick(s)} className={`flex w-full flex-col items-center gap-1 rounded-lg py-1 ${clickable ? "hover:bg-neutral-100" : "cursor-default"}`}>
              <span className="h-1.5 w-full rounded-full" style={{ background: done || now ? m.color : "rgba(148,163,184,0.3)", opacity: now ? 1 : done ? 0.55 : 1 }} />
              <span className={`truncate text-[10.5px] font-semibold ${now ? "text-neutral-900" : "text-neutral-400"}`}>{s === "published" ? "Posted" : m.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// The board task that is the work behind this post: see it, open it, link one, or (admins) create one from here.
function TaskCard({ item, form, canLink, isAdmin, team, onItem, say, setError }: { item: ContentItem; form: Form; canLink: boolean; isAdmin: boolean; team: Person[]; onItem: (i: ContentItem) => void; say: (t: string) => void; setError: (t: string) => void }) {
  const [mode, setMode] = useState<"" | "link" | "create">("");
  const [sprints, setSprints] = useState<BoardSprint[] | null>(null);
  const [sprintId, setSprintId] = useState("");
  const [tasks, setTasks] = useState<BoardTaskLite[]>([]);
  const [taskId, setTaskId] = useState("");
  const [title, setTitle] = useState(`Produce: ${item.title}`);
  const [assignees, setAssignees] = useState<string[]>(item.owners.map((o) => o._id));
  const [due, setDue] = useState(form.date ? dayKey(new Date(new Date(`${form.date}T12:00`).getTime() - 86400000)) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mode || sprints) return;
    listSprints().then((s) => {
      setSprints(s);
      setSprintId((s.find((x) => x.status === "active") ?? s[0])?._id ?? "");
    });
  }, [mode, sprints]);
  useEffect(() => {
    if (mode !== "link" || !sprintId) return;
    listSprintTasks(sprintId).then((t) => {
      const free = t.filter((x) => !x.contentItem);
      setTasks(free);
      setTaskId(free[0]?._id ?? "");
    });
  }, [mode, sprintId]);

  const go = async (fn: () => Promise<ContentItem>, done: string) => {
    setBusy(true);
    setError("");
    try {
      onItem(await fn());
      say(done);
      setMode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
    }
    setBusy(false);
  };

  return (
    <section className={card}>
      <p className={label}>Task on the board</p>
      {item.task ? (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
            <ListChecks size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <Link href={`/board?task=${item.task._id}`} className="block truncate text-sm font-semibold text-neutral-900 hover:text-orange-600">
              {item.task.title}
            </Link>
            <span className="block text-xs text-neutral-500">
              {item.task.status.replace("_", " ")}
              {item.task.assignees.length ? ` · ${item.task.assignees.map((a) => a.name).join(", ")}` : ""}
            </span>
          </span>
          {canLink && (
            <button onClick={() => go(() => unlinkContentTask(item._id), "Task unlinked")} disabled={busy} className={btnGhost} aria-label="Unlink the task">
              <Unlink size={14} />
            </button>
          )}
        </div>
      ) : mode === "" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-neutral-500">Tie the work behind this post to a task, so progress shows up on the board.</p>
          {canLink && (
            <>
              {isAdmin && (
                <button onClick={() => setMode("create")} className={btnPrimary}>
                  Create task
                </button>
              )}
              <button onClick={() => setMode("link")} className={btnGhost}>
                Link a task
              </button>
            </>
          )}
        </div>
      ) : sprints && sprints.length === 0 ? (
        <p className="text-sm text-neutral-500">
          There’s no sprint yet. {isAdmin ? <Link href="/board" className="font-semibold text-orange-600 hover:underline">Create one on the board</Link> : "An admin needs to create one on the board."}
        </p>
      ) : (
        <div className="space-y-3">
          <Field label="Sprint">
            <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className={inputCls}>
              {(sprints ?? []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                  {s.status === "active" ? " (active)" : ""}
                </option>
              ))}
            </select>
          </Field>
          {mode === "link" ? (
            <>
              <Field label="Task">
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={inputCls}>
                  {tasks.length === 0 && <option value="">No unlinked tasks in this sprint</option>}
                  {tasks.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode("")} className={btnGhost}>
                  Cancel
                </button>
                <button disabled={!taskId || busy} onClick={() => go(() => linkContentTask(item._id, taskId), "Task linked")} className={btnPrimary}>
                  Link task
                </button>
              </div>
            </>
          ) : (
            <>
              <Field label="Task title">
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={200} />
              </Field>
              <Field label="Due">
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
              </Field>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Give it to</p>
                <div className="flex flex-wrap gap-1.5">
                  {team.map((p) => {
                    const on = assignees.includes(p._id);
                    return (
                      <button key={p._id} type="button" onClick={() => setAssignees(on ? assignees.filter((x) => x !== p._id) : [...assignees, p._id])} aria-pressed={on} className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode("")} className={btnGhost}>
                  Cancel
                </button>
                <button
                  disabled={!sprintId || !title.trim() || busy}
                  onClick={() =>
                    go(async () => {
                      const t = await createBoardTask({ sprint: sprintId, title: title.trim(), assignees, dueDate: due || null, contentItem: item._id });
                      return linkContentTask(item._id, t._id); // makes sure both sides point at each other
                    }, "Task created and linked")
                  }
                  className={btnPrimary}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : null} Create task
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
