"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, RotateCcw, Save } from "lucide-react";
import { getBrand } from "@/lib/api";
import type { Brand } from "@/lib/types";
import { uploadMedia, type Slide } from "@/lib/present";
import { darken, GIVING_THEMES } from "./GivingPromo";
import { TemplateActions, type TemplateHandlers } from "./TemplateActions";
import { btnGhost, btnPrimary, Field, inputCls } from "./ui";

// Blank text = use the brand's value.
interface Look {
  accountNo: string;
  accountName: string;
  bankName: string;
  heading: string;
  theme: string;
  custom: { main: string; dark: string; glow: string };
  logoUrl: string;
  loop: boolean;
}
const DEFAULT_LOOK: Look = { accountNo: "", accountName: "", bankName: "", heading: "Offering\nand\nTithe", theme: "blue", custom: { main: "#1d45b8", dark: "#0a2373", glow: "#7ac143" }, logoUrl: "", loop: true };
const STORE = "giving-look";

function loadLook(): Look {
  try {
    return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(STORE) || "{}") };
  } catch {
    return DEFAULT_LOOK;
  }
}

// The Offering and Tithe overlay. Account details default to the brand's bank details.
export function GivingPanel(h: TemplateHandlers) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState("");
  const [look, setLook] = useState<Look>(loadLook);
  const [saved, setSaved] = useState<Look>(loadLook);
  const [uploading, setUploading] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    getBrand().then(setBrand).catch((e) => setError(e.message));
  }, []);

  const dirty = JSON.stringify(look) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(look) === JSON.stringify(DEFAULT_LOOK);
  const accountNo = look.accountNo || (brand?.accountNumber ?? "");
  const accountName = look.accountName || (brand?.accountName ?? "");
  const bankName = look.bankName || (brand?.bankName ?? "");

  const slide = useMemo<Slide | null>(() => {
    if (!accountNo) return null;
    const t = look.theme === "custom" ? null : GIVING_THEMES[look.theme] ?? GIVING_THEMES.blue;
    const c = look.custom;
    return {
      kind: "giving",
      accountNo,
      accountName,
      bankName,
      heading: look.heading,
      logoUrl: look.logoUrl,
      c1: t ? t[1] : c.main,
      c2: t ? t[2] : c.dark,
      c3: t ? t[3] : darken(c.dark, 0.5),
      hi: t ? t[4] : c.glow,
      loop: look.loop,
    };
  }, [accountNo, accountName, bankName, look]);

  useEffect(() => {
    if (slide && touched.current) h.onStage(slide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  const edit = (p: Partial<Look>) => {
    touched.current = true;
    setLook((l) => ({ ...l, ...p }));
  };
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(look));
    } catch {}
    setSaved(look);
  }
  function reset() {
    touched.current = true;
    try {
      localStorage.removeItem(STORE);
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

  return (
    <div className="h-full w-full space-y-4 overflow-y-auto pb-4">
      <p className="text-sm text-neutral-500">The account bar and phone panel slide over whatever background is on screen. Details come from your Brand; change them here if needed.</p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {!accountNo && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">No account number yet — add bank details under Church Profile, or type one below.</p>}

      <div className="grid content-start gap-4 rounded-xl bg-white p-4 md:grid-cols-2">
        <div className="flex items-center justify-between md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Details &amp; look</span>
          <div className="flex gap-1.5">
            <button onClick={reset} disabled={isDefault && !dirty} className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}>
              <RotateCcw size={13} /> Reset
            </button>
            <button onClick={save} disabled={!dirty} className={`${btnPrimary} !px-2.5 !py-1.5 text-xs`}>
              <Save size={13} /> {dirty ? "Save edits" : "Saved"}
            </button>
          </div>
        </div>
        <Field label="Account number">
          <input value={look.accountNo} placeholder={brand?.accountNumber} onChange={(e) => edit({ accountNo: e.target.value.replace(/[^\d ]/g, "").slice(0, 14) })} inputMode="numeric" className={`${inputCls} text-lg font-bold tracking-wide`} />
        </Field>
        <Field label="Account name">
          <input value={look.accountName} placeholder={brand?.accountName} onChange={(e) => edit({ accountName: e.target.value })} maxLength={120} className={inputCls} />
        </Field>
        <Field label="Bank name">
          <input value={look.bankName} placeholder={brand?.bankName} onChange={(e) => edit({ bankName: e.target.value })} maxLength={60} className={inputCls} />
        </Field>
        <Field label="Heading" hint="One word per line works best.">
          <textarea value={look.heading} onChange={(e) => edit({ heading: e.target.value })} rows={3} maxLength={80} className={inputCls} />
        </Field>
        <Field label="Colours" className="md:col-span-2">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {Object.entries(GIVING_THEMES).map(([k, v]) => (
                <button key={k} type="button" title={v[0]} aria-label={v[0]} aria-pressed={look.theme === k} onClick={() => edit({ theme: k })} className={`h-8 w-8 rounded-full border-2 ${look.theme === k ? "border-neutral-900" : "border-neutral-200"}`} style={{ background: `linear-gradient(135deg,${v[1]},${v[3]})` }} />
              ))}
              <button type="button" aria-pressed={look.theme === "custom"} onClick={() => edit({ theme: "custom" })} className={`rounded-full border-2 px-3 text-xs font-medium ${look.theme === "custom" ? "border-neutral-900" : "border-neutral-200"}`}>
                Custom
              </button>
            </div>
            {look.theme === "custom" && (
              <div className="flex gap-4">
                {(["main", "dark", "glow"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs capitalize text-neutral-500">
                    <input type="color" value={look.custom[k]} onChange={(e) => edit({ custom: { ...look.custom, [k]: e.target.value } })} className="h-8 w-10 cursor-pointer rounded-md border border-neutral-200 bg-white p-0.5" />
                    {k}
                  </label>
                ))}
              </div>
            )}
          </div>
        </Field>
        <Field label="Bank logo" hint={look.logoUrl ? "Using your logo." : "Until you add the official logo, the bank name shows in its place."}>
          <div className="flex items-center gap-2">
            <label className={`${btnGhost} cursor-pointer !px-3 !py-1.5 text-xs`}>
              <ImagePlus size={14} /> {uploading ? "Uploading…" : "Upload logo"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
            </label>
            {look.logoUrl && (
              <button onClick={() => edit({ logoUrl: "" })} className="text-xs font-medium text-neutral-500 hover:text-orange-600">
                Remove
              </button>
            )}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-neutral-700 md:col-span-2">
          <input type="checkbox" checked={look.loop} onChange={(e) => edit({ loop: e.target.checked })} className="h-4 w-4 accent-orange-600" /> Loop (keeps repeating while on screen)
        </label>
      </div>

      <TemplateActions slide={slide} title={"Offering and Tithe"} subtitle={bankName} h={h} />
    </div>
  );
}
