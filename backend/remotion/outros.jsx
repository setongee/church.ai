import React from 'react';
import { AbsoluteFill, Img, Loop, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY_FONT, Backdrop, displayFont, displayWeight, isDark, rgba, sz } from './common.jsx';

// Entrance animations of the closing card normally follow the video's own frame. A static image
// (a carousel slide) has only frame 0, so it can pin them to a "fully arrived" frame instead.
export const SettledFrameContext = React.createContext(null);

export function Pop({ index, children, style }) {
  const own = useCurrentFrame();
  const settled = React.useContext(SettledFrameContext);
  const frame = settled ?? own;
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6 - index * 5, fps, config: { damping: 18, stiffness: 120 } });
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * 36}px)`, ...style }}>{children}</div>;
}

// Progress 0..1 of something drawn/written between two seconds (settles when pinned).
function useDraw(startSec, durSec) {
  const own = useCurrentFrame();
  const settled = React.useContext(SettledFrameContext);
  const { fps } = useVideoConfig();
  return interpolate(((settled ?? own) / fps - startSec) / durSec, [0, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

// Small round platform mark: simple drawn glyphs, no brand artwork.
export function Badge({ platform, size = 64, fg, bg }) {
  const common = { width: size * 0.56, height: size * 0.56, viewBox: '0 0 24 24', fill: 'none', stroke: fg, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  let glyph;
  if (platform === 'instagram') {
    glyph = (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="5.5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.3" cy="6.7" r="0.6" fill={fg} />
      </svg>
    );
  } else if (platform === 'youtube') {
    glyph = (
      <svg {...common}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="M10 9.2 15.2 12 10 14.8z" fill={fg} />
      </svg>
    );
  } else if (platform === 'x') {
    glyph = (
      <svg {...common}>
        <path d="M4 4 20 20M20 4 4 20" />
      </svg>
    );
  } else {
    const ch = platform === 'facebook' ? 'f' : platform === 'tiktok' ? '♪' : '@';
    glyph = <span style={{ color: fg, fontFamily: BODY_FONT, fontWeight: 800, fontSize: size * 0.56, lineHeight: 1 }}>{ch}</span>;
  }
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{glyph}</div>;
}

function mix(hex, other, amt) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const c = (sh) => Math.round(((a >> sh) & 255) * (1 - amt) + ((b >> sh) & 255) * amt);
  return `#${[16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, '0')).join('')}`;
}

// `flat`: on a light background the (usually white) logo is shown as a solid dark mark instead.
function Logo({ outro, theme, height = 130, color, fontSize = 60, flat = false }) {
  if (outro.logoUrl && theme.showLogo) return <Img src={outro.logoUrl} style={{ height, width: 'auto', filter: flat ? 'brightness(0)' : 'none' }} />;
  if (!outro.churchName) return null;
  return <div style={{ color, fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize }}>{outro.churchName}</div>;
}

const splitLast = (text) => {
  const w = text.split(/\s+/).filter(Boolean);
  return [w.slice(0, -1).join(' '), w.at(-1) ?? ''];
};

// ---------------------------------------------------------------- 1. Thank you (clean)

export function ThanksOutro({ theme, outro, sizes, transparent = false }) {
  const p = { sizes };
  const bg = outro.bg || theme.bg;
  const accent = outro.accent || theme.accent;
  const t = { ...theme, bg, bg2: outro.bg ? mix(bg, '#000000', 0.45) : theme.bg2, backgroundImageUrl: outro.bg ? '' : theme.backgroundImageUrl };
  const ink = transparent || isDark(bg) ? '#ffffff' : '#111111';
  const [head, last] = splitLast(outro.thanks);
  return (
    <AbsoluteFill>
      {transparent ? null : <Backdrop theme={t} />}
      <AbsoluteFill style={{ padding: '120px 90px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <Pop index={0}><Logo outro={outro} theme={theme} color={ink} /></Pop>
        <Pop index={1} style={{ marginTop: 90 }}>
          <div style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 128), lineHeight: 1.02, letterSpacing: -3, color: ink }}>
            {head} <span style={{ color: accent }}>{last}</span>
          </div>
        </Pop>
        <Pop index={2} style={{ marginTop: 56 }}><div style={{ width: 130, height: 6, borderRadius: 3, background: accent, margin: '0 auto' }} /></Pop>
        <Pop index={3} style={{ marginTop: 64 }}>
          <div style={{ display: 'inline-block', padding: '26px 54px', borderRadius: 999, background: accent, color: isDark(accent) ? '#ffffff' : '#0b0b0b', fontFamily: BODY_FONT, fontWeight: 800, fontSize: sz(p, 'info', 40), lineHeight: 1.25, maxWidth: 860 }}>{outro.linkText}</div>
        </Pop>
        {outro.handles.length > 0 && (
          <Pop index={4} style={{ marginTop: 80 }}>
            {outro.handles.map((h, k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: k ? 26 : 0 }}>
                <Badge platform={h.platform} size={72} fg={isDark(accent) ? '#fff' : '#0b0b0b'} bg={accent} />
                <div style={{ color: ink, fontFamily: BODY_FONT, fontWeight: 800, fontSize: sz(p, 'info', 46) }}>{h.handle}</div>
              </div>
            ))}
          </Pop>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 2. Handwritten note

export function ScriptOutro({ theme, outro, sizes }) {
  const p = { sizes };
  const bg = outro.bg || '#f8f2e4';
  const accent = outro.accent || '#c2410c';
  const ink = isDark(bg) ? '#f4f1ea' : '#1e2a4f';
  const font = "ReelCaveat, 'Caveat', cursive";
  const write = useDraw(0.3, 1.1);
  const line = useDraw(1.3, 0.6);
  const arrow = useDraw(2.0, 0.6);
  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 107px, ${rgba(ink, 0.12)} 107px, ${rgba(ink, 0.12)} 110px)`, backgroundPosition: '0 70px' }} />
      <div style={{ position: 'absolute', left: 128, top: 0, bottom: 0, width: 4, background: rgba('#d94b4b', 0.4) }} />
      <AbsoluteFill style={{ padding: '140px 90px 120px 190px', justifyContent: 'center' }}>
        <Pop index={0}><Logo outro={outro} theme={theme} height={120} color={ink} flat={!isDark(bg)} /></Pop>
        <div style={{ marginTop: 80, fontFamily: font, fontWeight: 700, fontSize: sz(p, 'headline', 190), lineHeight: 0.95, color: ink, transform: 'rotate(-2.5deg)', transformOrigin: 'left center', clipPath: write >= 1 ? 'none' : `inset(-10% ${(1 - write) * 100}% -10% -2%)`, width: 'fit-content', maxWidth: 800 }}>
          {outro.thanks}
        </div>
        <svg width="700" height="50" viewBox="0 0 700 50" style={{ marginTop: 24, overflow: 'visible' }}>
          <path d="M6 30 C 120 4, 200 44, 330 22 S 560 8, 694 26" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round" strokeDasharray="760" strokeDashoffset={760 * (1 - line)} />
        </svg>
        <div style={{ marginTop: 70, display: 'flex', alignItems: 'center', gap: 30, opacity: arrow }}>
          <div style={{ fontFamily: font, fontWeight: 700, fontSize: sz(p, 'info', 70), lineHeight: 1.05, color: accent, maxWidth: 700 }}>{outro.linkText}</div>
          <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
            <path d="M20 20 C 20 80, 50 100, 95 96 M70 76 L96 96 L68 112" fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {outro.handles.length > 0 && (
          <Pop index={5} style={{ marginTop: 70 }}>
            {outro.handles.map((h, k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: k ? 22 : 0 }}>
                <Badge platform={h.platform} size={64} fg={bg} bg={ink} />
                <div style={{ fontFamily: font, fontWeight: 700, fontSize: sz(p, 'info', 68), color: ink, lineHeight: 1 }}>{h.handle}</div>
              </div>
            ))}
          </Pop>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 3. Bold block

export function BoldOutro({ theme, outro, sizes }) {
  const p = { sizes };
  const bg = outro.bg || '#ffd400';
  const accent = outro.accent || '#0b0b0b';
  const ink = isDark(bg) ? '#ffffff' : '#0b0b0b';
  const accentInk = isDark(accent) ? '#ffffff' : '#0b0b0b';
  const own = useCurrentFrame();
  const settled = React.useContext(SettledFrameContext);
  const t = (settled ?? own) / 30;
  const { height } = useVideoConfig();
  const fit = height < 1500 ? 0.8 : 1; // the 4:5 carousel slide is shorter than a reel
  const words = outro.thanks.toUpperCase().split(/\s+/).filter(Boolean);
  const font = "ReelBebas, 'Bebas Neue', Impact, sans-serif";
  const tick = (outro.linkText + '   ✦   ').repeat(6);
  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ padding: '60px 80px 170px', justifyContent: 'center' }}>
        <Pop index={0}><Logo outro={outro} theme={theme} height={110} color={ink} flat={!isDark(bg)} /></Pop>
        <div style={{ marginTop: 70 }}>
          {words.map((w, i) => (
            <Pop key={i} index={i + 1}>
              <div style={{ fontFamily: font, fontSize: sz(p, 'headline', Math.round((words.length > 3 ? 250 : 320) * fit)), lineHeight: 0.88, letterSpacing: -4, color: i === words.length - 1 ? accent : ink, textTransform: 'uppercase' }}>{w}</div>
            </Pop>
          ))}
        </div>
        <Pop index={words.length + 2} style={{ marginTop: 70 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            {outro.handles.map((h, k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 30px 14px 16px', borderRadius: 999, background: accent }}>
                <Badge platform={h.platform} size={58} fg={accent} bg={accentInk} />
                <div style={{ color: accentInk, fontFamily: BODY_FONT, fontWeight: 800, fontSize: sz(p, 'info', 40) }}>{h.handle}</div>
              </div>
            ))}
          </div>
        </Pop>
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 170, background: accent, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ whiteSpace: 'nowrap', color: accentInk, fontFamily: font, fontSize: sz(p, 'info', 100), letterSpacing: 2, transform: `translateX(${-t * 150}px)` }}>{tick}</div>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 4. Glass cards

export function GlassOutro({ theme, outro, sizes }) {
  const p = { sizes };
  const bg = outro.bg || '#1b1464';
  const accent = outro.accent || '#5eead4';
  const own = useCurrentFrame();
  const settled = React.useContext(SettledFrameContext);
  const t = (settled ?? own) / 30;
  const glass = { background: 'rgba(255,255,255,0.14)', border: '2px solid rgba(255,255,255,0.28)', backdropFilter: 'blur(14px)', borderRadius: 48 };
  const blob = (size, x, y, color, sp, ph) => (
    <div style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', left: x + Math.sin(t * sp + ph) * 120, top: y + Math.cos(t * sp * 0.8 + ph) * 150, background: `radial-gradient(circle, ${color} 0%, transparent 65%)`, filter: 'blur(24px)', opacity: 0.75 }} />
  );
  return (
    <AbsoluteFill style={{ background: `linear-gradient(165deg, ${bg}, ${mix(bg, '#000000', 0.5)})`, overflow: 'hidden' }}>
      {blob(1000, -300, -100, accent, 0.5, 0)}
      {blob(900, 400, 1100, '#c026d3', 0.4, 2)}
      <AbsoluteFill style={{ padding: '120px 80px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <Pop index={0}><Logo outro={outro} theme={theme} color="#ffffff" /></Pop>
        <Pop index={1} style={{ ...glass, marginTop: 80, padding: '70px 60px', width: '100%' }}>
          <div style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 118), lineHeight: 1.02, letterSpacing: -3, color: '#ffffff' }}>{outro.thanks}</div>
          <div style={{ width: 110, height: 6, borderRadius: 3, background: accent, margin: '44px auto 0' }} />
          <div style={{ marginTop: 44, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 42), lineHeight: 1.3, color: accent }}>{outro.linkText}</div>
        </Pop>
        {outro.handles.map((h, k) => (
          <Pop key={k} index={2 + k} style={{ ...glass, borderRadius: 999, marginTop: 28, padding: '20px 44px 20px 22px', width: '100%', display: 'flex', alignItems: 'center', gap: 26 }}>
            <Badge platform={h.platform} size={80} fg={isDark(accent) ? '#fff' : '#06201d'} bg={accent} />
            <div style={{ textAlign: 'left' }}>
              {h.label ? <div style={{ fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 26), letterSpacing: 4, textTransform: 'uppercase', color: rgba('#ffffff', 0.7) }}>{h.label}</div> : null}
              <div style={{ fontFamily: BODY_FONT, fontWeight: 800, fontSize: sz(p, 'info', 46), color: '#ffffff' }}>{h.handle}</div>
            </div>
          </Pop>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 5. Your own image / video

export function MediaOutro({ theme, outro, sizes }) {
  const fill = { width: '100%', height: '100%', objectFit: 'cover' };
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {outro.mediaType === 'video' ? (
        outro.mediaSec >= 0.5 ? <Loop durationInFrames={Math.max(1, Math.floor(outro.mediaSec * 30) - 1)}><OffthreadVideo src={outro.mediaUrl} muted style={fill} /></Loop> : <OffthreadVideo src={outro.mediaUrl} muted style={fill} />
      ) : <Img src={outro.mediaUrl} style={fill} />}
      {outro.mediaOverlay ? (
        <AbsoluteFill>
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.7))' }} />
          <ThanksOutro theme={{ ...theme, bg: 'transparent' }} outro={{ ...outro, bg: '', accent: outro.accent }} sizes={sizes} transparent />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
