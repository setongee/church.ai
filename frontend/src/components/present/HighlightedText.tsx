import type { Highlight } from "@/lib/present";

// Splits `text` into plain and highlighted runs. Overlaps are resolved in favour of the later range.
export function highlightSegments(text: string, highlights?: Highlight[]) {
  const marks = (highlights ?? []).filter((h) => h.end > h.start && h.start < text.length).sort((a, b) => a.start - b.start);
  const out: { start: number; end: number; color?: string; index?: number }[] = [];
  let at = 0;
  marks.forEach((h, index) => {
    const start = Math.max(h.start, at);
    const end = Math.min(h.end, text.length);
    if (end <= start) return;
    if (start > at) out.push({ start: at, end: start });
    out.push({ start, end, color: h.color, index });
    at = end;
  });
  if (at < text.length) out.push({ start: at, end: text.length });
  return out;
}

// Scripture text with its highlights painted behind the words. Used on the output screen; the highlight
// editor renders its own interactive version of the same runs.
export function HighlightedText({ text, highlights }: { text: string; highlights?: Highlight[] }) {
  if (!highlights?.length) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, highlights).map((s) =>
        s.color ? (
          <mark key={s.start} style={{ background: s.color, color: "#18181b", textShadow: "none", borderRadius: "0.14em", padding: "0 0.1em", margin: "0 -0.1em", WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }}>
            {text.slice(s.start, s.end)}
          </mark>
        ) : (
          <span key={s.start}>{text.slice(s.start, s.end)}</span>
        ),
      )}
    </>
  );
}
