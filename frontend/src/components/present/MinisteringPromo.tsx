"use client";

import { useEffect, useRef } from "react";
import { mediaSrc } from "@/lib/present";

// With a closing word the scene runs to 13.6s; without one it ends after the zoom-out.
export const MINISTERING_DURATION = 13.6;
export const MINISTERING_DURATION_NO_WORD = 10.6;
export const MINISTERING_DEFAULTS = { gap: 0.6, titleColor: "#0e416a", nameColor: "#ffffff", pillColor: "#0e416a", titleScale: 1, nameScale: 1, titleSpacing: 0.01 };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const eOut = (p: number) => 1 - Math.pow(1 - p, 3);
const eIn = (p: number) => p * p * p;
const eBack = (p: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};
const lin = (p: number) => p;
const seg = (t: number, a: number, b: number, e: (p: number) => number = eOut) => e(clamp((t - a) / (b - a)));

const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap";

function drawSwirl(c: HTMLCanvasElement, t: number) {
  const x = c.getContext("2d");
  if (!x) return;
  const W = c.width;
  const H = c.height;
  x.clearRect(0, 0, W, H);
  const N = 120;
  x.lineCap = "round";
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const w = Math.sin(t * 0.55 + k * 5) * 0.045;
    const fold = Math.sin(k * Math.PI) * 0.18;
    const p0 = [-0.15 * W, (0.18 + 0.75 * k) * H];
    const p1 = [(0.3 + w + fold) * W, (1.05 * k - 0.1 + w) * H];
    const p2 = [(0.18 - w + fold * 0.6) * W, (-0.3 + 0.55 * k) * H];
    const p3 = [(0.7 - 0.3 * k + w * 0.5) * W, -0.15 * H];
    const hue = (185 + k * 250) % 360;
    const band = Math.sin(k * Math.PI * 9 + t * 0.9);
    const light = 50 + 22 * Math.pow(Math.max(0, band), 3) - 12 * Math.pow(Math.max(0, -band), 2);
    x.strokeStyle = `hsl(${hue} 90% ${Math.max(18, light - 22)}%)`;
    x.lineWidth = H * 0.05;
    x.beginPath();
    x.moveTo(p0[0], p0[1] + 4);
    x.bezierCurveTo(p1[0], p1[1] + 4, p2[0], p2[1] + 4, p3[0], p3[1] + 4);
    x.stroke();
    x.strokeStyle = `hsl(${hue} 98% ${light}%)`;
    x.lineWidth = H * 0.038;
    x.beginPath();
    x.moveTo(p0[0], p0[1]);
    x.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    x.stroke();
    if (band > 0.85) {
      x.strokeStyle = "rgba(255,255,255,.35)";
      x.lineWidth = H * 0.01;
      x.beginPath();
      x.moveTo(p0[0], p0[1] - 5);
      x.bezierCurveTo(p1[0], p1[1] - 5, p2[0], p2[1] - 5, p3[0], p3[1] - 5);
      x.stroke();
    }
  }
}

export interface MinisteringProps {
  name: string;
  logoUrl?: string;
  photoUrl?: string;
  // Optional closing word (Bebas Neue, centred). Leave empty to end after the zoom-out.
  word?: string;
  // Space between "Ministering" and the name, in % of the screen width.
  gap?: number;
  titleColor?: string;
  nameColor?: string;
  pillColor?: string;
  // Font size multipliers (1 = the default size).
  titleScale?: number;
  // Letter spacing of the headline, in em.
  titleSpacing?: number;
  nameScale?: number;
  // Play again as soon as it finishes.
  loop?: boolean;
  // true = hold one still frame (the staging monitor) instead of playing.
  frozen?: boolean;
}

// The "Ministering" speaker promo: an orange silhouette resolves into the speaker's photo with a blue outline,
// the headline wipes in, then the scene zooms into a swirl and a closing word lands. Everything is a pure
// function of time, so it plays from the moment it mounts (the Stage remounts it on every go-live).
export function MinisteringPromo({ name, logoUrl, photoUrl, word = "", gap = MINISTERING_DEFAULTS.gap, titleColor = MINISTERING_DEFAULTS.titleColor, nameColor = MINISTERING_DEFAULTS.nameColor, pillColor = MINISTERING_DEFAULTS.pillColor, titleScale = 1, nameScale = 1, titleSpacing = MINISTERING_DEFAULTS.titleSpacing, loop, frozen }: MinisteringProps) {
  const root = useRef<HTMLDivElement>(null);
  const render = useRef<(t: number) => void>(() => {});

  // Poppins/Anton/Bowlby One aren't bundled; load them once for whichever window is showing this.
  useEffect(() => {
    if (document.querySelector("link[data-ministering-fonts]")) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONTS_HREF;
    l.dataset.ministeringFonts = "1";
    document.head.appendChild(l);
  }, []);

  const photoSrc = photoUrl ? mediaSrc(photoUrl) : "";

  useEffect(() => {
    const els: Record<string, HTMLElement> = {};
    root.current?.querySelectorAll<HTMLElement>("[data-r]").forEach((el) => (els[el.dataset.r!] = el));
    const $ = (id: string) => els[id];
    const swirl = $("swirl") as unknown as HTMLCanvasElement;
    const burst = $("burst") as unknown as HTMLCanvasElement;
    const bx = burst.getContext("2d")!;

    render.current = (t: number) => {
      $("flash").style.transform = `translateY(${-100 * seg(t, 0.35, 0.6, eIn)}%)`;
      $("white").style.transform = `translateY(${-100 * seg(t, 0.55, 1.05)}%)`;

      const l2 = seg(t, 0.45, 0.95, eBack);
      $("logo").style.opacity = String(clamp((t - 0.45) / 0.15));
      $("logo").style.transform = `scale(${0.5 + 0.5 * l2})`;

      const s = seg(t, 0.85, 1.7);
      swirl.style.transform = `translate(${(s - 1) * 45}%,${(s - 1) * 35}%) rotate(${(1 - s) * -25}deg)`;
      if (t > 0.8 && t < 10.6) drawSwirl(swirl, t);

      const pin = seg(t, 0.85, 1.35);
      $("person").style.transform = `translateX(${(1 - pin) * -12}cqw) scale(${1 + 0.025 * clamp((t - 2) / 7)})`;
      $("person").style.opacity = String(clamp((t - 0.85) / 0.1));
      const toPhoto = seg(t, 1.45, 1.9, lin);
      $("sil").style.opacity = String(1 - toPhoto);
      const g = 1 - seg(t, 1.3, 2.3);
      $("gy").style.opacity = String(g);
      $("gy").style.transform = `translate(${-1.6 * g}cqw,${-0.4 * g}cqw)`;
      $("gc").style.opacity = String(g * 0.8);
      $("gc").style.transform = `translate(${1.2 * g}cqw,${0.3 * g}cqw)`;
      const o = seg(t, 1.7, 2.4);
      $("outline").style.opacity = String(o);
      $("outline").style.transform = `translate(${-1.8 + Math.sin(t * 0.9) * 0.9}cqw,${-1.1 + Math.cos(t * 0.7) * 0.8}cqw) scale(${1 + 0.03 * o})`;

      const ti = seg(t, 1.0, 1.7);
      $("title").style.clipPath = `inset(-10% ${100 - ti * 100}% -10% 0)`;
      $("title").style.filter = `blur(${(1 - ti) * 0.6}cqw)`;
      $("title").style.opacity = String(0.25 + 0.75 * ti);
      $("pill").style.transform = `scaleX(${seg(t, 1.05, 1.55)})`;
      $("pilltext").style.opacity = String(seg(t, 1.4, 1.9));

      const z = seg(t, 9.4, 10.15, eIn);
      $("scene").style.transform = `scale(${1 + z * 1.9}) rotate(${z * 16}deg)`;
      $("scene").style.filter = z > 0 ? `blur(${z * 8}px) saturate(${1 + z})` : "none";
      $("scene").style.opacity = String(1 - seg(t, 9.95, 10.3, lin));
      const b = clamp((t - 9.6) / 0.45) * (1 - clamp((t - 10.15) / 0.5));
      burst.style.opacity = String(b);
      if (b > 0) {
        bx.clearRect(0, 0, burst.width, burst.height);
        bx.save();
        bx.translate(burst.width / 2, burst.height / 2);
        bx.rotate(t * 1.4);
        bx.scale(2.4, 2.4);
        bx.filter = "blur(6px)";
        bx.globalCompositeOperation = "lighter";
        [-14, 0, 14].forEach((dx) => {
          bx.globalAlpha = 0.55;
          bx.drawImage(swirl, -swirl.width / 2 + dx, -swirl.height / 2);
        });
        bx.restore();
      }

      $("end").style.opacity = String(seg(t, 10.05, 10.35, lin));
      const w = seg(t, 10.15, 11.0);
      const k = (1 - w) * 0.9;
      const wordEl = $("word");
      wordEl.style.transform = `translate(${(1 - w) * -6}cqw,${(1 - w) * 2}cqw) rotate(${(1 - w) * -9}deg) scale(${1.35 - 0.35 * w})`;
      wordEl.style.textShadow = k > 0.01 ? `${-k}cqw 0 #18b6e8, ${k}cqw ${k * 0.4}cqw #f2861f` : "none";
      wordEl.style.filter = `blur(${(1 - w) * 0.35}cqw)`;
      Array.from(wordEl.children).forEach((c, i) => {
        const out = seg(t, 12.9 + i * 0.05, 13.5);
        const el = c as HTMLElement;
        el.style.transform = `translateY(${out * -0.8}cqw) scaleY(${1 - out * 0.25})`;
        el.style.opacity = String(1 - out * 0.85);
      });
    };
  }, []);

  // Headline fits the column; the closing word re-renders with the current frame.
  useEffect(() => {
    const fit = () => {
      const el = root.current?.querySelector<HTMLElement>("[data-r=title]");
      const host = root.current;
      if (!el || !host) return;
      const box = el.parentElement!.getBoundingClientRect().width;
      const cw = host.getBoundingClientRect().width;
      el.style.fontSize = "100px";
      const textW = (el.firstElementChild as HTMLElement).offsetWidth;
      const px = Math.min((100 * box) / textW, cw * 0.115) * titleScale;
      el.style.fontSize = `${(px / cw) * 100}cqw`;
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
  }, [titleScale, titleSpacing]);

  useEffect(() => {
    if (frozen) {
      render.current(6);
      return;
    }
    let raf = 0;
    let start = performance.now();
    const dur = word ? MINISTERING_DURATION : MINISTERING_DURATION_NO_WORD;
    const tick = (now: number) => {
      if (loop && now - start >= dur * 1000) start = now;
      render.current(Math.min(dur, (now - start) / 1000));
      if (loop || now - start < dur * 1000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozen, name, word, loop, photoSrc, logoUrl]);

  const letters = Array.from(word || " ");
  const mask = photoSrc ? { WebkitMaskImage: `url("${photoSrc}")`, maskImage: `url("${photoSrc}")` } : {};
  const m = "absolute inset-0 h-full w-full [mask-size:contain] [mask-repeat:no-repeat] [mask-position:50%_100%] [-webkit-mask-size:contain] [-webkit-mask-repeat:no-repeat] [-webkit-mask-position:50%_100%]";

  return (
    <div ref={root} className="absolute inset-0 overflow-hidden" style={{ containerType: "inline-size", background: "linear-gradient(90deg,#e2f3ff 0%,#c1f5fe 55%)", fontFamily: "Poppins, system-ui, sans-serif" }}>
      <div data-r="scene" className="absolute inset-0" style={{ transformOrigin: "28% 30%" }}>
        <canvas
          data-r="swirl"
          width={1280}
          height={720}
          className="absolute inset-0 h-full w-full"
          style={{ filter: "blur(.12cqw) saturate(1.15)", WebkitMaskImage: "radial-gradient(ellipse 75% 85% at 18% 8%,#000 55%,transparent 80%)", maskImage: "radial-gradient(ellipse 75% 85% at 18% 8%,#000 55%,transparent 80%)" }}
        />
        <div data-r="person" className="absolute" style={{ left: "3cqw", bottom: 0, width: "52cqw", height: "46cqw" }}>
          <div data-r="outline" className={m} style={{ background: "#1673b8", ...mask }} />
          <div data-r="gy" className={m} style={{ background: "#ffe21a", ...mask }} />
          <div data-r="gc" className={m} style={{ background: "#18b6e8", ...mask }} />
          {photoSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-contain" style={{ objectPosition: "50% 100%", filter: "grayscale(1) contrast(1.08)" }} />
          )}
          <div data-r="sil" className={m} style={{ background: "#f2861f", ...mask }} />
        </div>
        <div className="absolute top-0 bottom-0" style={{ left: "53.7cqw", width: "38cqw" }}>
          <div className="absolute w-full" style={{ top: "5.6cqw", left: 0, height: "13cqw" }}>
            <div data-r="logo" className="absolute grid place-items-center" style={{ left: "calc(50% - 6.5cqw)", top: ".6cqw", width: "13cqw", height: "11.5cqw" }}>
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaSrc(logoUrl)} alt="" className="max-h-full max-w-full object-contain" />
              )}
            </div>
          </div>
          <div className="absolute flex w-full flex-col items-center" style={{ top: "22.3cqw", left: 0, gap: `${gap}cqw` }}>
            <h1 data-r="title" className="m-0 flex w-full justify-center whitespace-nowrap" style={{ fontFamily: '"Bebas Neue", Impact, sans-serif', fontWeight: 400, color: titleColor, lineHeight: 0.8, letterSpacing: `${titleSpacing}em` }}>
              <span>Ministering</span>
            </h1>
            <div data-r="pill" className="grid w-full place-items-center overflow-hidden" style={{ height: `${5.8 * nameScale}cqw`, borderRadius: "3cqw", background: pillColor, transformOrigin: "0 50%" }}>
              <span data-r="pilltext" className="whitespace-nowrap" style={{ fontSize: `${2.65 * nameScale}cqw`, color: nameColor, fontWeight: 600 }}>
                {name}
              </span>
            </div>
          </div>
        </div>
      </div>
      <canvas data-r="burst" width={1280} height={720} className="pointer-events-none absolute" style={{ inset: "-20%", width: "140%", height: "140%" }} />
      <div data-r="end" className="absolute inset-0 grid place-items-center" style={{ background: "linear-gradient(90deg,#e2f3ff 0%,#c1f5fe 70%)", opacity: 0 }}>
        <div data-r="word" className="whitespace-nowrap" style={{ fontFamily: '"Bebas Neue", Impact, sans-serif', fontSize: "12cqw", lineHeight: 1 }}>
          {letters.map((c, i) => (
            <span key={i} style={{ display: "inline-block", color: (i === 2 || i === letters.length - 1) && letters.length > 2 ? "#f2861f" : "#0e416a" }}>
              {c === " " ? " " : c}
            </span>
          ))}
        </div>
      </div>
      <div data-r="white" className="absolute inset-0 bg-white" />
      <div data-r="flash" className="absolute inset-0" style={{ background: "#f2861f" }} />
    </div>
  );
}
