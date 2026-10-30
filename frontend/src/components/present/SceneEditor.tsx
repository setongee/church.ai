"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, Minus, Plus } from "lucide-react";
import { FrameEditor } from "./FrameEditor";
import { BackgroundField } from "./BackgroundPicker";
import { inputCls } from "./ui";
import { SECTIONS, type Background, type PresentState, type PresentStyle, type SceneTemplate, type SectionKey, type SectionLook, type SectionStyles, type Slide, type TemplateScene } from "@/lib/present";

export interface SceneResult {
  name: string;
  scene: TemplateScene;
}

interface Props {
  // An animated template that plays behind everything. Omit it to build a custom template from your own background.
  slide?: Slide | null;
  look: { background: Background; style: PresentStyle };
  // Editing a saved custom template.
  initial?: { name: string; background: Background | null; style: Pick<PresentStyle, "frame" | "frameBg" | "align" | "scale">; sections?: SectionStyles | null };
  onSave: (r: SceneResult) => void;
  onClose: () => void;
  // Building a prayer template: it is only about prayers, so it has one look and previews with a prayer.
  prayer?: boolean;
}

type Tab = "all" | SectionKey;
type Bits = Pick<PresentStyle, "frame" | "frameBg" | "align" | "scale">;

const lookOf = (s: Bits): SectionLook => ({ frame: s.frame, frameBg: s.frameBg, align: s.align, scale: s.scale });

// Sets up how a template and the content on top of it fit together - e.g. the Offering overlay filling the
// screen with scripture and songs sitting in a panel on the right, or your own background with a lower
// third. A custom template can also give scripture, songs and prayers a look each. Nothing here touches the live
// screen: the result is saved (to the schedule, or the template library), and only goes live when that is triggered.
export function SceneEditor({ slide, look, initial, onSave, onClose, prayer }: Props) {
  const custom = !slide;
  const sectioned = custom && !prayer; // a general template can have a look per section
  const [name, setName] = useState(initial?.name ?? "");
  const [bg, setBg] = useState<Background | null>(initial?.background ?? null);
  const [style, setStyle] = useState<PresentStyle>({ ...look.style, frame: null, frameBg: null, ...(initial?.style ?? {}) });
  const [sections, setSections] = useState<SectionStyles>(initial?.sections ?? {});
  const [tab, setTab] = useState<Tab>("all");

  const section = tab === "all" ? null : tab;
  const customised = section ? Boolean(sections[section]) : true;
  // The look being edited: the template's default, or one section's own (a section without one shows the default).
  const own = section ? sections[section] : undefined;
  const activeStyle: PresentStyle = own ? { ...style, frame: own.frame, frameBg: own.frameBg, align: own.align, scale: own.scale } : style;
  const activeBg = own?.background ?? bg;

  const change = (p: Partial<PresentStyle>) => {
    if (!section) return setStyle((s) => ({ ...s, ...p }));
    setSections((all) => (all[section] ? { ...all, [section]: { ...all[section]!, ...(("frame" in p) ? { frame: p.frame ?? null } : {}), ...(("frameBg" in p) ? { frameBg: p.frameBg ?? null } : {}), ...(p.align ? { align: p.align } : {}), ...(p.scale ? { scale: p.scale } : {}) } } : all));
  };
  const toggleCustom = (on: boolean) => {
    if (!section) return;
    setSections((all) => {
      const next = { ...all };
      if (on) next[section] = { ...lookOf(style), background: null };
      else delete next[section];
      return next;
    });
  };

  const state = { mode: "live", slide: null, rev: 0, alert: null, logoUrl: "", logoKind: "logo", background: activeBg ?? look.background, bgSlide: slide ?? null, style: activeStyle } as PresentState;
  const samples: SectionKey[] | undefined = prayer ? ["prayer"] : section ? [section] : undefined;
  const count = Object.keys(sections).length;

  return (
    <FrameEditor
      key={`${tab}:${customised}`}
      title={custom ? (initial ? (prayer ? "Edit prayer template" : "Edit template") : prayer ? "New prayer template" : "New template") : "Template scene"}
      doneLabel={custom ? "Save template" : "Save to schedule"}
      state={state}
      onChange={change}
      onClose={onClose}
      canSave={!custom || Boolean(name.trim())}
      samples={samples}
      locked={Boolean(section) && !customised}
      onDone={() => onSave({ name: name.trim(), scene: { layer: "background", background: custom ? bg : undefined, style: { frame: style.frame, frameBg: style.frameBg, align: style.align, scale: style.scale }, ...(sectioned && count ? { sections } : {}) } })}
      header={
        sectioned ? (
          <section className="rounded-2xl bg-neutral-50 p-3.5">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Section">
              {([{ id: "all", label: "All" }, ...SECTIONS] as { id: Tab; label: string }[]).map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${tab === t.id ? "bg-orange-600 text-[#ffffff]" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>
                  {t.label}
                  {t.id !== "all" && sections[t.id as SectionKey] && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#fdba74] align-middle" aria-label="has its own look" />}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {tab === "all" ? (
                <>
                  The look every section starts from. Give <b>Scripture</b>, <b>Song</b> or <b>Prayer</b> a look of their own with the tabs above{count ? ` (${count} customised)` : ""}.
                </>
              ) : customised ? (
                <>
                  This look is only for <b>{SECTIONS.find((s) => s.id === tab)!.label.toLowerCase()}</b> — placement, fill, alignment, size and backdrop.
                </>
              ) : (
                <>
                  {SECTIONS.find((s) => s.id === tab)!.label} uses the <b>All</b> look right now.
                </>
              )}
            </p>
            {section && (
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-800">
                <input type="checkbox" checked={customised} onChange={(e) => toggleCustom(e.target.checked)} className="h-4 w-4 accent-orange-600" />
                Customise {SECTIONS.find((s) => s.id === section)!.label.toLowerCase()} separately
              </label>
            )}
          </section>
        ) : undefined
      }
      intro={
        custom && prayer ? (
          <>
            Build a look for prayers: pick its <b>background</b>, then place where the <b>prayer text</b> sits and how it lines up and how big it is. Choose it on a prayer, and it&apos;s used whenever that prayer goes on screen.
          </>
        ) : custom ? (
          <>
            Build your own template: pick its <b>background</b>, then place where <b>scripture, songs and prayers</b> sit on it. Use the tabs to give each its own look. It&apos;s saved to your templates, and goes live when you click <b>Go live</b> on it (here, or from the schedule).
          </>
        ) : (
          <>
            The template plays behind everything. Place where <b>scripture, songs and other text</b> sit while it&apos;s on — for example a panel on the right of the Offering screen. This is a setup only: it goes live when you click <b>Go live</b> on it in the schedule.
          </>
        )
      }
      extra={
        <>
          {custom && !section && (
            <>
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Name</h3>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={prayer ? "e.g. Prayer — soft purple lower third" : "e.g. Worship — right panel"} className={inputCls} />
              </section>
              <BackgroundField value={bg} onChange={setBg} label="Template background" hint={{ set: "This sits behind everything while the template is on.", unset: "Pick a colour, gradient, picture or video. Without one, the screen's own background is used." }} />
            </>
          )}
          {section && customised && (
            <BackgroundField
              value={own?.background ?? null}
              onChange={(b) => setSections((all) => (all[section] ? { ...all, [section]: { ...all[section]!, background: b ?? null } } : all))}
              label={`${SECTIONS.find((s) => s.id === section)!.label} backdrop (optional)`}
              hint={{ set: "Shown behind this section only.", unset: "Leave empty to use the template background." }}
            />
          )}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Text</h3>
            <div className="flex items-center gap-2">
              {(["left", "center"] as const).map((a) => (
                <button key={a} onClick={() => change({ align: a })} aria-label={`Align ${a}`} className={`rounded-lg p-2 ${activeStyle.align === a ? "bg-orange-50 text-orange-600" : "text-neutral-500 hover:bg-neutral-100"}`}>
                  {a === "left" ? <AlignLeft size={16} /> : <AlignCenter size={16} />}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-neutral-200" />
              <button onClick={() => change({ scale: Math.max(0.5, +(activeStyle.scale - 0.1).toFixed(2)) })} aria-label="Smaller text" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
                <Minus size={16} />
              </button>
              <span className="w-12 text-center text-sm font-semibold tabular-nums text-neutral-600">{Math.round(activeStyle.scale * 100)}%</span>
              <button onClick={() => change({ scale: Math.min(1.6, +(activeStyle.scale + 0.1).toFixed(2)) })} aria-label="Bigger text" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
                <Plus size={16} />
              </button>
            </div>
          </section>
        </>
      }
    />
  );
}

// A small badge for a template card: which sections have a look of their own.
export function sectionSummary(t: Pick<SceneTemplate, "sections">): string[] {
  return SECTIONS.filter((s) => t.sections?.[s.id]).map((s) => s.label);
}
