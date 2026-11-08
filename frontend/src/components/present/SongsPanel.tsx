"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, CalendarPlus, FileUp, Loader2, Music2, Languages, Parentheses, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { EFFECT_COLORS, EFFECT_SPEEDS, TEXT_EFFECTS, deleteSong, importSongs, listSongs, applyTranslationLookToAll, DEFAULT_TRANSLATION_LOOK, isTranslationLine, saveSong, songSlides, titleCase, toggleTranslationLines, translateLyrics, type TranslationLook, type EffectSpeed, type ScheduleItemInput, type Slide, type Song, type SongImportResult, type TextEffect } from "@/lib/present";
import { FxText, SongText } from "./FxText";
import { SongFinder } from "./SongFinder";
import { btnGhost, btnPrimary, Empty, Field, inputCls, Modal } from "./ui";

interface Props {
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onAdd: (item: ScheduleItemInput) => void;
  // What's on the live screen, so changing a slide's effect updates it there at once.
  liveSlide?: Slide | null;
  // The Hymns tab is this same panel showing the hymn book (numbered, searchable by number).
  category?: "song" | "hymn";
}

// Effects chosen for a song: one for the whole song, plus per-slide overrides (null = deliberately none).
type SongFx = { all: TextEffect | null; slides: Record<number, TextEffect | null> };
const NO_FX: SongFx = { all: null, slides: {} };
const fxKey = (id: string) => `present-song-fx:${id}`;
const sameSong = (a: Slide, b: Slide) => a.kind === "song" && b.kind === "song" && a.title === b.title && a.text === b.text && a.label === b.label;

type Draft = { title: string; author: string; lyrics: string; number: string; translationLook?: TranslationLook };
const BLANK: Draft = { title: "", author: "", lyrics: "", number: "" };
const TR_COLORS = ["#fde68a", "#93c5fd", "#86efac", "#fca5a5", "#d4d4d4"];

export function SongsPanel({ onStage, onLive, onAdd, liveSlide, category = "song" }: Props) {
  const hymns = category === "hymn";
  const noun = hymns ? "hymn" : "song";
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState("");
  const [slideIdx, setSlideIdx] = useState(-1);
  const [editing, setEditing] = useState<{ id?: string; draft: Draft; tab?: "lyrics" | "prefs" } | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [finding, setFinding] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<SongImportResult | null>(null);
  const [importDraft, setImportDraft] = useState({ title: "", author: "" });
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lyricsBox = useRef<HTMLTextAreaElement>(null);
  const [lookMsg, setLookMsg] = useState("");
  // AI "translate foreign words": the result waits here for review and only replaces the lyrics when applied.
  const [tr, setTr] = useState<{ busy: boolean; error: string; proposal: string; added: number } | null>(null);

  const refresh = useCallback(() => listSongs(q, category).then(setSongs).catch((e) => (setSongs([]), setError(e.message))), [q, category]);
  useEffect(() => {
    const t = setTimeout(refresh, 200);
    return () => clearTimeout(t);
  }, [refresh]);

  const active = songs?.find((s) => s._id === activeId) ?? null;
  const [fx, setFx] = useState<SongFx>(NO_FX);
  const [scope, setScope] = useState<"slide" | "all">("all");
  // Each song remembers its effects on this device.
  useEffect(() => {
    let saved: SongFx = NO_FX;
    try {
      const raw = activeId && localStorage.getItem(fxKey(activeId));
      if (raw) saved = { ...NO_FX, ...JSON.parse(raw) };
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable on the client
    setFx(saved);
  }, [activeId]);
  const withFx = useCallback((base: Slide[], f: SongFx) => base.map((sl, i) => (sl.kind === "song" ? { ...sl, effect: (i in f.slides ? f.slides[i] : f.all) ?? undefined } : sl)), []);
  const baseSlides = useMemo(() => (active ? songSlides(active) : []), [active]);
  const slides = useMemo(() => withFx(baseSlides, fx), [baseSlides, fx, withFx]);
  const current = slideIdx >= 0 ? slides[slideIdx] : null;
  const currentFx = current?.kind === "song" ? (current.effect ?? null) : null;

  // Pick (or change) an effect for this slide or the whole song. Whatever is staged or live updates right away.
  function setEffect(next: TextEffect | null) {
    if (!activeId) return;
    const target: "slide" | "all" = scope === "slide" && slideIdx >= 0 ? "slide" : "all";
    const f: SongFx = target === "all" ? { all: next, slides: {} } : { ...fx, slides: { ...fx.slides, [slideIdx]: next } };
    setFx(f);
    try {
      localStorage.setItem(fxKey(activeId), JSON.stringify(f));
    } catch {}
    const updated = withFx(baseSlides, f);
    if (slideIdx >= 0 && updated[slideIdx]) onStage(updated[slideIdx]);
    const onAir = liveSlide ? updated.find((u) => sameSong(u, liveSlide)) : undefined;
    if (onAir) onLive(onAir);
  }
  const tweak = (patch: Partial<TextEffect>) => currentFx && setEffect({ ...currentFx, ...patch });

  function pick(i: number) {
    setSlideIdx(i);
    if (slides[i]) onStage(slides[i]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? Math.min(slides.length - 1, slideIdx + 1) : Math.max(0, slideIdx - 1);
    pick(next);
  }

  async function translate() {
    if (!editing || tr?.busy) return;
    setTr({ busy: true, error: "", proposal: "", added: 0 });
    try {
      const r = await translateLyrics(editing.draft.lyrics);
      setTr({ busy: false, error: "", proposal: r.lyrics, added: r.added });
    } catch (e) {
      setTr({ busy: false, error: e instanceof Error ? e.message : "Couldn't translate", proposal: "", added: 0 });
    }
  }

  // Wraps the lines the cursor/selection touches in ( ) - or takes the brackets off if they are all translations already.
  function toggleTranslation() {
    const box = lyricsBox.current;
    if (!editing || !box) return;
    const text = editing.draft.lyrics;
    const start = text.lastIndexOf("\n", box.selectionStart - 1) + 1;
    let end = text.indexOf("\n", box.selectionEnd);
    if (end < 0) end = text.length;
    const next = toggleTranslationLines(text.slice(start, end).split("\n")).join("\n");
    setEditing({ ...editing, draft: { ...editing.draft, lyrics: text.slice(0, start) + next + text.slice(end) } });
    requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(start, start + next.length);
    });
  }
  const look: TranslationLook = { ...DEFAULT_TRANSLATION_LOOK, ...editing?.draft.translationLook };
  const setLook = (patch: Partial<TranslationLook>) => editing && setEditing({ ...editing, draft: { ...editing.draft, translationLook: { ...look, ...patch } } });
  async function applyLookToAll() {
    if (!confirm("Use this translation look for every song and hymn?")) return;
    try {
      const r = await applyTranslationLookToAll(look);
      setLookMsg(`Applied to ${r.updated} song${r.updated === 1 ? "" : "s"}.`);
      await refresh();
    } catch (e) {
      setLookMsg(e instanceof Error ? e.message : "Couldn't apply it");
    }
  }

  async function save() {
    if (!editing) return;
    try {
      const song = await saveSong({ ...editing.draft, title: titleCase(editing.draft.title), category }, editing.id);
      setEditing(null);
      await refresh();
      setActiveId(song._id);
      setSlideIdx(-1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  function chooseImportFile(file: File | undefined) {
    if (!file) return;
    setImportFile(file);
    setImportResult(null);
    // Suggest the file name as the title until the user types their own.
    setImportDraft((d) => (d.title ? d : { ...d, title: file.name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim() }));
  }

  async function runImport() {
    if (!importFile || !importDraft.title.trim()) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const r = await importSongs(importFile, importDraft.title.trim(), importDraft.author.trim());
      setImportResult(r);
      await refresh();
      if (r.created[0]) {
        setActiveId(r.created[0]._id);
        setSlideIdx(-1);
        setImporting(false);
      }
    } catch (e) {
      setImportResult({ created: [], skipped: [], failed: [{ name: "Import", error: e instanceof Error ? e.message : "Import failed" }] });
    } finally {
      setImportBusy(false);
    }
  }

  async function remove(s: Song) {
    if (!confirm(`Delete “${s.title}”?`)) return;
    await deleteSong(s._id);
    if (activeId === s._id) setActiveId("");
    refresh();
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 md:grid-cols-[17rem_1fr]">
      <div className="flex min-h-0 flex-col gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={hymns ? "Search number, title or lyrics" : "Search title or lyrics"} className={`${inputCls} pl-9`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setEditing({ draft: BLANK })} className={btnGhost}>
            <Plus size={16} /> New {noun}
          </button>
          {!hymns && (
          <button
            onClick={() => {
              setImportResult(null);
              setImportDraft({ title: "", author: "" });
              setImportFile(null);
              setImporting(true);
            }}
            className={btnGhost}
          >
            <FileUp size={16} /> Import
          </button>
          )}
        </div>
        {!hymns && (
        <button
          onClick={() => {
            setFinding(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
        >
          <Sparkles size={16} /> Find lyrics
        </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-white p-1.5">
          {songs === null && <p className="p-4 text-center text-sm text-neutral-400">Loading…</p>}
          {songs?.length === 0 && <p className="p-4 text-center text-sm text-neutral-400">{q ? `No ${noun}s match.` : `No ${noun}s yet.`}</p>}
          {songs?.map((s) => (
            <button
              key={s._id}
              onClick={() => {
                setActiveId(s._id);
                setSlideIdx(-1);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left transition ${s._id === activeId ? "bg-orange-50" : "hover:bg-neutral-50"}`}
            >
              <span className={`block truncate text-sm font-medium ${s._id === activeId ? "text-orange-700" : "text-neutral-900"}`}>
                {hymns && s.number && <span className="mr-2 inline-block min-w-[1.75rem] text-xs font-bold tabular-nums text-orange-600">{s.number}</span>}
                {titleCase(s.title)}
              </span>
              {s.author && <span className="block truncate text-xs text-neutral-400">{s.author}</span>}
            </button>
          ))}
        </div>
      </div>

      <div tabIndex={0} onKeyDown={onKeyDown} className="min-h-0 overflow-y-auto rounded-xl bg-white p-4 outline-none">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!active ? (
          <Empty icon={<Music2 size={22} />} title={`Pick a ${noun}`}>
            Choose a {noun} on the left to see its slides, or add a new one. Separate slides with a blank line.
          </Empty>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-neutral-900">{hymns && active.number ? `${active.number}. ` : ""}{titleCase(active.title)}</h3>
                <p className="text-xs text-neutral-400">{[active.author, `${slides.length} slides`].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => onAdd({ type: "song", title: titleCase(active.title), subtitle: active.author, slides })} className={btnGhost}>
                  <CalendarPlus size={15} /> Add to schedule
                </button>
                <button onClick={() => setEditing({ id: active._id, draft: { title: titleCase(active.title), author: active.author, lyrics: active.lyrics, number: active.number ?? "", translationLook: active.translationLook } })} className={btnGhost}>
                  <Pencil size={15} /> Edit
                </button>
                <button onClick={() => remove(active)} aria-label={`Delete ${noun}`} className={`${btnGhost} text-red-600`}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div className="mb-4 space-y-2.5 rounded-xl bg-neutral-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Text effect</span>
                <div className="flex rounded-lg bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Apply effect to">
                  {(
                    [
                      ["slide", slideIdx >= 0 ? `Slide ${slideIdx + 1}` : "This slide"],
                      ["all", "Whole song"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} onClick={() => setScope(k)} disabled={k === "slide" && slideIdx < 0} className={`rounded-md px-2.5 py-1 transition disabled:opacity-40 ${scope === k ? "bg-orange-600 text-[#ffffff]" : "text-neutral-500 hover:text-neutral-800"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setEffect(null)} className={`w-[4.5rem] rounded-lg border bg-white px-1 py-2 text-center text-[11px] font-semibold ${!currentFx ? "border-orange-500 text-orange-700" : "border-neutral-200 text-neutral-500 hover:border-neutral-300"}`}>
                  <span className="block text-lg leading-none text-neutral-800">Aa</span>
                  None
                </button>
                {TEXT_EFFECTS.map((e) => (
                  <button key={e.id} onClick={() => setEffect({ id: e.id, speed: currentFx?.speed, color: currentFx?.color })} title={e.hint} className={`w-[4.5rem] overflow-hidden rounded-lg border bg-neutral-900 px-1 py-2 text-center text-[11px] font-semibold ${currentFx?.id === e.id ? "border-orange-500 text-orange-300" : "border-neutral-700 text-neutral-300 hover:border-neutral-500"}`}>
                    <FxText text="Aa" effect={{ id: e.id, color: currentFx?.color ?? "#fde68a" }} base="#ffffff" className="mb-0.5 text-lg font-bold leading-none text-white" />
                    {e.label}
                  </button>
                ))}
              </div>
              {currentFx && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-neutral-500">Speed</span>
                    <div className="flex rounded-lg bg-white p-0.5 text-xs font-semibold">
                      {EFFECT_SPEEDS.map((sp) => (
                        <button key={sp.id} onClick={() => tweak({ speed: sp.id as EffectSpeed })} className={`rounded-md px-2.5 py-1 ${(currentFx.speed ?? "normal") === sp.id ? "bg-orange-600 text-[#ffffff]" : "text-neutral-500 hover:text-neutral-800"}`}>
                          {sp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-neutral-500">Colour</span>
                    {EFFECT_COLORS.map((c) => (
                      <button key={c} onClick={() => tweak({ color: c })} aria-label={`Effect colour ${c}`} aria-pressed={(currentFx.color ?? EFFECT_COLORS[0]) === c} className={`h-6 w-6 rounded-full border-2 ${(currentFx.color ?? EFFECT_COLORS[0]) === c ? "scale-110 border-neutral-900" : "border-white ring-1 ring-neutral-300"}`} style={{ background: c }} />
                    ))}
                  </div>
                </div>
              )}
              {slideIdx < 0 && <p className="text-xs text-neutral-400">Pick a slide below to preview an effect, or set one for the whole song.</p>}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  onDoubleClick={() => onLive(s)}
                  className={`rounded-xl border p-3.5 text-left transition ${i === slideIdx ? "border-orange-300 bg-orange-50 ring-2 ring-orange-500/10" : "border-neutral-100 bg-neutral-50/60 hover:border-neutral-200"}`}
                >
                  {s.kind === "song" && (
                    <>
                      <span className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-orange-600">
                        {s.label || `Slide ${i + 1}`}
                        {s.effect && <span className="rounded-full bg-[#171717] px-1.5 py-0.5 text-[9px] text-[#ffffff]">{TEXT_EFFECTS.find((e) => e.id === s.effect!.id)?.label}</span>}
                      </span>
                      <span className="line-clamp-6 whitespace-pre-line text-base font-medium leading-snug text-neutral-800">{s.text.split("\n").map((l, k) => (isTranslationLine(l) ? <span key={k} className="block text-xs italic text-neutral-400">{l.trim()}</span> : <span key={k} className="block">{l}</span>))}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-neutral-400">Click to preview · Double-click or Enter to go live · Arrow keys to step through</p>
          </>
        )}
      </div>

      {finding && (
        <SongFinder
          onClose={() => setFinding(false)}
          onCreated={async (song) => {
            setFinding(false);
            await refresh();
            setActiveId(song._id);
            setSlideIdx(-1);
          }}
        />
      )}

      {importing && (
        <Modal title="Import song" guard onClose={() => setImporting(false)}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title">
                <input autoFocus value={importDraft.title} onChange={(e) => setImportDraft({ ...importDraft, title: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Author">
                <input value={importDraft.author} onChange={(e) => setImportDraft({ ...importDraft, author: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <input ref={fileInput} type="file" accept=".txt,.text,.lyrics,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => chooseImportFile(e.target.files?.[0])} />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={importBusy}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 px-4 py-8 text-sm text-neutral-500 transition hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-700 disabled:opacity-60"
            >
              <FileUp size={22} />
              <span className="font-medium">{importFile ? importFile.name : "Choose a .txt or Word (.docx) file"}</span>
              <span className="text-xs text-neutral-400">A blank line starts a new slide · “Verse 1”, “Chorus” lines label the slide after them</span>
            </button>
            {importResult && (
              <div className="space-y-1.5 text-sm">
                {importResult.skipped.map((s) => (
                  <p key={s.name} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                    {s.reason}
                  </p>
                ))}
                {importResult.failed.map((f) => (
                  <p key={f.name} className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
                    {f.error}
                  </p>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setImporting(false)} className={btnGhost}>
                Cancel
              </button>
              <button onClick={runImport} disabled={importBusy || !importFile || !importDraft.title.trim()} className={btnPrimary}>
                {importBusy && <Loader2 size={16} className="animate-spin" />}
                {importBusy ? "Importing…" : "Import song"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? `Edit ${noun}` : `New ${noun}`} guard onClose={() => (setEditing(null), setTr(null))} wide>
          <div className="space-y-4">
            <div className={`grid gap-4 ${hymns ? "sm:grid-cols-[6rem_1fr_1fr]" : "sm:grid-cols-2"}`}>
              {hymns && (
                <Field label="No.">
                  <input value={editing.draft.number} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, number: e.target.value } })} className={inputCls} />
                </Field>
              )}
              <Field label="Title">
                <input autoFocus value={editing.draft.title} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, title: e.target.value } })} className={inputCls} />
              </Field>
              <Field label="Author">
                <input value={editing.draft.author} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, author: e.target.value } })} className={inputCls} />
              </Field>
            </div>
            <div className="flex gap-1 self-start rounded-xl bg-neutral-100 p-1" role="tablist" aria-label="Song editor">
              {(
                [
                  ["lyrics", "Lyrics"],
                  ["prefs", "Preferences"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={(editing.tab ?? "lyrics") === id} data-no-guard onClick={() => setEditing({ ...editing, tab: id })} className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${(editing.tab ?? "lyrics") === id ? "bg-white text-orange-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className={(editing.tab ?? "lyrics") === "lyrics" ? "" : "hidden"}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={toggleTranslation} title="Select lines (or put the cursor on one), then click: wraps them in ( ) so they show as a smaller translation" className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700">
                  <Parentheses size={14} /> Mark as translation
                </button>
                <button type="button" onClick={translate} disabled={tr?.busy || editing.draft.lyrics.trim().length < 3} className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50">
                  {tr?.busy ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                  {tr?.busy ? "Translating…" : "AI: translate foreign words"}
                </button>
                <span className="text-xs text-neutral-400">A line in (brackets) is a translation. Change how it looks in Preferences.</span>
              </div>
              {tr?.error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{tr.error}</p>}
              {tr && !tr.busy && !tr.error && (
                <div className="mb-2 space-y-2 rounded-xl border border-orange-200 bg-orange-50/50 p-3" data-no-guard>
                  {tr.added === 0 ? (
                    <p className="text-xs text-neutral-600">No foreign words found, so nothing was changed.</p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-neutral-700">Review: {tr.added} line{tr.added === 1 ? "" : "s"} translated. Edit anything below, then apply.</p>
                      <textarea value={tr.proposal} onChange={(e) => setTr({ ...tr, proposal: e.target.value })} rows={10} className={`${inputCls} font-mono leading-relaxed`} />
                    </>
                  )}
                  <div className="flex justify-end gap-2">
                    <button type="button" data-no-guard onClick={() => setTr(null)} className={btnGhost}>{tr.added === 0 ? "OK" : "Discard"}</button>
                    {tr.added > 0 && (
                      <button type="button" data-no-guard onClick={() => { setEditing({ ...editing, draft: { ...editing.draft, lyrics: tr.proposal } }); setTr(null); }} className={btnPrimary}>
                        Use this in the lyrics
                      </button>
                    )}
                  </div>
                </div>
              )}
              <Field label="Lyrics" hint="A blank line starts a new slide. Put [Verse 1], [Chorus], [Bridge] on its own line to label the slide.">
              <textarea
                ref={lyricsBox}
                value={editing.draft.lyrics}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, lyrics: e.target.value } })}
                rows={14}
                placeholder={"[Verse 1]\nAmazing grace, how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\n…"}
                className={`${inputCls} font-mono leading-relaxed`}
              />
              </Field>
            </div>
            <div className={`rounded-xl border border-neutral-200 bg-neutral-50 p-3 ${(editing.tab ?? "lyrics") === "prefs" ? "" : "hidden"}`} data-no-guard>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Translation look</div>
              <p className="mb-3 text-xs text-neutral-400">How the (bracketed) translation lines appear on screen under each lyric line.</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
                <div className="space-y-3 text-sm">
                  <label className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs font-semibold text-neutral-600">Size</span>
                    <input type="range" min={30} max={100} step={5} value={Math.round(look.scale * 100)} onChange={(e) => setLook({ scale: Number(e.target.value) / 100 })} className="min-w-0 flex-1 accent-orange-600" />
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-neutral-500">{Math.round(look.scale * 100)}% of lyrics</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-14 shrink-0 text-xs font-semibold text-neutral-600">Colour</span>
                    <button type="button" data-no-guard onClick={() => setLook({ color: "" })} aria-pressed={!look.color} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${!look.color ? "bg-orange-600 text-[#ffffff]" : "bg-white text-neutral-600 ring-1 ring-neutral-200"}`}>
                      Same as lyrics
                    </button>
                    {TR_COLORS.map((c) => (
                      <button key={c} type="button" data-no-guard onClick={() => setLook({ color: c })} aria-label={`Translation colour ${c}`} aria-pressed={look.color === c} className={`h-6 w-6 rounded-full border-2 ${look.color === c ? "scale-110 border-neutral-900" : "border-white ring-1 ring-neutral-300"}`} style={{ background: c }} />
                    ))}
                    <input type="color" value={look.color || "#ffffff"} onChange={(e) => setLook({ color: e.target.value })} aria-label="Custom translation colour" className="h-7 w-9 cursor-pointer rounded border border-neutral-200 bg-white p-0.5" />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                    <input type="checkbox" checked={look.italic} onChange={(e) => setLook({ italic: e.target.checked })} className="accent-orange-600" /> Italic
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" data-no-guard onClick={() => setLook(DEFAULT_TRANSLATION_LOOK)} className={`${btnGhost} !py-1 text-xs`}>Reset</button>
                    <button type="button" data-no-guard onClick={applyLookToAll} className={`${btnGhost} !py-1 text-xs`}>Use for all songs</button>
                    {lookMsg && <span className="text-xs text-neutral-500">{lookMsg}</span>}
                  </div>
                </div>
                <div className="grid place-items-center rounded-lg bg-neutral-900 p-3 text-center text-white" aria-label="Preview">
                  <SongText text={"Olorun mi, mo yin O\n(My God, I praise You)"} look={look} className="text-lg font-semibold leading-snug" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => (setEditing(null), setTr(null))} className={btnGhost}>
                Cancel
              </button>
              <button onClick={save} disabled={!editing.draft.title.trim()} className={btnPrimary}>
                Save {noun}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// The Songs tab: opens on the church's own songs (Custom); the hymn book is the other tab.
export function SongsTab(props: Omit<Props, "category">) {
  const [sub, setSub] = useState<"hymn" | "song">("song");
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 gap-1 self-start rounded-xl bg-neutral-100 p-1" role="tablist" aria-label="Songs">
        {(
          [
            ["hymn", "Hymns", BookMarked],
            ["song", "Custom", Music2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${sub === id ? "bg-white text-orange-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <SongsPanel key={sub} category={sub} {...props} />
      </div>
    </div>
  );
}
