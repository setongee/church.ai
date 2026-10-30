"use client";

import { useEffect, useState } from "react";
import { loadFont } from "@/lib/fonts";
import { DEFAULT_ALERT_STYLE, type PresentAlert } from "@/lib/present";

const SPEED = { slow: 1.6, normal: 1, fast: 0.6 } as const;

// The alert banner on the output: one message with an entrance effect, several taking turns, or a scrolling ticker.
// Which message shows is worked out from the clock and the alert's start time, so the output and the controller's
// monitor always agree.
export function AlertBanner({ alert }: { alert: PresentAlert }) {
  const st = { ...DEFAULT_ALERT_STYLE, ...(alert.style ?? {}) };
  const texts = (alert.texts?.length ? alert.texts : [alert.text]).filter(Boolean);
  const interval = Math.max(2, alert.seconds ?? 6);
  const rotating = texts.length > 1 && st.effect !== "scroll";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [rotating]);
  useEffect(() => {
    if (st.font) void loadFont(st.font);
  }, [st.font]);

  const idx = rotating ? Math.floor((now - (alert.startedAt ?? 0)) / (interval * 1000)) % texts.length : 0;
  const shown = texts[Math.max(0, idx)] ?? "";
  const ticker = texts.join("      •      ");
  const duration = Math.max(10, ticker.length * 0.2) * SPEED[st.speed];
  const justify = st.position === "top" ? "items-start" : st.position === "middle" ? "items-center" : "items-end";

  return (
    <div className={`pointer-events-none absolute inset-0 flex ${justify}`}>
      <div
        key={`${alert.id}-${st.effect}-${rotating ? idx : 0}`}
        className={`alert-fx-${st.effect} flex w-full items-center overflow-hidden px-24 py-9 ${st.align === "left" || st.effect === "scroll" ? "justify-start" : "justify-center"}`}
        style={{ background: st.bg, color: st.color, minHeight: st.height || undefined, fontFamily: st.font ? `"${st.font}", system-ui, sans-serif` : undefined, fontWeight: st.weight, fontSize: st.size, lineHeight: 1.15, textAlign: st.align, textTransform: st.uppercase ? "uppercase" : undefined, boxShadow: st.position === "middle" ? undefined : st.position === "top" ? "0 12px 40px rgba(0,0,0,.35)" : "0 -12px 40px rgba(0,0,0,.35)" }}
      >
        {st.effect === "scroll" ? (
          <span className="alert-ticker" style={{ ["--alert-d" as string]: `${duration}s` }}>
            {ticker}
          </span>
        ) : (
          <p>{shown}</p>
        )}
      </div>
    </div>
  );
}
