"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Mic, RotateCcw, Save } from "lucide-react";
import { getBrand } from "@/lib/api";
import type { Brand } from "@/lib/types";
import { uploadMedia, type Slide } from "@/lib/present";
import { MINISTERING_DEFAULTS } from "./MinisteringPromo";
import { MINISTERING_TEMPLATES } from "./ministeringTemplates";
import { TemplateActions, type TemplateHandlers } from "./TemplateActions";
import { btnGhost, btnPrimary, Empty, Field, inputCls } from "./ui";

// The look of the template. `logoUrl` empty = the brand's (black) logo.
interface Look {
  gap: number;
  titleColor: string;
  nameColor: string;
  pillColor: string;
  titleScale: number;
  nameScale: number;
  titleSpacing: number;
  logoUrl: string;
  loop: boolean;
}
const DEFAULT_LOOK: Look = { ...MINISTERING_DEFAULTS, logoUrl: "", loop: false };
const store = (template: string) => `ministering-look:${template}`;

function loadLook(template: string): Look {
  try {
    return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(store(template)) || "{}") };
  } catch {
    return DEFAULT_LOOK;
  }
}

// The animated "Ministering" speaker promo. The preacher (name + photo) comes from the brand's ministers;
// the logo is the brand's black logo unless you swap it. Edits can be saved and reset.
export function MinisteringPanel(h: TemplateHandlers) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState("");
  const [ministerId, setMinisterId] = useState("");
  const [template, setTemplate] = useState(MINISTERING_TEMPLATES[0].id);
  const [look, setLook] = useState<Look>(() => loadLook(MINISTERING_TEMPLATES[0].id));
  const [saved, setSaved] = useState<Look>(() => loadLook(MINISTERING_TEMPLATES[0].id));
  const [uploading, setUploading] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    getBrand()
      .then((b) => {
        setBrand(b);
        setMinisterId(b.ministers?.[0]?._id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const ministers = brand?.ministers ?? [];
  const minister = ministers.find((m) => m._id === ministerId);
  const logoUrl = look.logoUrl || brand?.logoUrl || brand?.logoLightUrl || "";
  const dirty = JSON.stringify(look) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(look) === JSON.stringify(DEFAULT_LOOK);

  const slide = useMemo<Slide | null>(
    () => (minister ? { kind: "ministering", template, name: minister.name, logoUrl, photoUrl: minister.imageUrl, gap: look.gap, titleColor: look.titleColor, nameColor: look.nameColor, pillColor: look.pillColor, titleScale: look.titleScale, titleSpacing: look.titleSpacing, nameScale: look.nameScale, loop: look.loop } : null),
    [minister, template, logoUrl, look],
  );

  // Keep the preview monitor in step with edits (not on first load).
  useEffect(() => {
    if (slide && touched.current) h.onStage(slide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  function selectTemplate(id: string) {
    touched.current = true;
    const l = loadLook(id);
    setTemplate(id);
    setLook(l);
    setSaved(l);
  }
  const edit = (p: Partial<Look>) => {
    touched.current = true;
    setLook((l) => ({ ...l, ...p }));
  };
  function save() {
    try {
      localStorage.setItem(store(template), JSON.stringify(look));
    } catch {}
    setSaved(look);
  }
  function reset() {
    touched.current = true;
    try {
      localStorage.removeItem(store(template));
    } catch {}
    setLook(DEFAULT_LOOK);
    setSaved(DEFAULT_LOOK);
  }
  async function pickLogo(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      edit({ logoUrl: (await uploadMedia(file, "media")).url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!brand && !error) return <p className="p-4 text-sm text-neutral-400">Loading…</p>;
  if (!brand) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!ministers.length)
    return (
      <Empty icon={<Mic size={20} />} title="No ministers yet">
        Add the preachers (name and a transparent PNG cut-out photo) under Church Profile → Ministers, then pick one here.
      </Empty>
    );

  const color = (label: string, key: "titleColor" | "nameColor" | "pillColor") => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={look[key]} onChange={(e) => edit({ [key]: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg bg-white p-1" />
        <span className="text-xs tabular-nums text-neutral-500">{look[key]}</span>
      </div>
    </Field>
  );

  return (
    <div className="h-full w-full space-y-4 overflow-y-auto pb-4">
      <p className="text-sm text-neutral-500">The animated speaker intro: the church logo, the minister you pick and their photo.</p>
      {MINISTERING_TEMPLATES.length > 1 && <Field label="Template">
        <div className="grid gap-2 sm:grid-cols-2">
          {MINISTERING_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTemplate(t.id)}
              className={`rounded-xl border p-3 text-left transition ${template === t.id ? "border-orange-400 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-300"}`}
            >
              <span className="block text-sm font-semibold text-neutral-900">{t.name}</span>
              <span className="mt-0.5 block text-xs text-neutral-500">{t.description}</span>
            </button>
          ))}
        </div>
      </Field>}
      <Field label="Minister">
        <select value={ministerId} onChange={(e) => (touched.current = true, setMinisterId(e.target.value))} className={inputCls}>
          {ministers.map((m) => (
            <option key={m._id} value={m._id}>
              {m.name}
              {m.title ? ` — ${m.title}` : ""}
            </option>
          ))}
        </select>
      </Field>
      {minister && !minister.imageUrl && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{minister.name} has no photo yet — add one under Church Profile → Ministers.</p>}

      <div className="grid content-start gap-4 rounded-xl bg-white p-4 md:grid-cols-2">
        <div className="flex items-center justify-between md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Edit template</span>
          <div className="flex gap-1.5">
            <button onClick={reset} disabled={isDefault && !dirty} className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}>
              <RotateCcw size={13} /> Reset
            </button>
            <button onClick={save} disabled={!dirty} className={`${btnPrimary} !px-2.5 !py-1.5 text-xs`}>
              <Save size={13} /> {dirty ? "Save edits" : "Saved"}
            </button>
          </div>
        </div>
        <Field label={`Space between “Ministering” and the name (${look.gap.toFixed(1)})`}>
          <input type="range" min={-1} max={4} step={0.1} value={look.gap} onChange={(e) => edit({ gap: Number(e.target.value) })} className="w-full accent-orange-600" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Headline size (${Math.round(look.titleScale * 100)}%)`}>
            <input type="range" min={0.5} max={1.5} step={0.05} value={look.titleScale} onChange={(e) => edit({ titleScale: Number(e.target.value) })} className="w-full accent-orange-600" />
          </Field>
          <Field label={`Name size (${Math.round(look.nameScale * 100)}%)`}>
            <input type="range" min={0.5} max={1.6} step={0.05} value={look.nameScale} onChange={(e) => edit({ nameScale: Number(e.target.value) })} className="w-full accent-orange-600" />
          </Field>
        </div>
        <Field label={`Headline letter spacing (${look.titleSpacing.toFixed(2)})`}>
          <input type="range" min={-0.05} max={0.3} step={0.01} value={look.titleSpacing} onChange={(e) => edit({ titleSpacing: Number(e.target.value) })} className="w-full accent-orange-600" />
        </Field>
        <div className="grid grid-cols-3 gap-3 md:col-span-2">
          {color("Headline", "titleColor")}
          {color("Name text", "nameColor")}
          {color("Name bar", "pillColor")}
        </div>
        <Field label="Logo" hint={look.logoUrl ? "Using your own logo." : "Using the brand’s black logo."}>
          <div className="flex items-center gap-2">
            <label className={`${btnGhost} cursor-pointer !px-3 !py-1.5 text-xs`}>
              <ImagePlus size={14} /> {uploading ? "Uploading…" : "Change logo"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
            </label>
            {look.logoUrl && (
              <button onClick={() => edit({ logoUrl: "" })} className="text-xs font-medium text-neutral-500 hover:text-orange-600">
                Use brand logo
              </button>
            )}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-neutral-700 md:col-span-2">
          <input type="checkbox" checked={look.loop} onChange={(e) => edit({ loop: e.target.checked })} className="h-4 w-4 accent-orange-600" /> Loop (play again when it finishes)
        </label>
      </div>

      <p className="text-xs text-neutral-400">For the cleanest result the photo should be a PNG with the background removed — the orange silhouette and blue outline follow its shape.</p>
      <TemplateActions slide={slide} title={`Ministering — ${minister?.name}`} subtitle={"Speaker intro"} h={h} />
    </div>
  );
}
