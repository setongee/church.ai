"use client";

import type { CSSProperties } from "react";
import { DEFAULT_TRANSLATION_LOOK, isTranslationLine, type EffectId, type TextEffect, type TranslationLook } from "@/lib/present";

// One cycle, in seconds, at normal speed. "rise" is the length of a single line's entrance.
const BASE_SECONDS: Record<EffectId, number> = { pulse: 2.4, glow: 3, neon: 2.6, outline: 2.8, shimmer: 3.4, float: 4, rise: 0.9, wave: 1.8 };
const SPEED: Record<string, number> = { slow: 1.6, normal: 1, fast: 0.6 };

// A song's lyrics with an optional motion effect. With no effect it's just the paragraph it always was.
export function FxText({ text, effect, base = "#ffffff", className = "", style }: { text: string; effect?: TextEffect | null; base?: string; className?: string; style?: CSSProperties }) {
  if (!effect) {
    return (
      <p className={className} style={style}>
        {text}
      </p>
    );
  }
  const seconds = BASE_SECONDS[effect.id] * (SPEED[effect.speed ?? "normal"] ?? 1);
  const vars = { "--fx-d": `${seconds}s`, "--fx-c": effect.color ?? "#fde68a", "--fx-base": base } as CSSProperties;
  const lines = text.split("\n");

  if (effect.id === "rise") {
    // Each line enters on its own, one after the other (replays whenever the slide changes).
    return (
      <p className={className} style={{ ...style, ...vars }}>
        {lines.map((l, i) => (
          <span key={i} className="fx-line" style={{ animationDelay: `${i * 0.35}s` }}>
            {l || " "}
          </span>
        ))}
      </p>
    );
  }
  if (effect.id === "wave") {
    let n = 0;
    return (
      <p className={className} style={{ ...style, ...vars }}>
        {lines.map((l, li) => (
          <span key={li} className="block">
            {l.split(/(\s+)/).map((w, wi) =>
              /^\s+$/.test(w) ? (
                <span key={wi}> </span>
              ) : (
                <span key={wi} className="inline-block whitespace-nowrap">
                  {Array.from(w).map((ch, ci) => (
                    <span key={ci} className="fx-letter" style={{ animationDelay: `${(n++ * 0.07).toFixed(2)}s` }}>
                      {ch}
                    </span>
                  ))}
                </span>
              ),
            )}
            {!l && " "}
          </span>
        ))}
      </p>
    );
  }
  return (
    <p className={`${className} fx-${effect.id}`} style={{ ...style, ...vars }}>
      {text}
    </p>
  );
}

// Song lyrics where "(…)" lines are translations: those are set smaller, in their own colour, under the lyric line, and never
// get the motion effect. Without any translation line this is exactly FxText.
export function SongText({ text, effect, base = "#ffffff", className = "", style, look }: { text: string; effect?: TextEffect | null; base?: string; className?: string; style?: CSSProperties; look?: TranslationLook }) {
  const lines = text.split("\n");
  if (!lines.some(isTranslationLine)) return <FxText text={text} effect={effect} base={base} className={className} style={style} />;
  const l = { ...DEFAULT_TRANSLATION_LOOK, ...look };
  const segments: { tr: boolean; lines: string[] }[] = [];
  for (const line of lines) {
    const tr = isTranslationLine(line);
    const last = segments[segments.length - 1];
    if (last && last.tr === tr) last.lines.push(line);
    else segments.push({ tr, lines: [line] });
  }
  return (
    <div className={className} style={style}>
      {segments.map((seg, i) =>
        seg.tr ? (
          <p key={i} style={{ fontSize: `${l.scale}em`, lineHeight: 1.2, margin: "0.12em 0 0.35em", fontStyle: l.italic ? "italic" : "normal", ...(l.color ? { color: l.color } : { opacity: 0.8 }) }}>
            {seg.lines.map((x) => x.trim()).join("\n")}
          </p>
        ) : (
          <FxText key={i} text={seg.lines.join("\n")} effect={effect} base={base} className="whitespace-pre-line" />
        ),
      )}
    </div>
  );
}
