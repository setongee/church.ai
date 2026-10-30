'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  editTimelineWords,
  getPeaks,
  getTimelineWords,
  previewReelTemplate,
  replaceTimelineWords,
} from '@/lib/api';
import type { TimelineWord } from '@/lib/types';
import { fmtSec } from './hooks';
import { Overlay } from './TemplateModal';

const PADDING_SEC = 6;
const WAVE_H = 76;
const WORDS_H = 60;
const ROW_H = 28;
const RULER_H = 22;
const NUDGE = 0.05;
const MIN_CLIP = 3;

// Edit a clip on a timeline: scrub the waveform, fix any word the speech-to-text got wrong
// (names and native words especially) and nudge its timing, and drag the clip's start/end.
// Word fixes are saved to the session's transcript, so every reel and merged video that uses
// those words picks them up.
export function TimelineEditor({
  sessionId,
  audioUrl,
  title,
  startSec,
  endSec,
  templateId,
  reelId,
  onApplyRange,
  onClose,
}: {
  sessionId: string;
  audioUrl: string;
  title: string;
  startSec: number;
  endSec: number;
  templateId?: string;
  // When set, the side panel can render a real frame of this reel with the current words.
  reelId?: string;
  onApplyRange: (start: number, end: number) => void | Promise<void>;
  onClose: () => void;
}) {
  const [range, setRange] = useState({ start: startSec, end: endSec });
  const [words, setWords] = useState<TimelineWord[]>([]);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [pps, setPps] = useState(130);
  const [selected, setSelected] = useState<number | null>(null); // primary word (index into `words`)
  const [multi, setMulti] = useState<number[]>([]); // every selected word, including the primary
  // Live offset (seconds) while dragging selected words, and the live edge change while resizing.
  const [dragShift, setDragShift] = useState(0);
  const [resizing, setResizing] = useState<{ index: number; s: number; e: number } | null>(null);
  const undoRef = useRef<{ i: number; w: string; s: number; e: number }[][]>([]);
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(startSec);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewing, setPreviewing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rangeRef = useRef(range);
  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  const viewStart = Math.max(0, startSec - PADDING_SEC);
  const viewEnd = (duration > 0 ? Math.min(duration, endSec + PADDING_SEC) : endSec + PADDING_SEC);
  const width = Math.max(300, (viewEnd - viewStart) * pps);
  const xOf = useCallback((t: number) => (t - viewStart) * pps, [viewStart, pps]);

  // Load words + waveform for the visible window.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await getTimelineWords(sessionId, viewStart, endSec + PADDING_SEC);
        if (cancelled) return;
        setWords(w.words);
        setDuration(w.durationSec);
        const to = Math.min(w.durationSec || Infinity, endSec + PADDING_SEC);
        const p = await getPeaks(sessionId, viewStart, to, Math.min(1200, Math.ceil((to - viewStart) * 20)));
        if (!cancelled) setPeaks(p.peaks);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the timeline');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, viewStart, endSec]);

  // Draw the waveform.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(WAVE_H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, WAVE_H);
    const barW = width / peaks.length;
    ctx.fillStyle = '#94a3b8';
    peaks.forEach((p, i) => {
      const h = Math.max(2, Math.min(1, p * 1.4) * (WAVE_H - 8));
      ctx.fillRect(i * barW, (WAVE_H - h) / 2, Math.max(1, barW - 1), h);
    });
  }, [peaks, width]);

  // Playhead: follow the audio smoothly while it plays and stop at the clip's end.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        setNow(audio.currentTime);
        if (audio.currentTime >= rangeRef.current.end) {
          audio.pause();
          setPlaying(false);
          return;
        }
        const el = scrollRef.current;
        if (el) {
          const x = (audio.currentTime - viewStart) * pps;
          if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = Math.max(0, x - 80);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, viewStart, pps]);

  function seek(t: number) {
    const audio = audioRef.current;
    if (audio) audio.currentTime = t;
    setNow(t);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (audio.currentTime < range.start || audio.currentTime >= range.end - 0.05) audio.currentTime = range.start;
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setError('Could not play the audio.'));
  }

  // Space plays/pauses unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        togglePlay();
      } else if (!typing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (!typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (multi.length || selected !== null)) {
        e.preventDefault();
        shiftSelected((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.25 : NUDGE));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function select(index: number, focusInput = false) {
    const w = words[index];
    if (!w) return;
    setSelected(index);
    setMulti([index]);
    setDraft(w.w);
    if (!playing) seek(w.s);
    if (focusInput) setTimeout(() => inputRef.current?.select(), 0);
  }

  // Click = one word, shift-click = everything between the last word and this one, cmd/ctrl-click = toggle.
  function selectWith(index: number, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    if (e.shiftKey && selected !== null) {
      const [a, b] = [Math.min(selected, index), Math.max(selected, index)];
      setMulti(Array.from({ length: b - a + 1 }, (_, k) => a + k));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setMulti((m) => (m.includes(index) ? m.filter((x) => x !== index) : [...m, index]));
      setSelected(index);
      return;
    }
    select(index, true);
  }

  // Saves a batch of word changes: optimistic, undoable (Cmd/Ctrl+Z), reverted if the save fails.
  const applyEdits = useCallback(
    async (patches: { index: number; w?: string; s?: number; e?: number }[], recordUndo = true) => {
      const valid = patches.filter((p) => words[p.index]);
      if (valid.length === 0) return false;
      const next = valid.map((p) => ({ index: p.index, word: { ...words[p.index], ...p } }));
      if (next.some((n) => n.word.e <= n.word.s || n.word.s < 0)) {
        setError('A word must end after it starts, inside the recording.');
        return false;
      }
      const before = valid.map((p) => ({ i: words[p.index].i, w: words[p.index].w, s: words[p.index].s, e: words[p.index].e }));
      setError('');
      const apply = (list: { index: number; word: TimelineWord }[]) =>
        setWords((prev) => prev.map((x, i) => list.find((n) => n.index === i)?.word ?? x));
      apply(next);
      try {
        await editTimelineWords(
          sessionId,
          next.map((n) => ({ i: n.word.i, w: n.word.w, s: n.word.s, e: n.word.e }))
        );
        if (recordUndo) undoRef.current.push(before);
        return true;
      } catch (err) {
        setWords((prev) =>
          prev.map((x) => {
            const b = before.find((y) => y.i === x.i);
            return b ? { ...x, ...b } : x;
          })
        );
        setError(err instanceof Error ? err.message : 'Failed to save the change');
        return false;
      }
    },
    [sessionId, words]
  );

  async function undo() {
    const last = undoRef.current.pop();
    if (!last) return;
    const patches = last
      .map((b) => ({ index: words.findIndex((x) => x.i === b.i), w: b.w, s: b.s, e: b.e }))
      .filter((p) => p.index >= 0);
    await applyEdits(patches, false);
  }

  const commit = (index: number, patch: { w?: string; s?: number; e?: number }) => applyEdits([{ index, ...patch }]);

  // Move every selected word by `delta` seconds (the "shift" of a traditional editor).
  async function shiftSelected(delta: number) {
    const targets = multi.length ? multi : selected !== null ? [selected] : [];
    const lowest = Math.min(...targets.map((i) => words[i]?.s ?? 0));
    const d = Math.max(delta, -lowest);
    await applyEdits(targets.map((index) => ({ index, s: words[index].s + d, e: words[index].e + d })));
  }

  const selectAllInClip = () => {
    const idx = words.map((w, i) => (w.e > range.start && w.s < range.end ? i : -1)).filter((i) => i >= 0);
    setMulti(idx);
    if (idx.length) setSelected(idx[0]);
  };
  const selectFromHere = () => {
    if (selected === null) return;
    setMulti(words.map((_, i) => i).filter((i) => i >= selected && words[i].s < range.end));
  };

  // Dragging a word moves it (and every other selected word with it); a plain click just selects.
  const startWordDrag = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).dataset.handle) return;
    const startX = e.clientX;
    const group = multi.includes(index) ? multi : [index];
    let moved = false;
    let delta = 0;
    const lowest = Math.min(...group.map((i) => words[i].s));
    const highest = Math.max(...group.map((i) => words[i].e));
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 4) return;
      moved = true;
      delta = Math.min(Math.max((ev.clientX - startX) / pps, -lowest), Math.max(0, duration - highest));
      setDragShift(delta);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragShift(0);
      if (!moved) return selectWith(index, ev);
      if (!multi.includes(index)) {
        setSelected(index);
        setMulti([index]);
      }
      applyEdits(group.map((i) => ({ index: i, s: words[i].s + delta, e: words[i].e + delta })));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Dragging a word's left/right edge changes just its start or end.
  const startResize = (index: number, edge: 's' | 'e') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const w = words[index];
    const startX = e.clientX;
    let cur = { index, s: w.s, e: w.e };
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - startX) / pps;
      cur = edge === 's' ? { index, s: Math.min(Math.max(0, w.s + d), w.e - 0.05), e: w.e } : { index, s: w.s, e: Math.max(w.e + d, w.s + 0.05) };
      setResizing(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setResizing(null);
      if (Math.abs(cur.s - w.s) > 0.004 || Math.abs(cur.e - w.e) > 0.004) applyEdits([{ index, s: cur.s, e: cur.e }]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  async function commitDraft(advance: boolean) {
    if (selected === null) return;
    const cur = words[selected];
    if (draft !== cur.w) await commit(selected, { w: draft });
    if (advance && selected + 1 < words.length) select(selected + 1, true);
  }

  async function handleReplace() {
    if (!findText.trim()) return;
    setError('');
    setNotice('');
    try {
      const { replaced } = await replaceTimelineWords(sessionId, findText, replaceText);
      setNotice(
        replaced === 0
          ? `"${findText}" wasn't found.`
          : `Replaced ${replaced} ${replaced === 1 ? 'word' : 'words'} across the whole transcript.`
      );
      if (replaced > 0) {
        const w = await getTimelineWords(sessionId, viewStart, endSec + PADDING_SEC);
        setWords(w.words);
        setSelected(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace');
    }
  }

  // Dragging a clip handle: live while dragging, snapped to the nearest word edge on release.
  const startDrag = (edge: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = scrollRef.current;
    if (!el) return;
    const timeAt = (clientX: number) => viewStart + (clientX - el.getBoundingClientRect().left + el.scrollLeft) / pps;
    const move = (ev: PointerEvent) => {
      const t = timeAt(ev.clientX);
      setRange((r) =>
        edge === 'start'
          ? { ...r, start: Math.min(Math.max(viewStart, t), r.end - MIN_CLIP) }
          : { ...r, end: Math.max(Math.min(viewEnd, t), r.start + MIN_CLIP) }
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setRange((r) => {
        const edges = words.map((w) => (edge === 'start' ? w.s : w.e));
        const t = edge === 'start' ? r.start : r.end;
        const nearest = edges.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), t);
        const snapped = Math.abs(nearest - t) < 0.5 ? nearest : t;
        const next = edge === 'start' ? { ...r, start: Math.min(snapped, r.end - MIN_CLIP) } : { ...r, end: Math.max(snapped, r.start + MIN_CLIP) };
        return next;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  async function refreshPreview() {
    if (!reelId) return;
    setPreviewing(true);
    try {
      const res = await previewReelTemplate({ templateId, reelId, atSec: Math.max(0.3, now - range.start) });
      setPreviewUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = Math.ceil(viewStart); t <= viewEnd; t += 1) out.push(t);
    return out;
  }, [viewStart, viewEnd]);

  const rangeChanged = Math.abs(range.start - startSec) > 0.01 || Math.abs(range.end - endSec) > 0.01;
  const sel = selected !== null ? words[selected] : null;

  return (
    <Overlay onClose={onClose} wide>
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-neutral-900">Timeline · {title}</h2>
            <p className="text-xs text-neutral-500">
              Drag a word to move it, drag its edges to resize, shift-click to select several then shift them together (← → nudge, Cmd/Ctrl+Z undo). Double-click to edit text. Space plays the clip.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">
            Close
          </button>
        </div>

        <div className={`mt-4 grid gap-5 ${reelId ? 'lg:grid-cols-[1fr_200px]' : ''}`}>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <button
                onClick={togglePlay}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
              >
                {playing ? '❚❚ Pause' : '▶ Play clip'}
              </button>
              <span className="font-mono text-xs text-neutral-500">
                {fmtSec(now)} · clip {fmtSec(range.start)} – {fmtSec(range.end)} ({(range.end - range.start).toFixed(1)}s)
              </span>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-500">
                Zoom
                <input type="range" min={40} max={220} value={pps} onChange={(e) => setPps(Number(e.target.value))} className="w-24" />
              </label>
            </div>

            <div
              ref={scrollRef}
              className="relative overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50"
              onPointerDown={(e) => {
                const el = scrollRef.current;
                if (!el) return;
                seek(Math.max(range.start, Math.min(range.end, viewStart + (e.clientX - el.getBoundingClientRect().left + el.scrollLeft) / pps)));
              }}
            >
              {loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-neutral-400">Loading timeline…</div>
              ) : (
                <div className="relative select-none" style={{ width, height: RULER_H + WAVE_H + WORDS_H + 8 }}>
                  {/* ruler */}
                  {ticks.map((t) => (
                    <div key={t} className="absolute top-0" style={{ left: xOf(t) }}>
                      <div className={`w-px bg-neutral-300 ${t % 5 === 0 ? 'h-3' : 'h-1.5'}`} />
                      {t % 5 === 0 && <span className="absolute left-1 top-0 text-[10px] text-neutral-400">{fmtSec(t).slice(0, -2)}</span>}
                    </div>
                  ))}

                  {/* waveform */}
                  <canvas ref={canvasRef} style={{ position: 'absolute', top: RULER_H, left: 0, width, height: WAVE_H }} />

                  {/* words */}
                  <div className="absolute left-0" style={{ top: RULER_H + WAVE_H + 4, height: WORDS_H, width }}>
                    {words.map((w, i) => {
                      const inClip = w.e > range.start && w.s < range.end;
                      const isSel = multi.includes(i) || selected === i;
                      const live = resizing?.index === i ? resizing : null;
                      const shift = isSel && dragShift ? dragShift : 0;
                      const ws = (live?.s ?? w.s) + shift;
                      const we = (live?.e ?? w.e) + shift;
                      return (
                        <div
                          key={w.i}
                          onPointerDown={startWordDrag(i)}
                          onDoubleClick={() => select(i, true)}
                          title={`${w.w} · ${ws.toFixed(2)}s – ${we.toFixed(2)}s (drag to move, drag the edges to resize)`}
                          className={`group absolute cursor-grab truncate rounded px-1 text-left text-xs active:cursor-grabbing ${
                            selected === i
                              ? 'bg-neutral-900 text-white ring-2 ring-amber-400'
                              : isSel
                                ? 'bg-amber-100 text-neutral-900 ring-2 ring-amber-400'
                                : inClip
                                  ? 'bg-white text-neutral-900 ring-1 ring-neutral-300 hover:ring-neutral-500'
                                  : 'bg-neutral-100 text-neutral-400 ring-1 ring-neutral-200'
                          }`}
                          style={{
                            left: xOf(ws),
                            top: (i % 2) * (ROW_H + 2),
                            width: Math.max(22, (we - ws) * pps),
                            height: ROW_H,
                            lineHeight: `${ROW_H}px`,
                          }}
                        >
                          <span
                            data-handle="s"
                            onPointerDown={startResize(i, 's')}
                            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l bg-amber-500/0 group-hover:bg-amber-500/70"
                          />
                          {w.w || <span className="text-neutral-400">·</span>}
                          <span
                            data-handle="e"
                            onPointerDown={startResize(i, 'e')}
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r bg-amber-500/0 group-hover:bg-amber-500/70"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* outside-the-clip shading + drag handles */}
                  <div className="pointer-events-none absolute inset-y-0 left-0 bg-white/60" style={{ width: Math.max(0, xOf(range.start)) }} />
                  <div className="pointer-events-none absolute inset-y-0 bg-white/60" style={{ left: xOf(range.end), right: 0 }} />
                  {(['start', 'end'] as const).map((edge) => (
                    <div
                      key={edge}
                      onPointerDown={startDrag(edge)}
                      title={edge === 'start' ? 'Drag to change where the clip starts' : 'Drag to change where the clip ends'}
                      className="absolute inset-y-0 z-10 w-3 cursor-ew-resize bg-red-500/80 hover:bg-red-600"
                      style={{ left: xOf(edge === 'start' ? range.start : range.end) - (edge === 'start' ? 0 : 12) }}
                    />
                  ))}

                  {/* playhead */}
                  <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-amber-500" style={{ left: xOf(now) }} />
                </div>
              )}
            </div>

            {/* shift toolbar */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-3 text-xs text-neutral-600">
              <span className="font-medium">{multi.length > 1 ? `${multi.length} words selected` : 'Select words'}</span>
              <button onClick={selectAllInClip} className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100">All in clip</button>
              <button onClick={selectFromHere} disabled={selected === null} className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 disabled:opacity-40">From here on</button>
              <span className="ml-2 text-neutral-400">Shift</span>
              {[-0.25, -0.05, 0.05, 0.25].map((d) => (
                <button
                  key={d}
                  onClick={() => shiftSelected(d)}
                  disabled={!multi.length && selected === null}
                  className="rounded border border-neutral-300 px-2 py-1 font-mono hover:bg-neutral-100 disabled:opacity-40"
                  title={d < 0 ? 'Captions appear earlier' : 'Captions appear later'}
                >
                  {d > 0 ? '+' : '−'}{Math.abs(d)}s
                </button>
              ))}
              <button onClick={undo} className="ml-auto rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100">Undo</button>
            </div>

            {/* selected word editor */}
            <div className="mt-3 min-h-[76px] rounded-lg border border-neutral-200 p-3">
              {sel ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitDraft(true);
                      } else if (e.key === 'Escape') {
                        setDraft(sel.w);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={() => commitDraft(false)}
                    aria-label="Word text"
                    className="w-48 rounded-md border border-neutral-300 px-2 py-1.5 text-sm font-medium focus:border-neutral-900 focus:outline-none"
                  />
                  <button
                    onClick={() => commit(selected!, { w: '' }).then(() => setDraft(''))}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                    title="Hide this word from the captions"
                  >
                    Hide word
                  </button>
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    Start
                    <button onClick={() => commit(selected!, { s: Math.max(0, sel.s - NUDGE) })} className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-100">−</button>
                    <span className="w-12 text-center font-mono">{sel.s.toFixed(2)}</span>
                    <button onClick={() => commit(selected!, { s: Math.min(sel.e - NUDGE, sel.s + NUDGE) })} className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-100">+</button>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    End
                    <button onClick={() => commit(selected!, { e: Math.max(sel.s + NUDGE, sel.e - NUDGE) })} className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-100">−</button>
                    <span className="w-12 text-center font-mono">{sel.e.toFixed(2)}</span>
                    <button onClick={() => commit(selected!, { e: sel.e + NUDGE })} className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-100">+</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-400">Select a word on the timeline to fix its spelling or timing.</p>
              )}
            </div>

            {/* find & replace */}
            <div className="mt-3 rounded-lg border border-neutral-200 p-3">
              <p className="text-xs font-medium text-neutral-600">Fix a word everywhere</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Misheard word"
                  className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <span className="text-neutral-400">→</span>
                <input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Correct spelling"
                  className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={handleReplace}
                  disabled={!findText.trim()}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
                >
                  Replace all
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-400">
                Whole words only, ignoring capitals and punctuation. Applies to the entire recording, so every reel stays consistent.
              </p>
            </div>
          </div>

          {reelId && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-500">Look at the playhead</p>
              <div className="aspect-[9/16] w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Frame preview" className={`h-full w-full object-cover ${previewing ? 'opacity-50' : ''}`} />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center text-xs text-neutral-400">
                    Move the playhead, then refresh to see that frame with your corrections.
                  </div>
                )}
              </div>
              <button
                onClick={refreshPreview}
                disabled={previewing}
                className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
              >
                {previewing ? 'Rendering…' : 'Refresh preview'}
              </button>
            </div>
          )}
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
          <p className="text-xs text-neutral-400">
            Spelling and timing fixes save instantly. Re-render the video to see them in the final file.
          </p>
          <div className="flex gap-2">
            {rangeChanged && (
              <button
                onClick={async () => {
                  await onApplyRange(range.start, range.end);
                  onClose();
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Apply clip range
              </button>
            )}
            <button onClick={onClose} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100">
              Done
            </button>
          </div>
        </div>
      </div>
      <audio ref={audioRef} src={audioUrl} preload="auto" onEnded={() => setPlaying(false)} />
    </Overlay>
  );
}
