"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, FileUp, Loader2, Trash2 } from "lucide-react";
import { downloadBible, importBible, listBibles, removeBible, type BibleMeta } from "@/lib/present";
import { useAuth } from "@/components/AuthProvider";
import { btnGhost, btnPrimary, Field, inputCls, Modal } from "./ui";

const LANGS: Record<string, string> = { en: "English", es: "Spanish", pt: "Portuguese", fr: "French", de: "German", it: "Italian", ru: "Russian", sw: "Swahili", zh: "Chinese", tl: "Tagalog" };

// Download free translations on demand, remove ones you don't need, or import your own XML.
export function BibleManager({ onClose, onChanged }: { onClose: () => void; onChanged: (installed: BibleMeta[], addedId?: string) => void }) {
  // Offline mode has no catalogue to download from: a Bible is added from an XML file and kept on this device.
  const { offlineMode } = useAuth();
  const [tab, setTab] = useState<"get" | "installed" | "import">(offlineMode ? "import" : "get");
  const [installed, setInstalled] = useState<BibleMeta[]>([]);
  const [available, setAvailable] = useState<BibleMeta[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState("en");
  const [form, setForm] = useState({ name: "", abbr: "" });
  const file = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File | null>(null);

  async function load(addedId?: string) {
    const r = await listBibles();
    setInstalled(r.installed);
    setAvailable(r.available);
    onChanged(r.installed, addedId);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(key: string, fn: () => Promise<unknown>, addedId?: string) {
    setBusy(key);
    setError("");
    try {
      await fn();
      await load(addedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const langs = [...new Set(available.map((b) => b.lang))];
  const shown = available.filter((b) => b.lang === lang);

  return (
    <Modal title="Bibles" onClose={onClose} wide>
      <div className="mb-4 flex gap-1 rounded-xl bg-neutral-100 p-1">
        {(
          [
            ["get", "Download"],
            ["installed", `Installed (${installed.length})`],
            ["import", offlineMode ? "Add from XML" : "Import XML"],
          ] as const
        )
          .filter(([k]) => !(offlineMode && k === "get"))
          .map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === k ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === "get" && (
        <>
          {langs.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {langs.map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${l === lang ? "bg-orange-600 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                  {LANGS[l] || l}
                </button>
              ))}
            </div>
          )}
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-100">
            {shown.length === 0 && <p className="p-6 text-center text-sm text-neutral-400">Everything in this language is already installed.</p>}
            {shown.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-16 shrink-0 text-sm font-bold text-neutral-900">{b.abbr}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-neutral-800">{b.name}</span>
                  <span className="block text-xs text-neutral-400">{b.license}</span>
                </span>
                <button onClick={() => run(b.id, () => downloadBible(b.id), b.id)} disabled={!!busy} className={btnGhost}>
                  {busy === b.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  {busy === b.id ? "Installing…" : "Download"}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-400">
            These are public-domain or openly licensed. NIV, ESV, NKJV, NLT, GNT, TPT and AMPC are copyrighted and can’t be downloaded here — if your church holds a license, import that copy’s XML under “Import XML”.
          </p>
        </>
      )}

      {tab === "installed" && (
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-100">
          {installed.length === 0 && <p className="p-6 text-center text-sm text-neutral-400">Nothing installed yet.</p>}
          {installed.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3">
              <Check size={16} className="shrink-0 text-green-600" />
              <span className="w-16 shrink-0 text-sm font-bold text-neutral-900">{b.abbr}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                {b.name}
                {b.verses ? <span className="ml-2 text-xs text-neutral-400">{b.verses.toLocaleString()} verses</span> : null}
              </span>
              {b.source === "local" && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">This device</span>}
              {(!offlineMode || b.source === "local") && (
              <button
                onClick={() => confirm(`Remove ${b.abbr}?${b.source === "local" ? " It was added on this device only, so you would need the file again to add it back." : " You can download it again later."}`) && run(b.id, () => removeBible(b.id))}
                disabled={!!busy}
                aria-label={`Remove ${b.abbr}`}
                className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={16} />
              </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "import" && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            Add any Bible in <b>Zefania</b>, <b>OSIS</b>, <b>USFX</b> or <b>OpenSong (.xmm)</b> — from the Zefania / OSIS collections, or a licensed module you own.
            {offlineMode && " It is read on this computer and kept here, so it works with no internet."}
          </p>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="New King James Version" className={inputCls} />
            </Field>
            <Field label="Abbreviation">
              <input value={form.abbr} onChange={(e) => setForm({ ...form, abbr: e.target.value })} placeholder="NKJV" className={inputCls} />
            </Field>
          </div>
          <input ref={file} type="file" accept=".xml,.xmm,text/xml,application/xml" hidden onChange={(e) => setChosen(e.target.files?.[0] ?? null)} />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => file.current?.click()} className={btnGhost}>
              <FileUp size={16} /> {chosen ? chosen.name : "Choose XML / XMM file"}
            </button>
            <button
              disabled={!chosen || !(form.name || form.abbr) || !!busy}
              onClick={() =>
                run("import", async () => {
                  await importBible(chosen!, form.name, form.abbr);
                  setForm({ name: "", abbr: "" });
                  setChosen(null);
                  setTab("installed");
                })
              }
              className={btnPrimary}
            >
              {busy === "import" ? <Loader2 size={16} className="animate-spin" /> : null}
              {busy === "import" ? "Importing…" : "Import Bible"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
