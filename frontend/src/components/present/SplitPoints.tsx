"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { BODY_PX, type PresentState, type SplitPage } from "@/lib/present";

// The left half of the split screen: key points typed in the Split tab. Fixed size; it only steps down if the points
// would overflow the panel.
export function SplitPoints({ page, title, style, dark }: { page: SplitPage; title?: string; style: PresentState["style"]; dark: boolean }) {
  const weight = style.weight || 500;
  const color = dark ? "#18181b" : "#ffffff";

  const content = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    const el = content.current;
    if (!el) return;
    let size = BODY_PX * style.scale;
    el.style.fontSize = `${size}px`;
    for (let i = 0; i < 45 && size > 18 && el.scrollHeight > el.clientHeight + 1; i++) {
      size = Math.floor(size * 0.94);
      el.style.fontSize = `${size}px`;
    }
  }, [style.scale]);
  useLayoutEffect(() => {
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
  }, [fit, page, title, weight, style.font]);

  return (
    <div className="absolute overflow-hidden rounded-[36px]" style={{ left: 60, top: 60, width: 870, height: 960, background: dark ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.38)", backdropFilter: "blur(14px)", border: `2px solid ${dark ? "rgba(24,24,27,.15)" : "rgba(255,255,255,.22)"}` }}>
      <div ref={content} className="absolute inset-0 flex flex-col justify-center overflow-hidden" style={{ padding: "56px 64px", color, textAlign: "left" }}>
        {title && <p style={{ fontSize: "0.5em", letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, fontWeight: 700, marginBottom: "0.5em" }}>{title}</p>}
        {page.heading && <p style={{ fontSize: "1.15em", lineHeight: 1.1, fontWeight: Math.min(900, weight + 200), marginBottom: "0.45em" }}>{page.heading}</p>}
        <ul style={{ display: "flex", flexDirection: "column", gap: "0.45em" }}>
          {page.points.map((pt, i) => (
            <li key={i} style={{ display: "flex", gap: "0.5em", lineHeight: 1.22, fontWeight: weight }}>
              <span style={{ width: "0.42em", height: "0.42em", marginTop: "0.45em", flexShrink: 0, borderRadius: 9999, background: "var(--color-orange-500, #f97316)" }} />
              <span>{pt}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
