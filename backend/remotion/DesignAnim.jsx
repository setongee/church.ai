import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// How one layer looks at progress p (0 = hidden, 1 = settled) for the chosen effect.
function layerStyle(effect, p, spr, w, h, canvasW) {
  const e = easeOut(clamp01(p));
  switch (effect) {
    case 'fade':
      return { opacity: e };
    case 'blur':
      return { opacity: clamp01(p * 1.6), filter: `blur(${(1 - e) * 26}px)`, transform: `scale(${1 + (1 - e) * 0.06})` };
    case 'zoomin':
      return { opacity: clamp01(p * 2), transform: `scale(${0.55 + 0.45 * e})` };
    case 'zoomout':
      return { opacity: clamp01(p * 2), transform: `scale(${1.6 - 0.6 * e})` };
    case 'slideleft':
      return { opacity: clamp01(p * 2.5), transform: `translateX(${(1 - e) * canvasW * 0.6}px)` };
    case 'slideright':
      return { opacity: clamp01(p * 2.5), transform: `translateX(${-(1 - e) * canvasW * 0.6}px)` };
    case 'dropdown':
      return { opacity: clamp01(p * 2.5), transform: `translateY(${-(1 - e) * 220}px)` };
    case 'pop':
      return { opacity: clamp01(p * 3), transform: `scale(${0.2 + 0.8 * spr})` };
    case 'tilt':
      return { opacity: clamp01(p * 2), transform: `rotate(${(1 - e) * -9}deg) translateY(${(1 - e) * 60}px) scale(${0.9 + 0.1 * e})` };
    case 'flip':
      return { opacity: clamp01(p * 2.5), transformOrigin: '50% 100%', transform: `perspective(900px) rotateX(${(1 - e) * 75}deg)` };
    default:
      return {};
  }
}

function Layer({ layer, effect, start, dur, exitAt, exitDur }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;
  const p = clamp01((t - start) / dur);
  const spr = spring({ frame: frame - start * fps, fps, config: { damping: 9, stiffness: 140, mass: 0.7 } });
  const out = exitAt == null ? 1 : 1 - clamp01((t - exitAt) / exitDur);
  const base = { position: 'absolute', left: layer.x, top: layer.y, width: layer.w, height: layer.h };

  if (effect === 'rise') {
    const e = easeOut(p);
    return (
      <div style={{ ...base, overflow: 'hidden', opacity: out }}>
        <Img src={layer.src} style={{ width: '100%', height: '100%', transform: `translateY(${(1 - e) * 105}%)` }} />
      </div>
    );
  }
  if (effect === 'wipe') {
    const e = easeOut(p);
    return <Img src={layer.src} style={{ ...base, opacity: out, clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` }} />;
  }
  const st = layerStyle(effect, p, spr, layer.w, layer.h, width);
  return <Img src={layer.src} style={{ ...base, ...st, opacity: (st.opacity ?? 1) * out }} />;
}

// A still design brought to life: the background drifts slowly, then each element enters with
// the chosen effect, one after another. With `loop` the elements leave again at the end so the
// clip repeats seamlessly.
export function DesignAnim({ background, layers, effect, lengthSec, speed, stagger, loop, bgMotion }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const t = frame / fps;
  const total = durationInFrames / fps;
  const dur = speed || 0.9;
  const exitDur = loop ? Math.min(0.8, total * 0.12) : 0;
  const exitAt = loop ? total - exitDur - 0.02 : null;
  // Spread the entrances so every element has finished arriving before the hold / exit.
  const n = layers.length;
  const room = Math.max(0.2, total - (loop ? exitDur + 0.6 : 0.6) - dur - 0.3);
  const step = n > 1 ? Math.min(stagger ?? 0.4, room / (n - 1)) : 0;
  // Entrance order (drawing order stays as designed): the big structure first (cards, panels),
  // then the text and pictures, and the small decorations last.
  const canvasArea = width * height;
  const rank = (l) => (l.kind === 'shape' && l.w * l.h > canvasArea * 0.06 ? 0 : l.kind === 'shape' ? 2 : 1);
  const sorted = layers.map((l, i) => ({ i, r: rank(l) })).sort((a, b) => a.r - b.r || a.i - b.i);
  const order = new Array(layers.length);
  sorted.forEach((x, pos) => (order[x.i] = pos));
  const drift = 0.5 - 0.5 * Math.cos((2 * Math.PI * frame) / durationInFrames);
  const bgScale = bgMotion ? 1 + 0.06 * drift : 1;
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Img src={background} style={{ width, height, transform: `scale(${bgScale})`, transformOrigin: '50% 50%' }} />
      {layers.map((l, i) => (
        <Layer key={i} layer={l} effect={effect} start={0.3 + order[i] * step} dur={dur} exitAt={exitAt} exitDur={exitDur} />
      ))}
    </AbsoluteFill>
  );
}
