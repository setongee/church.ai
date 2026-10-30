"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, RotateCcw, Save, X } from "lucide-react";
import { getBrand } from "@/lib/api";
import type { Brand } from "@/lib/types";
import { mediaSrc, uploadMedia, type Slide } from "@/lib/present";
import { FontPicker } from "@/components/editor/FontPicker";
import { TemplateActions, type TemplateHandlers } from "./TemplateActions";
import { btnGhost, btnPrimary, Field, inputCls } from "./ui";

interface Look {
  script: string;
  main: string;
  badgeTop: string;
  badgeNum: string;
  badgeColor: string;
  marquee: string;
  speed: number;
  logoGap: number;
  marqueeGap: number;
  scriptFont: string;
  mainFont: string;
  badgeFont: string;
  marqueeFont: string;
  logoUrl: string; // "" = the brand logo
  bgUrl: string;
  photos: string[];
}
const DEFAULT_LOOK: Look = { script: "Welcome to", main: "Church", badgeTop: "Day", badgeNum: "1", badgeColor: "#d4131b", marquee: "Service will begin shortly", speed: 3, logoGap: 0.6, marqueeGap: 0, scriptFont: "", mainFont: "", badgeFont: "", marqueeFont: "", logoUrl: "", bgUrl: "", photos: [] };
const STORE = "welcome-look";

function loadLook(): Look {
  try {
    return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(STORE) || "{}") };
  } catch {
    return DEFAULT_LOOK;
  }
}

// The "Welcome to Church" holding screen: photo carousel, scrolling line and a day badge. Texts, photos,
// logo and background are all editable; the logo defaults to the brand's light logo (the screen is dark).
export function WelcomePanel(h: TemplateHandlers) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState("");
  const [look, setLook] = useState<Look>(loadLook);
  const [saved, setSaved] = useState<Look>(loadLook);
  const [busy, setBusy] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    getBrand().then(setBrand).catch((e) => setError(e.message));
  }, []);

  const dirty = JSON.stringify(look) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(look) === JSON.stringify(DEFAULT_LOOK);
  const logoUrl = look.logoUrl || brand?.logoLightUrl || brand?.logoUrl || "";

  const slide = useMemo<Slide>(
    () => ({ kind: "welcome", script: look.script, main: look.main, badgeTop: look.badgeTop, badgeNum: look.badgeNum, badgeColor: look.badgeColor, marquee: look.marquee, logoUrl, bgUrl: look.bgUrl, photos: look.photos, speed: look.speed, logoGap: look.logoGap, marqueeGap: look.marqueeGap, scriptFont: look.scriptFont, mainFont: look.mainFont, badgeFont: look.badgeFont, marqueeFont: look.marqueeFont }),
    [look, logoUrl],
  );

  useEffect(() => {
    if (touched) h.onStage(slide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  const edit = (p: Partial<Look>) => {
    setTouched(true);
    setLook((l) => ({ ...l, ...p }));
  };
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(look));
    } catch {}
    setSaved(look);
  }
  function reset() {
    setTouched(true);
    try {
      localStorage.removeItem(STORE);
    } catch {}
    setLook(DEFAULT_LOOK);
    setSaved(DEFAULT_LOOK);
  }
  async function upload(files: File[], then: (urls: string[]) => void, what: string) {
    if (!files.length) return;
    setBusy(what);
    try {
      const urls: string[] = [];
      for (const f of files) urls.push((await uploadMedia(f, "media")).url);
      then(urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy("");
    }
  }
  function move(i: number, dir: number) {
    const j = i + dir;
    if (j < 0 || j >= look.photos.length) return;
    const p = [...look.photos];
    [p[i], p[j]] = [p[j], p[i]];
    edit({ photos: p });
  }

  if (!brand && !error) return <p className="p-4 text-sm text-neutral-400">Loading…</p>;

  const text = (label: string, key: "script" | "main" | "badgeTop" | "badgeNum" | "marquee", max = 60) => (
    <Field label={label}>
      <input value={look[key]} onChange={(e) => edit({ [key]: e.target.value })} maxLength={max} className={inputCls} />
    </Field>
  );
  const pick = (label: string, current: string, onFiles: (f: File[]) => void, onClear: () => void, multiple = false) => (
    <div className="flex items-center gap-2">
      <label className={`${btnGhost} cursor-pointer !px-3 !py-1.5 text-xs`}>
        <ImagePlus size={14} /> {busy === label ? "Uploading…" : label}
        <input type="file" accept="image/*" multiple={multiple} className="hidden" onChange={(e) => (onFiles(Array.from(e.target.files ?? [])), (e.target.value = ""))} />
      </label>
      {current && (
        <button onClick={onClear} className="text-xs font-medium text-neutral-500 hover:text-orange-600">
          Remove
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full w-full space-y-4 overflow-y-auto pb-4">
      <p className="text-sm text-neutral-500">A looping holding screen for before the service: photos rotate in the centre while the line scrolls along the bottom.</p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

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
        <div className="grid grid-cols-2 gap-3">
          {text("Script line", "script")}
          {text("Main word", "main", 24)}
          {text("Badge label", "badgeTop", 10)}
          {text("Badge number", "badgeNum", 4)}
        </div>
        <p className="-mt-2 text-xs text-neutral-400 md:col-span-2">Leave both badge fields empty to hide the badge.</p>
        <div className="md:col-span-2">{text("Scrolling text", "marquee", 120)}</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Badge colour">
            <input type="color" value={look.badgeColor} onChange={(e) => edit({ badgeColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg bg-white p-1" />
          </Field>
          <Field label={`Seconds per photo (${look.speed})`}>
            <input type="range" min={1.5} max={12} step={0.5} value={look.speed} onChange={(e) => edit({ speed: Number(e.target.value) })} className="w-full accent-orange-600" />
          </Field>
        </div>
        <Field label={`Space between logo and script line (${look.logoGap.toFixed(1)})`}>
          <input type="range" min={-1} max={6} step={0.1} value={look.logoGap} onChange={(e) => edit({ logoGap: Number(e.target.value) })} className="w-full accent-orange-600" />
        </Field>
        <Field label={`Space between photos and scrolling text (${look.marqueeGap.toFixed(1)})`}>
          <input type="range" min={-3} max={3} step={0.1} value={look.marqueeGap} onChange={(e) => edit({ marqueeGap: Number(e.target.value) })} className="w-full accent-orange-600" />
        </Field>
        <Field label="Fonts" hint="Each part can have its own font. “Default” keeps the template’s font." className="md:col-span-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {(
              [
                ["Script line", "scriptFont"],
                ["Main word", "mainFont"],
                ["Badge", "badgeFont"],
                ["Scrolling text", "marqueeFont"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-20 shrink-0 text-xs text-neutral-500">{label}</span>
                <FontPicker value={look[key] || "Default"} onChange={(f) => edit({ [key]: f === "Default" ? "" : f })} className="min-w-0 flex-1" />
                {look[key] && (
                  <button aria-label={`Reset ${label} font`} title="Back to default" onClick={() => edit({ [key]: "" })} className="text-neutral-400 hover:text-orange-600">
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Field>
        <Field label="Logo" hint={look.logoUrl ? "Using your own logo." : "Using the brand’s light logo."}>
          {pick("Change logo", look.logoUrl, (f) => upload(f, (u) => edit({ logoUrl: u[0] }), "Change logo"), () => edit({ logoUrl: "" }))}
        </Field>
        <Field label="Background photo" hint="Shown dark and blurred behind everything.">
          {pick("Add background", look.bgUrl, (f) => upload(f.slice(0, 1), (u) => edit({ bgUrl: u[0] }), "Add background"), () => edit({ bgUrl: "" }))}
        </Field>
        <Field className="md:col-span-2" label={`Photos (${look.photos.length})`} hint={look.photos.length ? "They rotate in this order. Portrait or square photos crop best." : "No photos yet — placeholder cards show until you add some."}>
          <div className="space-y-3">
            {pick("Add photos", "", (f) => upload(f, (u) => edit({ photos: [...look.photos, ...u].slice(0, 30) }), "Add photos"), () => {}, true)}
            {look.photos.length > 0 && (
              <>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {look.photos.map((u, i) => (
                    <div key={u + i} className="relative aspect-[4/5] overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 bg-cover bg-center" style={{ backgroundImage: `url("${mediaSrc(u)}")` }}>
                      <div className="absolute inset-x-1 bottom-1 flex justify-between">
                        <button aria-label="Move earlier" onClick={() => move(i, -1)} className="rounded bg-black/60 p-0.5 text-white"><ChevronLeft size={12} /></button>
                        <button aria-label="Remove photo" onClick={() => edit({ photos: look.photos.filter((_, k) => k !== i) })} className="rounded bg-black/60 p-0.5 text-white"><X size={12} /></button>
                        <button aria-label="Move later" onClick={() => move(i, 1)} className="rounded bg-black/60 p-0.5 text-white"><ChevronRight size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => edit({ photos: [] })} className="text-xs font-medium text-neutral-500 hover:text-orange-600">Remove all photos</button>
              </>
            )}
          </div>
        </Field>
      </div>

      <TemplateActions slide={slide} title={`${look.script} ${look.main}`.trim()} subtitle="Holding screen" h={h} />
    </div>
  );
}
