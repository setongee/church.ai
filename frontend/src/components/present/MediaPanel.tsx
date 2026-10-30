"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Check, Film, ImagePlus, Play, Stamp, Trash2 } from "lucide-react";
import { appMedia, BACKGROUND_PRESETS, IMAGE_FITS, deleteMedia, listMedia, mediaSrc, uploadMedia, type AppMediaItem, type Background, type MediaItem, type PresentStyle, type ScheduleItemInput, type Slide } from "@/lib/present";
import { Chips, SearchBox, ViewTabs, type SourceView } from "./appSource";
import { btnGhost, Empty } from "./ui";

interface Props {
  mode: "media" | "backgrounds";
  background: Background;
  onBackground: (b: Background) => void;
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onAdd: (item: ScheduleItemInput) => void;
  style: PresentStyle;
  onStyle: (p: Partial<PresentStyle>) => void;
  // The Logo screen: the church logo, or a picture/GIF/video picked from here.
  logoUrl: string;
  logoKind: "logo" | "image" | "video";
  brandLogo: string;
  onLogo: (url: string, kind: "logo" | "image" | "video") => void;
}

// One card's worth of media, whether uploaded here or generated elsewhere in the app.
interface Card {
  id: string;
  url: string;
  type: "image" | "gif" | "video";
  title: string;
  badge?: string; // where it came from ("Reel", "Design"...)
  deletable?: MediaItem;
}

const same = (a: Background, b: Background) => a.type === b.type && a.value === b.value;
const asSlide = (c: Card): Slide => (c.type === "video" ? { kind: "video", url: c.url } : { kind: "image", url: c.url });
const asBackground = (c: Card): Background => (c.type === "video" ? { type: "video", value: c.url } : { type: "image", value: c.url });

function Thumb({ card }: { card: Card }) {
  if (card.type === "video") {
    return (
      <>
        {/* #t=0.1 asks the browser to show a frame instead of a black box */}
        <video src={`${mediaSrc(card.url)}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-[#ffffff]">
            <Play size={16} fill="currentColor" />
          </span>
        </span>
      </>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaSrc(card.url)} alt={card.title} loading="lazy" className="h-full w-full object-cover" />;
}

// Media: pictures, GIFs and videos shown full screen. Backgrounds: sit behind the text. Both take uploads
// and can also pull in what the rest of the app has made (designs, quote graphics, reels, ...).
export function MediaPanel({ mode, background, onBackground, onStage, onLive, onAdd, style, onStyle, logoUrl, logoKind, brandLogo, onLogo }: Props) {
  const purpose: MediaItem["purpose"] = mode === "backgrounds" ? "background" : "media";
  const [view, setView] = useState<SourceView>("library");
  const [mine, setMine] = useState<MediaItem[] | null>(null);
  const [fromApp, setFromApp] = useState<AppMediaItem[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "gif" | "video">("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listMedia(purpose).then(setMine).catch((e) => (setMine([]), setError(e.message)));
  }, [purpose]);

  useEffect(() => {
    if (view !== "app") return;
    const t = setTimeout(() => appMedia(q).then(setFromApp).catch((e) => (setFromApp([]), setError(e.message))), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [view, q]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    try {
      const added: MediaItem[] = [];
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) {
        setBusy(list.length > 1 ? `Uploading ${i + 1} of ${list.length}…` : "Uploading…");
        added.push(await uploadMedia(list[i], purpose));
      }
      setMine((cur) => [...added.reverse(), ...(cur ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy("");
      if (file.current) file.current.value = "";
    }
  }

  async function remove(m: MediaItem) {
    if (!confirm(`Delete “${m.name || "this file"}”?`)) return;
    await deleteMedia(m._id);
    setMine((cur) => cur?.filter((x) => x._id !== m._id) ?? null);
  }

  const cards: Card[] | null = useMemo(() => {
    if (view === "library") return mine?.map((m) => ({ id: m._id, url: m.url, type: m.type, title: m.name || "Untitled", deletable: m })) ?? null;
    return fromApp?.map((a) => ({ id: a.id, url: a.url, type: a.type, title: a.title, badge: a.label })) ?? null;
  }, [view, mine, fromApp]);

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    fromApp?.forEach((a) => counts.set(a.label, (counts.get(a.label) ?? 0) + 1));
    return [...counts.entries()].map(([label, count]) => ({ id: label, label, count }));
  }, [fromApp]);

  const shown = (cards ?? []).filter(
    (c) => (typeFilter === "all" || c.type === typeFilter) && (view === "library" || sourceFilter === "all" || c.badge === sourceFilter) && (view === "app" || !q || c.title.toLowerCase().includes(q.toLowerCase())),
  );

  const choose = (c: Card) => {
    if (mode === "backgrounds") onBackground(asBackground(c));
    else {
      setActiveId(c.id);
      onStage(asSlide(c));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        <ViewTabs value={view} onChange={setView} />
        <SearchBox value={q} onChange={setQ} placeholder={view === "app" ? "Search presentation slides…" : "Search by name"} />
        <input ref={file} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        {view === "library" && (
          <button onClick={() => file.current?.click()} disabled={!!busy} className={`${btnGhost} ml-auto`}>
            <ImagePlus size={16} /> {busy || "Upload"}
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-400">
        {mode === "backgrounds" ? "Click one to put it behind everything on the output. Videos loop silently." : "Click to preview · Double-click to show on screen. Pictures, GIFs and videos."}
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {logoKind !== "logo" && (
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2">
          <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md bg-black">
            <Thumb card={{ id: "logo", url: logoUrl, type: logoKind === "video" ? "video" : "image", title: "Logo screen" }} />
          </span>
          <p className="min-w-0 flex-1 text-xs text-orange-900">
            <b>Logo screen</b> is showing this {logoKind === "video" ? "video" : "picture"} (press <kbd className="rounded bg-white/70 px-1">L</kbd> to show it).
          </p>
          {brandLogo && (
            <button onClick={() => onLogo(brandLogo, "logo")} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100">
              Back to church logo
            </button>
          )}
        </div>
      )}

      {mode === "media" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Framing</span>
          <div className="flex gap-0.5 rounded-lg bg-neutral-100 p-0.5" role="group" aria-label="Picture framing">
            {IMAGE_FITS.map((f) => (
              <button
                key={f.id}
                onClick={() => onStyle({ imageFit: f.id })}
                title={f.hint}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${(style.imageFit || "contain") === f.id ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-neutral-400">{IMAGE_FITS.find((f) => f.id === (style.imageFit || "contain"))?.hint}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Chips
          options={[
            { id: "all", label: "All" },
            { id: "image", label: "Pictures" },
            { id: "gif", label: "GIFs" },
            { id: "video", label: "Videos" },
          ]}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        {view === "app" && sources.length > 1 && <Chips options={[{ id: "all", label: "All sources" }, ...sources]} value={sourceFilter} onChange={setSourceFilter} />}
      </div>

      {mode === "backgrounds" && view === "library" && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Colors &amp; gradients</h3>
          <div className="flex flex-wrap gap-2.5">
            {BACKGROUND_PRESETS.map((p) => (
              <button key={p.name} onClick={() => onBackground(p.bg)} title={p.name} aria-label={p.name} className="group w-20 text-left">
                <span className={`relative block aspect-[3/2] overflow-hidden rounded-lg border-2 transition ${same(background, p.bg) ? "border-orange-500" : "border-transparent group-hover:border-neutral-300"}`} style={{ background: p.bg.value }}>
                  {same(background, p.bg) && (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-600 text-[#ffffff]">
                      <Check size={10} />
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-neutral-500">{p.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">{view === "app" ? "Made in this app" : mode === "backgrounds" ? "Your backgrounds" : "Your media"}</h3>
        {cards === null && <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>}
        {cards && shown.length === 0 && (
          <Empty icon={<Film size={22} />} title={view === "app" ? "Nothing found" : "Nothing here yet"}>
            {view === "app" ? (
              <>
                Only designs and animations tagged for presentation show up here. Make them in the <a href="/presentation" className="font-semibold text-orange-600 underline">Presentation studio</a>, or tag any design with the TV button in the design studio.
              </>
            ) : (
              "Upload pictures, GIFs or videos."
            )}
          </Empty>
        )}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
          {shown.map((c) => {
            const on = mode === "backgrounds" ? same(background, asBackground(c)) : activeId === c.id;
            return (
              <div key={c.id} className="group relative">
                <button
                  onClick={() => choose(c)}
                  onDoubleClick={() => mode === "media" && onLive(asSlide(c))}
                  className={`relative block aspect-video w-full overflow-hidden rounded-xl border-2 bg-neutral-100 transition ${on ? "border-orange-500" : "border-transparent group-hover:border-neutral-300"}`}
                >
                  <Thumb card={c} />
                  {logoKind !== "logo" && logoUrl === c.url && (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffffff]">Logo screen</span>
                  )}
                  {(c.type !== "image" || c.badge) && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffffff]">{c.badge ?? c.type}</span>
                  )}
                </button>
                <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
                  {mode === "media" && (
                    <button
                      onClick={() => onAdd({ type: c.type === "video" ? "media" : "image", title: c.title, subtitle: c.type === "video" ? "Video" : c.type === "gif" ? "GIF" : "Image", slides: [asSlide(c)] })}
                      aria-label="Add to schedule"
                      title="Add to schedule"
                      className="rounded-lg bg-black/60 p-1.5 text-[#ffffff] hover:bg-orange-600"
                    >
                      <CalendarPlus size={13} />
                    </button>
                  )}
                    <button onClick={() => onLogo(c.url, c.type === "video" ? "video" : "image")} aria-label="Use as logo screen" title="Use as the Logo screen" className="rounded-lg bg-black/60 p-1.5 text-[#ffffff] hover:bg-orange-600">
                      <Stamp size={13} />
                    </button>
                  {c.deletable && (
                    <button onClick={() => remove(c.deletable!)} aria-label="Delete" className="rounded-lg bg-black/60 p-1.5 text-[#ffffff] hover:bg-red-600">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <span className="mt-1 block truncate text-xs text-neutral-500">{c.title}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
