"use client";

import { useEffect, useRef } from "react";
import { mediaSrc } from "@/lib/present";

export const GIVING_DURATION = 20;

// [label, main, dark, darkest, glow]
export const GIVING_THEMES: Record<string, [string, string, string, string, string]> = {
  blue: ["Royal blue", "#1d45b8", "#0a2373", "#041148", "#7ac143"],
  red: ["Red", "#e3060a", "#b8000a", "#6a0003", "#ff5a4f"],
  green: ["Green", "#1c9a4a", "#0b6b30", "#033d1a", "#b8f06a"],
  purple: ["Purple", "#6a2bc4", "#43128f", "#220552", "#d38bff"],
  maroon: ["Maroon", "#8c1c3a", "#5e0c24", "#300410", "#ff8fae"],
  gold: ["Gold", "#d79a12", "#a86a00", "#5a3500", "#ffe08a"],
  teal: ["Teal", "#0fa3a3", "#06706f", "#023b3c", "#7ff0e0"],
  orange: ["Orange", "#f26a0f", "#c04800", "#6b2500", "#ffd27a"],
  black: ["Black and gold", "#3a3a3f", "#1b1b1f", "#050506", "#d4af37"],
};

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
export const darken = (hex: string, f: number) => toHex(hexRgb(hex).map((v) => v * f));
const tint = (hex: string) => toHex(hexRgb(hex).map((v) => v * 0.08 + 255 * 0.92));

export interface GivingProps {
  accountNo: string;
  accountName: string;
  bankName?: string;
  heading?: string;
  logoUrl?: string;
  c1?: string;
  c2?: string;
  c3?: string;
  hi?: string;
  loop?: boolean;
  frozen?: boolean;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const eOut = (p: number) => 1 - Math.pow(1 - p, 3);
const eIn = (p: number) => p * p * p;
const eIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const eBack = (p: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};
const lin = (p: number) => p;
const seg = (t: number, a: number, b: number, e: (p: number) => number = eOut) => e(clamp((t - a) / (b - a)));

const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800;900&display=swap";

const CSS = `
.gv .bg{background:radial-gradient(120% 90% at 70% 120%,var(--c3) 0%,transparent 60%),radial-gradient(90% 120% at 20% -10%,var(--c1) 0%,transparent 70%),linear-gradient(160deg,var(--c1),var(--c2) 60%,var(--c3))}
.gv .streaks{position:absolute;inset:-30%;pointer-events:none;opacity:.55;background:repeating-linear-gradient(105deg,rgba(255,255,255,.07) 0 .15cqw,transparent .15cqw 1.4cqw);-webkit-mask-image:radial-gradient(70% 60% at 60% 70%,#000 20%,transparent 75%);mask-image:radial-gradient(70% 60% at 60% 70%,#000 20%,transparent 75%)}
.gv .bar{position:absolute;left:0;right:0;top:41.3cqw;height:15cqw;overflow:hidden;box-shadow:0 -.4cqw 1.6cqw rgba(0,0,0,.35)}
.gv .panel{position:absolute;left:0;top:0;width:25.5cqw;height:100%;overflow:hidden;box-shadow:.4cqw 0 1.6cqw rgba(0,0,0,.35)}
.gv .tile{border-radius:18%;background:linear-gradient(160deg,var(--tile1),var(--tile2));display:grid;place-items:center;overflow:hidden;box-shadow:0 .25cqw .8cqw rgba(0,0,0,.35),inset 0 0 0 .18cqw rgba(255,255,255,.7)}
.gv .tile img{width:84%;height:84%;object-fit:contain}
.gv .tile .ph{font-weight:800;color:var(--c2);text-align:center;line-height:1.05;letter-spacing:-.02em}
.gv .barTile{position:absolute;left:35.7cqw;top:3.6cqw;width:8.4cqw;height:8.4cqw}
.gv .barTile .ph{font-size:1.45cqw}
.gv .barText{position:absolute;left:46.4cqw;right:3cqw;top:2.7cqw}
.gv .acctName{color:#fff;font-weight:700;font-size:2.55cqw;line-height:1.1;white-space:nowrap;text-transform:uppercase;letter-spacing:.01em;text-shadow:0 .15cqw .4cqw rgba(0,0,0,.4)}
.gv .acctNo{font-weight:800;font-size:6.6cqw;line-height:1.05;white-space:nowrap;letter-spacing:-.01em;background:linear-gradient(100deg,#fff 0%,#f2f2f2 40%,#fff 46%,#cfcfcf 52%,#f4f4f4 70%,#bdbdbd 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 .25cqw .35cqw rgba(0,0,0,.45))}
.gv .heading{position:absolute;left:0;right:0;top:9cqw;text-align:center;color:#fff;font-weight:800;font-size:3.5cqw;line-height:1.05;text-transform:uppercase;text-shadow:0 .25cqw .6cqw rgba(0,0,0,.45);white-space:pre-line;padding:0 1.5cqw}
.gv .phone{position:absolute;left:3.6cqw;top:24.5cqw;width:18.5cqw;height:36cqw;border-radius:2.6cqw;background:#0b0b0d;padding:.75cqw;box-shadow:inset 0 0 0 .25cqw #2c2c30,1.2cqw 1.2cqw 2.2cqw rgba(0,0,0,.55);transform-origin:50% 90%}
.gv .screen{position:relative;width:100%;height:100%;border-radius:2cqw;overflow:hidden;background:radial-gradient(80% 50% at 50% 35%,#2a2a30,#0d0d10 70%)}
.gv .sparkle{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.55) 0 .08cqw,transparent .1cqw);background-size:1.6cqw 1.6cqw;opacity:.25}
.gv .notch{position:absolute;left:50%;top:.6cqw;width:4.5cqw;height:1cqw;margin-left:-2.25cqw;border-radius:1cqw;background:#000}
.gv .scrTile{position:absolute;left:50%;top:3.6cqw;width:7.6cqw;height:4.2cqw;margin-left:-3.8cqw;border-radius:.7cqw}
.gv .scrTile .ph{font-size:1.05cqw}
.gv .scrName{position:absolute;left:.6cqw;right:.6cqw;top:8.6cqw;text-align:center;color:#fff;font-weight:700;font-size:.82cqw;text-transform:uppercase;line-height:1.15}
.gv .scrNo{position:absolute;left:0;right:0;top:10.4cqw;text-align:center;color:#fff;font-weight:800;font-size:1.85cqw;letter-spacing:-.01em;white-space:nowrap}
.gv .box{position:absolute;left:50%;bottom:2.5cqw;width:11cqw;margin-left:-5.5cqw;height:5cqw;border-radius:.4cqw .4cqw .2cqw .2cqw;background:linear-gradient(180deg,#fff,#d9d9de 60%,#b9b9c0)}
.gv .box::before{content:"";position:absolute;left:-.4cqw;right:-.4cqw;top:-1.3cqw;height:1.6cqw;border-radius:.5cqw;background:linear-gradient(180deg,#f6f6f8,#e4e4ea);box-shadow:0 .2cqw .3cqw rgba(0,0,0,.15)}
.gv .cubeTile{position:absolute;left:50%;bottom:7.6cqw;width:7cqw;height:7cqw;margin-left:-3.5cqw}
.gv .cubeTile .ph{font-size:1.15cqw}
.gv .glow{position:absolute;left:50%;bottom:6cqw;width:12cqw;height:6cqw;margin-left:-6cqw;border-radius:50%;background:radial-gradient(closest-side,var(--hi),transparent);opacity:.45;filter:blur(.6cqw)}
`;

function Tile({ cls, logoUrl, bank, r }: { cls: string; logoUrl?: string; bank: string; r?: string }) {
  const [a, ...rest] = bank.split(/\s+/);
  return (
    <div data-r={r} className={`tile ${cls}`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaSrc(logoUrl)} alt="" />
      ) : (
        <span className="ph">
          {a}
          {rest.length > 0 && <br />}
          {rest.join(" ")}
        </span>
      )}
    </div>
  );
}

// "Offering and Tithe" livestream overlay: an account bar sliding in from the right and a phone panel
// rising on the left. Everything outside those two is see-through, so it sits over the present background.
export function GivingPromo({ accountNo, accountName, bankName = "", heading = "Offering\nand\nTithe", logoUrl, c1 = "#1d45b8", c2 = "#0a2373", c3 = "#041148", hi = "#7ac143", loop, frozen }: GivingProps) {
  const root = useRef<HTMLDivElement>(null);
  const render = useRef<(t: number) => void>(() => {});

  useEffect(() => {
    if (document.querySelector("link[data-giving-fonts]")) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONTS_HREF;
    l.dataset.givingFonts = "1";
    document.head.appendChild(l);
  }, []);

  useEffect(() => {
    const els: Record<string, HTMLElement> = {};
    root.current?.querySelectorAll<HTMLElement>("[data-r]").forEach((el) => (els[el.dataset.r!] = el));
    const $ = (id: string) => els[id];
    render.current = (t: number) => {
      const bin = seg(t, 0, 0.8, eIO);
      const bout = seg(t, 18.6, 19.3, eIn);
      $("bar").style.transform = `translateX(${(1 - bin) * 100 + bout * 100}%)`;
      $("barText").style.opacity = String(seg(t, 0.5, 1.0));
      $("barTile").style.transform = `scale(${seg(t, 0.55, 1.05, eBack)})`;

      const pin = seg(t, 0.8, 1.5, eIO);
      const pout = seg(t, 17.9, 18.5, eIn);
      $("panel").style.transform = `translateY(${(1 - pin) * 100 + pout * 100}%)`;

      const hin = seg(t, 1.6, 2.2);
      const hout = seg(t, 17.3, 17.8, lin);
      $("heading").style.opacity = String(hin * (1 - hout));
      $("heading").style.transform = `translateY(${(1 - hin) * 2}cqw) scale(${0.92 + 0.08 * hin})`;
      $("heading").style.filter = `blur(${(1 - hin) * 0.5 + hout * 0.7}cqw)`;

      const fin = seg(t, 1.9, 2.8, eBack);
      const fout = seg(t, 17.3, 17.9, eIn);
      const rock = Math.sin((t - 2.8) * 1.1) * 5 * clamp((t - 2.6) / 0.8);
      $("phone").style.transform = `translateY(${(1 - fin) * 30 + fout * 6}cqw) rotate(${(1 - fin) * -18 + rock + fout * -10}deg)`;
      $("phone").style.filter = fout > 0 ? `blur(${fout * 0.6}cqw)` : "none";
      $("phone").style.opacity = String(1 - fout);
      $("cubeTile").style.transform = `translateY(${Math.sin(t * 2.2) * -0.6}cqw) rotate(${Math.sin(t * 1.3) * 4}deg)`;
      $("sparkle").style.backgroundPosition = `${t * 0.4}cqw ${t * -0.8}cqw`;

      const sh = ((t - 2) % 4) / 1.2;
      $("acctNo").style.backgroundPosition = `${sh >= 0 && sh <= 1 ? (1 - sh) * 120 - 10 : 110}% 0`;
      const drift = `translateX(${(t * 0.35) % 1.55}cqw)`;
      $("streaks1").style.transform = drift;
      $("streaks2").style.transform = drift;
    };
  }, []);

  // Long names/numbers shrink to fit their line.
  useEffect(() => {
    const fit = () => {
      const cw = root.current?.getBoundingClientRect().width;
      if (!cw) return;
      for (const id of ["acctName", "acctNo", "scrNo"]) {
        const el = root.current?.querySelector<HTMLElement>(`[data-r=${id}]`);
        if (!el) continue;
        el.style.fontSize = "";
        const avail = el.parentElement!.getBoundingClientRect().width;
        const cur = parseFloat(getComputedStyle(el).fontSize);
        if (el.scrollWidth > avail) el.style.fontSize = `${(((cur * avail) / el.scrollWidth) / cw) * 100}cqw`;
      }
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
  }, [accountNo, accountName]);

  useEffect(() => {
    if (frozen) {
      render.current(8);
      return;
    }
    let raf = 0;
    let start = performance.now();
    const tick = (now: number) => {
      if (loop && now - start >= GIVING_DURATION * 1000) start = now;
      render.current(Math.min(GIVING_DURATION, (now - start) / 1000));
      if (loop || now - start < GIVING_DURATION * 1000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozen, loop, accountNo, accountName]);

  const vars = { "--c1": c1, "--c2": c2, "--c3": c3, "--hi": hi, "--tile1": "#ffffff", "--tile2": tint(c1) } as React.CSSProperties;
  return (
    <div ref={root} className="gv absolute inset-0 overflow-hidden" style={{ containerType: "inline-size", fontFamily: "Poppins, system-ui, sans-serif", ...vars }}>
      <style>{CSS}</style>
      <div data-r="bar" className="bar bg" style={{ transform: "translateX(100%)" }}>
        <div data-r="streaks1" className="streaks" />
        <Tile r="barTile" cls="barTile" logoUrl={logoUrl} bank={bankName} />
        <div data-r="barText" className="barText">
          <div data-r="acctName" className="acctName">{accountName}</div>
          <div data-r="acctNo" className="acctNo">{accountNo}</div>
        </div>
      </div>
      <div data-r="panel" className="panel bg" style={{ transform: "translateY(100%)" }}>
        <div data-r="streaks2" className="streaks" />
        <div data-r="heading" className="heading">{heading}</div>
        <div data-r="phone" className="phone">
          <div className="screen">
            <div data-r="sparkle" className="sparkle" />
            <div className="notch" />
            <Tile cls="scrTile" logoUrl={logoUrl} bank={bankName} />
            <div className="scrName">{accountName}</div>
            <div data-r="scrNo" className="scrNo">{accountNo}</div>
            <div className="glow" />
            <div className="box" />
            <Tile r="cubeTile" cls="cubeTile" logoUrl={logoUrl} bank={bankName} />
          </div>
        </div>
      </div>
    </div>
  );
}
