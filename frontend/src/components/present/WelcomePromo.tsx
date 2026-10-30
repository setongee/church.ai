"use client";

import { useEffect, useRef } from "react";
import { loadFont } from "@/lib/fonts";
import { mediaSrc } from "@/lib/present";

export interface WelcomeProps {
  script?: string;
  main?: string;
  badgeTop?: string;
  badgeNum?: string;
  badgeColor?: string;
  marquee?: string;
  logoUrl?: string;
  bgUrl?: string;
  photos?: string[];
  // Seconds each photo stays in the centre.
  speed?: number;
  // Space between the logo and the script line, and between the photos and the scrolling text (cqw).
  logoGap?: number;
  marqueeGap?: number;
  // Google font families; empty = the template's own.
  scriptFont?: string;
  mainFont?: string;
  badgeFont?: string;
  marqueeFont?: string;
  frozen?: boolean;
}

const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Great+Vibes&family=Unbounded:wght@800;900&family=Poppins:wght@400;500;600;700&display=swap";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const eIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

// distance from centre -> x-centre, width, height, opacity (cqw)
const XS = [0, 16.0, 21.6, 25.9, 29.6, 32.6];
const WS = [25.5, 5.9, 4.3, 3.5, 2.8, 0];
const HS = [23.2, 20.2, 16.4, 12.2, 9, 6];
const OS = [1, 1, 1, 0.95, 0.5, 0];
const at = (arr: number[], a: number) => {
  const i = Math.min(Math.floor(a), arr.length - 2);
  return lerp(arr[i], arr[i + 1], a - i);
};

const PH = [
  "linear-gradient(160deg,#6b3b1f,#2a140a)", "linear-gradient(160deg,#7a1f2b,#2c0a10)", "linear-gradient(160deg,#1f4a6b,#0a1a2a)",
  "linear-gradient(160deg,#8a6a2a,#2e220a)", "linear-gradient(160deg,#3d2a6b,#130a2a)", "linear-gradient(160deg,#1f6b55,#0a2a20)",
  "linear-gradient(160deg,#6b5a4a,#221a12)", "linear-gradient(160deg,#a0471c,#331306)", "linear-gradient(160deg,#2b5c7a,#0c1d29)",
];

const R = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const PARTS = Array.from({ length: 90 }, (_, i) => ({ x: R(i, 1), y: R(i, 2), r: R(i, 3), sp: 0.006 + R(i, 4) * 0.018, dr: R(i, 5) * 6.28, lamp: R(i, 6) < 0.14 }));

function dust(c: HTMLCanvasElement, t: number) {
  const x = c.getContext("2d");
  if (!x) return;
  const W = c.width;
  const H = c.height;
  x.clearRect(0, 0, W, H);
  PARTS.forEach((p) => {
    const y = (((p.y - t * p.sp) % 1) + 1) % 1;
    const px = p.x + Math.sin(t * 0.3 + p.dr) * 0.01;
    const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + p.dr * 3);
    if (!p.lamp) {
      x.fillStyle = `rgba(255,${190 + Math.round(p.r * 50)},120,${0.18 + 0.5 * tw * p.r})`;
      x.beginPath();
      x.arc(px * W, y * H, (0.6 + p.r * 2.2) * (W / 1280), 0, 6.283);
      x.fill();
    } else {
      const s = (5 + p.r * 7) * (W / 1280);
      x.save();
      x.translate(px * W, y * H);
      x.rotate(Math.sin(t * 0.5 + p.dr) * 0.15);
      x.globalAlpha = 0.12 + 0.12 * tw;
      x.strokeStyle = "#f3d9a8";
      x.lineWidth = W / 1280;
      x.beginPath();
      x.moveTo(0, -s * 1.6);
      x.lineTo(0, -s);
      x.moveTo(-s * 0.7, -s * 0.6);
      x.lineTo(s * 0.7, -s * 0.6);
      x.lineTo(s * 0.45, s * 0.6);
      x.lineTo(0, s);
      x.lineTo(-s * 0.45, s * 0.6);
      x.closePath();
      x.stroke();
      x.fillStyle = "rgba(255,220,160,.35)";
      x.beginPath();
      x.arc(0, 0, s * 0.25, 0, 6.283);
      x.fill();
      x.restore();
    }
  });
}

const CSS = `
.wc .bgdefault{position:absolute;inset:0;background:radial-gradient(60% 45% at 50% 100%,rgba(120,80,40,.35),transparent 70%),radial-gradient(50% 40% at 15% 30%,rgba(90,60,30,.25),transparent 70%),radial-gradient(45% 40% at 85% 25%,rgba(90,60,30,.22),transparent 70%),linear-gradient(180deg,#120d09,#0b0806 50%,#1a120b)}
.wc .bgimg{position:absolute;inset:-4%;background-size:cover;background-position:center;filter:blur(.35cqw) saturate(.8) brightness(.55)}
.wc .shade{position:absolute;inset:0;background:radial-gradient(70% 55% at 50% 45%,rgba(0,0,0,0),rgba(0,0,0,.55) 100%),linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.1) 40%,rgba(0,0,0,.5))}
.wc .head{position:absolute;left:0;right:0;top:4.2cqw;display:flex;flex-direction:column;align-items:center}
.wc .logo{height:4.4cqw;max-width:22cqw;display:flex;align-items:center;justify-content:center}
.wc .logo img{max-height:100%;max-width:100%;object-fit:contain;filter:drop-shadow(0 .2cqw .5cqw rgba(0,0,0,.5))}
.wc .script{font-family:"Great Vibes","Brush Script MT",cursive;color:#fff;font-size:6.6cqw;line-height:.9;margin-top:.6cqw;text-shadow:0 .2cqw .8cqw rgba(0,0,0,.6);white-space:nowrap}
.wc .mainRow{position:relative;margin-top:-.8cqw}
.wc .main{font-family:Unbounded,"Arial Black",sans-serif;font-weight:900;color:#fff;font-size:6.6cqw;line-height:1;letter-spacing:-.01em;text-transform:uppercase;white-space:nowrap;text-shadow:0 .3cqw 1cqw rgba(0,0,0,.6)}
.wc .badge{position:absolute;right:-.6cqw;top:28%;width:3.2cqw;padding:.45cqw 0 1.25cqw;background:var(--badge);color:#fff;text-align:center;clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%);transform-origin:50% 0;box-shadow:inset 0 .25cqw 0 rgba(255,255,255,.25)}
.wc .badge .t{display:block;font-weight:700;font-size:.8cqw;line-height:1;letter-spacing:.04em;text-transform:uppercase}
.wc .badge .n{display:block;font-weight:800;font-size:2.3cqw;line-height:1.05}
.wc .carousel{position:absolute;left:0;right:0;top:40.5cqw;height:0}
.wc .card{position:absolute;left:50%;top:0;border-radius:2cqw;overflow:hidden;background-size:cover;background-position:center;box-shadow:0 .8cqw 2cqw rgba(0,0,0,.55);will-change:transform,width,height}
.wc .marquee{position:absolute;left:0;right:0;height:2.6cqw;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.wc .track{position:absolute;left:0;top:0;white-space:nowrap;color:#fff;font-weight:500;font-size:1.55cqw;letter-spacing:.55em;line-height:2.6cqw;text-transform:uppercase}
`;

const font = (f: string): React.CSSProperties => (f ? { fontFamily: `"${f}", system-ui, sans-serif` } : {});

// "Welcome to Church" holding screen: a coverflow of photos rotating in the centre, a scrolling line
// along the bottom, drifting dust and lanterns. It runs continuously (there's no end).
export function WelcomePromo({ script = "Welcome to", main = "Church", badgeTop = "", badgeNum = "", badgeColor = "#d4131b", marquee = "", logoUrl, bgUrl, photos = [], speed = 3, logoGap = 0.6, marqueeGap = 0, scriptFont = "", mainFont = "", badgeFont = "", marqueeFont = "", frozen }: WelcomeProps) {
  const root = useRef<HTMLDivElement>(null);
  const render = useRef<(t: number) => void>(() => {});
  const speedRef = useRef(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Chosen Google fonts, fetched in whichever window is showing this.
  useEffect(() => {
    [scriptFont, mainFont, badgeFont, marqueeFont].filter(Boolean).forEach((f) => void loadFont(f));
  }, [scriptFont, mainFont, badgeFont, marqueeFont]);

  useEffect(() => {
    if (document.querySelector("link[data-welcome-fonts]")) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONTS_HREF;
    l.dataset.welcomeFonts = "1";
    document.head.appendChild(l);
  }, []);

  const base = photos.length ? photos.map((u) => ({ url: mediaSrc(u) })) : PH.map((g) => ({ grad: g }));
  const reps = Math.max(1, Math.ceil(9 / base.length));
  const items = Array.from({ length: reps }, () => base).flat();
  const count = items.length;

  useEffect(() => {
    render.current = (t: number) => {
      const host = root.current;
      if (!host) return;
      const cards = Array.from(host.querySelectorAll<HTMLElement>(".card"));
      const n = cards.length;
      const per = speedRef.current || 3;
      const mv = Math.min(0.9, per * 0.35);
      if (n) {
        const k = Math.floor(t / per);
        const f = eIO(clamp(((t % per) - (per - mv)) / mv));
        const c = (k + f) % n;
        cards.forEach((el, i) => {
          let d = i - c;
          d = ((d % n) + n) % n;
          if (d > n / 2) d -= n;
          const a = Math.min(Math.abs(d), 5);
          const s = Math.sign(d);
          const w = at(WS, a);
          const h = at(HS, a);
          const x = s * at(XS, a);
          const o = at(OS, a);
          el.style.width = `${w}cqw`;
          el.style.height = `${h}cqw`;
          el.style.transform = `translate(${x - w / 2}cqw,${-h / 2}cqw)`;
          el.style.opacity = String(o);
          el.style.zIndex = String(10 - Math.round(a * 2));
          el.style.borderRadius = `${a < 1 ? lerp(2, 3, a) : 3}cqw`;
          el.style.backgroundPosition = `${50 + (a < 1 ? d * -20 : 0)}% 40%`;
          el.style.visibility = o <= 0.01 ? "hidden" : "visible";
        });
      }
      const canvas = host.querySelector<HTMLCanvasElement>("canvas");
      if (canvas) dust(canvas, t);
      const track = host.querySelector<HTMLElement>(".track");
      if (track) {
        const half = track.scrollWidth / 2 || 1;
        const pxPerCqw = host.getBoundingClientRect().width / 100 || 1;
        track.style.transform = `translateX(${-((t * 3.2 * pxPerCqw) % half)}px)`;
      }
      const badge = host.querySelector<HTMLElement>(".badge");
      if (badge) badge.style.transform = `rotate(${Math.sin(t * 1.6) * 3}deg)`;
    };
  }, []);

  useEffect(() => {
    if (frozen) {
      render.current(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      render.current((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozen, count, photos.length, marquee]);

  const line = (marquee.trim() || " ");
  const track = Array(12).fill(line).join("    •    ");
  const showBadge = Boolean(badgeTop.trim() || badgeNum.trim());
  return (
    <div ref={root} className="wc absolute inset-0 overflow-hidden bg-[#0b0806]" style={{ containerType: "inline-size", fontFamily: "Poppins, system-ui, sans-serif", ["--badge" as string]: badgeColor }}>
      <style>{CSS}</style>
      <div className="bgdefault" />
      {bgUrl && <div className="bgimg" style={{ backgroundImage: `url("${mediaSrc(bgUrl)}")` }} />}
      <div className="shade" />
      <canvas width={1280} height={720} className="absolute inset-0 h-full w-full" />
      <div className="head">
        <div className="logo">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc(logoUrl)} alt="" />
          )}
        </div>
        <div className="script" style={{ marginTop: `${logoGap}cqw`, ...font(scriptFont) }}>{script}</div>
        <div className="mainRow">
          <div className="main" style={font(mainFont)}>{main}</div>
          {showBadge && (
            <div className="badge" style={font(badgeFont)}>
              <span className="t">{badgeTop}</span>
              <span className="n">{badgeNum}</span>
            </div>
          )}
        </div>
      </div>
      <div className="carousel">
        {items.map((it, i) => (
          <div key={i} className="card" style={"url" in it ? { backgroundImage: `url("${it.url}")` } : { background: it.grad }} />
        ))}
      </div>
      <div className="marquee" style={{ top: `${52.1 + marqueeGap}cqw` }}>
        <div className="track" style={font(marqueeFont)}>{track}</div>
      </div>
    </div>
  );
}
