"use client";

import { useEffect } from "react";
import { BookOpen, Check, Eye, Monitor, Quote, Sparkles, X } from "lucide-react";
import type { BibleMeta, Slide } from "@/lib/present";
import { accept, dismiss, setListenBridge, stop, useListen, type Suggestion } from "@/lib/listen/store";

interface Props {
  bibles: BibleMeta[];
  versionId: string;
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
}

// The floating part of Listen: a "hearing…" line while it listens, a card for each scripture it catches (with the
// verse text and Put on screen / Preview / Dismiss). What it heard recently lives in the "Heard" button beside the
// Scripture Box. Mounted once at page level so
// it keeps going while the operator switches tabs; it stops listening when the page closes.
export function ListenSuggestions({ bibles, versionId, onStage, onLive }: Props) {
  const L = useListen();

  // The page's Bible versions and its stage / go-live actions, for building the slides.
  useEffect(() => {
    setListenBridge({ bibles, versionId, onStage, onLive });
  }, [bibles, versionId, onStage, onLive]);
  useEffect(
    () => () => {
      setListenBridge(null);
      stop();
    },
    [],
  );

  const listening = L.status === "listening";
  if (!listening && !L.suggestions.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[75] mx-auto flex max-w-xl flex-col items-stretch gap-2.5">
      {!L.heardOpen && L.suggestions.map((s) => (
        <Card key={s.id} s={s} />
      ))}

      {listening && (
        <div className="pointer-events-auto flex items-center gap-2 self-center rounded-full bg-[#171717] py-1.5 pl-3 pr-1.5 text-xs text-[#e5e5e5] shadow-xl ring-1 ring-[rgba(255,255,255,0.12)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          <span className="max-w-[16rem] truncate sm:max-w-sm" dir="rtl" title={L.transcript}>
            <bdi>{L.transcript ? `…${L.transcript}` : "Listening… say a verse reference"}</bdi>
          </span>
        </div>
      )}
    </div>
  );
}

// A scripture the preacher NAMED ("John 3:16") is orange; one DETECTED from words they quoted without giving the
// reference ("the joy of the Lord is your strength") is violet, so the operator knows which kind of guess it is.
export const SOURCE_THEME = {
  heard: { accent: "#ea580c", hover: "#c2410c", soft: "rgba(234,88,12,.18)", text: "#fdba74", chip: "Heard" },
  detected: { accent: "#7c3aed", hover: "#6d28d9", soft: "rgba(124,58,237,.22)", text: "#c4b5fd", chip: "Detected" },
  // ...and one the AI recognised from the preacher's OWN WORDS (a paraphrase) is teal: the least certain, so "check it".
  ai: { accent: "#0d9488", hover: "#0f766e", soft: "rgba(13,148,136,.22)", text: "#5eead4", chip: "AI match" },
} as const;

function Card({ s }: { s: Suggestion }) {
  const quote = s.source === "quote";
  const para = s.source === "paraphrase";
  const th = para ? SOURCE_THEME.ai : quote ? SOURCE_THEME.detected : SOURCE_THEME.heard;
  const ring = s.auto ? "#22c55e" : th.accent;
  return (
    <div className="present-slide-up pointer-events-auto relative overflow-hidden rounded-2xl bg-[#171717] text-[#ffffff] shadow-2xl ring-1" style={{ ["--tw-ring-color" as string]: ring }} role="status">
      <div className="flex items-start gap-3 p-4 pb-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: s.auto ? "#16a34a" : th.accent }}>{s.auto ? <Check size={18} /> : para ? <Sparkles size={17} /> : quote ? <Quote size={17} /> : <BookOpen size={17} />}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold leading-tight">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ffffff]" style={{ background: s.auto ? "#16a34a" : th.accent }}>{s.auto ? "Put on screen" : th.chip}</span>
            {s.label}
            {s.version && <span className="text-xs font-normal text-[#a3a3a3]">{s.version}</span>}
          </p>
          {s.note && <p className="mt-1 text-xs" style={{ color: s.auto ? "#86efac" : th.text }}>{s.note}</p>}
          {s.text ? <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-[#e5e5e5]">“{s.text}”</p> : <p className="mt-1.5 text-xs text-[#a3a3a3]">Looking up the verse…</p>}
          {(quote || para) && s.heard && <p className="mt-1.5 line-clamp-1 text-[11px] text-[#a3a3a3]">You said: “…{s.heard.split(" ").slice(-14).join(" ")}”</p>}
        </div>
        <button onClick={() => dismiss(s.id)} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#ffffff]">
          <X size={15} />
        </button>
      </div>
      {!s.auto && (
        <div className="flex items-center gap-2 border-t border-[rgba(255,255,255,0.1)] px-4 py-2.5">
          <button onClick={() => void accept(s.id, "live")} disabled={!s.text} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold text-[#ffffff] disabled:opacity-50" style={{ background: th.accent }}>
            <Monitor size={14} /> Put on screen
          </button>
          <button onClick={() => void accept(s.id, "stage")} disabled={!s.text} className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-1.5 text-sm font-semibold text-[#ffffff] hover:bg-[rgba(255,255,255,0.22)] disabled:opacity-50">
            <Eye size={14} /> Preview
          </button>
          <span className="ml-auto text-[11px] text-[#737373]">{s.source === "verse" ? "low certainty" : para || s.confidence === "medium" ? "check it" : ""}</span>
        </div>
      )}
      <span key={s.at} className="absolute bottom-0 left-0 h-[3px]" style={{ background: s.auto ? "#22c55e" : th.accent, animation: `toast-bar ${s.auto ? 7000 : 25000}ms linear forwards` }} />
    </div>
  );
}
