"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImagePlus,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  assetUrl,
  generateMessageNotes,
  getBrand,
  getMessageNotes,
  listEditorImages,
  lookupScripture,
  regenerateNotesPart,
  saveMessageNotes,
  uploadEditorImage,
} from "@/lib/api";
import type {
  Brand,
  ImageAsset,
  MessageNotes,
  NotesDay,
  NotesSection,
  PlanKind,
  Session,
} from "@/lib/types";
import { FontPicker } from "../editor/FontPicker";
import { Spinner, cx } from "../editor/ui";
import { buildImagesZip, buildPdf, notesFileName } from "./export";
import { FORMATS, renderNotes, type NotesFormat } from "./layout";
import { NOTES_THEMES, themeById } from "./themes";

const KINDS: PlanKind[] = [
  "read",
  "pray",
  "reflect",
  "act",
  "share",
  "memorize",
  "review",
];
const input =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500";
const small =
  "rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50";

// The Monday to Saturday after a service date (the first Monday strictly after it), as YYYY-MM-DD.
function weekAfter(iso: string): string[] {
  const base = new Date(`${iso}T12:00:00`);
  const start = new Date(base);
  start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7));
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function Block({
  title,
  hint,
  children,
  defaultOpen = false,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            size={16}
            className={cx(
              "shrink-0 text-neutral-400 transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-neutral-900">
              {title}
            </span>
            {hint && (
              <span className="block truncate text-xs text-neutral-500">
                {hint}
              </span>
            )}
          </span>
        </button>
        {action}
      </div>
      {open && (
        <div className="space-y-3 border-t border-neutral-100 px-4 py-4">
          {children}
        </div>
      )}
    </section>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
    {children}
  </span>
);

export function MessageNotesPanel({ session }: { session: Session }) {
  const sessionId = session._id;
  const [notes, setNotes] = useState<MessageNotes | null | undefined>(
    undefined,
  );
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [translation, setTranslation] = useState<"kjv" | "web">("kjv");
  const [link, setLink] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const [theme, setTheme] = useState("midnight-gold");
  const [format, setFormat] = useState<NotesFormat>("book");
  const [previews, setPreviews] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [newRef, setNewRef] = useState("");
  const [coverTab, setCoverTab] = useState<"text" | "upload">("text");
  const [gallery, setGallery] = useState<ImageAsset[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getMessageNotes(sessionId).catch(() => null),
      getBrand().catch(() => null),
    ]).then(([n, b]) => {
      if (!alive) return;
      setNotes(n);
      setBrand(b);
      if (n?.messageLink) setLink(n.messageLink);
    });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // ---- autosave: every edit is sent after a short pause ----
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<MessageNotes | null>(null);
  const flush = useCallback(async () => {
    const n = latest.current;
    if (!n) return;
    setSaveState("saving");
    try {
      const { _id, session: _s, updatedAt, translation: _t, ...fields } = n;
      void _id;
      void _s;
      void updatedAt;
      void _t;
      await saveMessageNotes(sessionId, fields);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [sessionId]);

  const edit = (patch: Partial<MessageNotes>) => {
    setNotes((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...patch };
      latest.current = next;
      return next;
    });
    setSaveState("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 1000);
  };
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        flush();
      }
    },
    [flush],
  );

  // ---- preview: redraw a moment after anything changes ----
  const renderToken = useRef(0);
  useEffect(() => {
    if (!notes) return;
    const token = ++renderToken.current;
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const { pages } = await renderNotes(notes, brand, theme, format);
        if (token !== renderToken.current)
          return void pages.forEach((p) => p.dispose());
        const urls = pages.map((p) =>
          p.toDataURL({
            format: "jpeg",
            quality: 0.82,
            multiplier: format === "slides" ? 0.5 : 0.55,
          }),
        );
        pages.forEach((p) => p.dispose());
        setPreviews(urls);
        setPageIdx((i) => Math.min(i, urls.length - 1));
      } catch (err) {
        if (token === renderToken.current)
          setError(
            err instanceof Error ? err.message : "Could not draw the preview",
          );
      } finally {
        if (token === renderToken.current) setRendering(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [notes, brand, theme, format]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const generate = () =>
    run("generate", async () => {
      const n = await generateMessageNotes(sessionId, {
        translation,
        messageLink: link.trim(),
      });
      latest.current = n;
      setNotes(n);
    });

  const regen = (part: "prayer" | "reading" | "plan") =>
    run(part, async () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await flush();
      const n = await regenerateNotesPart(sessionId, part);
      latest.current = n;
      setNotes(n);
    });

  const changeTranslation = (t: "kjv" | "web") =>
    run("translation", async () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await flush();
      const n = await saveMessageNotes(sessionId, { translation: t });
      latest.current = n;
      setNotes(n);
    });

  const addScripture = () =>
    run("lookup", async () => {
      if (!notes || !newRef.trim()) return;
      const hit = await lookupScripture(newRef.trim(), notes.translation);
      if (
        notes.scriptures.some(
          (s) => s.ref.toLowerCase() === hit.ref.toLowerCase(),
        )
      )
        throw new Error(`${hit.ref} is already in the list.`);
      edit({
        scriptures: [
          ...notes.scriptures,
          { ref: hit.ref, text: hit.text, quoted: true, verified: true },
        ],
      });
      setNewRef("");
    });

  const uploadCover = (file: File) =>
    run("cover", async () => {
      const { url } = await uploadEditorImage(file, "upload");
      edit({ coverMode: "image", coverImageUrl: url });
    });

  const openGallery = () => {
    if (gallery) return;
    listEditorImages("gallery")
      .then(setGallery)
      .catch(() => setGallery([]));
  };

  const exportFile = (kind: "pdf" | "zip") =>
    run(kind, async () => {
      if (!notes) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const blob =
        kind === "pdf"
          ? await buildPdf(notes, brand, theme, format)
          : await buildImagesZip(notes, brand, theme, format);
      download(blob, notesFileName(notes, format, kind));
    });

  // ---- loading & empty states ----
  if (notes === undefined)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );

  if (notes === null) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 sm:p-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <FileText size={18} /> Message Notes
        </div>
        <p className="mt-2 text-sm text-neutral-600">
          Turns this message into beautiful study notes: a title page, the
          message broken into topics and key points with every scripture quoted
          in full, prayer points, further reading, and a Monday-to-Saturday plan
          to live it out. Then download it as slides or a PDF.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <Label>Bible translation</Label>
            <select
              value={translation}
              onChange={(e) => setTranslation(e.target.value as "kjv" | "web")}
              className={input}
            >
              <option value="kjv">King James (KJV)</option>
              <option value="web">World English Bible (WEB)</option>
            </select>
          </label>
          <label className="block">
            <Label>Link to the full message (optional)</Label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Spotify, YouTube…"
              className={input}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-neutral-400">
          Scripture text is looked up from the translation itself, never written
          by the AI. NKJV, NIV and ESV are copyrighted and can&apos;t be fetched
          this way.
        </p>
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={Boolean(busy)}
          className="mt-5 flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Spinner /> Writing the notes… about a minute
            </>
          ) : (
            <>
              <Sparkles size={15} /> Generate message notes
            </>
          )}
        </button>
      </div>
    );
  }

  // ---- editing helpers ----
  const setSection = (i: number, patch: Partial<NotesSection>) =>
    edit({
      sections: notes.sections.map((s, k) =>
        k === i ? { ...s, ...patch } : s,
      ),
    });
  const setDay = (i: number, patch: Partial<NotesDay>) =>
    edit({
      plan: {
        ...notes.plan,
        days: notes.plan.days.map((d, k) => (k === i ? { ...d, ...patch } : d)),
      },
    });
  const moveSection = (i: number, to: number) => {
    if (to < 0 || to >= notes.sections.length) return;
    const next = [...notes.sections];
    const [s] = next.splice(i, 1);
    next.splice(to, 0, s);
    edit({ sections: next });
  };
  const page = previews[pageIdx];
  const spec = FORMATS[format];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      {/* ---------------------------------------------------------------- preview & download */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FORMATS) as NotesFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  title={FORMATS[f].hint}
                  onClick={() => setFormat(f)}
                  className={cx(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    format === f
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-50",
                  )}
                >
                  {FORMATS[f].label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-neutral-400">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "error"
                    ? "Save failed"
                    : ""}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2">
            {NOTES_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                title={`${t.name} — ${t.blurb}`}
                className={cx(
                  "overflow-hidden rounded-lg border text-left",
                  theme === t.id
                    ? "border-neutral-900 ring-2 ring-neutral-900"
                    : "border-neutral-200 hover:border-neutral-400",
                )}
              >
                <span
                  className="block h-9"
                  style={{
                    background: `linear-gradient(${t.bg.angle}deg, ${t.bg.from}, ${t.bg.to})`,
                  }}
                >
                  <span className="flex h-full items-end gap-1 p-1.5">
                    <span
                      className="h-1.5 w-5 rounded-full"
                      style={{ background: t.accent }}
                    />
                    <span
                      className="h-1.5 w-3 rounded-full"
                      style={{ background: t.accent2 }}
                    />
                  </span>
                </span>
                <span className="block truncate px-1.5 py-1 text-[10px] font-medium text-neutral-700">
                  {t.name}
                </span>
              </button>
            ))}
          </div>

          <div
            className="relative mt-4! overflow-hidden rounded-lg bg-neutral-100"
            style={{
              aspectRatio: `${spec.w} / ${spec.h}`,
              maxHeight: "62vh",
              margin: "0 auto",
              width: format === "slides" ? "100%" : undefined,
            }}
          >
            {page ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page}
                alt={`Page ${pageIdx + 1}`}
                className={cx(
                  "h-full w-full object-contain transition-opacity",
                  rendering && "opacity-60",
                )}
              />
            ) : (
              <div className="grid h-full place-items-center">
                <Spinner />
              </div>
            )}
            {previews.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={pageIdx === 0}
                  onClick={() => setPageIdx((i) => i - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={pageIdx === previews.length - 1}
                  onClick={() => setPageIdx((i) => i + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
              {previews.length ? `${pageIdx + 1} / ${previews.length}` : ""}
              {rendering ? " · updating…" : ""}
            </span>
          </div>

          {previews.length > 1 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {previews.map((u, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPageIdx(i)}
                  className={cx(
                    "h-14 shrink-0 overflow-hidden rounded border",
                    i === pageIdx
                      ? "border-neutral-900 ring-1 ring-neutral-900"
                      : "border-neutral-200 opacity-80 hover:opacity-100",
                  )}
                  style={{ aspectRatio: `${spec.w} / ${spec.h}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportFile("pdf")}
              disabled={Boolean(busy)}
              className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
            >
              {busy === "pdf" ? <Spinner /> : <Download size={15} />} Download
              PDF
            </button>
            <button
              type="button"
              onClick={() => exportFile("zip")}
              disabled={Boolean(busy)}
              className="flex items-center gap-2 rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
            >
              {busy === "zip" ? <Spinner /> : <Download size={15} />} Images
              (ZIP)
            </button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            {spec.hint}. The PDF has the same look as the preview; the listen
            button is clickable.
          </p>
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- editor */}
      <div className="space-y-3">
        <Block
          title="Details"
          hint="Title, preacher, date, link to the full message"
          defaultOpen
        >
          <label className="block">
            <Label>Title</Label>
            <input
              value={notes.title}
              onChange={(e) => edit({ title: e.target.value })}
              className={input}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <Label>Preacher</Label>
              <input
                value={notes.preacher}
                onChange={(e) => edit({ preacher: e.target.value })}
                className={input}
              />
            </label>
            <label className="block">
              <Label>Date of the service</Label>
              <input
                type="date"
                value={notes.date}
                onChange={(e) => {
                  const date = e.target.value;
                  if (!date) return;
                  // The plan's dates follow the service date.
                  const dates = weekAfter(date);
                  edit({
                    date,
                    plan: {
                      ...notes.plan,
                      days: notes.plan.days.map((d, i) => ({
                        ...d,
                        date: dates[i] ?? d.date,
                      })),
                    },
                  });
                }}
                className={input}
              />
            </label>
          </div>
          <label className="block">
            <Label>Link to the full message</Label>
            <input
              value={notes.messageLink}
              onChange={(e) => edit({ messageLink: e.target.value })}
              placeholder="https://open.spotify.com/episode/…"
              className={input}
            />
          </label>
          <p className="-mt-1 text-[11px] text-neutral-400">
            Adds a final page with a Listen button and a QR code.
          </p>
          <label className="block">
            <Label>Bible translation</Label>
            <select
              value={notes.translation}
              onChange={(e) =>
                changeTranslation(e.target.value as "kjv" | "web")
              }
              disabled={busy === "translation"}
              className={input}
            >
              <option value="kjv">King James (KJV)</option>
              <option value="web">World English Bible (WEB)</option>
            </select>
          </label>
        </Block>

        <Block
          title="Cover"
          hint={
            notes.coverMode === "image" && notes.coverImageUrl
              ? "Picture behind the title"
              : "Type only"
          }
          defaultOpen
        >
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 text-xs font-medium">
            {(
              [
                ["text", "Text only"],
                ["upload", "Upload / gallery"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setCoverTab(k);
                  if (k === "text") edit({ coverMode: "text" });
                  if (k === "upload") openGallery();
                }}
                className={cx(
                  "rounded-md px-2 py-1.5",
                  coverTab === k ? "bg-white shadow-sm" : "text-neutral-500",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          {coverTab === "text" && (
            <p className="text-xs text-neutral-500">
              The title and preacher are set in type on the theme&apos;s
              background. Clean and classic.
            </p>
          )}
          {coverTab === "upload" && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-5 text-sm text-neutral-600 hover:border-neutral-500">
                {busy === "cover" ? <Spinner /> : <ImagePlus size={18} />}{" "}
                Upload a picture
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadCover(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {gallery && gallery.length > 0 && (
                <div>
                  <Label>Or choose from your gallery</Label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {gallery.slice(0, 15).map((a) => (
                      <button
                        key={a._id}
                        type="button"
                        onClick={() =>
                          edit({ coverMode: "image", coverImageUrl: a.url })
                        }
                        className={cx(
                          "aspect-square overflow-hidden rounded-md border",
                          notes.coverImageUrl === a.url
                            ? "border-neutral-900 ring-2 ring-neutral-900"
                            : "border-neutral-200 hover:ring-2 hover:ring-neutral-400",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={assetUrl(a.url)}
                          alt={a.name || "Gallery image"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {notes.coverImageUrl && coverTab !== "text" && (
            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(notes.coverImageUrl)}
                alt="Cover picture"
                className="h-16 w-16 rounded-md object-cover"
              />
              <span className="min-w-0 flex-1 text-xs text-neutral-500">
                {notes.coverMode === "image"
                  ? "Showing on the cover."
                  : "Not showing (text only)."}
              </span>
              <button
                type="button"
                className={small}
                onClick={() =>
                  edit({
                    coverMode: notes.coverMode === "image" ? "text" : "image",
                  })
                }
              >
                {notes.coverMode === "image" ? "Hide" : "Use"}
              </button>
              <button
                type="button"
                className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove the picture"
                onClick={() => edit({ coverMode: "text", coverImageUrl: "" })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </Block>

        <Block
          title="Fonts"
          hint={`${notes.fonts?.head || themeById(theme).head.family} · ${notes.fonts?.body || themeById(theme).body.family}`}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Headings</Label>
              <FontPicker
                value={notes.fonts?.head || themeById(theme).head.family}
                onChange={(f) => edit({ fonts: { ...notes.fonts, head: f } })}
                block
              />
            </div>
            <div>
              <Label>Body text</Label>
              <FontPicker
                value={notes.fonts?.body || themeById(theme).body.family}
                onChange={(f) => edit({ fonts: { ...notes.fonts, body: f } })}
                block
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-neutral-400">Pairings:</span>
            {(
              [
                ["Classic", "Playfair Display", "Lora"],
                ["Modern", "Bricolage Grotesque", "Plus Jakarta Sans"],
                ["Elegant", "Cormorant Garamond", "Source Serif 4"],
                ["Warm", "DM Serif Display", "DM Sans"],
                ["Bold", "Bebas Neue", "Inter"],
              ] as const
            ).map(([name, h, b]) => (
              <button
                key={name}
                type="button"
                className={small}
                onClick={() => edit({ fonts: { head: h, body: b } })}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              className={small}
              onClick={() => edit({ fonts: { head: "", body: "" } })}
            >
              Theme default
            </button>
          </div>
        </Block>

        <Block title="Closing page" hint="Service times, venue and contact">
          <p className="text-xs text-neutral-500">
            Shown as “Join us” on the last page. Leave a field blank to use what
            is on your Church Profile.
          </p>
          <label className="block">
            <Label>Invitation line</Label>
            <input
              value={notes.endInfo?.note ?? ""}
              onChange={(e) =>
                edit({ endInfo: { ...notes.endInfo, note: e.target.value } })
              }
              placeholder="e.g. Join us this Sunday!"
              className={input}
            />
          </label>
          <label className="block">
            <Label>Service times</Label>
            <textarea
              rows={3}
              value={notes.endInfo?.serviceTimes ?? ""}
              onChange={(e) =>
                edit({
                  endInfo: { ...notes.endInfo, serviceTimes: e.target.value },
                })
              }
              placeholder={
                brand?.serviceTimes || "Sundays 9am & 11am\nWednesdays 6pm"
              }
              className={input}
            />
          </label>
          <label className="block">
            <Label>Venue / address</Label>
            <textarea
              rows={2}
              value={notes.endInfo?.venue ?? ""}
              onChange={(e) =>
                edit({ endInfo: { ...notes.endInfo, venue: e.target.value } })
              }
              placeholder={brand?.address || "Venue and address"}
              className={input}
            />
          </label>
          <label className="block">
            <Label>Contact &amp; online</Label>
            <textarea
              rows={3}
              value={notes.endInfo?.contact ?? ""}
              onChange={(e) =>
                edit({ endInfo: { ...notes.endInfo, contact: e.target.value } })
              }
              placeholder={
                [brand?.phone, brand?.email, brand?.website]
                  .filter(Boolean)
                  .join("\n") || "Phone, email, website, social handle"
              }
              className={input}
            />
          </label>
        </Block>

        <Block
          title="Overview"
          hint="The opening hook, big idea and closing challenge"
        >
          <label className="block">
            <Label>Opening hook</Label>
            <textarea
              rows={2}
              value={notes.hook}
              onChange={(e) => edit({ hook: e.target.value })}
              className={input}
            />
          </label>
          <label className="block">
            <Label>The big idea</Label>
            <textarea
              rows={2}
              value={notes.bigIdea}
              onChange={(e) => edit({ bigIdea: e.target.value })}
              className={input}
            />
          </label>
          <label className="block">
            <Label>Closing challenge</Label>
            <textarea
              rows={3}
              value={notes.closing}
              onChange={(e) => edit({ closing: e.target.value })}
              className={input}
            />
          </label>
        </Block>

        <Block
          title="Message"
          hint={`${notes.sections.length} topics`}
          action={
            <button
              type="button"
              className={small}
              onClick={() =>
                edit({
                  sections: [
                    ...notes.sections,
                    {
                      heading: "New topic",
                      summary: "",
                      pullQuote: "",
                      points: [{ text: "", refs: [] }],
                    },
                  ],
                })
              }
            >
              + Topic
            </button>
          }
        >
          {notes.sections.map((sec, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={sec.heading}
                  onChange={(e) => setSection(i, { heading: e.target.value })}
                  className={cx(input, "font-semibold")}
                  aria-label="Topic heading"
                />
                <button
                  type="button"
                  className={small}
                  onClick={() => moveSection(i, i - 1)}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={small}
                  onClick={() => moveSection(i, i + 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete topic"
                  onClick={() =>
                    window.confirm(`Delete “${sec.heading}”?`) &&
                    edit({ sections: notes.sections.filter((_, k) => k !== i) })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                rows={2}
                value={sec.summary}
                onChange={(e) => setSection(i, { summary: e.target.value })}
                placeholder="Short intro (optional)"
                className={cx(input, "mt-2")}
              />
              <div className="mt-2 space-y-2">
                {sec.points.map((p, pi) => (
                  <div key={pi} className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <textarea
                        rows={2}
                        value={p.text}
                        onChange={(e) =>
                          setSection(i, {
                            points: sec.points.map((x, k) =>
                              k === pi ? { ...x, text: e.target.value } : x,
                            ),
                          })
                        }
                        className={input}
                      />
                      <input
                        value={p.refs.join(", ")}
                        onChange={(e) =>
                          setSection(i, {
                            points: sec.points.map((x, k) =>
                              k === pi
                                ? {
                                    ...x,
                                    refs: e.target.value
                                      .split(",")
                                      .map((r) => r.trim())
                                      .filter(Boolean),
                                  }
                                : x,
                            ),
                          })
                        }
                        placeholder="Scripture refs, comma separated"
                        className={cx(input, "mt-1 py-1.5 text-xs")}
                      />
                    </div>
                    <button
                      type="button"
                      className="h-8 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete point"
                      onClick={() =>
                        setSection(i, {
                          points: sec.points.filter((_, k) => k !== pi),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={small}
                  onClick={() =>
                    setSection(i, {
                      points: [...sec.points, { text: "", refs: [] }],
                    })
                  }
                >
                  + Point
                </button>
              </div>
              <input
                value={sec.pullQuote}
                onChange={(e) => setSection(i, { pullQuote: e.target.value })}
                placeholder="Pull quote — a line the preacher said (optional)"
                className={cx(input, "mt-2 text-xs")}
              />
            </div>
          ))}
          <p className="text-[11px] text-neutral-400">
            Wrap a key phrase in **double asterisks** to make it bold.
          </p>
        </Block>

        <Block
          title="Scriptures"
          hint={`${notes.scriptures.length} in this message`}
        >
          {notes.scriptures.map((s, i) => (
            <div
              key={s.ref}
              className="rounded-lg border border-neutral-200 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-neutral-900">
                  {s.ref}
                  {s.verified === false && (
                    <span className="ml-2 text-[11px] font-normal text-amber-600">
                      text not found
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      checked={s.quoted}
                      onChange={(e) =>
                        edit({
                          scriptures: notes.scriptures.map((x, k) =>
                            k === i ? { ...x, quoted: e.target.checked } : x,
                          ),
                        })
                      }
                      className="accent-neutral-900"
                    />{" "}
                    Quote in the message
                  </label>
                  <button
                    type="button"
                    className="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${s.ref}`}
                    onClick={() =>
                      edit({
                        scriptures: notes.scriptures.filter((_, k) => k !== i),
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              <textarea
                rows={3}
                value={s.text}
                onChange={(e) =>
                  edit({
                    scriptures: notes.scriptures.map((x, k) =>
                      k === i ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
                className={cx(input, "mt-2 text-xs")}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={newRef}
              onChange={(e) => setNewRef(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addScripture()}
              placeholder="Add a verse, e.g. John 3:16"
              className={input}
            />
            <button
              type="button"
              onClick={addScripture}
              disabled={busy === "lookup" || !newRef.trim()}
              className="shrink-0 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "lookup" ? "…" : "Add"}
            </button>
          </div>
        </Block>

        <Block
          title="Prayer points"
          hint={`${notes.prayerPoints.filter((p) => p.include).length} of ${notes.prayerPoints.length} included`}
          action={
            <button
              type="button"
              className={small}
              onClick={() => regen("prayer")}
              disabled={Boolean(busy)}
            >
              {busy === "prayer" ? (
                "…"
              ) : (
                <span className="flex items-center gap-1">
                  <RefreshCw size={11} /> Rewrite
                </span>
              )}
            </button>
          }
        >
          <p className="text-xs text-neutral-500">
            Review them: untick any you don&apos;t want, edit the wording, or
            add your own.
          </p>
          {notes.prayerPoints.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={p.include}
                onChange={(e) =>
                  edit({
                    prayerPoints: notes.prayerPoints.map((x, k) =>
                      k === i ? { ...x, include: e.target.checked } : x,
                    ),
                  })
                }
                className="mt-3 accent-neutral-900"
                aria-label="Include"
              />
              <textarea
                rows={2}
                value={p.text}
                onChange={(e) =>
                  edit({
                    prayerPoints: notes.prayerPoints.map((x, k) =>
                      k === i ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
                className={cx(input, !p.include && "opacity-50")}
              />
              <button
                type="button"
                className="mt-1.5 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Delete"
                onClick={() =>
                  edit({
                    prayerPoints: notes.prayerPoints.filter((_, k) => k !== i),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={small}
            onClick={() =>
              edit({
                prayerPoints: [
                  ...notes.prayerPoints,
                  { text: "", include: true },
                ],
              })
            }
          >
            <Plus size={11} className="mr-1 inline" /> Add a prayer point
          </button>
        </Block>

        <Block
          title="Further reading"
          hint={`${notes.furtherReading.length} passages`}
          action={
            <button
              type="button"
              className={small}
              onClick={() => regen("reading")}
              disabled={Boolean(busy)}
            >
              {busy === "reading" ? (
                "…"
              ) : (
                <span className="flex items-center gap-1">
                  <RefreshCw size={11} /> Rewrite
                </span>
              )}
            </button>
          }
        >
          {notes.furtherReading.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  value={r.ref}
                  onChange={(e) =>
                    edit({
                      furtherReading: notes.furtherReading.map((x, k) =>
                        k === i ? { ...x, ref: e.target.value } : x,
                      ),
                    })
                  }
                  className={cx(input, "font-semibold")}
                />
                <textarea
                  rows={2}
                  value={r.why}
                  onChange={(e) =>
                    edit({
                      furtherReading: notes.furtherReading.map((x, k) =>
                        k === i ? { ...x, why: e.target.value } : x,
                      ),
                    })
                  }
                  className={cx(input, "text-xs")}
                />
              </div>
              <button
                type="button"
                className="mt-1.5 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Delete"
                onClick={() =>
                  edit({
                    furtherReading: notes.furtherReading.filter(
                      (_, k) => k !== i,
                    ),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={small}
            onClick={() =>
              edit({
                furtherReading: [...notes.furtherReading, { ref: "", why: "" }],
              })
            }
          >
            <Plus size={11} className="mr-1 inline" /> Add a passage
          </button>
        </Block>

        <Block
          title="Weekly plan"
          hint="Monday to Saturday"
          action={
            <button
              type="button"
              className={small}
              onClick={() => regen("plan")}
              disabled={Boolean(busy)}
            >
              {busy === "plan" ? (
                "…"
              ) : (
                <span className="flex items-center gap-1">
                  <RefreshCw size={11} /> Rewrite
                </span>
              )}
            </button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <Label>Theme of the week</Label>
              <input
                value={notes.plan.theme}
                onChange={(e) =>
                  edit({ plan: { ...notes.plan, theme: e.target.value } })
                }
                className={input}
              />
            </label>
            <label className="block">
              <Label>Weekly target</Label>
              <input
                value={notes.plan.target}
                onChange={(e) =>
                  edit({ plan: { ...notes.plan, target: e.target.value } })
                }
                className={input}
              />
            </label>
          </div>
          {notes.plan.days.map((d, i) => (
            <div
              key={d.day}
              className="rounded-lg border border-neutral-200 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {d.day.slice(0, 3)}
                  {d.date
                    ? ` · ${new Date(`${d.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                    : ""}
                </span>
                <input
                  value={d.title}
                  onChange={(e) => setDay(i, { title: e.target.value })}
                  className={cx(input, "font-medium")}
                />
                <select
                  value={d.kind}
                  onChange={(e) =>
                    setDay(i, { kind: e.target.value as PlanKind })
                  }
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs capitalize"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={2}
                value={d.action}
                onChange={(e) => setDay(i, { action: e.target.value })}
                className={cx(input, "mt-2")}
              />
              <input
                value={d.scripture}
                onChange={(e) => setDay(i, { scripture: e.target.value })}
                placeholder="Scripture to read (optional)"
                className={cx(input, "mt-1 py-1.5 text-xs")}
              />
            </div>
          ))}
          <p className="text-[11px] text-neutral-400">
            Dates follow the service date: the week after, Monday to Saturday.
          </p>
        </Block>

        <button
          type="button"
          onClick={() =>
            window.confirm(
              "Rewrite all the notes from the transcript? Your edits will be replaced.",
            ) && generate()
          }
          disabled={Boolean(busy)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
        >
          {busy === "generate" ? (
            <>
              <Spinner /> Rewriting…
            </>
          ) : (
            <>
              <RefreshCw size={14} /> Rewrite everything from the transcript
            </>
          )}
        </button>
      </div>
    </div>
  );
}
