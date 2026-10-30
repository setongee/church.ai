import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { normaliseTheme } from './templates.js';
import { BODY_FONT, NoAudioProvider, displayFont, displayWeight, rgba, sz, useFonts } from './common.jsx';
import { OutroCard } from './Reel.jsx';

const W = 1080;
const H = 1920;
const CREAM = '#f7efe2';
const FPS = 30;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

// -------------------------------------------------------------------------------- building blocks

const at = (images, i) => images[((i % images.length) + images.length) % images.length];

function Photo({ src, style }) {
  return <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} />;
}

// Halftone dots over a photo - the printed-poster texture.
function Halftone({ size = 14, opacity = 0.35, color = '#ffffff', blend = 'overlay' }) {
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(${color} 24%, transparent 26%)`,
        backgroundSize: `${size}px ${size}px`,
        opacity,
        mixBlendMode: blend,
        pointerEvents: 'none',
      }}
    />
  );
}

// Warm-to-cool colour wash that gives the photos one consistent look.
function Tint({ a, b, opacity = 0.5, angle = 160 }) {
  return <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${a}, ${b})`, mixBlendMode: 'soft-light', opacity, pointerEvents: 'none' }} />;
}

// A rounded photo tile with the collage treatment (tint + halftone).
function Tile({ src, pal, radius = 44, style, children, tint = 0.45, dots = 0.3 }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: radius, background: '#222', ...style }}>
      <Photo src={src} />
      <Tint a={pal.tintA} b={pal.tintB} opacity={tint} />
      <Halftone opacity={dots} />
      {children}
    </div>
  );
}

function useCycle(cycle) {
  const frame = useCurrentFrame();
  return { frame, idx: Math.floor(frame / cycle), local: frame % cycle, p: (frame % cycle) / cycle };
}

// ------------------------------------------------------------------------------------- 1. collage

function Collage({ images, pal, cycle }) {
  const { frame, idx, local } = useCycle(cycle);
  const pad = 34;
  const gap = 26;
  const leftW = 410;
  const tileH = 540;
  const per = tileH + gap;
  const total = per * Math.max(images.length, 3);
  const offset = (frame * 4.4) % total;
  const first = Math.floor(offset / per);
  const rows = Math.ceil(H / per) + 2;
  const heroLeft = pad + leftW + gap;
  const heroW = W - heroLeft - pad + 30;
  const heroH = H - pad * 2 - 130;
  const heroImg = (i) => at(images, i);
  const t = interpolate(local, [0, 16], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const pan = interpolate(local, [0, cycle], [-18, 18]);

  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <Halftone size={16} opacity={0.12} color="#8a6a3a" blend="multiply" />
      {/* the column of tiles gliding upward in a loop */}
      <div style={{ position: 'absolute', left: pad, top: 0, width: leftW, height: H, overflow: 'hidden' }}>
        {Array.from({ length: rows }, (_, k) => {
          const i = first + k;
          return (
            <Tile key={k} src={at(images, i + 1)} pal={pal} style={{ position: 'absolute', left: 0, top: k * per - (offset % per) + pad, width: leftW, height: tileH }} />
          );
        })}
      </div>
      {/* the angled hero box, photos sliding through it */}
      <div style={{ position: 'absolute', left: heroLeft, top: pad, width: heroW, height: heroH, clipPath: 'polygon(14% 0%, 100% 0%, 100% 100%, 0% 100%)', borderRadius: 44, overflow: 'hidden', background: '#222' }}>
        {idx > 0 && (
          <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-t * 30}%)`, opacity: 1 - t * 0.5 }}>
            <Photo src={heroImg(idx - 1)} style={{ transform: 'scale(1.14)' }} />
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - t) * 100}%)` }}>
          <Photo src={heroImg(idx)} style={{ transform: `scale(1.14) translateX(${pan}px)` }} />
        </div>
        <Tint a={pal.tintA} b={pal.tintB} opacity={0.5} />
        <Halftone opacity={0.3} />
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------------------- 2. wall

function Wall({ images, pal }) {
  const frame = useCurrentFrame();
  const gap = 22;
  const colW = (W + 120 - gap * 4) / 3;
  const tileH = colW * 1.3;
  const per = tileH + gap;
  const speeds = [3.4, -4.6, 4.0];
  const rows = Math.ceil((H + 500) / per) + 3;
  const total = per * Math.max(images.length, 4);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, ${pal.bg}, ${pal.bg2})`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -60, top: -250, width: W + 120, height: H + 500, transform: 'rotate(-6deg)' }}>
        {speeds.map((sp, c) => {
          const off = (((frame * sp) % total) + total) % total;
          const first = Math.floor(off / per);
          return Array.from({ length: rows }, (_, k) => {
            const i = first + k + c * 2;
            return (
              <Tile key={`${c}-${k}`} src={at(images, i)} pal={pal} radius={36} style={{ position: 'absolute', left: gap + c * (colW + gap), top: k * per - (off % per) - per, width: colW, height: tileH }} />
            );
          });
        })}
      </div>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 40%, ${rgba(pal.bg2, 0.7)} 100%)` }} />
    </AbsoluteFill>
  );
}

// ----------------------------------------------------------------------------------- 3. filmstrip

function FilmStrip({ images, pal }) {
  const frame = useCurrentFrame();
  const frameW = 430;
  const frameH = 500;
  const gap = 26;
  const per = frameW + gap;
  const total = per * Math.max(images.length, 4);
  const strips = [
    { y: 170, sp: 5.4 },
    { y: 770, sp: -6.2 },
    { y: 1370, sp: 5.0 },
  ];
  const cols = Math.ceil((W + 300) / per) + 3;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${pal.bg}, ${pal.bg2})`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -150, top: 0, width: W + 300, height: H, transform: 'rotate(-4deg) scale(1.08)' }}>
        {strips.map((s, r) => {
          const off = (((frame * s.sp) % total) + total) % total;
          const first = Math.floor(off / per);
          return (
            <div key={r} style={{ position: 'absolute', left: 0, top: s.y, width: '100%', height: frameH + 96, background: '#0a0a0a', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
              {[8, frameH + 96 - 30].map((y) => (
                <div key={y} style={{ position: 'absolute', left: 0, right: 0, top: y, height: 22, backgroundImage: `repeating-linear-gradient(90deg, ${rgba(pal.text, 0.85)} 0 26px, transparent 26px 52px)`, borderRadius: 4, opacity: 0.8, transform: `translateX(${-(off % 52)}px)` }} />
              ))}
              {Array.from({ length: cols }, (_, k) => {
                const i = first + k + r * 3;
                return (
                  <div key={k} style={{ position: 'absolute', top: 48, left: k * per - (off % per) - per, width: frameW, height: frameH, overflow: 'hidden', borderRadius: 6 }}>
                    <Photo src={at(images, i)} />
                    <Tint a={pal.tintA} b={pal.tintB} opacity={0.35} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------------------------ 4. polaroid

function Polaroid({ images, pal, cycle }) {
  const { frame, idx } = useCycle(cycle);
  const { fps } = useVideoConfig();
  const first = Math.max(0, idx - 4);
  const cards = [];
  for (let j = first; j <= idx; j += 1) cards.push(j);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, ${pal.bg}, ${pal.bg2})` }}>
      <Halftone size={22} opacity={0.1} color="#6b4a1e" blend="multiply" />
      {cards.map((j) => {
        const f = frame - j * cycle;
        const s = spring({ frame: f, fps, config: { damping: 13, stiffness: 90, mass: 0.9 } });
        const rot = ((j * 37) % 17) - 8;
        const dx = (((j * 53) % 9) - 4) * 14;
        const age = idx - j;
        return (
          <div
            key={j}
            style={{
              position: 'absolute',
              left: (W - 840) / 2 + dx,
              top: 330 - age * 6,
              width: 840,
              padding: '40px 40px 150px',
              background: '#fdfaf4',
              boxShadow: '0 30px 70px rgba(40,20,0,0.35)',
              transform: `translateY(${(1 - s) * -1500}px) rotate(${rot * s + (1 - s) * 22}deg) scale(${1 - age * 0.02})`,
              filter: age > 0 ? `brightness(${1 - age * 0.06})` : 'none',
            }}
          >
            <div style={{ position: 'relative', width: 760, height: 780, overflow: 'hidden', background: '#222' }}>
              <Photo src={at(images, j)} />
              <Tint a={pal.tintA} b={pal.tintB} opacity={0.22} />
              <Halftone opacity={0.14} />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ----------------------------------------------------------------------------------- 5. kenburns

function KenBurns({ images, pal, cycle }) {
  const { idx, local } = useCycle(cycle);
  const fade = 14;
  const layer = (i, opacity, localF) => {
    const dir = i % 4;
    const z = interpolate(localF, [0, cycle + fade], [1.04, 1.22]);
    const tx = (dir === 0 ? -1 : dir === 1 ? 1 : 0) * interpolate(localF, [0, cycle + fade], [0, 46]);
    const ty = (dir === 2 ? -1 : dir === 3 ? 1 : 0) * interpolate(localF, [0, cycle + fade], [0, 60]);
    return (
      <AbsoluteFill key={i} style={{ opacity }}>
        <Photo src={at(images, i)} style={{ transform: `scale(${z}) translate(${tx}px, ${ty}px)` }} />
      </AbsoluteFill>
    );
  };
  const nextOpacity = interpolate(local, [cycle - fade, cycle], [0, 1], { extrapolateLeft: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {layer(idx, 1, local)}
      {local > cycle - fade && layer(idx + 1, nextOpacity, local - (cycle - fade))}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${rgba('#000', 0.35)} 0%, transparent 25%, transparent 60%, ${rgba('#000', 0.75)} 100%)` }} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------------- 6. slidestack

function SlideStack({ images, pal, cycle }) {
  const { frame, idx } = useCycle(cycle);
  const { fps } = useVideoConfig();
  const first = Math.max(0, idx - 3);
  const cards = [];
  for (let j = first; j <= idx; j += 1) cards.push(j);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(165deg, ${pal.bg}, ${pal.bg2})` }}>
      <Halftone size={18} opacity={0.08} />
      {cards.map((j) => {
        const f = frame - j * cycle;
        const s = spring({ frame: f, fps, config: { damping: 17, stiffness: 100 } });
        const age = idx - j;
        // while the next card rises, this one eases back
        const ageF = age > 0 ? 1 : 0;
        return (
          <div
            key={j}
            style={{
              position: 'absolute',
              left: 80,
              top: 200,
              width: 920,
              height: 1400,
              borderRadius: 56,
              overflow: 'hidden',
              boxShadow: '0 40px 90px rgba(0,0,0,0.5)',
              transform: `translateY(${(1 - s) * 1700 - age * 70}px) scale(${1 - age * 0.06})`,
              filter: `brightness(${1 - ageF * age * 0.18})`,
              zIndex: j,
            }}
          >
            <Photo src={at(images, j)} />
            <Tint a={pal.tintA} b={pal.tintB} opacity={0.3} />
            <Halftone opacity={0.18} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------------------------ 7. diagonal

function Diagonal({ images, pal, cycle }) {
  const { idx, local } = useCycle(cycle);
  const wipe = 18;
  const t = interpolate(local, [cycle - wipe, cycle], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const x = t * 140 - 20; // % position of the sweeping edge
  const zoom = (l) => interpolate(l, [0, cycle + wipe], [1.05, 1.2]);
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill>
        <Photo src={at(images, idx)} style={{ transform: `scale(${zoom(local)})` }} />
      </AbsoluteFill>
      {t > 0 && (
        <AbsoluteFill style={{ clipPath: `polygon(0 0, ${x + 20}% 0, ${x - 20}% 100%, 0 100%)` }}>
          <Photo src={at(images, idx + 1)} style={{ transform: `scale(${zoom(local - cycle + wipe)})` }} />
        </AbsoluteFill>
      )}
      {t > 0 && t < 1 && (
        <div style={{ position: 'absolute', top: -100, bottom: -100, left: `${x + 8}%`, width: 36, background: pal.accent, transform: 'skewX(-11deg)', boxShadow: `0 0 50px ${rgba(pal.accent, 0.8)}` }} />
      )}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent 55%, ${rgba('#000', 0.7)} 100%)` }} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------------- 8. zoompunch

function ZoomPunch({ images, pal, cycle }) {
  const { idx, local } = useCycle(cycle);
  const punch = interpolate(local, [0, 9], [1.38, 1.0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const drift = interpolate(local, [9, cycle], [1.0, 1.1], { extrapolateLeft: 'clamp' });
  const flash = interpolate(local, [0, 6], [0.85, 0], { extrapolateRight: 'clamp' });
  const shake = local < 7 ? Math.sin(local * 5.1) * (7 - local) * 2.2 : 0;
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${-shake * 0.6}px)` }}>
        <Photo src={at(images, idx)} style={{ transform: `scale(${punch * drift})`, filter: 'contrast(1.12) saturate(1.15)' }} />
      </AbsoluteFill>
      <Tint a={pal.tintA} b={pal.tintB} opacity={0.35} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)' }} />
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------------------------ 9. mosaic

function Mosaic({ images, pal, cycle }) {
  const { frame, idx, local } = useCycle(cycle);
  const { fps } = useVideoConfig();
  const cols = 3;
  const rows = 5;
  const gap = 12;
  const tw = (W - gap * (cols + 1)) / cols;
  const th = (H - gap * (rows + 1)) / rows;
  const hot = (idx * 7 + 3) % (cols * rows);
  const edges = [
    [0, -H], [W, 0], [0, H], [-W, 0],
  ];
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, ${pal.bg}, ${pal.bg2})`, overflow: 'hidden' }}>
      {Array.from({ length: cols * rows }, (_, k) => {
        const c = k % cols;
        const r = Math.floor(k / cols);
        const s = spring({ frame: frame - 4 - k * 3, fps, config: { damping: 15, stiffness: 110 } });
        const [ex, ey] = edges[k % 4];
        const x = gap + c * (tw + gap);
        const y = gap + r * (th + gap);
        const isHot = k === hot && frame > 60;
        const up = isHot ? interpolate(local, [0, 12, cycle - 12, cycle], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }) : 0;
        const cx = W / 2 - (x + tw / 2);
        const cy = H / 2 - (y + th / 2);
        return (
          <div
            key={k}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: tw,
              height: th,
              zIndex: isHot ? 5 : 1,
              transform: `translate(${(1 - s) * ex + cx * up}px, ${(1 - s) * ey + cy * up}px) scale(${1 + up * 1.85}) rotate(${(1 - s) * 18}deg)`,
              filter: !isHot && frame > 60 ? 'brightness(0.78)' : 'none',
              boxShadow: up > 0 ? '0 30px 80px rgba(0,0,0,0.6)' : 'none',
            }}
          >
            <Tile src={at(images, k + (isHot ? idx : 0))} pal={pal} radius={26} style={{ width: '100%', height: '100%' }} tint={0.3} dots={0.2} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------------- 10. coverflow

function CoverFlow({ images, pal, cycle }) {
  const frame = useCurrentFrame();
  const move = 22;
  const idx = Math.floor(frame / cycle);
  const local = frame % cycle;
  const step = interpolate(local, [cycle - move, cycle], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const pos = idx + step;
  const cur = Math.round(pos);
  return (
    <AbsoluteFill style={{ background: pal.bg2, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: 'scale(1.5)', filter: 'blur(50px) brightness(0.55)' }}>
        <Photo src={at(images, cur)} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, perspective: 1800 }}>
        {[-2, -1, 0, 1, 2, 3].map((o) => {
          const j = idx + o;
          const d = j - pos;
          const a = Math.abs(d);
          return (
            <div
              key={j}
              style={{
                position: 'absolute',
                left: (W - 700) / 2,
                top: 330,
                width: 700,
                height: 1060,
                zIndex: Math.round(20 - a * 5),
                opacity: Math.max(0, 1 - Math.max(0, a - 0.2) * 0.5),
                transform: `translateX(${d * 560}px) translateZ(${-a * 260}px) rotateY(${-d * 42}deg)`,
              }}
            >
              <Tile src={at(images, j)} pal={pal} radius={46} style={{ width: '100%', height: '100%', boxShadow: '0 40px 80px rgba(0,0,0,0.55)' }} tint={0.3} dots={0.16} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------------------------ 11. duotone

function Duotone({ images, pal, cycle, title }) {
  const { idx, local } = useCycle(cycle);
  const fade = 12;
  const scale = (l) => interpolate(l, [0, cycle + fade], [1.05, 1.2]);
  const layer = (i, l, opacity) => (
    <AbsoluteFill key={i} style={{ opacity, background: pal.bg }}>
      <Photo src={at(images, i)} style={{ filter: 'grayscale(1) contrast(1.25)', transform: `scale(${scale(l)})`, mixBlendMode: 'luminosity' }} />
      <AbsoluteFill style={{ background: `linear-gradient(160deg, ${pal.tintA}, ${pal.tintB})`, mixBlendMode: 'multiply' }} />
      <AbsoluteFill style={{ background: `linear-gradient(160deg, ${rgba(pal.tintA, 0.55)}, transparent)`, mixBlendMode: 'screen' }} />
    </AbsoluteFill>
  );
  const nextOpacity = interpolate(local, [cycle - fade, cycle], [0, 1], { extrapolateLeft: 'clamp' });
  const words = (title || '').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 4);
  return (
    <AbsoluteFill style={{ background: pal.bg }}>
      {layer(idx, local, 1)}
      {local > cycle - fade && layer(idx + 1, local - (cycle - fade), nextOpacity)}
      <Halftone size={12} opacity={0.4} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 70px' }}>
        {words.map((w, k) => (
          <div key={k} style={{ fontFamily: displayFont({ font: pal.font }), fontSize: 250, lineHeight: 0.9, color: 'transparent', WebkitTextStroke: `4px ${rgba(pal.text, 0.8)}`, letterSpacing: 4, transform: `translateX(${Math.sin((idx + local / cycle) * 1.4 + k) * 30}px)` }}>
            {w}
          </div>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ----------------------------------------------------------------------------- 12. poster slide

// Looks after the loop position of a row that slides left -> right forever: returns the x offset
// (0..period) the row has moved, so tiles reappear on the left as they leave on the right.
function slideRight(frame, speed, period) {
  return (frame * speed) % period;
}

function PosterSlide({ images, pal, cycle, title }) {
  const { frame, idx, local } = useCycle(cycle);
  const fade = 14;
  const words = (title || 'Service Recap').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 2);
  const lines = [...words, ...words].slice(0, 4);
  const heroOpacity = interpolate(local, [0, fade], [0, 1], { extrapolateRight: 'clamp' });
  const tileW = 330;
  const tileH = 330;
  const gap = 36;
  const per = tileW + gap;
  const count = Math.max(images.length, 4);
  const period = per * count;
  const off = slideRight(frame, 5.2, period);
  const rowY = 1030;
  const first = Math.floor(off / per);
  const cols = Math.ceil(W / per) + 3;
  const tfont = displayFont({ font: pal.font });
  return (
    <AbsoluteFill style={{ background: pal.bg2, overflow: 'hidden' }}>
      {/* soft blurred, tinted backdrop of the current photo */}
      <AbsoluteFill style={{ transform: 'scale(1.35)', filter: 'blur(14px)' }}>
        <Photo src={at(images, idx)} />
      </AbsoluteFill>
      <Tint a={pal.tintA} b={pal.tintB} opacity={0.75} />
      <Halftone size={10} opacity={0.35} />
      <AbsoluteFill style={{ background: `linear-gradient(105deg, ${rgba('#ffffff', 0.35)} 0%, transparent 45%)`, mixBlendMode: 'soft-light' }} />

      {/* giant stacked title: outline on the left half, solid on the right */}
      <div style={{ position: 'absolute', left: 150, top: 120, width: 800 }}>
        {lines.map((w, k) => (
          <div key={k} style={{ position: 'relative', fontFamily: tfont, fontSize: 330, lineHeight: 0.8, letterSpacing: 4, whiteSpace: 'nowrap', opacity: 1 - k * 0.14, transform: `translateX(${Math.sin((frame / 40) + k) * 12}px)` }}>
            <span style={{ color: 'transparent', WebkitTextStroke: `4px ${rgba(pal.text, 0.7)}` }}>{w}</span>
            <span style={{ position: 'absolute', left: 0, top: 0, color: pal.accent, clipPath: 'inset(0 0 0 50%)' }}>{w}</span>
          </div>
        ))}
      </div>

      {/* the centred hero photo, edges feathered so the title shows around it */}
      <div style={{ position: 'absolute', left: 250, top: 330, width: 580, height: 940, opacity: heroOpacity, WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 22%, #000 78%, transparent 100%), linear-gradient(180deg, #000 70%, transparent 100%)', WebkitMaskComposite: 'source-in', maskComposite: 'intersect' }}>
        <Photo src={at(images, idx)} style={{ transform: `scale(${1.08 + local * 0.0008})` }} />
      </div>

      {/* the row of boxes sliding left to right */}
      <div style={{ position: 'absolute', left: 0, top: rowY, width: W, height: tileH, overflow: 'hidden' }}>
        {Array.from({ length: cols }, (_, k) => {
          const i = first + k;
          const x = k * per - (off % per) - per;
          return (
            <div key={k} style={{ position: 'absolute', left: x, top: 0, width: tileW, height: tileH, borderRadius: 96, overflow: 'hidden', background: '#222', WebkitMaskImage: 'radial-gradient(ellipse at center, #000 62%, transparent 100%)' }}>
              <Photo src={at(images, count - 1 - ((i % count) + count) % count + idx + 1)} />
              <Tint a={pal.tintA} b={pal.tintB} opacity={0.3} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// -------------------------------------------------------------------------------- 13. story cards

// One Instagram-story-looking phone card with a photo inside.
function StoryCard({ src, pal, name, scale = 1, w = 520, h = 920 }) {
  return (
    <div style={{ position: 'relative', width: w, height: h, borderRadius: 48, overflow: 'hidden', background: '#111', border: '4px solid rgba(255,255,255,0.85)', boxShadow: '0 40px 90px rgba(0,0,0,0.55)', transform: `scale(${scale})` }}>
      <Photo src={src} />
      <Tint a={pal.tintA} b={pal.tintB} opacity={0.18} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.45), transparent 22%, transparent 78%, rgba(0,0,0,0.5))' }} />
      {/* story chrome */}
      <div style={{ position: 'absolute', left: 20, right: 20, top: 16, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.35)' }}>
        <div style={{ width: '38%', height: '100%', borderRadius: 3, background: '#fff' }} />
      </div>
      <div style={{ position: 'absolute', left: 22, top: 38, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: pal.accent, border: '3px solid #fff' }} />
        <span style={{ color: '#fff', fontFamily: BODY_FONT, fontWeight: 700, fontSize: 30, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>{name}</span>
      </div>
      <div style={{ position: 'absolute', left: 22, right: 22, bottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid #fff', opacity: 0.9 }} />
        <div style={{ flex: 1, height: 58, borderRadius: 29, border: '3px solid rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', padding: '0 24px', color: 'rgba(255,255,255,0.9)', fontFamily: BODY_FONT, fontWeight: 700, fontSize: 26 }}>Send Message</div>
        <div style={{ width: 22, height: 22, borderTop: '3px solid #fff', borderRight: '3px solid #fff', transform: 'rotate(45deg)', opacity: 0.9 }} />
      </div>
    </div>
  );
}

function StoryCards({ images, pal, cycle, name }) {
  const { frame, idx } = useCycle(cycle);
  const cardW = 520;
  const gap = 44;
  const per = cardW + gap;
  const count = Math.max(images.length, 3);
  const period = per * count;
  const off = slideRight(frame, 4.6, period);
  const first = Math.floor(off / per);
  const cols = Math.ceil(W / per) + 3;
  return (
    <AbsoluteFill style={{ background: pal.bg2, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: 'scale(1.18)' }}>
        <Photo src={at(images, idx)} style={{ transform: `translateX(${Math.sin(frame / 60) * 18}px)` }} />
      </AbsoluteFill>
      <Tint a={pal.tintA} b={pal.tintB} opacity={0.65} />
      <Halftone size={12} opacity={0.3} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25), transparent 30%, rgba(0,0,0,0.4))' }} />
      <div style={{ position: 'absolute', left: 0, top: 320, width: W, height: 1000, overflow: 'visible' }}>
        {Array.from({ length: cols }, (_, k) => {
          const i = first + k;
          const x = k * per - (off % per) - per;
          // cards nearer the middle of the screen are a touch bigger - a gentle sense of depth
          const centre = x + cardW / 2;
          const near = 1 - Math.min(1, Math.abs(centre - W / 2) / W);
          return (
            <div key={k} style={{ position: 'absolute', left: x, top: 40 + (1 - near) * 40 }}>
              <StoryCard src={at(images, count - 1 - (((i % count) + count) % count))} pal={pal} name={name} scale={0.86 + near * 0.16} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

const STYLES = {
  collage: Collage,
  posterslide: PosterSlide,
  storycards: StoryCards,
  wall: Wall,
  filmstrip: FilmStrip,
  polaroid: Polaroid,
  kenburns: KenBurns,
  slidestack: SlideStack,
  diagonal: Diagonal,
  zoompunch: ZoomPunch,
  mosaic: Mosaic,
  coverflow: CoverFlow,
  duotone: Duotone,
};

// ------------------------------------------------------------------------------------ overlays

// Title that opens the reel, over the moving photos; fades away after a few seconds.
function IntroTitle({ intro, pal, sizes }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!intro?.enabled || !intro.title) return null;
  const inS = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 110 } });
  const out = interpolate(frame, [fps * 2.6, fps * 3.2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const theme = { font: pal.font };
  const p = { sizes };
  const words = intro.title.split(/\s+/).filter(Boolean);
  return (
    <AbsoluteFill style={{ opacity: out, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 70px' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${rgba('#000', 0.62)}, ${rgba('#000', 0.2)} 75%)` }} />
      <div style={{ position: 'relative', transform: `translateY(${(1 - inS) * 50}px) scale(${0.94 + inS * 0.06})`, opacity: inS }}>
        <div style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 150), lineHeight: 1.0, letterSpacing: -3, color: '#fff', textShadow: '0 8px 50px rgba(0,0,0,0.6)', textTransform: 'uppercase' }}>
          {words.map((w, k) => (
            <span key={k} style={{ color: k === words.length - 1 ? pal.accent : '#fff' }}>{w}{k < words.length - 1 ? ' ' : ''}</span>
          ))}
        </div>
        {intro.subtitle ? (
          <div style={{ marginTop: 36, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 46), color: '#fff', letterSpacing: 4, textTransform: 'uppercase', textShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>{intro.subtitle}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function LogoBar({ logoUrl, show }) {
  if (!show || !logoUrl) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 56, pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent 82%, ${rgba('#000', 0.45)} 100%)` }} />
      <Img src={logoUrl} style={{ position: 'relative', height: 92, width: 'auto', filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.5))' }} />
    </AbsoluteFill>
  );
}

// ----------------------------------------------------------------------------------- lower thirds

// Optional caption overlay across the bottom of the photos. It slides up a moment after the reel
// starts and stays. Styles follow common church-event graphics:
//   bar   - full-width colour bar, text left and right, a logo tab rising from the middle
//   block - dark title block (script lead-in + big title) beside a strip for time and place
//   strip - slim white label, bold wordmark, address strip
export function LowerThird({ lt, pal, logoUrl, font, scale = 1 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!lt || !lt.style || lt.style === 'none') return null;
  const s = spring({ frame: frame - 14, fps, config: { damping: 17, stiffness: 95 } });
  const theme = { font };
  const disp = displayFont(theme);
  const dw = displayWeight(theme);
  // Panels are always dark so white type reads on any palette (the collage palette is cream).
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };
  const dark = lum(pal.bg2) < 0.35 ? pal.bg2 : '#15110f';
  const title = lt.title || '';
  const sub = lt.subtitle || '';
  const left = lt.left || '';
  const right = lt.right || '';
  const T = (size) => Math.round(size * scale);

  if (lt.style === 'bar') {
    return (
      <AbsoluteFill style={{ justifyContent: 'flex-end', pointerEvents: 'none' }}>
        <div style={{ position: 'relative', height: T(130), marginBottom: T(70), transform: `translateY(${(1 - s) * 260}px)`, opacity: s }}>
          <div style={{ position: 'absolute', inset: 0, background: rgba(pal.accent, 0.88), display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${T(60)}px` }}>
            <span style={{ width: '34%', color: pal.accentText, fontFamily: BODY_FONT, fontWeight: 700, fontSize: T(38) }}>{left}</span>
            <span style={{ width: '34%', textAlign: 'right', color: pal.accentText, fontFamily: BODY_FONT, fontWeight: 700, fontSize: T(38) }}>{right}</span>
          </div>
          <div style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: T(320), height: T(290), background: dark, borderRadius: `${T(10)}px ${T(10)}px 0 0`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: T(14), padding: `0 ${T(20)}px`, textAlign: 'center', boxShadow: '0 -10px 40px rgba(0,0,0,0.35)' }}>
            {logoUrl ? <Img src={logoUrl} style={{ height: T(86), width: 'auto', maxWidth: T(260) }} /> : null}
            <span style={{ color: '#fff', fontFamily: disp, fontWeight: dw, fontSize: T(46), lineHeight: 1.0, textTransform: 'uppercase' }}>{title}</span>
            {sub ? <span style={{ color: pal.accent, fontFamily: BODY_FONT, fontWeight: 700, fontSize: T(28), textTransform: 'uppercase', letterSpacing: 2 }}>{sub}</span> : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (lt.style === 'block') {
    return (
      <AbsoluteFill style={{ justifyContent: 'flex-end', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', height: T(260), margin: `0 ${T(40)}px ${T(70)}px`, transform: `translateX(${(1 - s) * -900}px)`, opacity: s }}>
          <div style={{ width: '52%', background: rgba(dark, 0.94), padding: `${T(24)}px ${T(34)}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {sub ? <span style={{ color: pal.accent, fontFamily: displayFont({ font: 'playfair' }), fontStyle: 'italic', fontWeight: 700, fontSize: T(62), lineHeight: 0.9, marginBottom: T(-6) }}>{sub}</span> : null}
            <span style={{ color: '#fff', fontFamily: disp, fontWeight: dw, fontSize: T(84), lineHeight: 0.92, textTransform: 'uppercase' }}>{title}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, background: rgba(dark, 0.8), padding: `${T(24)}px ${T(26)}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: T(16) }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: '#fff', fontFamily: disp, fontWeight: dw, fontSize: T(70), lineHeight: 0.95, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</div>
              <div style={{ marginTop: T(10), color: rgba('#ffffff', 0.9), fontFamily: BODY_FONT, fontWeight: 700, fontSize: T(28), lineHeight: 1.25 }}>{right}</div>
            </div>
            {logoUrl ? <Img src={logoUrl} style={{ height: T(80), width: 'auto', maxWidth: T(130), objectFit: 'contain', flexShrink: 0 }} /> : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // strip
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', height: T(76), margin: `0 ${T(40)}px ${T(80)}px`, transform: `translateX(${(1 - s) * -900}px)`, opacity: s }}>
        <div style={{ width: '34%', background: '#fff', display: 'flex', alignItems: 'center', padding: `0 ${T(26)}px`, color: '#111', fontFamily: BODY_FONT, fontWeight: 700, fontSize: T(30), textTransform: 'uppercase' }}>{title}</div>
        <div style={{ padding: `0 ${T(26)}px`, display: 'flex', alignItems: 'center', color: '#fff', fontFamily: disp, fontWeight: dw, fontSize: T(64), textTransform: 'uppercase', textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>{sub}</div>
        <div style={{ flex: 1, background: pal.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `0 ${T(20)}px`, color: pal.accentText, fontFamily: BODY_FONT, fontWeight: 700, fontSize: T(22), textTransform: 'uppercase', textAlign: 'center' }}>{right}</div>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------------- composition

export function PhotoReelComposition(props) {
  useFonts();
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const theme = normaliseTheme(props.theme);
  const outroFrames = props.outro?.enabled && props.outroSec > 0 ? Math.round(props.outroSec * FPS) : 0;
  const photoFrames = durationInFrames - outroFrames;
  const cycle = Math.max(15, Math.round(props.cycleSec * FPS));
  const Style = STYLES[props.style] ?? Collage;
  const images = props.images.length ? props.images : [''];
  const overlap = 8;
  const photoOpacity = outroFrames ? interpolate(frame, [photoFrames - overlap, photoFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const outroOpacity = outroFrames ? interpolate(frame, [photoFrames - overlap, photoFrames, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  return (
    <NoAudioProvider>
      {props.mixSrc ? <Audio src={props.mixSrc} /> : null}
      <AbsoluteFill style={{ opacity: photoOpacity }}>
        <Style images={images} pal={props.pal} cycle={cycle} title={props.intro?.title} name={props.churchName} />
        <IntroTitle intro={props.intro} pal={props.pal} sizes={props.sizes} />
        <LogoBar logoUrl={props.logoUrl} show={props.showLogo && (!props.lowerThird || props.lowerThird.style === 'none')} />
        <LowerThird lt={props.lowerThird} pal={props.pal} logoUrl={props.logoUrl} font={props.pal.font} />
      </AbsoluteFill>
      {outroFrames > 0 && (
        <Sequence from={photoFrames - overlap} durationInFrames={outroFrames + overlap}>
          <AbsoluteFill style={{ opacity: outroOpacity }}>
            <OutroCard theme={theme} outro={props.outro} sizes={props.sizes} />
          </AbsoluteFill>
        </Sequence>
      )}
    </NoAudioProvider>
  );
}

// ------------------------------------------------------------------------------------ carousel

const CARD_R = 46;

function Gutter({ children }) {
  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <Halftone size={16} opacity={0.1} color="#8a6a3a" blend="multiply" />
      {children}
    </AbsoluteFill>
  );
}

// Position in the slide's loop, 0..1. Everything below is built from this, so the last frame
// flows back into the first and the video loops seamlessly on Instagram.
function useLoop() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;
  // swing(a, b): eases a -> b -> a over one loop
  const swing = (a, b) => a + (b - a) * (0.5 - 0.5 * Math.cos(2 * Math.PI * t));
  return { frame, t, swing };
}

function SlideText({ title, subtitle, pal, font }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!title && !subtitle) return null;
  const s = spring({ frame: frame - 8, fps, config: { damping: 18, stiffness: 110 } });
  const theme = { font };
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 190, color: '#fff', textShadow: '0 6px 36px rgba(0,0,0,0.65)', opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
      {title ? <div style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: 110, lineHeight: 1.0, letterSpacing: -2, textTransform: 'uppercase' }}>{title}</div> : null}
      {subtitle ? <div style={{ marginTop: 20, fontFamily: BODY_FONT, fontWeight: 700, fontSize: 40, letterSpacing: 3, color: pal.accent, textTransform: 'uppercase' }}>{subtitle}</div> : null}
    </div>
  );
}

function CarouselFooter({ logoUrl, showLogo }) {
  const frame = useCurrentFrame();
  if (!showLogo || !logoUrl) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 46, pointerEvents: 'none', opacity: interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' }) }}>
      <Img src={logoUrl} style={{ height: 84, width: 'auto', filter: 'drop-shadow(0 3px 14px rgba(0,0,0,0.55))' }} />
    </AbsoluteFill>
  );
}

// A photo box with the collage treatment whose picture drifts inside it.
function MovingTile({ src, pal, style, radius = CARD_R, dx = 0, dy = 0, zoom = 1.18, clip }) {
  return (
    <div style={{ position: 'absolute', overflow: 'hidden', borderRadius: radius, background: '#222', clipPath: clip, ...style }}>
      <Photo src={src} style={{ transform: `scale(${zoom}) translate(${dx}px, ${dy}px)` }} />
      <Tint a={pal.tintA} b={pal.tintB} opacity={0.45} />
      <Halftone opacity={0.28} />
    </div>
  );
}

const SW = 1080;
const SH = 1350;

// One slide of the carousel as a looping video, in the collage style (1080 x 1350, 4:5). The photo
// boxes keep moving - columns of tiles glide, pictures pan inside their frames - while the slide's
// text eases in.
export function CarouselSlide({ layout, images, title, subtitle, pal, theme: themeProp, logoUrl, showLogo, outro, sizes, mixSrc, lowerThird }) {
  useFonts();
  const { t, swing } = useLoop();
  const pad = 30;
  const g = 24;
  const list = images.length ? images : [''];
  const im = (i) => at(list, i);
  let body = null;

  if (layout === 'hero-left' || layout === 'hero-right') {
    const left = layout === 'hero-left';
    const stackW = 340;
    const tileH = (SH - pad * 2 - g * 2) / 3;
    const per = tileH + g;
    const stackPhotos = list.length > 1 ? list.slice(1) : list;
    const period = per * stackPhotos.length;
    // one full lap per loop; the stack moves up on the left variant and down on the other
    const off = (left ? 1 : -1) * t * period;
    const heroW = SW - pad * 2 - stackW - g + 40;
    const heroX = left ? pad + stackW + g - 40 : pad;
    const stackX = left ? pad : SW - pad - stackW;
    const rows = Math.ceil(SH / per) + 3;
    const base = Math.floor(off / per);
    const frac = off - base * per;
    body = (
      <Gutter>
        <div style={{ position: 'absolute', left: stackX, top: 0, width: stackW, height: SH, overflow: 'hidden' }}>
          {Array.from({ length: rows }, (_, k) => {
            const idx = base + k - 1;
            return <MovingTile key={k} src={at(stackPhotos, idx)} pal={pal} style={{ left: 0, top: pad + (k - 1) * per - frac, width: stackW, height: tileH }} zoom={1.1} />;
          })}
        </div>
        <MovingTile
          src={im(0)}
          pal={pal}
          style={{ left: heroX, top: pad, width: heroW, height: SH - pad * 2 }}
          dx={swing(-26, 26)}
          zoom={1.14 + 0.05 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t))}
          clip={left ? 'polygon(10% 0, 100% 0, 100% 100%, 0 100%)' : 'polygon(0 0, 100% 0, 90% 100%, 0 100%)'}
        />
      </Gutter>
    );
  } else if (layout === 'framed') {
    body = (
      <AbsoluteFill style={{ background: '#222' }}>
        <AbsoluteFill style={{ transform: `scale(${swing(1.3, 1.42)})`, filter: 'blur(36px) brightness(0.8)' }}>
          <Photo src={im(0)} />
        </AbsoluteFill>
        <Tint a={pal.tintA} b={pal.tintB} opacity={0.6} />
        <Halftone opacity={0.3} />
        <div style={{ position: 'absolute', left: 100, top: 110 + swing(-8, 8), width: SW - 200, height: SH - 330, borderRadius: 56, overflow: 'hidden', border: `14px solid ${CREAM}`, boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }}>
          <Photo src={im(0)} style={{ transform: `scale(${swing(1.02, 1.1)})` }} />
          <Tint a={pal.tintA} b={pal.tintB} opacity={0.25} />
          <Halftone opacity={0.18} />
        </div>
      </AbsoluteFill>
    );
  } else if (layout === 'split') {
    body = (
      <Gutter>
        <MovingTile src={im(0)} pal={pal} style={{ left: pad, top: pad, width: SW - pad * 2, height: SH * 0.58 }} dx={swing(-44, 44)} zoom={1.2} clip="polygon(0 0, 100% 0, 100% 86%, 0 100%)" />
        <MovingTile src={im(1)} pal={pal} style={{ left: pad, bottom: pad, width: SW - pad * 2, height: SH * 0.5 }} dx={swing(44, -44)} zoom={1.2} clip="polygon(0 14%, 100% 0, 100% 100%, 0 100%)" />
      </Gutter>
    );
  } else if (layout === 'trio') {
    const th = (SH - pad * 2 - g * 2) / 3;
    const bw = (SW - pad * 2 - g) / 2;
    const bh = SH - pad * 2 - th * 1.25 - g;
    body = (
      <Gutter>
        <MovingTile src={im(0)} pal={pal} style={{ left: pad, top: pad, width: SW - pad * 2, height: th * 1.25 }} dx={swing(-40, 40)} zoom={1.2} />
        <MovingTile src={im(1)} pal={pal} style={{ left: pad, top: pad + th * 1.25 + g, width: bw, height: bh }} dy={swing(-34, 34)} zoom={1.22} />
        <MovingTile src={im(2)} pal={pal} style={{ left: pad + bw + g, top: pad + th * 1.25 + g, width: bw, height: bh }} dy={swing(34, -34)} zoom={1.22} />
      </Gutter>
    );
  } else if (layout === 'info') {
    // The closing card as a slide: church logo, call to action, service times, address, socials.
    body = <OutroCard theme={normaliseTheme(themeProp)} outro={{ ...outro, logoUrl: showLogo ? outro.logoUrl : '' }} sizes={sizes} />;
  } else {
    // 'title' cover: one big duotone photo, slowly pushing in, with the title
    body = (
      <AbsoluteFill style={{ background: '#222' }}>
        <Photo src={im(0)} style={{ transform: `scale(${swing(1.06, 1.2)}) translate(${swing(-22, 22)}px, ${swing(10, -10)}px)` }} />
        <Tint a={pal.tintA} b={pal.tintB} opacity={0.6} />
        <Halftone opacity={0.32} />
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${rgba('#000', 0.15)} 30%, ${rgba('#000', 0.75)} 100%)` }} />
        <div style={{ position: 'absolute', inset: 30, border: `10px solid ${CREAM}`, borderRadius: 56 }} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      {mixSrc ? <Audio src={mixSrc} /> : null}
      {body}
      {layout !== 'info' && <SlideText title={title} subtitle={subtitle} pal={pal} font={pal.font} />}
      {layout !== 'info' && <CarouselFooter logoUrl={logoUrl} showLogo={showLogo && (!lowerThird || lowerThird.style === 'none')} />}
      {layout !== 'info' && <LowerThird lt={lowerThird} pal={pal} logoUrl={logoUrl} font={pal.font} scale={0.9} />}
    </AbsoluteFill>
  );
}
