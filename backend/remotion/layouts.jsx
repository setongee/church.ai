import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { HEADLINE_WRITE_START, headlineWriteSec } from './templates.js';
import {
  Backdrop,
  buildPhrases,
  BODY_FONT,
  Captions,
  Logo,
  ServiceTitle,
  TopBar,
  Waveform,
  displayFont,
  displayWeight,
  infoParts,
  rgba,
  showHeadline,
  sz,
  useSceneProgress,
  useSegFrame,
} from './common.jsx';

const churchLabel = (p) => (p.theme.showChurch ? p.churchName || '' : '');

function useWordSpring(index, delay = 6, step = 5, config = { damping: 16, stiffness: 150 }) {
  const frame = useSegFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay - index * step, fps, config });
}

function AnimatedWords({ text, style, lastStyle, step = 5, rise = 60, gap = '4px 24px' }) {
  const parts = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>
      {parts.map((word, i) => (
        <AnimatedWord key={i} index={i} step={step} rise={rise} style={{ ...style, ...(i === parts.length - 1 ? lastStyle : null) }}>
          {word}
        </AnimatedWord>
      ))}
    </div>
  );
}
function AnimatedWord({ index, step, rise, style, children }) {
  const s = useWordSpring(index, 6, step);
  return (
    <span style={{ display: 'inline-block', opacity: s, transform: `translateY(${(1 - s) * rise}px)`, ...style }}>{children}</span>
  );
}

// Detail line under the captions: "title · preacher", then the footer line. (The takeaway text
// is deliberately not drawn on the video.)
function Takeaway({ p, color, accent, align = 'left' }) {
  const frame = useSegFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: frame - (p.continuous ? 8 : Math.floor(fps * 0.9)), fps, config: { damping: 20 } });
  const info = infoParts(p).join('  ·  ');
  return (
    <div style={{ opacity: t, transform: `translateY(${(1 - t) * 30}px)`, textAlign: align }}>
      {info ? <div style={{ color: accent, fontSize: sz(p, 'info', 34), fontWeight: 700, letterSpacing: 1, fontFamily: BODY_FONT }}>{info}</div> : null}
      {p.theme.footerText ? (
        <div style={{ marginTop: 10, color, opacity: 0.7, fontSize: sz(p, 'info', 28), fontFamily: BODY_FONT, fontWeight: 700 }}>{p.theme.footerText}</div>
      ) : null}
    </div>
  );
}

function ProgressBar({ p, track, fill, height = 8 }) {
  const progress = useSceneProgress(p.sceneFrames);
  if (!p.theme.showProgress) return null;
  return (
    <div style={{ height, borderRadius: height / 2, background: track }}>
      <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: height / 2, background: fill }} />
    </div>
  );
}

const Fill = ({ children, style }) => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>{children}</div>
);

// ---------------------------------------------------------------- 1. Kinetic

function KineticBackdrop({ theme }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (size, x, y, color, speed, phase, opacity) => (
    <div
      style={{
        position: 'absolute', width: size, height: size, borderRadius: '50%',
        left: x + Math.sin(t * speed + phase) * 140, top: y + Math.cos(t * speed * 0.8 + phase) * 180,
        background: `radial-gradient(circle, ${color} 0%, transparent 65%)`, opacity, filter: 'blur(20px)',
      }}
    />
  );
  return (
    <Backdrop theme={theme}>
      {blob(1100, -300, -200, theme.accent, 0.5, 0, 0.35)}
      {blob(900, 380, 700, theme.accent, 0.35, 2, 0.2)}
      {blob(1000, -200, 1300, '#ffffff', 0.4, 4, 0.08)}
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
    </Backdrop>
  );
}

function Kinetic(p) {
  const { theme } = p;
  return (
    <AbsoluteFill>
      <KineticBackdrop theme={theme} />
      <AbsoluteFill style={{ padding: '110px 80px 120px' }}>
        <TopBar p={p} color={rgba(theme.text, 0.85)} titleColor={theme.accent} />
        {showHeadline(p) ? (
<div style={{ marginTop: 100 }}>
          <AnimatedWords
            text={p.headline}
            style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 120), lineHeight: 1.0, letterSpacing: -4, textTransform: 'uppercase', color: theme.text }}
            lastStyle={{ color: theme.accent }}
          />
        </div>
        ) : null}
        <Fill>
          <Captions words={p.words} theme={theme} size={sz(p, 'captions', 88)} />
        </Fill>
        {theme.showWaveform ? <Waveform color={theme.accent} audioOffset={p.audioOffset} /> : null}
        <div style={{ marginTop: 50 }}>
          <Takeaway p={p} color={rgba(theme.text, 0.88)} accent={theme.accent} />
        </div>
        <div style={{ marginTop: 44 }}>
          <ProgressBar p={p} track={rgba(theme.text, 0.15)} fill={theme.accent} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 2. Minimal

function Minimal(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const rule = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} angle={180} />
      <AbsoluteFill style={{ padding: '120px 96px 110px' }}>
        <TopBar p={p} color={theme.accent} logoHeight={52} size={26} spacing={4} upper />
        <div style={{ height: 3, width: `${rule * 100}%`, background: theme.text, opacity: 0.85, marginTop: 36 }} />
        {showHeadline(p) ? (
<div style={{ marginTop: 70 }}>
          <AnimatedWords
            text={p.headline}
            step={4}
            rise={30}
            gap="0 22px"
            style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 104), lineHeight: 1.08, letterSpacing: -2, color: theme.text }}
          />
        </div>
        ) : null}
        <Fill>
          <Captions words={p.words} theme={theme} size={sz(p, 'captions', 78)} inactive={rgba(theme.text, 0.22)} spoken={theme.text} active={theme.accent} />
        </Fill>
        {theme.showWaveform ? <Waveform color={theme.accent} audioOffset={p.audioOffset} bars={36} barWidth={9} gap={9} maxHeight={90} minHeight={8} /> : null}
        <div style={{ marginTop: 48 }}>
          <Takeaway p={p} size={36} color={rgba(theme.text, 0.75)} accent={theme.accent} />
        </div>
        <div style={{ marginTop: 36 }}>
          <ProgressBar p={p} track={rgba(theme.text, 0.12)} fill={theme.text} height={4} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 3. Bold block

function Block(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 140 } });
  const ticker = [churchLabel(p), p.groupTitle, theme.showSpeaker ? p.speaker : '', theme.footerText].filter(Boolean).join('   ✦   ') || ' ';
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} angle={180}>
        <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(135deg, transparent 0 60px, ${rgba(theme.text, 0.05)} 60px 120px)` }} />
      </Backdrop>
      <AbsoluteFill style={{ padding: '100px 80px 0' }}>
        <TopBar p={p} color={theme.text} logoHeight={80} size={34} upper spacing={2} />
        {showHeadline(p) ? (
<div style={{ marginTop: 40 }}>
          <AnimatedWords
            text={p.headline}
            step={4}
            rise={90}
            gap="0 30px"
            style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 220), lineHeight: 0.86, textTransform: 'uppercase', color: theme.text, letterSpacing: 1 }}
          />
        </div>
        ) : null}
        <Fill>
          <div style={{ background: theme.accent, borderRadius: 32, padding: '56px 56px', transform: `rotate(-2deg) scale(${0.85 + cardIn * 0.15})`, opacity: cardIn, width: '100%', boxShadow: `14px 14px 0 ${rgba(theme.text, 0.25)}` }}>
            <Captions words={p.words} theme={theme} size={sz(p, 'captions', 128)} lineHeight={1.0} inactive="rgba(255,255,255,0.3)" spoken="#ffffff" active={theme.accentText} />
          </div>
        </Fill>
        {theme.showProgress ? <div style={{ marginBottom: 30 }}><ProgressBar p={p} track={rgba(theme.text, 0.2)} fill={theme.text} height={12} /></div> : null}
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: -40, right: -40, bottom: 70, transform: 'rotate(-2deg)', background: theme.accent, overflow: 'hidden', height: 110, display: 'flex', alignItems: 'center' }}>
        <div style={{ whiteSpace: 'nowrap', transform: `translateX(${-(frame * 5) % 1400}px)`, fontFamily: displayFont(theme), fontSize: sz(p, 'info', 64), color: theme.accentText, letterSpacing: 2 }}>
          {Array.from({ length: 6 }, () => `${ticker}   ✦   `).join('')}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 4. Quote card

function Quote(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = spring({ frame: frame - 2, fps, config: { damping: 15, stiffness: 90 } });
  const info = infoParts(p);
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} />
      <AbsoluteFill style={{ padding: '120px 96px 110px' }}>
        <TopBar p={p} color={rgba(theme.text, 0.8)} logoHeight={60} />
        <div style={{ marginTop: 60, fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: 560, lineHeight: 0.7, height: 280, color: theme.accent, opacity: 0.9 * mark, transform: `translateY(${(1 - mark) * 40}px)` }}>“</div>
        {showHeadline(p) ? (
<div style={{ marginTop: 20, color: theme.accent, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'headline', 34), letterSpacing: 8, textTransform: 'uppercase' }}>{p.headline}</div>
        ) : null}
        <Fill style={{ justifyContent: 'flex-start' }}>
          <Captions words={p.words} theme={theme} size={sz(p, 'captions', 80)} align="left" maxWords={9} lineHeight={1.18} inactive={rgba(theme.text, 0.25)} spoken={theme.text} active={theme.accent} />
        </Fill>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 90, height: 4, background: theme.accent }} />
          <div>
            {info[0] ? <div style={{ color: theme.text, fontSize: sz(p, 'info', 40), fontWeight: 700, fontFamily: BODY_FONT }}>{info[0]}</div> : null}
            {info.length > 1 ? <div style={{ color: rgba(theme.text, 0.6), fontSize: sz(p, 'info', 28), fontFamily: BODY_FONT, fontWeight: 700 }}>{info.slice(1).join('  ·  ')}</div> : null}
          </div>
        </div>
        {theme.showWaveform ? <div style={{ marginTop: 50 }}><Waveform color={theme.accent} audioOffset={p.audioOffset} bars={44} barWidth={10} gap={8} maxHeight={60} minHeight={6} /></div> : null}
        {theme.footerText ? <div style={{ marginTop: 20, color: rgba(theme.text, 0.55), fontSize: sz(p, 'info', 28), fontFamily: BODY_FONT, fontWeight: 700, textAlign: 'center' }}>{theme.footerText}</div> : null}
        <div style={{ marginTop: 30 }}>
          <ProgressBar p={p} track={rgba(theme.text, 0.14)} fill={theme.accent} height={5} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 5. Karaoke

function Karaoke(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const angle = 160 + Math.sin(frame / 40) * 25;
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} angle={angle}>
        <AbsoluteFill style={{ backgroundImage: `radial-gradient(${rgba('#ffffff', 0.12)} 2px, transparent 2px)`, backgroundSize: '56px 56px' }} />
      </Backdrop>
      <AbsoluteFill style={{ padding: '110px 80px 120px' }}>
        <TopBar p={p} color={theme.text} />
        {showHeadline(p) ? (
<div style={{ marginTop: 90, display: 'flex', justifyContent: 'center' }}>
          <KaraokeTitle p={p} />
        </div>
        ) : null}
        <Fill>
          <Captions words={p.words} theme={theme} size={sz(p, 'captions', 118)} mode="pill" maxWords={5} lineHeight={1.15} inactive={rgba(theme.text, 0.35)} spoken={theme.text} active={theme.accent} activeText={theme.accentText} />
        </Fill>
        {theme.showWaveform ? <Waveform color={theme.accent} audioOffset={p.audioOffset} bars={20} barWidth={30} gap={16} maxHeight={150} minHeight={24} radius={15} /> : null}
        <div style={{ marginTop: 50, textAlign: 'center' }}>
          <Takeaway p={p} size={38} color={rgba(theme.text, 0.9)} accent={theme.accent} align="center" />
        </div>
        <div style={{ marginTop: 40 }}>
          <ProgressBar p={p} track={rgba('#ffffff', 0.2)} fill={theme.accent} height={10} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
function KaraokeTitle({ p }) {
  const s = useWordSpring(0, 4, 0, { damping: 12, stiffness: 120 });
  return (
    <div style={{ background: rgba('#ffffff', 0.16), border: `3px solid ${rgba('#ffffff', 0.5)}`, borderRadius: 999, padding: '22px 54px', color: p.theme.text, fontFamily: displayFont(p.theme), fontWeight: displayWeight(p.theme), fontSize: sz(p, 'headline', 62), letterSpacing: 2, textTransform: 'uppercase', transform: `scale(${0.7 + s * 0.3})`, opacity: s, textAlign: 'center' }}>
      {p.headline}
    </div>
  );
}

// ---------------------------------------------------------------- 6. Poster

function Poster(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const info = infoParts(p);
  return (
    <AbsoluteFill style={{ background: '#ffffff' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1120, overflow: 'hidden', background: `linear-gradient(160deg, ${theme.bg}, ${theme.bg2})` }}>
        {theme.backgroundImageUrl ? (
          <Img src={theme.backgroundImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.05 + frame * 0.0006})` }} />
        ) : (
          <>
            <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', right: -260, top: -240, background: rgba(theme.accent, 0.35) }} />
            <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', left: -200, top: 380, background: rgba('#ffffff', 0.08) }} />
          </>
        )}
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${rgba(theme.bg2, 0.35)} 0%, ${rgba(theme.bg2, theme.backgroundImageUrl ? theme.overlay : 0.1)} 55%, ${rgba(theme.bg2, 0.9)} 100%)` }} />
        <div style={{ position: 'absolute', top: 100, left: 80, right: 80 }}>
          <TopBar p={p} color="#ffffff" />
        </div>
        {showHeadline(p) ? (
<div style={{ position: 'absolute', left: 80, right: 80, bottom: 130 }}>
          <AnimatedWords
            text={p.headline}
            step={4}
            rise={50}
            gap="0 22px"
            style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 112), lineHeight: 1.02, letterSpacing: -3, color: '#ffffff', textShadow: '0 6px 40px rgba(0,0,0,0.35)' }}
          />
        </div>
        ) : null}
      </div>
      <div style={{ position: 'absolute', top: 1000, left: 0, right: 0, bottom: 0, background: '#ffffff', borderRadius: '64px 64px 0 0', boxShadow: '0 -20px 60px rgba(0,0,0,0.18)', padding: '70px 80px 80px', display: 'flex', flexDirection: 'column' }}>
        <Fill>
          <Captions words={p.words} theme={theme} size={sz(p, 'captions', 72)} maxWords={7} shadow={false} inactive={rgba(theme.text, 0.25)} spoken={theme.text} active={theme.accent} />
        </Fill>
        {theme.showWaveform ? <Waveform color={theme.accent} audioOffset={p.audioOffset} bars={40} barWidth={10} gap={8} maxHeight={70} minHeight={8} /> : null}
        <div style={{ marginTop: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', color: theme.text, fontFamily: BODY_FONT, fontWeight: 700 }}>
          <div>
            {info[0] ? <div style={{ fontSize: sz(p, 'info', 36) }}>{info[0]}</div> : null}
            {info.length > 1 ? <div style={{ fontSize: sz(p, 'info', 28), opacity: 0.6 }}>{info.slice(1).join('  ·  ')}</div> : null}
          </div>
          {theme.footerText ? <div style={{ fontSize: sz(p, 'info', 26), opacity: 0.6, textAlign: 'right' }}>{theme.footerText}</div> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 7. Neon

function Neon(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const flicker = 0.92 + 0.08 * Math.sin(frame * 0.7) * Math.sin(frame * 0.23);
  const glow = (c, r = 1) => `0 0 ${12 * r}px ${c}, 0 0 ${30 * r}px ${c}, 0 0 ${70 * r}px ${rgba(c, 0.7)}`;
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} angle={180}>
        {/* perspective grid floor */}
        <div style={{ position: 'absolute', left: -400, right: -400, bottom: -100, height: 1000, perspective: 700 }}>
          <div
            style={{
              position: 'absolute', inset: 0, transformOrigin: 'center top', transform: 'rotateX(68deg)',
              backgroundImage: `linear-gradient(${rgba(theme.accent, 0.55)} 2px, transparent 2px), linear-gradient(90deg, ${rgba(theme.accent, 0.55)} 2px, transparent 2px)`,
              backgroundSize: '90px 90px', backgroundPosition: `0 ${(frame * 3) % 90}px`,
              maskImage: 'linear-gradient(180deg, transparent, #000 40%)', WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 40%)',
            }}
          />
        </div>
      </Backdrop>
      <AbsoluteFill style={{ padding: '110px 80px 110px' }}>
        <TopBar p={p} color={rgba(theme.text, 0.9)} titleColor={theme.accent} />
        {showHeadline(p) ? (
<div style={{ marginTop: 90, opacity: flicker }}>
          <AnimatedWords
            text={p.headline}
            step={4}
            rise={40}
            gap="0 26px"
            style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 190), lineHeight: 0.92, textTransform: 'uppercase', color: '#ffffff', letterSpacing: 3, textShadow: glow(theme.accent, 0.9) }}
            lastStyle={{ color: '#fff', textShadow: glow('#ff2bd6', 0.9) }}
          />
        </div>
        ) : null}
        <Fill>
          <Captions words={p.words} theme={theme} size={sz(p, 'captions', 86)} inactive={rgba(theme.text, 0.28)} spoken={theme.text} active={theme.accent} shadow={false} />
        </Fill>
        {theme.showWaveform ? (
          <div style={{ filter: `drop-shadow(0 0 10px ${theme.accent})` }}>
            <Waveform color={theme.accent} audioOffset={p.audioOffset} bars={30} barWidth={14} gap={10} maxHeight={130} minHeight={8} />
          </div>
        ) : null}
        <div style={{ marginTop: 40 }}>
          <Takeaway p={p} size={36} color={rgba(theme.text, 0.9)} accent={theme.accent} />
        </div>
        <div style={{ marginTop: 34 }}>
          <ProgressBar p={p} track={rgba(theme.accent, 0.2)} fill={theme.accent} height={6} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 8. Aurora glass

function Aurora(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (size, cx, cy, color, speed, ph, a) => (
    <div
      style={{
        position: 'absolute', width: size, height: size, borderRadius: '50%', filter: 'blur(90px)', opacity: a,
        left: cx + Math.sin(t * speed + ph) * 260 - size / 2, top: cy + Math.cos(t * speed * 0.9 + ph) * 320 - size / 2, background: color,
      }}
    />
  );
  return (
    <AbsoluteFill>
      <Backdrop theme={theme}>
        {blob(900, 200, 300, theme.accent, 0.45, 0, 0.55)}
        {blob(1000, 880, 800, '#a78bfa', 0.35, 2, 0.5)}
        {blob(900, 300, 1500, theme.bg2, 0.4, 4, 0.9)}
        {blob(700, 900, 1700, '#38bdf8', 0.3, 1, 0.35)}
      </Backdrop>
      <AbsoluteFill style={{ padding: '110px 80px 110px' }}>
        <TopBar p={p} color={theme.text} />
        {showHeadline(p) ? (
<div style={{ marginTop: 90 }}>
          <AnimatedWords
            text={p.headline}
            step={4}
            rise={40}
            gap="0 22px"
            style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 104), lineHeight: 1.04, letterSpacing: -3, color: theme.text }}
          />
        </div>
        ) : null}
        <Fill>
          <div style={{ width: '100%', padding: '64px 56px', borderRadius: 64, background: rgba('#ffffff', 0.13), border: `2px solid ${rgba('#ffffff', 0.3)}`, boxShadow: '0 30px 80px rgba(0,0,0,0.25)', backdropFilter: 'blur(26px)', WebkitBackdropFilter: 'blur(26px)', minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Captions words={p.words} theme={theme} size={sz(p, 'captions', 80)} inactive={rgba(theme.text, 0.35)} spoken={theme.text} active={theme.accent} shadow={false} />
          </div>
        </Fill>
        {theme.showWaveform ? <Waveform color={rgba('#ffffff', 0.9)} audioOffset={p.audioOffset} bars={32} barWidth={12} gap={10} maxHeight={90} minHeight={8} /> : null}
        <div style={{ marginTop: 40 }}>
          <Takeaway p={p} size={36} color={rgba(theme.text, 0.9)} accent={theme.accent} />
        </div>
        <div style={{ marginTop: 34 }}>
          <ProgressBar p={p} track={rgba('#ffffff', 0.2)} fill={theme.accent} height={6} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 9. Scripture page

function Scripture(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frameIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const head = spring({ frame: useSegFrame() - 4, fps, config: { damping: 18 } });
  const gold = '#b8893a';
  const info = infoParts(p).join('  ·  ');
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} angle={170}>
        <AbsoluteFill style={{ backgroundImage: `radial-gradient(ellipse at 50% 40%, transparent 40%, ${rgba('#6b4a1e', 0.28)} 100%)` }} />
      </Backdrop>
      <div style={{ position: 'absolute', inset: 56, border: `4px solid ${gold}`, opacity: frameIn }} />
      <div style={{ position: 'absolute', inset: 76, border: `1.5px solid ${gold}`, opacity: frameIn }} />
      <AbsoluteFill style={{ padding: '150px 150px 150px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', minHeight: 40 }}>
          <ServiceTitle p={p} color={theme.accent} size={28} align="center" upper spacing={6} maxWidth={760} />
        </div>
        <div style={{ margin: '34px auto 0', display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center', color: gold, fontSize: 34 }}>
          <div style={{ width: 160, height: 2, background: gold }} />✦<div style={{ width: 160, height: 2, background: gold }} />
        </div>
        {showHeadline(p) ? (
<div style={{ marginTop: 56, opacity: head, transform: `translateY(${(1 - head) * 30}px)`, fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 112), lineHeight: 1.06, letterSpacing: -2, color: theme.text }}>
          {p.headline}
        </div>
        ) : null}
        <Fill>
          <Captions words={p.words} theme={theme} size={sz(p, 'captions', 70)} maxWords={7} shadow={false} lineHeight={1.22} inactive={rgba(theme.text, 0.22)} spoken={theme.text} active={theme.accent} />
        </Fill>
        {theme.showWaveform ? <Waveform color={gold} audioOffset={p.audioOffset} bars={36} barWidth={8} gap={9} maxHeight={70} minHeight={6} /> : null}
        <div style={{ margin: '34px auto 0', display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center', color: gold, fontSize: 30 }}>
          <div style={{ width: 120, height: 2, background: gold }} />✦<div style={{ width: 120, height: 2, background: gold }} />
        </div>
        {info ? <div style={{ marginTop: 14, color: theme.accent, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 28), letterSpacing: 1 }}>{info}</div> : null}
        {theme.footerText ? <div style={{ marginTop: 8, color: rgba(theme.text, 0.6), fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 26) }}>{theme.footerText}</div> : null}
        {theme.showProgress ? <div style={{ marginTop: 28 }}><ProgressBar p={p} track={rgba(theme.text, 0.12)} fill={gold} height={4} /></div> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 10. Broadcast

function Broadcast(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sf = useSegFrame();
  const slide = spring({ frame: sf - 4, fps, config: { damping: 16, stiffness: 120 } });
  const info = infoParts(p);
  // In a merged video the takeaway changes with each point, which would make the scrolling text
  // jump mid-scroll, so the ticker sticks to the stable bits there.
  const ticker = [p.groupTitle, theme.footerText, churchLabel(p)].filter(Boolean).join('     •     ') || ' ';
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} angle={175}>
        <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(0deg, ${rgba('#ffffff', 0.025)} 0 2px, transparent 2px 6px)` }} />
        <div style={{ position: 'absolute', width: 1400, height: 1400, borderRadius: '50%', left: -300, top: 200, background: `radial-gradient(circle, ${rgba(theme.accent, 0.18)}, transparent 65%)` }} />
      </Backdrop>
      <AbsoluteFill style={{ padding: '100px 70px' }}>
        <TopBar p={p} color={theme.text} logoHeight={74} size={32} />
        <Fill style={{ alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: 'rgba(0,0,0,0.62)', padding: '44px 40px', borderLeft: `10px solid ${theme.accent}` }}>
            <Captions words={p.words} theme={theme} size={sz(p, 'captions', 70)} align="left" maxWords={7} shadow={false} lineHeight={1.18} inactive={rgba('#ffffff', 0.4)} spoken="#ffffff" active={theme.accent} />
          </div>
        </Fill>
        {/* lower third */}
        <div style={{ marginTop: 40, opacity: p.continuous ? slide : 1, transform: `translateX(${(1 - slide) * (p.continuous ? -90 : -900)}px)` }}>
          {showHeadline(p) ? (
<div style={{ background: theme.accent, color: theme.accentText, padding: '26px 36px', fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 82), lineHeight: 1.0, textTransform: 'uppercase', letterSpacing: 1 }}>
            {p.headline}
          </div>
        ) : null}
          <div style={{ background: '#ffffff', color: '#0b1220', padding: '16px 36px', fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 32), display: 'flex', justifyContent: 'space-between', gap: 24 }}>
            <span>{info.join('  ·  ') || ' '}</span>
          </div>
        </div>
        {theme.showProgress ? <div style={{ marginTop: 26 }}><ProgressBar p={p} track={rgba('#ffffff', 0.2)} fill={theme.accent} height={6} /></div> : null}
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, background: '#020617', display: 'flex', alignItems: 'center', overflow: 'hidden', borderTop: `4px solid ${theme.accent}` }}>
        <div style={{ whiteSpace: 'nowrap', transform: `translateX(${1000 - ((frame * 4) % 3600)}px)`, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 34), color: '#fff' }}>{ticker}</div>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 11. Sunrise

function Sunrise(p) {
  const { theme } = p;
  const frame = useCurrentFrame();
  const progress = useSceneProgress(p.sceneFrames);
  const rise = 380 - progress * 160 + Math.sin(frame / 25) * 6;
  const ring = (i) => 700 + i * 220 + Math.sin(frame / 30 + i) * 14;
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} angle={0}>
        <div style={{ position: 'absolute', left: '50%', top: 860 + rise - 380, width: 0, height: 0 }}>
          {[3, 2, 1, 0].map((i) => (
            <div key={i} style={{ position: 'absolute', width: ring(i), height: ring(i), left: -ring(i) / 2, top: -ring(i) / 2, borderRadius: '50%', background: rgba(theme.accent, 0.05 + (3 - i) * 0.035) }} />
          ))}
          <div style={{ position: 'absolute', width: 640, height: 640, left: -320, top: -320, borderRadius: '50%', background: `radial-gradient(circle at 50% 45%, ${rgba(theme.accent, 0.62)} 0%, ${rgba(theme.accent, 0.34)} 50%, ${rgba(theme.accent, 0)} 72%)` }} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 520, background: `linear-gradient(180deg, transparent, ${rgba(theme.bg, 0.92)})` }} />
      </Backdrop>
      <AbsoluteFill style={{ padding: '110px 90px 110px', textAlign: 'center' }}>
        <TopBar p={p} color={theme.text} />
        {showHeadline(p) ? (
<div style={{ marginTop: 110, display: 'flex', justifyContent: 'center' }}>
          <AnimatedWords
            text={p.headline}
            step={4}
            rise={40}
            gap="0 24px"
            style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 108), lineHeight: 1.04, letterSpacing: -2, color: theme.text, textShadow: '0 4px 40px rgba(0,0,0,0.3)', textAlign: 'center' }}
          />
        </div>
        ) : null}
        <Fill>
          <Captions words={p.words} theme={theme} size={sz(p, 'captions', 84)} shadow inactive={rgba(theme.text, 0.5)} spoken={theme.text} active={theme.accent} />
        </Fill>
        {theme.showWaveform ? <Waveform color={rgba(theme.text, 0.9)} audioOffset={p.audioOffset} bars={32} barWidth={12} gap={10} maxHeight={80} minHeight={8} /> : null}
        <div style={{ marginTop: 40 }}>
          <Takeaway p={p} size={36} color={rgba(theme.text, 0.92)} accent={theme.accent} align="center" />
        </div>
        <div style={{ marginTop: 34 }}>
          <ProgressBar p={p} track={rgba(theme.text, 0.2)} fill={theme.text} height={5} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 12. Handwritten

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Text "written" in place: each word is revealed left to right by a wipe, so it looks like a pen
// drawing it. The space is reserved from the start, so nothing shifts while writing.
function InkWord({ children, progress, style }) {
  const done = progress >= 1;
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: progress > 0 ? 1 : 0,
        clipPath: done ? 'none' : `inset(-20% ${(1 - progress) * 100}% -20% -4%)`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function HandHeadline({ p, t }) {
  const { theme } = p;
  const parts = p.headline.split(/\s+/).filter(Boolean);
  const total = parts.reduce((a, w) => a + w.length, 0) || 1;
  const dur = headlineWriteSec(p.headline);
  let at = HEADLINE_WRITE_START;
  const size = sz(p, 'headline', 150);
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: `0 ${Math.round(size * 0.22)}px`, fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: size, lineHeight: 1.0, color: theme.text, transform: 'rotate(-1.2deg)', transformOrigin: 'left center' }}>
        {parts.map((w, i) => {
          const d = (w.length / total) * dur;
          const prog = clamp01((t - at) / d);
          at += d;
          return <InkWord key={i} progress={prog} style={i === parts.length - 1 ? { color: theme.accent } : null}>{w}</InkWord>;
        })}
      </div>
      <svg width="760" height="46" viewBox="0 0 760 46" style={{ display: 'block', marginTop: 14, overflow: 'visible' }}>
        <path
          d="M6 28 C 90 6, 150 40, 250 22 S 420 8, 520 26 S 680 34, 752 12"
          fill="none" stroke={theme.accent} strokeWidth="7" strokeLinecap="round"
          strokeDasharray="800" strokeDashoffset={800 * (1 - clamp01((t - HEADLINE_WRITE_START - dur) / 0.5))}
        />
      </svg>
    </div>
  );
}

function HandCaptions({ p, t }) {
  const { theme } = p;
  const phrases = React.useMemo(() => buildPhrases(p.words, 7), [p.words]);
  const phrase = phrases.find((ph) => t >= ph.start - 0.05 && t < ph.visibleUntil);
  if (!phrase) return null;
  const size = sz(p, 'captions', 128);
  const fade = clamp01((phrase.visibleUntil - t) / 0.18);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${Math.round(size * 0.04)}px ${Math.round(size * 0.24)}px`, opacity: fade, fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: size, lineHeight: 1.12, color: theme.text }}>
      {phrase.words.map((w, i) => {
        const dur = Math.max(0.14, Math.min(0.9, w.end - w.start));
        const prog = clamp01((t - w.start) / dur);
        return <InkWord key={i} progress={prog} style={prog < 1 ? { color: theme.accent } : null}>{w.text}</InkWord>;
      })}
    </div>
  );
}

function Handwriting(p) {
  const { theme } = p;
  const frame = useSegFrame();
  const abs = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const clock = abs / fps;
  const info = infoParts(p).join('  ·  ');
  const progress = useSceneProgress(p.sceneFrames);
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} angle={180}>
        <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 107px, ${rgba('#5b7bb5', 0.28)} 107px, ${rgba('#5b7bb5', 0.28)} 110px)`, backgroundPosition: '0 70px' }} />
        <div style={{ position: 'absolute', left: 128, top: 0, bottom: 0, width: 4, background: rgba('#d94b4b', 0.45) }} />
      </Backdrop>
      <AbsoluteFill style={{ padding: '110px 90px 120px 170px' }}>
        <TopBar p={p} color={rgba(theme.text, 0.85)} titleColor={theme.accent} />
        {showHeadline(p) ? <div style={{ marginTop: 80 }}><HandHeadline p={p} t={t} /></div> : null}
        <Fill style={{ alignItems: 'center', justifyContent: 'flex-start' }}>
          <HandCaptions p={p} t={clock} />
        </Fill>
        {info ? <div style={{ color: theme.accent, fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'info', 48) }}>{info}</div> : null}
        {theme.footerText ? <div style={{ marginTop: 6, color: rgba(theme.text, 0.65), fontFamily: displayFont(theme), fontWeight: 400, fontSize: sz(p, 'info', 40) }}>{theme.footerText}</div> : null}
        {theme.showProgress ? (
          <div style={{ marginTop: 30, height: 10, borderRadius: 5, background: rgba(theme.text, 0.1) }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 5, background: theme.accent }} />
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export const LAYOUT_COMPONENTS = {
  kinetic: Kinetic, minimal: Minimal, block: Block, quote: Quote, karaoke: Karaoke, poster: Poster,
  neon: Neon, aurora: Aurora, scripture: Scripture, broadcast: Broadcast, sunrise: Sunrise, handwriting: Handwriting,
};
