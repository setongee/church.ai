"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, BookOpen, CalendarPlus, Columns2, Highlighter, Library, Loader2, Search, Sparkles, X } from "lucide-react";
import { HIGHLIGHT_COLORS, addScriptureBox, listScriptureBox, bibleBooks, bibleChapter, bibleFind, bibleSmart, type BibleMeta, type BookInfo, type Highlight, type Passage, type ScheduleItemInput, type ScriptureBatch, type ScripturePart, type Slide, type SmartResult } from "@/lib/present";
import { btnPrimary, Empty, inputCls } from "./ui";
import { HighlightColors, HighlightEditor } from "./HighlightEditor";
import { ScriptureBoxModal } from "./ScriptureBoxModal";
import { HeardButton } from "./HeardButton";
import { getScriptureMemory, rememberScripture } from "@/lib/scriptureSession";

interface Props {
  bibles: BibleMeta[];
  versionId: string;
  setVersionId: (id: string) => void;
  onManage?: () => void; // only admins can add or remove Bibles
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onAdd: (item: ScheduleItemInput) => void;
  // The verse(s) on the live screen right now, if scripture is live (e.g. "John 3:16").
  liveReference?: string;
  // The verses of a multi-verse selection (null when one verse or none is picked), for the Batch card.
  onBatch: (b: ScriptureBatch | null) => void;
  // The key-points split (Split tab) and this panel's two-scriptures split replace each other: using one switches the other off.
  pointsSplitOn?: boolean;
  onPointsSplitOff?: () => void;
}

interface Range {
  from: number;
  to: number;
}

const NO_HIGHLIGHTS: Highlight[] = [];

type SmartFound = Extract<SmartResult, { type: "smart" }>;

// A reference for what's on screen: the slide's own, or the left side of a split.
const refOf = (s: Slide) => (s.kind === "scripture" ? s.reference : s.kind === "scripture2" ? s.left.reference : "");

// One side's place in the Bible: its books, current chapter and highlighted verses. The panel has
// one for the left scripture and one for the right when split.
function useSide(versionId: string, which: "a" | "b", onLoadError?: () => void) {
  const init = getScriptureMemory()[which]; // where this side was last (Genesis 1:1 the first time)
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [book, setBook] = useState(init.book);
  const [chapter, setChapter] = useState(init.chapter);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [passageVersion, setPassageVersion] = useState("");
  const [sel, setSel] = useState<Range | null>(init.sel);
  const [error, setError] = useState("");
  const pendingSel = useRef<Range | null>(null);
  // Starting on a remembered chapter keeps its remembered verse when that chapter first loads.
  const chapterKey = useRef(init.sel ? `${init.book}:${init.chapter}` : "");
  useEffect(() => {
    rememberScripture({ [which]: { book, chapter, sel } });
  }, [which, book, chapter, sel]);
  const errRef = useRef(onLoadError);
  useEffect(() => {
    errRef.current = onLoadError;
  });

  useEffect(() => {
    if (!versionId) return;
    bibleBooks(versionId).then(setBooks).catch(() => setBooks([]));
  }, [versionId]);

  useEffect(() => {
    if (!versionId) return;
    let stale = false;
    bibleChapter(versionId, book, chapter)
      .then((p) => {
        if (stale) return;
        // Same chapter in another version keeps the highlighted verses; a new chapter clears them.
        const key = `${book}:${chapter}`;
        const keep = chapterKey.current === key;
        chapterKey.current = key;
        const pend = pendingSel.current;
        pendingSel.current = null;
        setPassage(p);
        setPassageVersion(versionId);
        setSel((prev) => pend ?? (keep ? prev : null));
        setError("");
      })
      .catch((e) => {
        if (stale) return;
        errRef.current?.();
        setPassage(null);
        setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [versionId, book, chapter]);

  // Jump to a chapter (loading it if needed) and highlight some verses.
  const goTo = useCallback(
    (b: number, c: number, range: Range | null) => {
      if (b === book && c === chapter) setSel(range);
      else {
        pendingSel.current = range;
        setBook(b);
        setChapter(c);
      }
    },
    [book, chapter],
  );
  const pickBook = useCallback((n: number) => {
    setBook(n);
    setChapter(1);
  }, []);

  return { books, book, chapter, setChapter, passage, passageVersion, sel, setSel, error, goTo, pickBook };
}
type Side = ReturnType<typeof useSide>;

// Scrolls a list so `el` is visible, centring it when it was out of view (and leaving the list
// alone when it's already showing, so stepping through verses doesn't jump about).
function reveal(box: HTMLElement | null, el: Element | null) {
  if (!box || !el) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top >= b.top && r.bottom <= b.bottom) return;
  box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
}

// [16, 18, 19, 20] -> "16, 18-20"
function verseLabel(from: number, to: number) {
  return `${from}${to > from ? `-${to}` : ""}`;
}

// The text + reference for a side's highlighted verses (null until its chapter has loaded).
function partOf(side: Pick<Side, "passage" | "passageVersion">, range: Range | null, bibles: BibleMeta[]): ScripturePart | null {
  const meta = bibles.find((b) => b.id === side.passageVersion);
  if (!range || !side.passage || !meta) return null;
  const verses = side.passage.verses.filter((v) => v.n >= range.from && v.n <= range.to);
  if (!verses.length) return null;
  return { reference: `${side.passage.bookName} ${side.passage.chapter}:${verseLabel(range.from, range.to)}`, version: meta.abbr, text: verses.map((v) => v.text).join(" ") };
}

export function ScripturePanel({ bibles, versionId, setVersionId, onManage, onStage, onLive, onAdd, liveReference, onBatch, pointsSplitOn, onPointsSplitOff }: Props) {
  // Split view: a second scripture on the right. "linked" = the same verse(s) in another version;
  // otherwise the right side has its own book/chapter/verses to browse.
  const [memory] = useState(getScriptureMemory); // where the panel was when it was last open
  const [split, setSplit] = useState(memory.split && !pointsSplitOn);
  const [versionB, setVersionB] = useState(memory.versionB);
  const [linked, setLinked] = useState(memory.linked);
  const [focus, setFocus] = useState<"a" | "b">(memory.focus);
  const [q, setQ] = useState(memory.q);
  const [results, setResults] = useState<SmartFound | null>(memory.results);
  const [finding, setFinding] = useState(false);
  // Assisted = AI understands quotes/topics/messy references. Custom = plain reference or word search.
  const [mode, setMode] = useState<"assisted" | "custom">("assisted");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      if (localStorage.getItem("present-scripture-search") === "custom") setMode("custom");
    } catch {}
  }, []);
  function chooseMode(m: "assisted" | "custom") {
    setMode(m);
    setResults(null);
    try {
      localStorage.setItem("present-scripture-search", m);
    } catch {}
  }
  const [error, setError] = useState("");
  const [errorB, setErrorB] = useState("");
  // Enter twice quickly on a plain reference ("ps 2:8") puts it live without waiting for the second step.
  const lastEnter = useRef(0);
  const doubleEnter = useRef(false);

  // Version to put live as soon as the chapter has loaded in it (set by double-clicking a version).
  const pendingLive = useRef("");
  const liveWhenReady = useRef(false);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verseBox = useRef<HTMLDivElement>(null);
  const bookBox = useRef<HTMLDivElement>(null);
  const chapterBox = useRef<HTMLDivElement>(null);
  // Read at the moment they're needed, without re-running the staging effect when they change.
  const liveRef = useRef({ liveReference, onLive });
  useEffect(() => {
    liveRef.current = { liveReference, onLive };
  });

  const a = useSide(versionId, "a", () => {
    pendingLive.current = "";
  });
  const b = useSide(split ? versionB : "", "b");

  const independent = split && !linked;
  const side = independent && focus === "b" ? b : a; // the side the browser below is showing
  const sideVersionId = side === b ? versionB : versionId;
  const sideVersion = bibles.find((x) => x.id === sideVersionId);

  // ---- the two scriptures -----------------------------------------------------------------------
  // Depend on the values, not the side objects (those are new every render and would loop the staging effect).
  const { passage: aPassage, passageVersion: aVersion, sel: aSel } = a;
  const { passage: bPassage, passageVersion: bVersion, sel: bSel } = b;
  const partA = useMemo(() => partOf({ passage: aPassage, passageVersion: aVersion }, aSel, bibles), [aPassage, aVersion, aSel, bibles]);
  // Linked: the same verses as the left, fetched in the right version.
  const keyB = `${versionB}|${a.book}:${a.chapter}:${a.sel?.from}-${a.sel?.to}`;
  const [linkedB, setLinkedB] = useState<{ key: string; part: ScripturePart } | null>(null);
  useEffect(() => {
    if (!split || !linked || !versionB || !a.sel) return;
    const sel = a.sel;
    const meta = bibles.find((x) => x.id === versionB);
    let stale = false;
    const t = setTimeout(async () => {
      try {
        if (!meta) return;
        const c = await bibleChapter(versionB, a.book, a.chapter);
        if (stale) return;
        const vs = c.verses.filter((v) => v.n >= sel.from && v.n <= sel.to);
        if (!vs.length) return setErrorB("That verse isn't in this version");
        setLinkedB({ key: keyB, part: { reference: `${c.bookName} ${c.chapter}:${verseLabel(sel.from, sel.to)}`, version: meta.abbr, text: vs.map((v) => v.text).join(" ") } });
        setErrorB("");
      } catch (e) {
        if (!stale) setErrorB(e instanceof Error ? e.message : "Couldn't load that");
      }
    }, 120);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [split, linked, versionB, a.sel, a.book, a.chapter, bibles, keyB]);

  const partB = useMemo(() => {
    if (!split) return null;
    if (linked) return linkedB && linkedB.key === keyB ? linkedB.part : null;
    return partOf({ passage: bPassage, passageVersion: bVersion }, bSel, bibles);
  }, [split, linked, linkedB, keyB, bPassage, bVersion, bSel, bibles]);

  // Highlights belong to one exact passage text: pick another verse (or version) and they start afresh.
  const [hlOpen, setHlOpen] = useState(false);
  const [hlColor, setHlColor] = useState(memory.hlColor || HIGHLIGHT_COLORS[0]);
  const [hlA, setHlA] = useState<{ key: string; list: Highlight[] }>(memory.hlA);
  const [hlB, setHlB] = useState<{ key: string; list: Highlight[] }>(memory.hlB);
  // Remember it all, so switching tabs or pages and coming back finds it as it was.
  useEffect(() => {
    rememberScripture({ split, versionB, linked, focus, q, results, hlA, hlB, hlColor });
  }, [split, versionB, linked, focus, q, results, hlA, hlB, hlColor]);
  const keyOf = (p: ScripturePart | null) => (p ? `${p.reference}|${p.version}|${p.text}` : "");
  const listA = hlA.key === keyOf(partA) ? hlA.list : NO_HIGHLIGHTS; // stable, or the staging effect would loop
  const listB = hlB.key === keyOf(partB) ? hlB.list : NO_HIGHLIGHTS;
  const partAh = useMemo<ScripturePart | null>(() => (partA ? { ...partA, highlights: listA.length ? listA : undefined } : null), [partA, listA]);
  const partBh = useMemo<ScripturePart | null>(() => (partB ? { ...partB, highlights: listB.length ? listB : undefined } : null), [partB, listB]);

  // What gets staged: the left scripture, plus the right one once it's ready.
  const slide: Slide | null = useMemo(() => {
    if (!partAh) return null;
    return split && partBh ? { kind: "scripture2", left: partAh, right: partBh } : { kind: "scripture", ...partAh };
  }, [partAh, partBh, split]);

  // ---- batch: several verses selected -> a Batch card to step through them live ------------------------
  const batch = useMemo<ScriptureBatch | null>(() => {
    const meta = bibles.find((x) => x.id === aVersion);
    if (split || !aSel || aSel.to <= aSel.from || !aPassage || !meta) return null;
    const vs = aPassage.verses.filter((v) => v.n >= aSel.from && v.n <= aSel.to);
    if (vs.length < 2) return null;
    return {
      label: `${aPassage.bookName} ${aPassage.chapter}:${verseLabel(aSel.from, aSel.to)}`,
      version: meta.abbr,
      slides: vs.map((v) => ({ kind: "scripture" as const, reference: `${aPassage.bookName} ${aPassage.chapter}:${v.n}`, version: meta.abbr, text: v.text })),
    };
  }, [split, aSel, aPassage, aVersion, bibles]);
  useEffect(() => {
    onBatch(batch);
  }, [batch, onBatch]);
  useEffect(() => () => onBatch(null), [onBatch]);

  // ---- scripture box: saved scriptures ----------------------------------------------------------------------
  const [boxOpen, setBoxOpen] = useState(false);
  const [boxCount, setBoxCount] = useState(0);
  const [boxKey, setBoxKey] = useState(0);
  const [boxNote, setBoxNote] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    listScriptureBox()
      .then((l) => setBoxCount(l.length))
      .catch(() => {});
  }, [boxKey]);
  async function addToBox() {
    if (!slide) return;
    const parts = slide.kind === "scripture2" ? [slide.left, slide.right] : slide.kind === "scripture" ? [slide] : [];
    try {
      let added = 0;
      for (const p of parts) if ((await addScriptureBox({ reference: p.reference, version: p.version, text: p.text })).added) added++;
      setBoxKey((k) => k + 1);
      setBoxNote(added ? "Added to scripture box" : "Already in the scripture box");
    } catch (e) {
      setBoxNote(e instanceof Error ? e.message : "Couldn’t save it");
    }
    setTimeout(() => setBoxNote(""), 2200);
  }
  // Shift+Enter saves whatever is selected; read through a ref so the listener never goes stale.
  const addToBoxRef = useRef(addToBox);
  useEffect(() => {
    addToBoxRef.current = addToBox;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !e.shiftKey || (e.target as HTMLElement).closest("textarea")) return;
      e.preventDefault();
      void addToBoxRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // Whatever is highlighted is what's staged in Preview - except a multi-verse selection, which stages only its
  // first verse: going live shows verse one, and the Batch card steps on from there.
  const outSlide: Slide | null = batch ? batch.slides[0] : slide;
  // Coming back to the tab (or opening it fresh at Genesis 1:1) must not replace what is staged in Preview; only a
  // verse the operator picks does that.
  const arriving = useRef(Boolean(memory.a.sel));
  useEffect(() => {
    const slide = outSlide;
    if (!slide) return;
    if (arriving.current) {
      arriving.current = false;
      return;
    }
    onStage(slide);
    // A version was double-clicked: now that its text is here, swap it on the live screen too.
    if (pendingLive.current && pendingLive.current === a.passageVersion) {
      pendingLive.current = "";
      if (refOf(slide) === liveRef.current.liveReference) liveRef.current.onLive(slide);
    }
    // A verse was double-clicked: go live as soon as the slide (including a right side) is complete.
    if (liveWhenReady.current && (!split || slide.kind === "scripture2")) {
      liveWhenReady.current = false;
      liveRef.current.onLive(slide);
    }
  }, [outSlide, split, onStage, a.passageVersion]);

  function armLive() {
    liveWhenReady.current = true;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => (liveWhenReady.current = false), 4000);
  }

  // Keep the browser pointed at what the side being shown has selected. In split view the two sides
  // are usually in different books, so switching sides scrolls the book, chapter and verse lists to
  // that side's place (and arrowing through a long chapter keeps the verse in view).
  const sideKey = side === b ? "b" : "a";
  const { book: sideBook, chapter: sideChapter, sel: sideSel, passage: sidePassage } = side;
  const bookCount = side.books.length;
  useEffect(() => {
    reveal(bookBox.current, bookBox.current?.querySelector(`[data-book="${sideBook}"]`) ?? null);
  }, [sideKey, sideBook, bookCount]);
  useEffect(() => {
    reveal(chapterBox.current, chapterBox.current?.querySelector(`[data-ch="${sideChapter}"]`) ?? null);
  }, [sideKey, sideChapter, sideBook, bookCount]);
  useEffect(() => {
    if (sideSel) reveal(verseBox.current, verseBox.current?.querySelector(`[data-v="${sideSel.to}"]`) ?? null);
  }, [sideKey, sideSel, sidePassage]);

  // ---- split controls ---------------------------------------------------------------------------
  function toggleSplit() {
    if (split) {
      setSplit(false);
      setFocus("a");
      liveWhenReady.current = false;
      return;
    }
    if (!versionB || !bibles.some((x) => x.id === versionB)) setVersionB(bibles.find((x) => x.id !== versionId)?.id ?? versionId);
    setLinked(true);
    setFocus("a");
    setSplit(true);
    if (pointsSplitOn) onPointsSplitOff?.(); // the newer split wins
  }
  function setLinkedMode(on: boolean) {
    setLinked(on);
    if (on) setFocus("a");
    else {
      // Start the right side where the left is, then browse it on its own.
      b.goTo(a.book, a.chapter, a.sel);
      setFocus("b");
    }
  }

  // Double-click a version: switch to it, and if this passage is on the live screen, show it in the new version.
  function liveInVersion(id: string) {
    setVersionId(id);
    if (a.sel && a.passageVersion === id && slide && refOf(slide) === liveReference) onLive(slide);
    else pendingLive.current = id;
  }

  // ---- search / browse the side being shown ----------------------------------------------------------
  async function find(e?: React.FormEvent) {
    e?.preventDefault();
    arriving.current = false;
    if (!q.trim() || !sideVersionId || finding) return;
    setError("");
    setFinding(true);
    try {
      // Custom keeps the original behaviour: a reference opens it, anything else is a word search.
      const r =
        mode === "custom"
          ? await bibleFind(sideVersionId, q.trim()).then((f) => (f.type === "search" ? ({ type: "smart", suggestions: [], ai: true, keyword: { total: f.total, results: f.results } } as SmartResult) : f))
          : await bibleSmart(sideVersionId, q.trim());
      if (r.type === "passage") {
        // A plain reference: open it.
        const p = r.passage;
        const first = p.verses[0].n;
        const last = p.verses[p.verses.length - 1].n;
        const whole = p.verses.length > 1 && first === 1 && !q.includes(":");
        setResults(null);
        side.goTo(p.book, p.chapter, whole ? null : { from: first, to: last });
        if (doubleEnter.current && !whole) armLive();
      } else if (r.type === "smart") {
        setResults(r);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      doubleEnter.current = false;
      setFinding(false);
    }
  }

  function clickVerse(n: number, e: React.MouseEvent) {
    arriving.current = false;
    if (e.shiftKey && side.sel) side.setSel({ from: Math.min(side.sel.from, n), to: Math.max(side.sel.to, n) });
    else side.setSel({ from: n, to: n });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!side.passage || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    arriving.current = false;
    const max = side.passage.verses[side.passage.verses.length - 1].n;
    const cur = side.sel?.to ?? 0;
    const n = e.key === "ArrowDown" ? Math.min(max, cur + 1) : Math.max(1, cur - 1);
    side.setSel({ from: n, to: n });
  }

  const chapters = side.books.find((x) => x.n === side.book)?.chapters ?? 0;

  if (!bibles.length) {
    return (
      <Empty icon={<BookOpen size={22} />} title="No Bibles installed yet">
        {onManage ? (
          <>
            <p>Download a free translation like KJV, ASV, WEB or BBE, or import your own licensed XML.</p>
            <button onClick={onManage} className={`${btnPrimary} mt-3`}>
              <Library size={16} /> Get Bibles
            </button>
          </>
        ) : (
          <p>Ask an admin to add a Bible. Only admins can download or import them.</p>
        )}
      </Empty>
    );
  }

  const seg = (on: boolean) => `rounded-md px-2.5 py-1 text-xs font-semibold transition ${on ? "bg-orange-600 text-[#ffffff]" : "text-neutral-500 hover:text-neutral-800"}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
          {bibles.map((v) => (
            <button
              key={v.id}
              onClick={() => setVersionId(v.id)}
              onDoubleClick={() => liveInVersion(v.id)}
              title={`${v.name} — double-click to switch the live screen too`}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${v.id === versionId ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
            >
              {v.abbr}
            </button>
          ))}
        </div>
        {onManage && (
          <button onClick={onManage} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-orange-600">
            + Get more
          </button>
        )}
        <button
          onClick={toggleSplit}
          aria-pressed={split}
          title="Show two scriptures side by side"
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${split ? "bg-orange-600 text-[#ffffff]" : "text-neutral-500 hover:bg-neutral-100 hover:text-orange-600"}`}
        >
          <Columns2 size={14} /> Split
        </button>
        <button
          onClick={() => setBoxOpen(true)}
          title="Saved scriptures — right-click a verse or press Shift+Enter to add"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-orange-600"
        >
          <Archive size={14} /> Box
          {boxCount > 0 && <span className="rounded-full bg-orange-50 px-1.5 text-[10px] font-bold text-orange-700">{boxCount}</span>}
        </button>
        <HeardButton />
        {boxNote && <span className="text-xs font-medium text-green-700">{boxNote}</span>}
        <div className="ml-auto flex min-w-72 flex-1 items-center gap-2 sm:max-w-xl">
          <div className="flex shrink-0 gap-0.5 rounded-xl bg-neutral-100 p-1" role="tablist" aria-label="Search type">
            <button
              role="tab"
              aria-selected={mode === "assisted"}
              onClick={() => chooseMode("assisted")}
              title="AI understands quotes, topics, stories and spoken references"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mode === "assisted" ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
            >
              <Sparkles size={12} /> Assisted
            </button>
            <button
              role="tab"
              aria-selected={mode === "custom"}
              onClick={() => chooseMode("custom")}
              title="Type a reference, or words to find in the text"
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mode === "custom" ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
            >
              Custom
            </button>
          </div>
          <form onSubmit={find} className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                if (Date.now() - lastEnter.current < 700) doubleEnter.current = true;
                lastEnter.current = Date.now();
              }}
              placeholder={
                mode === "assisted"
                  ? independent && focus === "b"
                    ? "Right side — reference, quote or topic"
                    : 'Reference, quote or topic — "love is patient", "forgiveness"'
                  : independent && focus === "b"
                    ? 'Right side — "Rom 5:8", or words'
                    : 'Reference or words — "Jn 3:16", "Rom 8", "love one another"'
              }
              className={`${inputCls} pl-10`}
            />
          </form>
        </div>
      </div>

      {split && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-700">Right side</span>
            <div className="flex flex-wrap gap-1 rounded-lg bg-white/80 p-0.5">
              {bibles.map((v) => (
                <button key={v.id} onClick={() => setVersionB(v.id)} title={v.name} className={seg(v.id === versionB)}>
                  {v.abbr}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1 rounded-lg bg-white/80 p-0.5" role="group" aria-label="Right side content">
            <button onClick={() => setLinkedMode(true)} className={seg(linked)} title="Show the same verse(s) as the left, in the right version">
              Same verse
            </button>
            <button onClick={() => setLinkedMode(false)} className={seg(!linked)} title="Pick different verses for the right side">
              Choose verses
            </button>
          </div>
          {!linked && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-orange-700">Browsing</span>
              <div className="flex gap-1 rounded-lg bg-white/80 p-0.5" role="group" aria-label="Which side to browse">
                <button onClick={() => setFocus("a")} className={seg(focus === "a")}>
                  Left · {bibles.find((x) => x.id === versionId)?.abbr}
                </button>
                <button onClick={() => setFocus("b")} className={seg(focus === "b")}>
                  Right · {bibles.find((x) => x.id === versionB)?.abbr}
                </button>
              </div>
            </div>
          )}
          {errorB && <span className="text-xs text-red-600">{errorB}</span>}
        </div>
      )}

      {(error || side.error) && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || side.error}</p>}

      <div className="grid min-h-[22rem] flex-1 grid-cols-[7.5rem_3.25rem_1fr] gap-2 md:min-h-0 md:grid-cols-[11rem_6rem_1fr] md:gap-3">
        <div ref={bookBox} className="overflow-y-auto rounded-xl bg-white p-1.5">
          {side.books.map((bk, i) => (
            <div key={bk.n}>
              {(i === 0 || bk.n === 40) && (
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">{bk.n < 40 ? "Old Testament" : "New Testament"}</p>
              )}
              <button
                data-book={bk.n}
                onClick={() => {
                  setResults(null);
                  side.pickBook(bk.n);
                }}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition ${bk.n === side.book ? "bg-orange-50 font-semibold text-orange-700" : "text-neutral-700 hover:bg-neutral-50"}`}
              >
                {bk.name}
              </button>
            </div>
          ))}
        </div>

        <div ref={chapterBox} className="overflow-y-auto rounded-xl bg-white p-1.5">
          <div className="grid grid-cols-2 gap-1">
            {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => (
              <button
                key={c}
                data-ch={c}
                onClick={() => {
                  setResults(null);
                  side.setChapter(c);
                }}
                className={`rounded-lg py-1.5 text-sm tabular-nums transition ${c === side.chapter ? "bg-orange-600 font-semibold text-[#ffffff]" : "text-neutral-700 hover:bg-neutral-100"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div ref={verseBox} tabIndex={0} onKeyDown={onKeyDown} className={`min-h-0 overflow-y-auto rounded-xl border bg-white outline-none ${independent && focus === "b" ? "border-orange-300" : "border-neutral-100 focus:border-neutral-200"}`}>
          {finding || results ? (
            <div>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white/95 px-4 py-2.5 backdrop-blur">
                <p className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
                  {finding ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-orange-500" /> Finding scriptures…
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} className="text-orange-500" /> Results for “{q}”
                    </>
                  )}
                </p>
                <button onClick={() => setResults(null)} aria-label="Close results" className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100">
                  <X size={15} />
                </button>
              </div>
              {results && (
                <>
                  {!results.ai && (
                    <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                      {results.aiIssue === "credits" ? "AI search is paused — the OpenRouter key is out of credit (add credit at openrouter.ai to turn it back on). " : "AI search isn’t reachable right now. "}
                      Showing built-in story &amp; topic matches and word search instead.
                    </p>
                  )}
                  {results.suggestions.map((sg, i) => (
                    <button
                      key={`${sg.book}-${sg.chapter}-${sg.from}-${sg.to}`}
                      onClick={() => {
                        setResults(null);
                        side.goTo(sg.book, sg.chapter, { from: sg.from, to: sg.to });
                      }}
                      className="block w-full border-b border-neutral-50 px-4 py-3 text-left hover:bg-orange-50/50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold text-orange-600">{sg.reference}</span>
                        {i === 0 && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700">Best match</span>}
                      </span>
                      {sg.reason && <span className="block text-xs text-neutral-400">{sg.reason}</span>}
                      <span className="mt-1 line-clamp-4 block text-sm leading-relaxed text-neutral-700">
                        {sg.verses.length > 1 ? sg.verses.map((v) => `${v.n} ${v.text}`).join(" ") : sg.verses[0].text}
                      </span>
                    </button>
                  ))}
                  {results.keyword.results.length > 0 && (
                    <>
                      <p className={`bg-neutral-50 px-4 py-1.5 ${results.suggestions.length ? "" : "hidden"} text-[10px] font-bold uppercase tracking-widest text-neutral-400`}>
                        Word matches{results.keyword.total > results.keyword.results.length ? ` (${results.keyword.total})` : ""}
                      </p>
                      {results.keyword.results.map((r) => (
                        <button
                          key={`${r.book}-${r.chapter}-${r.verse}`}
                          onClick={() => {
                            setResults(null);
                            side.goTo(r.book, r.chapter, { from: r.verse, to: r.verse });
                          }}
                          className="block w-full border-b border-neutral-50 px-4 py-3 text-left hover:bg-neutral-50"
                        >
                          <span className="text-xs font-semibold text-orange-600">
                            {r.bookName} {r.chapter}:{r.verse}
                          </span>
                          <span className="mt-0.5 block text-sm leading-relaxed text-neutral-700">{r.text}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {!results.suggestions.length && !results.keyword.results.length && (
                    <p className="p-6 text-center text-sm text-neutral-500">{results.ai ? "No scriptures found. Try rewording it." : "No matches. Try a reference (like Mark 5:25) or fewer words."}</p>
                  )}
                  
                </>
              )}
            </div>
          ) : side.passage ? (
            <div className="p-1.5">
              <p className="px-3 pb-1 pt-2 text-sm font-semibold text-neutral-900">
                {side.passage.bookName} {side.passage.chapter}
                <span className="ml-2 text-xs font-medium text-neutral-400">{sideVersion?.abbr}</span>
                {independent && <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700">{focus === "b" ? "Right side" : "Left side"}</span>}
              </p>
              {side.passage.verses.map((v) => {
                const on = side.sel && v.n >= side.sel.from && v.n <= side.sel.to;
                return (
                  <button
                    key={v.n}
                    data-v={v.n}
                    onClick={(e) => clickVerse(v.n, e)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!on) side.setSel({ from: v.n, to: v.n });
                      setMenu({ x: e.clientX, y: e.clientY });
                    }}
                    onDoubleClick={() => {
                      // Highlight it, then go live as soon as the slide (and the right side, if split) is ready.
                      side.setSel({ from: v.n, to: v.n });
                      armLive();
                    }}
                    className={`flex w-full gap-3 rounded-lg px-3 py-2 text-left transition ${on ? "bg-orange-50 ring-1 ring-orange-200" : "hover:bg-neutral-50"}`}
                  >
                    <span className={`mt-0.5 w-6 shrink-0 text-right text-xs font-bold tabular-nums ${on ? "text-orange-600" : "text-neutral-400"}`}>{v.n}</span>
                    <span className="text-[15px] leading-relaxed text-neutral-800">{v.text}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>
          )}
        </div>
      </div>
      {hlOpen && partA && (
        <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-600">
              <span className="font-semibold text-orange-700">Highlight</span> — drag over words to highlight them, then press <span className="font-semibold">Go live</span> to show them on the screen. Click a highlight to remove it.
            </p>
            <HighlightColors
              color={hlColor}
              onColor={setHlColor}
              hasAny={listA.length + listB.length > 0}
              onClear={() => {
                setHlA({ key: keyOf(partA), list: [] });
                setHlB({ key: keyOf(partB), list: [] });
              }}
            />
          </div>
          <div className={split && partB ? "grid gap-3 sm:grid-cols-2" : ""}>
            <HighlightEditor label={`${partA.reference} · ${partA.version}`} text={partA.text} highlights={listA} color={hlColor} onChange={(list) => setHlA({ key: keyOf(partA), list })} />
            {split && partB && <HighlightEditor label={`${partB.reference} · ${partB.version}`} text={partB.text} highlights={listB} color={hlColor} onChange={(list) => setHlB({ key: keyOf(partB), list })} />}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-400">Click a verse to preview · Shift-click for a range · Double-click or Enter to go live · Clicking a search result previews it · ↑ ↓ to step</p>
        <div className="flex shrink-0 items-center gap-2">
        <button
          disabled={!slide}
          onClick={() => setHlOpen((o) => !o)}
          aria-pressed={hlOpen}
          title="Highlight words in the verse, then go live"
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${hlOpen ? "border-orange-600 bg-orange-600 text-[#ffffff]" : "border-neutral-200 bg-white text-neutral-700 hover:border-orange-300 hover:text-orange-700"}`}
        >
          <Highlighter size={14} /> Highlight
        </button>
        <button
          disabled={!slide}
          onClick={() => {
            if (slide?.kind === "scripture") onAdd({ type: "scripture", title: slide.reference, subtitle: slide.version, slides: [slide] });
            else if (slide?.kind === "scripture2") onAdd({ type: "scripture", title: `${slide.left.reference} | ${slide.right.reference}`, subtitle: `${slide.left.version} | ${slide.right.version}`, slides: [slide] });
          }}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-40"
        >
          <CalendarPlus size={14} /> Add to schedule
        </button>
        </div>
      </div>
      {menu && (
        <div style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()} className="fixed z-[75] w-56 overflow-hidden rounded-xl border border-neutral-100 bg-white p-1 shadow-xl">
          <button
            onClick={() => {
              setMenu(null);
              void addToBox();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <Archive size={15} /> Add to scripture box <kbd className="ml-auto rounded bg-neutral-100 px-1 text-[10px] text-neutral-500">⇧↵</kbd>
          </button>
          <button
            onClick={() => {
              setMenu(null);
              setBoxOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <BookOpen size={15} /> Open scripture box
          </button>
        </div>
      )}
      {boxOpen && <ScriptureBoxModal refreshKey={boxKey} onClose={() => setBoxOpen(false)} onStage={onStage} onLive={onLive} onAdd={onAdd} onCount={setBoxCount} />}
    </div>
  );
}
