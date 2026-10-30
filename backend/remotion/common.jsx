import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';

const FONT_FILES = {
  bricolage: { family: 'ReelBricolage', file: 'BricolageGrotesque-Variable.ttf', weight: '200 800', use: 800 },
  bebas: { family: 'ReelBebas', file: 'BebasNeue-Regular.ttf', weight: '400', use: 400 },
  jakarta: { family: 'ReelJakarta', file: 'PlusJakartaSans-Bold.ttf', weight: '700', use: 700 },
  lufga: { family: 'ReelLufga', file: 'Lufga-Bold.ttf', weight: '700', use: 700 },
  caveat: { family: 'ReelCaveat', file: 'Caveat-Variable.ttf', weight: '400 700', use: 700 },
  playfair: { family: 'ReelPlayfair', file: 'PlayfairDisplay-Variable.ttf', weight: '400 900', use: 700 },
};

export const displayFont = (theme) => `${FONT_FILES[theme.font].family}, sans-serif`;
export const displayWeight = (theme) => FONT_FILES[theme.font].use;
export const BODY_FONT = `${FONT_FILES.jakarta.family}, sans-serif`;

// Loads every bundled font before the first frame is captured, so renders never fall back to a
// system font on some frames.
export function useFonts() {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const faces = Object.values(FONT_FILES).map(
      (f) => new FontFace(f.family, `url(${staticFile(`fonts/${f.file}`)})`, { weight: f.weight })
    );
    Promise.all(faces.map((f) => f.load()))
      .then((loaded) => loaded.forEach((f) => document.fonts.add(f)))
      .catch(() => {})
      .finally(() => continueRender(handle));
  }, [handle]);
}

const AudioDataContext = createContext(null);

// Fetches/decodes the audio once for the whole composition (a merged reel has several scenes
// that all read the same track).
export function AudioProvider({ audioSrc, children }) {
  const data = useAudioData(audioSrc);
  return <AudioDataContext.Provider value={data}>{children}</AudioDataContext.Provider>;
}
export function NoAudioProvider({ children }) {
  return <AudioDataContext.Provider value={null}>{children}</AudioDataContext.Provider>;
}

const level = (v) => Math.min(1, Math.sqrt(v) * 1.9);

// Mirrored voice-reactive bars. With no audio (stills, previews) it draws a gentle synthetic
// wave instead so previews still look like the real thing.
export function Waveform({ color, audioOffset = 0, bars = 28, barWidth = 18, gap = 10, maxHeight = 164, minHeight = 16, radius, align = 'center' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useContext(AudioDataContext);
  let values;
  if (audioData) {
    const spectrum = visualizeAudio({ fps, frame: frame + audioOffset, audioData, numberOfSamples: 64, optimizeFor: 'speed' });
    const half = spectrum.slice(0, bars / 2);
    values = [...half].reverse().concat(half).map(level);
  } else {
    values = Array.from({ length: bars }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 0.5 + frame * 0.12)) * Math.abs(Math.cos(i * 0.21)));
  }
  return (
    <div style={{ display: 'flex', alignItems: align === 'bottom' ? 'flex-end' : 'center', justifyContent: 'center', gap, height: maxHeight + minHeight }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            width: barWidth,
            height: minHeight + v * maxHeight,
            borderRadius: radius ?? barWidth / 2,
            background: color,
            opacity: 0.5 + v * 0.5,
          }}
        />
      ))}
    </div>
  );
}

// Groups words into short on-screen phrases (break on punctuation or a length cap), each with
// the window of time it is visible.
export function buildPhrases(words, maxWords = 6) {
  const phrases = [];
  let cur = [];
  const flush = () => {
    if (cur.length) phrases.push({ words: cur, start: cur[0].start, end: cur.at(-1).end });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    const pause = w.brk || /[.!?]$/.test(w.text) || (/[,;:]$/.test(w.text) && cur.length >= 3);
    if (cur.length >= maxWords || pause) flush();
  }
  flush();
  // A phrase stays up until the next one begins (or briefly after the last word) so there is
  // never a blank flicker between phrases.
  return phrases.map((p, i) => ({ ...p, visibleUntil: phrases[i + 1] ? phrases[i + 1].start : p.end + 0.4 }));
}

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
export { rgba };

// Spoken-word captions. `mode: 'color'` recolours the active word; `'pill'` puts it on a filled
// pill. Inactive (yet to be spoken) words are dimmed, spoken ones are full strength.
export function Captions({ words, theme, size = 88, mode = 'color', align = 'center', maxWords = 6, inactive, spoken, active, activeText, lineHeight = 1.1, gap, shadow }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const phrases = useMemo(() => buildPhrases(words, maxWords), [words, maxWords]);
  const phrase = phrases.find((p) => t >= p.start - 0.05 && t < p.visibleUntil);
  if (!phrase) return null;

  const enter = spring({ frame: frame - Math.floor(phrase.start * fps), fps, config: { damping: 18, stiffness: 180 } });
  const cInactive = inactive ?? rgba(theme.text, 0.3);
  const cSpoken = spoken ?? theme.text;
  const cActive = active ?? theme.accent;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        gap: gap ?? `${Math.round(size * 0.1)}px ${Math.round(size * 0.28)}px`,
        transform: `translateY(${(1 - enter) * 40}px)`,
        opacity: Math.min(1, enter * 1.4),
      }}
    >
      {phrase.words.map((w, i) => {
        const isSpoken = t >= w.start;
        const isActive = t >= w.start && t < w.end + 0.08;
        const pop = spring({ frame: frame - Math.floor(w.start * fps), fps, config: { damping: 12, stiffness: 260 } });
        const pill = mode === 'pill' && isActive;
        return (
          <span
            key={i}
            style={{
              fontFamily: displayFont(theme),
              fontWeight: displayWeight(theme),
              fontSize: size,
              lineHeight,
              letterSpacing: -size * 0.02,
              color: pill ? activeText ?? theme.accentText : isActive && mode === 'color' ? cActive : isSpoken ? cSpoken : cInactive,
              background: pill ? cActive : 'transparent',
              padding: pill ? `0 ${size * 0.2}px` : 0,
              margin: pill ? `0 -${size * 0.2}px` : 0,
              borderRadius: size * 0.22,
              transform: `scale(${isActive ? 1 + (pop - 0.5) * 0.1 : 1}) ${pill ? 'rotate(-2deg)' : ''}`,
              textShadow: shadow ?? (mode !== 'pill' && isDark(theme.bg)) ? '0 6px 30px rgba(0,0,0,0.45)' : 'none',
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
}

export function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.5;
}

// Full-bleed background: the template's image (darkened by `overlay`) when set, otherwise a
// gradient between its two background colours.
export function Backdrop({ theme, children, angle = 165 }) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${theme.bg} 0%, ${theme.bg2} 100%)` }}>
      {theme.backgroundImageUrl ? (
        <>
          <Img src={theme.backgroundImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <AbsoluteFill style={{ background: rgba(theme.bg2, theme.overlay) }} />
        </>
      ) : null}
      {children}
    </AbsoluteFill>
  );
}

export function useSceneProgress(sceneFrames) {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, Math.max(1, sceneFrames)], [0, 1], { extrapolateRight: 'clamp' });
}

export function Logo({ p, height = 64 }) {
  if (!p.theme.showLogo || !p.logoUrl) return null;
  return <Img src={p.logoUrl} style={{ height, width: 'auto' }} />;
}

// In a merged video one scene runs the whole timeline, but each new point's headline should
// still animate in when that point begins. Layout entrance animations read their frame through
// this clock (frames since the current point started); for a single reel it is just 0.
const SegmentClockContext = createContext(0);
export const SegmentClockProvider = SegmentClockContext.Provider;
export function useSegFrame() {
  return useCurrentFrame() - useContext(SegmentClockContext);
}

// Font size scaled by the user's size sliders ('headline' | 'captions' | 'info').
export const sz = (p, key, n) => Math.round(n * (p.sizes?.[key] ?? 1));

// "Title · Preacher" detail line. (The service title lives at the top right, not down here.)
export function infoParts(p) {
  const t = p.theme;
  return [p.groupTitle, t.showSpeaker ? p.speaker : ''].filter(Boolean);
}

export const showHeadline = (p) => p.theme.showHeadline !== false;

// The service title, top right.
export function ServiceTitle({ p, color, size = 30, align = 'right', maxWidth = 520, weight = 700, spacing = 0, upper = false }) {
  if (!p.theme.showSessionTitle || !p.serviceTitle) return null;
  return (
    <div
      style={{
        color,
        fontFamily: BODY_FONT,
        fontWeight: weight,
        fontSize: sz(p, 'info', size),
        lineHeight: 1.25,
        textAlign: align,
        maxWidth,
        letterSpacing: spacing,
        textTransform: upper ? 'uppercase' : 'none',
      }}
    >
      {p.serviceTitle}
    </div>
  );
}

// Top row: church logo on the left (the church's name stands in only when there is no logo),
// service title on the right.
export function TopBar({ p, color, logoHeight = 64, size = 30, spacing = 0, upper = false, titleColor }) {
  const hasLogo = p.theme.showLogo && p.logoUrl;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <Logo p={p} height={logoHeight} />
        {!hasLogo && p.theme.showChurch && p.churchName ? (
          <span style={{ color, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 32) }}>{p.churchName}</span>
        ) : null}
      </div>
      <ServiceTitle p={p} color={titleColor ?? color} size={size} spacing={spacing} upper={upper} />
    </div>
  );
}
