"use client";

import type { CSSProperties, ReactNode } from "react";
import { ANNOUNCEMENT_TEMPLATES, mediaSrc, type Slide } from "@/lib/present";

type TextSlide = Extract<Slide, { kind: "text" }>;

// Text sizes on the 1920x1080 screen, stepped down as the words get longer.
const titlePx = (len: number, big: number) => (len <= 14 ? big : len <= 24 ? big * 0.8 : len <= 40 ? big * 0.64 : len <= 64 ? big * 0.5 : big * 0.4);
const bodyPx = (len: number) => (len <= 90 ? 56 : len <= 200 ? 46 : len <= 360 ? 38 : len <= 560 ? 32 : 27);

const fill: CSSProperties = { position: "absolute", inset: 0 };
const WHITE = "#ffffff";

function Img({ url, style }: { url: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaSrc(url)} alt="" style={{ objectFit: "cover", ...style }} />;
}

// A small label above the title (when the announcement has one).
const Kicker = ({ text, accent, color = accent, pill, size = 36, spacing = "0.22em" }: { text?: string; accent: string; color?: string; pill?: boolean; size?: number; spacing?: string }) =>
  text ? (
    <div style={{ display: "inline-block", alignSelf: "flex-start", marginBottom: 34, fontSize: size, fontWeight: 800, letterSpacing: spacing, textTransform: "uppercase", color: pill ? WHITE : color, background: pill ? accent : undefined, padding: pill ? "10px 30px" : undefined, borderRadius: pill ? 999 : undefined }}>{text}</div>
  ) : null;

const Title = ({ text, px, color, style }: { text: string; px: number; color: string; style?: CSSProperties }) => (text ? <h2 style={{ fontSize: px, lineHeight: 1.04, fontWeight: 900, color, ...style }}>{text}</h2> : null);
const Body = ({ text, px, color, style }: { text: string; px: number; color: string; style?: CSSProperties }) =>
  text ? (
    <p className="whitespace-pre-line" style={{ fontSize: px, lineHeight: 1.35, color, marginTop: 40, ...style }}>
      {text}
    </p>
  ) : null;

// Announcements: ten looks, each a complete 1920x1080 composition (they paint their own background). `scale` is the
// controller's text-size setting.
export function AnnouncementView({ slide, scale = 1 }: { slide: TextSlide; scale?: number }) {
  const meta = ANNOUNCEMENT_TEMPLATES.find((t) => t.id === slide.layout) ?? ANNOUNCEMENT_TEMPLATES[0];
  const accent = slide.accent || meta.accent;
  const title = slide.title ?? "";
  const body = slide.text ?? "";
  const kicker = slide.kicker;
  const image = slide.imageUrl;
  const t = (big: number) => titlePx(title.length, big) * scale;
  const b = bodyPx(body.length) * scale;
  const wrap = (bg: string | undefined, children: ReactNode, style?: CSSProperties) => (
    <div style={{ ...fill, overflow: "hidden", background: bg, ...style }}>{children}</div>
  );

  switch (meta.id) {
    case "bold":
      return wrap(
        "linear-gradient(135deg,#0b1020,#1a1033)",
        <>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 40, background: accent }} />
          <div style={{ position: "absolute", right: -260, top: -260, width: 760, height: 760, borderRadius: 9999, background: accent, opacity: 0.14 }} />
          <div style={{ ...fill, display: "flex", flexDirection: "column", justifyContent: "center", padding: "90px 150px 90px 190px" }}>
            <Kicker text={kicker} accent={accent} pill />
            <Title text={title} px={t(190)} color={WHITE} style={{ textTransform: "uppercase", letterSpacing: "-0.01em" }} />
            <div style={{ width: 260, height: 16, borderRadius: 8, background: accent, marginTop: 44 }} />
            <Body text={body} px={b} color="rgba(255,255,255,.82)" />
          </div>
        </>,
      );
    case "split":
      return wrap(
        "#0f172a",
        <>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", background: `linear-gradient(135deg,${accent},#0f172a)` }}>
            {image ? <Img url={image} style={{ width: "100%", height: "100%" }} /> : <div style={{ ...fill, display: "grid", placeItems: "center" }}><div style={{ width: 520, height: 520, borderRadius: 9999, border: "28px solid rgba(255,255,255,.25)" }} /></div>}
          </div>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 14, background: accent }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "50%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 100px 80px 120px" }}>
            <Kicker text={kicker} accent={accent} />
            <Title text={title} px={t(130)} color={WHITE} />
            <div style={{ width: 120, height: 8, borderRadius: 4, background: accent, marginTop: 36 }} />
            <Body text={body} px={b} color="#cbd5e1" style={{ marginTop: 32 }} />
          </div>
        </>,
      );
    case "glass":
      return wrap(
        `linear-gradient(135deg,${accent},#1e1b4b 70%)`,
        <>
          <div style={{ position: "absolute", left: -180, top: -120, width: 760, height: 760, borderRadius: 9999, background: "#f472b6", opacity: 0.55, filter: "blur(120px)" }} />
          <div style={{ position: "absolute", right: -200, bottom: -200, width: 900, height: 900, borderRadius: 9999, background: "#22d3ee", opacity: 0.4, filter: "blur(140px)" }} />
          <div style={{ ...fill, display: "grid", placeItems: "center", padding: 110 }}>
            <div style={{ maxWidth: 1500, width: "100%", padding: "90px 110px", borderRadius: 64, background: "rgba(255,255,255,.14)", border: "2px solid rgba(255,255,255,.35)", backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 40px 120px rgba(0,0,0,.35)" }}>
              {kicker && <div style={{ marginBottom: 30, fontSize: 34, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: WHITE, background: "rgba(255,255,255,.2)", padding: "10px 30px", borderRadius: 999 }}>{kicker}</div>}
              <Title text={title} px={t(130)} color={WHITE} />
              <Body text={body} px={b} color="rgba(255,255,255,.92)" style={{ marginTop: 34 }} />
            </div>
          </div>
        </>,
      );
    case "spotlight":
      return wrap(
        "radial-gradient(ellipse at 50% 32%,#2d2d3a 0%,#0b0b12 62%)",
        <div style={{ ...fill, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "90px 170px" }}>
          {kicker && <div style={{ marginBottom: 40, fontSize: 32, fontWeight: 700, letterSpacing: "0.5em", textTransform: "uppercase", color: accent }}>{kicker}</div>}
          <Title text={title} px={t(170)} color={WHITE} style={{ textShadow: `0 0 70px ${accent}aa, 0 0 18px ${accent}66` }} />
          <div style={{ width: 200, height: 6, borderRadius: 3, background: accent, marginTop: 52, boxShadow: `0 0 30px ${accent}` }} />
          <Body text={body} px={b} color="#a1a1aa" style={{ marginTop: 44 }} />
        </div>,
      );
    case "poster":
      return wrap(
        "#f5f0e6",
        <>
          <div style={{ position: "absolute", right: -170, top: -170, width: 820, height: 820, borderRadius: 9999, background: accent, overflow: "hidden" }}>{image && <Img url={image} style={{ width: "100%", height: "100%" }} />}</div>
          <div style={{ position: "absolute", right: 380, top: 560, width: 220, height: 220, borderRadius: 9999, border: `16px solid ${accent}`, opacity: 0.35 }} />
          <div style={{ position: "absolute", left: 130, top: 110, fontSize: 38, fontWeight: 900, letterSpacing: "0.25em", textTransform: "uppercase", color: accent }}>{kicker || "Announcement"}</div>
          <div style={{ position: "absolute", left: 130, bottom: 120, width: 1250 }}>
            <Title text={title} px={t(210)} color="#111111" style={{ lineHeight: 0.95, letterSpacing: "-0.02em" }} />
            <div style={{ width: 340, height: 20, background: accent, marginTop: 36 }} />
            <Body text={body} px={b} color="#44403c" style={{ marginTop: 34 }} />
          </div>
        </>,
      );
    case "lower":
      return wrap(
        "linear-gradient(160deg,#101828,#020617)",
        <>
          {image && <Img url={image} style={{ ...fill, width: "100%", height: "100%" }} />}
          <div style={{ ...fill, background: "linear-gradient(to top,rgba(0,0,0,.92) 0%,rgba(0,0,0,.65) 36%,rgba(0,0,0,0) 70%)" }} />
          <div style={{ position: "absolute", left: 110, right: 110, bottom: 100, display: "flex", gap: 44 }}>
            <div style={{ width: 16, borderRadius: 8, background: accent, flexShrink: 0 }} />
            <div>
              {kicker && <div style={{ marginBottom: 18, fontSize: 36, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: accent }}>{kicker}</div>}
              <Title text={title} px={t(118)} color={WHITE} />
              <Body text={body} px={b} color="rgba(255,255,255,.88)" style={{ marginTop: 26 }} />
            </div>
          </div>
        </>,
      );
    case "ticket":
      return wrap(
        "linear-gradient(135deg,#0f172a,#1e1b4b)",
        <div style={{ ...fill, display: "grid", placeItems: "center" }}>
          <div style={{ position: "relative", width: 1620, minHeight: 640, borderRadius: 40, background: WHITE, display: "flex", overflow: "visible", boxShadow: "0 50px 140px rgba(0,0,0,.5)" }}>
            <div style={{ width: 440, background: accent, borderRadius: "40px 0 0 40px", display: "grid", placeItems: "center", color: WHITE, textAlign: "center", padding: 50 }}>
              <div>
                <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "0.3em", opacity: 0.85 }}>ADMIT</div>
                <div style={{ fontSize: kicker && kicker.length > 8 ? 54 : 84, fontWeight: 900, lineHeight: 1.05, marginTop: 14, textTransform: "uppercase" }}>{kicker || "ALL"}</div>
              </div>
            </div>
            <div style={{ position: "absolute", left: 440, top: -4, bottom: -4, borderLeft: "8px dashed rgba(17,24,39,.22)" }} />
            <div style={{ position: "absolute", left: 440 - 44, top: -44, width: 88, height: 88, borderRadius: 9999, background: "#14173a" }} />
            <div style={{ position: "absolute", left: 440 - 44, bottom: -44, width: 88, height: 88, borderRadius: 9999, background: "#14173a" }} />
            <div style={{ flex: 1, padding: "80px 100px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <Title text={title} px={t(118)} color="#111827" />
              <Body text={body} px={b} color="#475569" style={{ marginTop: 30 }} />
            </div>
          </div>
        </div>,
      );
    case "editorial":
      return wrap(
        "#fbfaf6",
        <>
          {[110, 970].map((y) => (
            <div key={y} style={{ position: "absolute", left: 130, right: 130, top: y }}>
              <div style={{ height: 3, background: "#1c1917" }} />
              <div style={{ height: 1, background: "#1c1917", marginTop: 7 }} />
            </div>
          ))}
          <div style={{ ...fill, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "170px 260px", fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {kicker && <div style={{ marginBottom: 44, fontSize: 30, fontWeight: 700, letterSpacing: "0.45em", textTransform: "uppercase", color: accent }}>{kicker}</div>}
            <Title text={title} px={t(150)} color="#1c1917" style={{ fontWeight: 700, lineHeight: 1.08 }} />
            <div style={{ margin: "44px 0 8px", color: accent, fontSize: 40 }}>◆</div>
            <Body text={body} px={b} color="#44403c" style={{ fontStyle: "italic", marginTop: 20 }} />
          </div>
        </>,
      );
    case "wave":
      return wrap(
        "linear-gradient(135deg,#7c3aed 0%,#ec4899 55%,#f59e0b 100%)",
        <>
          <svg viewBox="0 0 1920 1080" style={{ ...fill, width: "100%", height: "100%" }} preserveAspectRatio="none" aria-hidden>
            <path d="M0 820 C 320 700, 640 960, 960 840 S 1600 700, 1920 830 V1080 H0Z" fill="#ffffff" opacity="0.14" />
            <path d="M0 910 C 360 800, 700 1010, 1020 920 S 1620 820, 1920 930 V1080 H0Z" fill="#ffffff" opacity="0.22" />
          </svg>
          <div style={{ position: "absolute", left: 140, top: 0, bottom: 120, width: image ? 1030 : 1500, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {kicker && <div style={{ alignSelf: "flex-start", marginBottom: 34, fontSize: 34, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: WHITE, background: "rgba(255,255,255,.22)", padding: "10px 30px", borderRadius: 999, border: `3px solid ${accent}` }}>{kicker}</div>}
            <Title text={title} px={t(170)} color={WHITE} style={{ textShadow: "0 8px 40px rgba(0,0,0,.2)" }} />
            <Body text={body} px={b} color="rgba(255,255,255,.94)" />
          </div>
          {image && <div style={{ position: "absolute", right: 150, top: 190, width: 560, height: 560, borderRadius: 9999, overflow: "hidden", border: `18px solid ${accent}`, boxShadow: "0 40px 100px rgba(0,0,0,.3)" }}><Img url={image} style={{ width: "100%", height: "100%" }} /></div>}
        </>,
      );
    default:
      return null;
  }
}
