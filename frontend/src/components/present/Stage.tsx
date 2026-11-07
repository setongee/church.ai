"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadFont } from "@/lib/fonts";
import { GivingPromo } from "./GivingPromo";
import { WelcomePromo } from "./WelcomePromo";
import { HighlightedText } from "./HighlightedText";
import { FxText } from "./FxText";
import { AlertBanner } from "./AlertBanner";
import { AnnouncementView } from "./AnnouncementView";
import { SplitPoints } from "./SplitPoints";
import { templateById } from "./ministeringTemplates";
import { BODY_PX, mediaSrc, sectionOf, type ScripturePart, type Background, type Frame, type ImageFit, type PresentState, type Slide } from "@/lib/present";

const W = 1920;
const H = 1080;

function isLight(bg: Background) {
  if (bg.type !== "color") return false;
  const m = /^#([0-9a-f]{6})$/i.exec(bg.value);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 160;
}

// "preview" = the staging monitor: videos stay paused. "live" = the live monitor: videos play but
// silently. Neither monitor ever makes sound - only the output window does.
export type Monitor = "preview" | "live";

const FIT_CLASS: Record<ImageFit, string> = { contain: "object-contain", cover: "object-cover", stretch: "object-fill", zoom: "object-cover present-zoom" };

// A picture, GIF or video filling its frame (the frame's size/shape comes from the layout). On the output a
// video plays with sound when it goes live; if the browser blocks sound-on autoplay it falls back to silent
// playback rather than not playing at all.
function MediaEl({ slide, fit, monitor }: { slide: Extract<Slide, { kind: "image" | "video" }>; fit: ImageFit; monitor?: Monitor }) {
  const ref = useRef<HTMLVideoElement>(null);
  const isVideo = slide.kind === "video";
  useEffect(() => {
    const v = ref.current;
    if (!v || monitor === "preview") return;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [monitor, isVideo]);
  const cls = `h-full w-full ${FIT_CLASS[fit]}`;
  if (slide.kind === "video") return <video ref={ref} data-slide-video src={mediaSrc(slide.url)} loop={slide.loop} muted={slide.muted || Boolean(monitor)} playsInline preload="auto" className={cls} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaSrc(slide.url)} alt="" className={cls} />;
}

const SHADOW = "0 30px 80px rgba(0,0,0,.55)";

// Pictures, GIFs and videos fill the screen; the framing setting (fit / fill / stretch / zoom) decides how.
function MediaSlideView({ slide, style, monitor }: { slide: Extract<Slide, { kind: "image" | "video" }>; style: PresentState["style"]; monitor?: Monitor }) {
  return (
    <div className="absolute inset-0 bg-black">
      <MediaEl slide={slide} fit={style.imageFit || "contain"} monitor={monitor} />
    </div>
  );
}

// The frame's own fill. Pictures and videos stretch to the frame (so a lower-third graphic lines up with it)
// and aren't dimmed the way a full-screen background is.
function FrameFill({ bg }: { bg: Background }) {
  if (bg.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaSrc(bg.value)} alt="" className="absolute inset-0 h-full w-full object-fill" />;
  }
  if (bg.type === "video") return <video src={mediaSrc(bg.value)} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-fill" />;
  return <div className="absolute inset-0" style={{ background: bg.value }} />;
}

// Where the scripture sits on the right half of the split screen.
const SPLIT_FRAME: Frame = { x: 990, y: 60, w: 870, h: 960 };

const FRAMED_KINDS = new Set(["scripture", "scripture2", "song", "text", "quote"]);

// The announcement look a text slide is shown in: its own, or (for announcements that didn't pick one) the wrapper's default.
// Prayers and everything that isn't an announcement are never restyled.
const announcementLayoutOf = (slide: Slide, style: PresentState["style"]) =>
  slide.kind !== "text" || slide.variant ? null : slide.layout && slide.layout !== "classic" ? slide.layout : style.announcementTemplate && style.announcementTemplate !== "classic" ? style.announcementTemplate : null;

// Text laid out inside a user-placed frame (a lower third, a side panel...). The type is sized to fill the
// frame: it is set at the chosen fixed size and only steps down if the text would overflow the frame.
function FramedSlide({ slide, frame, frameBg, style, color, shadow }: { slide: Slide; frame: Frame; frameBg: Background | null; style: PresentState["style"]; color: string; shadow: string }) {
  const content = useRef<HTMLDivElement>(null);
  const align = style.align === "left" ? "left" : "center";
  const weight = style.weight || 500;
  const pad = `${Math.round(Math.min(44, frame.h * 0.12))}px ${Math.round(Math.min(72, frame.w * 0.04))}px`;
  const flush = frame.x <= 0 && frame.x + frame.w >= 1920;

  // The size is fixed (it never depends on how much text there is). Only when the text would overflow the frame does it
  // step down, just far enough to fit.
  const fit = useCallback(() => {
    const el = content.current;
    if (!el) return;
    let size = BODY_PX * style.scale;
    el.style.fontSize = `${size}px`;
    for (let i = 0; i < 45 && size > 14 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1); i++) {
      size = Math.floor(size * 0.94);
      el.style.fontSize = `${size}px`;
    }
  }, [style.scale]);
  useLayoutEffect(() => {
    fit();
    // Web fonts arrive after the first layout; fit again once they have.
    document.fonts?.ready.then(fit).catch(() => {});
  }, [fit, slide, frame.w, frame.h, weight, style.font]);

  const small = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontSize: "0.52em", opacity: 0.85, marginTop: "0.45em", fontWeight: Math.min(900, weight + 100), ...extra });
  const part = (p: ScripturePart) => (
    <div className="min-w-0 flex-1">
      <p style={{ lineHeight: 1.22, fontWeight: weight }}><HighlightedText text={p.text} highlights={p.highlights} /></p>
      <p style={small()}>
        {p.reference} <span style={{ opacity: 0.7, fontSize: "0.8em" }}>{p.version}</span>
      </p>
    </div>
  );

  let body: React.ReactNode = null;
  if (slide.kind === "scripture") body = part(slide);
  else if (slide.kind === "scripture2") {
    body = (
      <div className="flex gap-[0.8em]">
        {part(slide.left)}
        <span className="w-px self-stretch" style={{ background: "currentColor", opacity: 0.3 }} />
        {part(slide.right)}
      </div>
    );
  } else if (slide.kind === "song") body = <FxText text={slide.text} effect={slide.effect} base={color} className="whitespace-pre-line" style={{ lineHeight: 1.22, fontWeight: weight + (weight < 700 ? 100 : 0) }} />;
  else if (slide.kind === "quote") {
    body = (
      <>
        <p style={{ lineHeight: 1.22, fontWeight: weight }}>“{slide.text}”</p>
        {slide.attribution && <p style={small()}>— {slide.attribution}</p>}
      </>
    );
  } else if (slide.kind === "text" && slide.variant === "prayer") {
    body = <p className="whitespace-pre-line" style={{ lineHeight: 1.22, fontWeight: weight }}>{slide.text}</p>;
  } else if (slide.kind === "text") {
    body = (
      <>
        {slide.title && <p style={{ lineHeight: 1.1, fontWeight: Math.min(900, weight + 200), marginBottom: slide.text ? "0.3em" : 0 }}>{slide.title}</p>}
        {slide.text && <p className="whitespace-pre-line" style={{ lineHeight: 1.25, fontWeight: weight, opacity: slide.title ? 0.9 : 1, fontSize: slide.title ? "0.7em" : undefined }}>{slide.text}</p>}
      </>
    );
  }

  return (
    <div className="absolute overflow-hidden" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, borderRadius: flush ? 0 : 28 }}>
      {frameBg && <FrameFill bg={frameBg} />}
      <div ref={content} className="absolute inset-0 flex flex-col justify-center overflow-hidden" style={{ padding: pad, color, textShadow: shadow, textAlign: align }}>
        {body}
      </div>
    </div>
  );
}

function BackgroundLayer({ bg }: { bg: Background }) {
  if (bg.type === "video") {
    return (
      <>
        <video src={mediaSrc(bg.value)} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/25" />
      </>
    );
  }
  if (bg.type === "image") {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaSrc(bg.value)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/25" />
      </>
    );
  }
  return <div className="absolute inset-0" style={{ background: bg.value }} />;
}

interface QuoteProps {
  slide: Extract<Slide, { kind: "quote" }>;
  style: PresentState["style"];
  color: string;
  shadow: string;
  dark: boolean;
  align: "left" | "center";
  w: (d: number) => number;
  strong: (d: number) => number;
  hasFont: boolean;
}

// Quote layouts. The chosen font (if any) always wins; layouts that want a serif only use one when no
// font has been picked.
function QuoteView({ slide, style, color, shadow, dark, align, w, strong, hasFont }: QuoteProps) {
  const layout = style.quoteLayout || "classic";
  const text = slide.text;
  const sc = style.scale;
  const serif = hasFont ? undefined : "Georgia, 'Times New Roman', serif";
  const soft = dark ? "rgba(24,24,27,.35)" : "rgba(255,255,255,.4)";
  const attrib = (size: number, extra: React.CSSProperties = {}) =>
    slide.attribution ? (
      <p className="tracking-wide" style={{ fontSize: size * sc, opacity: 0.85, fontWeight: strong(600), ...extra }}>
        — {slide.attribution}
      </p>
    ) : null;

  if (layout === "centered") {
    const size = BODY_PX * sc;
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[200px] py-[90px] text-center" style={{ color, textShadow: shadow, fontFamily: serif }}>
        <span className="mb-12 block h-[5px] w-[140px] rounded-full" style={{ background: "#f59e0b" }} />
        <p style={{ fontSize: size, lineHeight: 1.32, fontWeight: w(500), fontStyle: "italic" }}>{text}</p>
        {attrib(40, { marginTop: 56, letterSpacing: "0.18em", textTransform: "uppercase", fontStyle: "normal" })}
      </div>
    );
  }
  if (layout === "bold") {
    const size = BODY_PX * sc;
    return (
      <div className="absolute inset-0 flex flex-col justify-center px-[140px] py-[90px]" style={{ color, textShadow: shadow, textAlign: align }}>
        <p style={{ fontSize: size, lineHeight: 1.12, fontWeight: style.weight ? Math.min(900, style.weight + 200) : 800, textTransform: "uppercase", letterSpacing: "-0.01em" }}>{text}</p>
        {slide.attribution && (
          <p className="mt-14 inline-block self-start rounded-full px-8 py-3 font-bold tracking-widest" style={{ fontSize: 36 * sc, background: "#ea580c", color: "#fff", textShadow: "none", alignSelf: align === "left" ? "flex-start" : "center" }}>
            {slide.attribution.toUpperCase()}
          </p>
        )}
      </div>
    );
  }
  if (layout === "bar") {
    const size = BODY_PX * sc;
    return (
      <div className="absolute inset-0 flex items-center px-[170px] py-[90px]" style={{ color, textShadow: shadow }}>
        <div className="shrink-0 self-stretch rounded-full" style={{ width: 16, background: "#f97316", margin: "150px 70px 150px 0" }} />
        <div className="min-w-0">
          <p style={{ fontSize: size, lineHeight: 1.3, fontWeight: w(500) }}>{text}</p>
          {attrib(44, { marginTop: 48 })}
        </div>
      </div>
    );
  }
  if (layout === "card") {
    const size = BODY_PX * sc;
    return (
      <div className="absolute inset-0 flex items-center justify-center px-[170px] py-[110px]">
        <div className="flex max-h-full flex-col items-center justify-center rounded-[52px] px-[110px] py-[90px] text-center" style={{ color, background: dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.38)", backdropFilter: "blur(18px)", border: `2px solid ${soft}`, boxShadow: SHADOW }}>
          <p style={{ fontSize: size, lineHeight: 1.3, fontWeight: w(500) }}>{text}</p>
          {attrib(40, { marginTop: 44 })}
        </div>
      </div>
    );
  }
  if (layout === "minimal") {
    const size = BODY_PX * sc;
    return (
      <div className="absolute inset-0 flex flex-col justify-end px-[150px] py-[130px]" style={{ color, textShadow: shadow, textAlign: align }}>
        <p className="max-w-[1300px]" style={{ fontSize: size, lineHeight: 1.35, fontWeight: w(500), alignSelf: align === "left" ? "flex-start" : "center" }}>{text}</p>
        {attrib(34, { marginTop: 36, alignSelf: align === "left" ? "flex-start" : "center" })}
      </div>
    );
  }
  if (layout === "bigmark") {
    const size = BODY_PX * sc;
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[190px] py-[90px] text-center" style={{ color, textShadow: shadow }}>
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-[40px] -translate-x-1/2 leading-none" style={{ fontSize: 760, opacity: dark ? 0.12 : 0.14, fontFamily: "Georgia, serif" }}>
          &ldquo;
        </span>
        <p className="relative" style={{ fontSize: size, lineHeight: 1.28, fontWeight: w(500) }}>{text}</p>
        {slide.attribution && <div className="relative">{attrib(46, { marginTop: 52 })}</div>}
      </div>
    );
  }
  // classic
  const size = BODY_PX * sc;
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-[170px] py-[90px]" style={{ color, textShadow: shadow, textAlign: align }}>
      <span aria-hidden className="mb-2 block leading-none" style={{ fontSize: 220, height: 130, opacity: 0.35, fontFamily: "Georgia, serif" }}>
        &ldquo;
      </span>
      <p style={{ fontSize: size, lineHeight: 1.28, fontWeight: w(500) }}>{text}</p>
      {attrib(46, { marginTop: 48 })}
    </div>
  );
}

// The animated templates (speaker intro, offering overlay). They fill the whole screen.
function TemplateView({ slide, frozen }: { slide: Slide; frozen?: boolean }) {
  if (slide.kind === "giving") return <GivingPromo {...slide} frozen={frozen} />;
  if (slide.kind === "welcome") return <WelcomePromo {...slide} frozen={frozen} />;
  if (slide.kind === "ministering") {
    const T = templateById(slide.template).Component;
    return <T {...slide} frozen={frozen} />;
  }
  return null;
}

// Full-screen text keeps its fixed size. Only if the text would run off the top or bottom of the screen is everything
// scaled down (re-wrapping as it goes), just far enough to fit.
const SAFE_Y = 70;
function AutoShrink({ children, refit }: { children: React.ReactNode; refit: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    const o = outer.current;
    const el = inner.current;
    if (!o || !el) return;
    const box = o.getBoundingClientRect();
    const ratio = box.height / H;
    if (!ratio) return;
    const range = document.createRange();
    const overflows = () => {
      let top = Infinity;
      let bottom = -Infinity;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue?.trim()) continue;
        range.selectNodeContents(n);
        for (const r of Array.from(range.getClientRects())) {
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }
      }
      return top !== Infinity && ((top - box.top) / ratio < SAFE_Y - 1 || (bottom - box.top) / ratio > H - SAFE_Y + 1);
    };
    let k = 1;
    el.style.zoom = "1";
    for (let i = 0; i < 40 && k > 0.25 && overflows(); i++) {
      k *= 0.94;
      el.style.zoom = String(k);
    }
  }, []);
  useLayoutEffect(() => {
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
  }, [fit, refit]);
  return (
    <div ref={outer} className="absolute inset-0">
      <div ref={inner} className="absolute inset-0">{children}</div>
    </div>
  );
}

function SlideView({ slide, style, dark, monitor, hasFont }: { slide: Slide; style: PresentState["style"]; dark: boolean; monitor?: Monitor; hasFont: boolean }) {
  const color = dark ? "#18181b" : "#ffffff";
  const shadow = dark ? "none" : "0 4px 28px rgba(0,0,0,.45)";
  const align = style.align === "left" ? "left" : "center";
  // A chosen weight overrides each slide type's own; headings/references sit one step heavier.
  const w = (d: number) => style.weight || d;
  const strong = (d: number) => (style.weight ? Math.min(900, style.weight + 100) : d);

  if (slide.kind === "giving" || slide.kind === "ministering" || slide.kind === "welcome") return <TemplateView slide={slide} frozen={monitor === "preview"} />;

  if (slide.kind === "image" || slide.kind === "video") return <MediaSlideView slide={slide} style={style} monitor={monitor} />;

  const announcement = announcementLayoutOf(slide, style);
  if (slide.kind === "text" && announcement) return <AnnouncementView slide={{ ...slide, layout: announcement }} scale={style.scale} />;

  if (slide.kind === "quote") return <QuoteView slide={slide} style={style} color={color} shadow={shadow} dark={dark} align={align} w={w} strong={strong} hasFont={hasFont} />;

  if (slide.kind === "scripture2") {
    const parts = [slide.left, slide.right];
    const colSize = BODY_PX * style.scale;
    return (
      <div className="absolute inset-0 grid grid-cols-2 gap-0 px-[90px] pb-[80px] pt-[170px]" style={{ color, textShadow: shadow, textAlign: align }}>
        {parts.map((p, i) => (
          <div key={i} className={`flex h-full flex-col justify-start px-[55px] ${i === 0 ? "border-r-2" : ""}`} style={{ borderColor: dark ? "rgba(24,24,27,.25)" : "rgba(255,255,255,.3)" }}>
            <p style={{ fontSize: colSize, lineHeight: 1.3, fontWeight: w(500) }}><HighlightedText text={p.text} highlights={p.highlights} /></p>
            <p className="mt-10 tracking-wide" style={{ fontSize: 40 * style.scale, opacity: 0.85, fontWeight: strong(600) }}>
              {p.reference}
              <span className="ml-4 text-[0.62em] font-medium opacity-70">{p.version}</span>
            </p>
          </div>
        ))}
      </div>
    );
  }

  const body = slide.text;
  const size = BODY_PX * style.scale;

  // A prayer reads like scripture: just the words, big and clear (the title is only for the operator's list).
  if (slide.kind === "text" && slide.variant === "prayer") {
    return (
      <div className="absolute inset-0 flex flex-col justify-center px-[150px] py-[90px]" style={{ color, textShadow: shadow, textAlign: align }}>
        <p className="whitespace-pre-line" style={{ fontSize: size, lineHeight: 1.28, fontWeight: w(500) }}>{body}</p>
      </div>
    );
  }

  if (slide.kind === "scripture") {
    return (
      <div className="absolute inset-0 flex flex-col justify-center px-[150px] py-[90px]" style={{ color, textShadow: shadow, textAlign: align }}>
        <p style={{ fontSize: size, lineHeight: 1.28, fontWeight: w(500) }}><HighlightedText text={body} highlights={slide.highlights} /></p>
        <p className="mt-14 tracking-wide" style={{ fontSize: 50 * style.scale, opacity: 0.85, fontWeight: strong(600) }}>
          {slide.reference}
          <span className="ml-5 text-[0.62em] font-medium opacity-70">{slide.version}</span>
        </p>
      </div>
    );
  }

  if (slide.kind === "song") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[140px] py-[90px]" style={{ color, textShadow: shadow, textAlign: align }}>
        <FxText text={body} effect={slide.effect} base={color} className="whitespace-pre-line" style={{ fontSize: size, lineHeight: 1.3, fontWeight: w(600) }} />
      </div>
    );
  }

  // text / announcement
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-24 px-[140px] py-[90px]" style={{ color, textShadow: shadow }}>
      {slide.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaSrc(slide.imageUrl)} alt="" className="max-h-[760px] max-w-[820px] rounded-3xl object-cover shadow-2xl" />
      )}
      <div className="min-w-0 flex-1" style={{ textAlign: slide.imageUrl ? "left" : align }}>
        {slide.title && <h2 className="mb-10" style={{ fontSize: 84 * style.scale, lineHeight: 1.1, fontWeight: strong(700) }}>{slide.title}</h2>}
        {body && (
          <p className="whitespace-pre-line" style={{ fontSize: size, lineHeight: 1.35, opacity: slide.title ? 0.9 : 1, fontWeight: style.weight || undefined }}>
            {body}
          </p>
        )}
      </div>
    </div>
  );
}

// Renders the display state on a fixed 1920x1080 canvas, scaled to fit its container. Used for the
// output window and for the preview/live monitors, so they always look identical.
export function Stage({ state, className = "", monitor }: { state: PresentState; className?: string; monitor?: Monitor }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch the chosen Google font in this window (the output is a separate window from the controller).
  const font = state.style.font;
  const [, setFontReady] = useState(0);
  useEffect(() => {
    if (font) loadFont(font).then(() => setFontReady((n) => n + 1));
  }, [font]);

  const showSlide = state.mode === "live" && state.slide;
  // Quotes and prayers can carry their own background; it sits behind just that slide.
  // Scripture, songs and prayers can have a look of their own (from a template or a wrapper): where the text sits, its
  // fill, alignment, size and an optional backdrop. Anything without one uses the screen's general style.
  const section = showSlide ? sectionOf(state.slide) : null;
  const sec = section ? state.sectionStyles?.[section] : undefined;
  const style = sec ? { ...state.style, frame: sec.frame, frameBg: sec.frameBg, align: sec.align, scale: sec.scale } : state.style;
  const slideBg = showSlide ? (state.slide!.kind === "quote" || state.slide!.kind === "text" ? state.slide!.background : undefined) ?? sec?.background ?? undefined : undefined;
  // Split screen: key points on the left, the live scripture on the right. The points belong to the deck, not
  // the slide, so changing the scripture leaves them alone.
  const deck = state.split?.on ? state.split : null;
  const splitPage = deck ? deck.pages[Math.min(deck.index, deck.pages.length - 1)] : null;
  const split = Boolean(showSlide && state.slide!.kind === "scripture" && splitPage);
  const frame = split ? SPLIT_FRAME : style.frame;
  const frameBg = split ? null : (style.frameBg ?? null);
  // Text-type slides can be placed in a frame (lower third etc.); pictures and videos stay full screen.
  const templated = Boolean(showSlide && announcementLayoutOf(state.slide!, style));
  const framed = Boolean(!templated && showSlide && frame && (split || FRAMED_KINDS.has(state.slide!.kind)));
  // With a framed fill the text colour follows the fill; otherwise it follows what's behind the slide.
  const dark = isLight(framed && frameBg ? frameBg : (slideBg ?? state.background));

  return (
    <div ref={box} className={`relative aspect-video w-full overflow-hidden bg-black ${className}`}>
      <div className="absolute left-0 top-0 origin-top-left overflow-hidden" style={{ width: W, height: H, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}>
        <BackgroundLayer bg={state.background} />
        {state.bgSlide && <div key={JSON.stringify(state.bgSlide)} className="absolute inset-0"><TemplateView slide={state.bgSlide} frozen={monitor === "preview"} /></div>}

        {/* key forces a quick cross-fade whenever the slide changes */}
        <div key={showSlide ? JSON.stringify(state.slide) : "none"} className="present-fade absolute inset-0" style={font ? { fontFamily: `"${font}", system-ui, sans-serif` } : undefined}>
          {slideBg && <BackgroundLayer bg={slideBg} />}
          {showSlide &&
            (framed ? (
              <FramedSlide slide={state.slide!} frame={frame!} frameBg={frameBg} style={style} color={dark ? "#18181b" : "#ffffff"} shadow={dark || frameBg ? "none" : "0 3px 20px rgba(0,0,0,.5)"} />
            ) : (
              FRAMED_KINDS.has(state.slide!.kind) ? (
                <AutoShrink refit={`${style.scale}|${style.weight}|${style.font}|${style.align}|${style.quoteLayout}|${style.announcementTemplate}`}>
                  <SlideView slide={state.slide!} style={style} dark={dark} monitor={monitor} hasFont={Boolean(font)} />
                </AutoShrink>
              ) : (
                <SlideView slide={state.slide!} style={style} dark={dark} monitor={monitor} hasFont={Boolean(font)} />
              )
            ))}
        </div>

        {split && splitPage && deck && (
          <div key={deck.index} className="present-fade absolute inset-0" style={font ? { fontFamily: `"${font}", system-ui, sans-serif` } : undefined}>
            <SplitPoints page={splitPage} title={deck.title} style={state.style} dark={dark} />
          </div>
        )}

        {state.mode === "logo" && (
          <div className="present-fade absolute inset-0 flex flex-col items-center justify-center">
            {state.logoSlide ? (
              <div key={JSON.stringify(state.logoSlide)} className="absolute inset-0">
                <TemplateView slide={state.logoSlide} frozen={monitor === "preview"} />
              </div>
            ) : state.logoUrl && state.logoKind !== "logo" ? (
              // A picture, GIF or video chosen in Media: full screen, framed by the picture-framing setting.
              <div className="absolute inset-0 bg-black">
                <MediaEl
                  slide={state.logoKind === "video" ? { kind: "video", url: state.logoUrl, loop: true, muted: true } : { kind: "image", url: state.logoUrl }}
                  fit={state.style.imageFit || "contain"}
                  monitor={monitor}
                />
              </div>
            ) : state.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc(state.logoUrl)} alt="" className="max-h-[560px] max-w-[1100px] object-contain" />
            ) : (
              <div className="h-40 w-40 rounded-full border-4 border-white/30" />
            )}
          </div>
        )}

        {state.alert && <AlertBanner alert={state.alert} />}

        <div className="absolute inset-0 bg-black transition-opacity duration-300" style={{ opacity: state.mode === "black" ? 1 : 0, pointerEvents: "none" }} />
      </div>
    </div>
  );
}
