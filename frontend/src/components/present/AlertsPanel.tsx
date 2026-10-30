"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, AlignLeft, BellRing, Plus, RotateCcw, X } from "lucide-react";
import { ALERT_EFFECTS, DEFAULT_ALERT_STYLE, type AlertStyle, type PresentAlert, type PresentState } from "@/lib/present";
import { FontPicker } from "@/components/editor/FontPicker";
import { Stage } from "./Stage";
import { btnGhost, btnPrimary, Field, inputCls } from "./ui";

export interface AlertRequest {
  texts: string[];
  seconds: number; // how long the alert stays up (0 = until hidden)
  interval: number; // seconds each message shows, when there are several
  style: AlertStyle;
}

interface Props {
  state: PresentState; // the live look, used for the preview behind the banner
  active: PresentAlert | null;
  onShow: (req: AlertRequest) => void;
  onHide: () => void;
  onStyle: (style: AlertStyle) => void; // restyle the alert that is on screen right now
}

const KEY = "present-quick-alerts";
const STYLE_KEY = "present-alert-style";
const DEFAULTS = ["Please silence your phones.", "Parents, please check the nursery.", "Please remain seated.", "Please move your vehicle — it is blocking the exit."];
const DURATIONS = [
  { label: "10 seconds", value: 10 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "Until I hide it", value: 0 },
];
const INTERVALS = [4, 6, 8, 12];
const BG_SWATCHES = ["#ea580c", "#dc2626", "#16a34a", "#2563eb", "#7c3aed", "#111827", "#f5f1e8"];
const COLOR_SWATCHES = ["#ffffff", "#111827", "#fde68a", "#000000"];
const WEIGHTS = [
  [400, "Regular"],
  [600, "Semi"],
  [700, "Bold"],
  [900, "Black"],
] as const;

const Chip = ({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
  <button onClick={onClick} title={title} aria-pressed={on} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
    {children}
  </button>
);

// Alerts: a banner over everything on the output (nursery calls, parking, reminders). Pick how it moves, give it
// several messages to cycle through, and style it - size, colours, font, height and position.
export function AlertsPanel({ state, active, onShow, onHide, onStyle }: Props) {
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [interval, setIntervalSecs] = useState(6);
  const [saved, setSaved] = useState<string[]>(DEFAULTS);
  const [style, setStyle] = useState<AlertStyle>(DEFAULT_ALERT_STYLE);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const st = localStorage.getItem(STYLE_KEY);
      /* eslint-disable react-hooks/set-state-in-effect -- localStorage is only readable after mount */
      if (raw) setSaved(JSON.parse(raw));
      if (st) setStyle({ ...DEFAULT_ALERT_STYLE, ...JSON.parse(st) });
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {}
  }, [saved]);

  const texts = useMemo(() => text.split("\n").map((t) => t.trim()).filter(Boolean), [text]);
  const slideshow = texts.length > 1 && style.effect !== "scroll";

  function change(patch: Partial<AlertStyle>) {
    const next = { ...style, ...patch };
    setStyle(next);
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify(next));
    } catch {}
    if (active) onStyle(next); // restyling is live
  }
  const show = (list: string[]) => list.length && onShow({ texts: list, seconds, interval, style });
  const sample = texts[0] ?? "Please silence your phones.";

  // The preview: the real banner on the real screen, with the message you're writing.
  const preview: PresentState = { ...state, mode: "clear", slide: null, alert: { id: `preview-${style.effect}`, text: sample, texts: texts.length ? texts : [sample], seconds: interval, startedAt: 0, style } };
  const previewKey = JSON.stringify([style.effect, style.position]);

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="min-h-0 space-y-6 overflow-y-auto pr-1">
        {active && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-orange-50 px-4 py-3">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-orange-800">
              <BellRing size={16} className="shrink-0" />
              <span className="truncate">Showing: {(active.texts?.length ?? 1) > 1 ? `${active.texts!.length} messages` : active.text}</span>
            </p>
            <button onClick={onHide} className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700">
              Hide alert
            </button>
          </div>
        )}

        <Field label="Alert message" hint="One message per line makes a slide show — they take turns on screen.">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. Silver Honda, plate ABC-123 — your lights are on." className={inputCls} />
        </Field>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Field label="Show for">
              <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className={inputCls}>
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {slideshow && (
            <div className="w-44">
              <Field label="Each message for">
                <select value={interval} onChange={(e) => setIntervalSecs(Number(e.target.value))} className={inputCls}>
                  {INTERVALS.map((n) => (
                    <option key={n} value={n}>
                      {n} seconds
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <button onClick={() => show(texts)} disabled={!texts.length} className={btnPrimary}>
            <BellRing size={16} /> {slideshow ? `Show ${texts.length} messages` : "Show alert"}
          </button>
          <button onClick={() => texts.forEach((t) => !saved.includes(t) && setSaved((s) => (s.includes(t) ? s : [...s, t])))} disabled={!texts.length} className={btnGhost}>
            <Plus size={16} /> Save as quick alert
          </button>
        </div>

        {/* Style */}
        <section className="space-y-5 rounded-2xl bg-neutral-50 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Style</h3>
            <button onClick={() => change(DEFAULT_ALERT_STYLE)} className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-orange-600">
              <RotateCcw size={13} /> Reset
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-neutral-500">Effect</p>
            <div className="flex flex-wrap gap-1.5">
              {ALERT_EFFECTS.map((e) => (
                <Chip key={e.id} on={style.effect === e.id} onClick={() => change({ effect: e.id })} title={e.hint}>
                  {e.label}
                </Chip>
              ))}
            </div>
            {style.effect === "scroll" && (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <span className="text-neutral-500">Speed</span>
                {(["slow", "normal", "fast"] as const).map((sp) => (
                  <Chip key={sp} on={style.speed === sp} onClick={() => change({ speed: sp })}>
                    {sp[0].toUpperCase() + sp.slice(1)}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-neutral-500">Position</p>
              <div className="flex gap-1.5">
                {(["top", "middle", "bottom"] as const).map((p) => (
                  <Chip key={p} on={style.position === p} onClick={() => change({ position: p })}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-neutral-500">Text</p>
              <div className="flex items-center gap-1.5">
                {(["left", "center"] as const).map((a) => (
                  <button key={a} onClick={() => change({ align: a })} aria-label={`Align ${a}`} aria-pressed={style.align === a} className={`rounded-lg p-2 ${style.align === a ? "bg-orange-50 text-orange-600" : "text-neutral-500 hover:bg-neutral-100"}`}>
                    {a === "left" ? <AlignLeft size={16} /> : <AlignCenter size={16} />}
                  </button>
                ))}
                <Chip on={style.uppercase} onClick={() => change({ uppercase: !style.uppercase })}>
                  AA
                </Chip>
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <ColorRow label="Background" value={style.bg} swatches={BG_SWATCHES} onChange={(bg) => change({ bg })} />
            <ColorRow label="Text colour" value={style.color} swatches={COLOR_SWATCHES} onChange={(color) => change({ color })} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-neutral-500">Font</p>
              <div className="flex items-center gap-2">
                <FontPicker value={style.font || "Default"} onChange={(font) => change({ font })} className="w-40" />
                <select value={style.weight} onChange={(e) => change({ weight: Number(e.target.value) })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm">
                  {WEIGHTS.map(([w, l]) => (
                    <option key={w} value={w}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-3">
              <Slider label="Text size" value={style.size} min={28} max={140} step={2} unit="px" onChange={(size) => change({ size })} />
              <Slider label="Banner height" value={style.height} min={0} max={500} step={10} unit="px" auto="Fit text" onChange={(height) => change({ height })} />
            </div>
          </div>
        </section>

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Quick alerts</h3>
          <div className="space-y-1.5">
            {saved.map((s) => (
              <div key={s} className="group flex items-center gap-1 rounded-xl bg-white pr-2 transition hover:bg-neutral-50">
                <button onClick={() => show([s])} title="Show now" className="min-w-0 flex-1 px-4 py-3 text-left text-sm text-neutral-800">
                  {s}
                </button>
                <button onClick={() => setText((t) => (t.trim() ? `${t.replace(/\s+$/, "")}\n${s}` : s))} title="Add to the message box (for a slide show)" aria-label="Add to the message box" className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-orange-600">
                  <Plus size={14} />
                </button>
                <button onClick={() => setSaved(saved.filter((x) => x !== s))} aria-label="Remove" className="rounded-md p-1.5 text-neutral-300 opacity-0 hover:bg-neutral-100 hover:text-neutral-600 group-hover:opacity-100">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <aside className="min-h-0 space-y-3 overflow-y-auto">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Preview</p>
        <Stage key={previewKey} state={preview} monitor="preview" className="rounded-xl" />
        <p className="text-xs text-neutral-400">This is how the alert will look on the output, with your message.</p>
      </aside>
    </div>
  );
}

function ColorRow({ label, value, swatches, onChange }: { label: string; value: string; swatches: string[]; onChange: (c: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-neutral-500">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((c) => (
          <button key={c} onClick={() => onChange(c)} aria-label={`${label} ${c}`} aria-pressed={value.toLowerCase() === c} className={`h-7 w-7 rounded-full border-2 ${value.toLowerCase() === c ? "scale-110 border-neutral-900" : "border-white ring-1 ring-neutral-300"}`} style={{ background: c }} />
        ))}
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={`Custom ${label.toLowerCase()}`} className="h-7 w-9 cursor-pointer rounded-md border border-neutral-200 bg-white p-0.5" />
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, auto, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; auto?: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-semibold text-neutral-500">
        {label}
        <span className="tabular-nums text-neutral-800">{value === 0 && auto ? auto : `${value}${unit}`}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-orange-600" />
    </label>
  );
}
