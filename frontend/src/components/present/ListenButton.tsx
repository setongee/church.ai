"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Loader2, Mic, Square } from "lucide-react";
import { engineInfo, resumeListening, setAiParaphrase, setDevice, setEngine, setMode, start, stop, useListen, type EngineId } from "@/lib/listen/store";

// "Listen" for the Present header: hears the preacher and offers the scriptures it catches (see ListenSuggestions).
export function ListenButton() {
  const L = useListen();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const on = L.status !== "off" && L.status !== "error";
  useEffect(() => resumeListening(), []); // after a refresh, pick up where it was

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setDevices(d.filter((x) => x.kind === "audioinput")))
      .catch(() => {});
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const engines = engineInfo();
  const main = engines.filter((e) => e.id === "server"); // Deepgram first
  const rest = engines.filter((e) => e.id !== "server");
  const [more, setMore] = useState(false);
  const showMore = more || L.engine !== "server"; // keep the chosen one in sight
  const EngineCard = ({ e }: { e: (typeof engines)[number] }) => (
    <button
      disabled={Boolean(e.unavailable)}
      onClick={() => setEngine(e.id as EngineId)}
      aria-pressed={L.engine === e.id}
      className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${L.engine === e.id ? "bg-orange-50 ring-1 ring-orange-200" : "hover:bg-neutral-50"} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${L.engine === e.id ? "border-orange-500 bg-orange-500 text-[#ffffff]" : "border-neutral-300"}`}>{L.engine === e.id && <Check size={11} />}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-neutral-900">{e.label}</span>
        <span className="block text-xs leading-snug text-neutral-500">{e.unavailable || e.blurb}</span>
      </span>
    </button>
  );
  const label = L.status === "loading" ? (L.progress ? `Getting ready ${L.progress}%` : "Getting ready…") : L.status === "starting" ? "Starting…" : on ? (L.reconnecting ? "Reconnecting…" : "Listening") : "Listen";

  return (
    <div ref={box} className="relative">
      <div className={`inline-flex items-center overflow-hidden rounded-xl border text-sm font-medium transition ${on ? "border-[#86efac] bg-[#dcfce7] text-[#166534]" : L.status === "error" ? "border-red-200 bg-white text-red-700" : "border-neutral-200 bg-white text-neutral-700 hover:border-orange-300"}`}>
        <button
          onClick={() => (on ? stop() : void start())}
          aria-pressed={on}
          title={on ? "Stop listening" : "Listen for scriptures the preacher mentions and offer to show them"}
          className="inline-flex items-center gap-2 px-3 py-2"
        >
          {L.status === "starting" || L.status === "loading" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : on ? (
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-40" />
              <Mic size={15} className="relative" />
            </span>
          ) : L.status === "error" ? (
            <AlertCircle size={16} />
          ) : (
            <Mic size={16} />
          )}
          {label}
        </button>
        <button onClick={() => setOpen((o) => !o)} aria-label="Listening settings" aria-expanded={open} className={`border-l px-2 py-2 ${on ? "border-[#86efac]" : "border-neutral-200"}`}>
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {L.status === "error" && !open && (
        <p className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl bg-red-600 px-3 py-2 text-xs leading-snug text-[#ffffff] shadow-lg">
          {L.error}{" "}
          <button onClick={() => setOpen(true)} className="font-semibold underline">
            Change engine
          </button>
        </p>
      )}

      {open && (
        <div role="dialog" aria-label="Listening settings" className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-neutral-100 bg-white p-3 shadow-xl">
          <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-400">How should it listen?</p>
          <div className="space-y-1.5">
            {main.map((e) => (
              <EngineCard key={e.id} e={e} />
            ))}
            {rest.length > 0 && (
              <>
                <button onClick={() => setMore((m) => !m)} aria-expanded={showMore} className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-50 hover:text-orange-600">
                  More options
                  <ChevronDown size={14} className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
                </button>
                {showMore && rest.map((e) => <EngineCard key={e.id} e={e} />)}
              </>
            )}
          </div>

          <label className="mt-3 block px-1">
              <span className="mb-1 block text-xs font-semibold text-neutral-500">Microphone</span>
              <select value={L.deviceId} onChange={(e) => setDevice(e.target.value)} className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-900 outline-none focus:border-orange-400">
                <option value="">Default microphone</option>
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-neutral-400">For the best results use a line from the sound desk, not the laptop’s own mic.</span>
          </label>

          <button onClick={() => setAiParaphrase(!L.aiParaphrase)} role="switch" aria-checked={L.aiParaphrase} className="mt-3 flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-neutral-50">
            <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${L.aiParaphrase ? "bg-[#0d9488]" : "bg-neutral-300"}`}>
              <span className={`h-4 w-4 rounded-full bg-white shadow transition ${L.aiParaphrase ? "translate-x-4" : ""}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-900">AI paraphrase detection</span>
              <span className="block text-xs leading-snug text-neutral-500">When the preacher quotes in their own words (“the Bible says…”), the AI finds the verse. The sentence is sent to the AI; a few cents a service.</span>
              {L.aiNote && <span className="mt-1 block text-xs font-medium text-red-600">{L.aiNote}</span>}
            </span>
          </button>

          <p className="mb-1.5 mt-4 px-1 text-[11px] font-bold uppercase tracking-widest text-neutral-400">When it hears a scripture</p>
          <div className="grid grid-cols-2 gap-1.5 px-0.5">
            {(
              [
                ["ask", "Ask me first", "Offers it; you tap to show"],
                ["auto", "Show it automatically", "Only clear ones, like John 3:16"],
              ] as const
            ).map(([id, title, hint]) => (
              <button key={id} onClick={() => setMode(id)} aria-pressed={L.mode === id} className={`rounded-xl px-3 py-2 text-left transition ${L.mode === id ? "bg-orange-50 ring-1 ring-orange-200" : "bg-neutral-50 hover:bg-neutral-100"}`}>
                <span className={`block text-sm font-semibold ${L.mode === id ? "text-orange-700" : "text-neutral-900"}`}>{title}</span>
                <span className="block text-[11px] leading-snug text-neutral-500">{hint}</span>
              </button>
            ))}
          </div>
          {L.mode === "auto" && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">Automatic mode puts a verse on the live screen as soon as a complete reference is heard. Speech recognition can mishear, so keep an eye on the output. Anything less certain is still only offered.</p>}

          <button onClick={() => (on ? stop() : void start())} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${on ? "bg-[#171717] text-[#ffffff] hover:bg-[#404040]" : "bg-orange-600 text-[#ffffff] hover:bg-orange-700"}`}>
            {on ? (
              <>
                <Square size={14} fill="currentColor" /> Stop listening
              </>
            ) : (
              <>
                <Mic size={15} /> Start listening
              </>
            )}
          </button>
          {L.status === "error" && <p className="mt-2 text-xs text-red-600">{L.error}</p>}
        </div>
      )}
    </div>
  );
}
