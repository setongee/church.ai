import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BoldOutro, MediaOutro, GlassOutro, Pop, ScriptOutro, SettledFrameContext, ThanksOutro } from './outros.jsx';
export { SettledFrameContext };
import { normaliseTheme } from './templates.js';
import { LAYOUT_COMPONENTS } from './layouts.jsx';
import {
  AudioProvider,
  BODY_FONT,
  Backdrop,
  NoAudioProvider,
  SegmentClockProvider,
  displayFont,
  displayWeight,
  rgba,
  sz,
  useFonts,
} from './common.jsx';

const FPS = 30;
const OUTRO_OVERLAP = 8; // frames the closing card fades in while the content fades out

// One scene: headline and word-synced captions drawn by whichever layout the template picks.
// A single reel is one scene; a merged video is also one scene that runs end to end.
export function Scene(props) {
  const theme = normaliseTheme(props.theme);
  const Layout = LAYOUT_COMPONENTS[theme.layout];
  return <Layout {...props} theme={theme} />;
}

// `audioSrc` is the voice alone (the waveform reads it, so the bars follow speech and not the
// music); `mixSrc` is what actually plays - voice + music when music is on.
function WithAudio({ audioSrc, mixSrc, children }) {
  const playing = mixSrc || audioSrc;
  const body = (
    <>
      {playing ? <Audio src={playing} /> : null}
      {children}
    </>
  );
  return audioSrc ? <AudioProvider audioSrc={audioSrc}>{body}</AudioProvider> : <NoAudioProvider>{body}</NoAudioProvider>;
}

// ---------------------------------------------------------------- closing card

// The card that closes every video: logo, a call to action, the church's service times,
// address and where to follow. Content comes from the Brand page unless overridden per video.
function InfoOutro({ theme, outro, sizes }) {
  const p = { sizes };
  const words = outro.cta.split(/\s+/).filter(Boolean);
  const label = { color: theme.accent, fontFamily: BODY_FONT, fontWeight: 700, letterSpacing: 8, textTransform: 'uppercase' };
  let i = 0;
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} />
      <AbsoluteFill style={{ padding: '110px 90px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <Pop index={i++}>
          {outro.logoUrl && theme.showLogo ? (
            <Img src={outro.logoUrl} style={{ height: 150, width: 'auto' }} />
          ) : outro.churchName ? (
            <div style={{ color: theme.text, fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'info', 64) }}>{outro.churchName}</div>
          ) : null}
        </Pop>

        <Pop index={i++} style={{ marginTop: 70 }}>
          <div style={{ fontFamily: displayFont(theme), fontWeight: displayWeight(theme), fontSize: sz(p, 'headline', 112), lineHeight: 1.04, letterSpacing: -3, color: theme.text }}>
            {words.map((w, k) => (
              <span key={k} style={{ color: k === words.length - 1 ? theme.accent : theme.text }}>
                {w}{k < words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </div>
        </Pop>

        <Pop index={i++} style={{ marginTop: 50 }}>
          <div style={{ width: 120, height: 6, borderRadius: 3, background: theme.accent, margin: '0 auto' }} />
        </Pop>

        {outro.serviceTimes.length > 0 && (
          <Pop index={i++} style={{ marginTop: 60 }}>
            <div style={{ ...label, fontSize: sz(p, 'info', 28) }}>Join us</div>
            <div style={{ marginTop: 18 }}>
              {outro.serviceTimes.map((line, k) => (
                <div key={k} style={{ color: theme.text, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 44), lineHeight: 1.35 }}>{line}</div>
              ))}
            </div>
          </Pop>
        )}

        {outro.address && (
          <Pop index={i++} style={{ marginTop: 40 }}>
            <div style={{ color: rgba(theme.text, 0.85), fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 34), lineHeight: 1.35, maxWidth: 820 }}>{outro.address}</div>
          </Pop>
        )}

        {(outro.follow.length > 0 || outro.website) && (
          <Pop index={i++} style={{ marginTop: 56 }}>
            {outro.follow.length > 0 && <div style={{ ...label, fontSize: sz(p, 'info', 28) }}>Follow us</div>}
            <div style={{ marginTop: 16 }}>
              {outro.follow.map((line, k) => (
                <div key={k} style={{ color: theme.text, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 40), lineHeight: 1.4 }}>{line}</div>
              ))}
              {outro.website ? <div style={{ marginTop: 10, color: theme.accent, fontFamily: BODY_FONT, fontWeight: 700, fontSize: sz(p, 'info', 38) }}>{outro.website}</div> : null}
            </div>
          </Pop>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// The closing card, in whichever of the designs the video picked.
export function OutroCard(props) {
  const Card = { media: MediaOutro, thanks: ThanksOutro, script: ScriptOutro, bold: BoldOutro, glass: GlassOutro }[props.outro.style] ?? InfoOutro;
  return <Card {...props} />;
}

// Fades a block in over its first frames (the closing card appearing over the content).
function FadeIn({ frames, children }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(frame, [0, frames], [0, 1], { extrapolateRight: 'clamp' }) }}>{children}</AbsoluteFill>;
}

// Content, then (optionally) the closing card. `fades` fades the content out at the end of the
// video itself when there is no closing card to hand over to.
function ContentThenOutro({ props, content }) {
  const theme = normaliseTheme(props.theme);
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const outroFrames = props.outro?.enabled && props.outroSec > 0 ? Math.round(props.outroSec * FPS) : 0;
  const contentFrames = durationInFrames - outroFrames;
  const contentOpacity = outroFrames
    ? interpolate(frame, [contentFrames - OUTRO_OVERLAP, contentFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const outroOpacity = outroFrames ? interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' }) : 0;
  return (
    <>
      <AbsoluteFill style={{ opacity: contentOpacity }}>{content(contentFrames)}</AbsoluteFill>
      {outroFrames > 0 && (
        <Sequence from={contentFrames - OUTRO_OVERLAP} durationInFrames={outroFrames + OUTRO_OVERLAP}>
          <AbsoluteFill style={{ opacity: outroOpacity }}>
            <FadeIn frames={OUTRO_OVERLAP}>
              <OutroCard theme={theme} outro={props.outro} sizes={props.sizes} />
            </FadeIn>
          </AbsoluteFill>
        </Sequence>
      )}
    </>
  );
}

export function ReelComposition(props) {
  useFonts();
  return (
    <AbsoluteFill>
      <WithAudio audioSrc={props.audioSrc} mixSrc={props.mixSrc}>
        <ContentThenOutro props={props} content={(contentFrames) => <Scene {...props} sceneFrames={contentFrames} audioOffset={0} />} />
      </WithAudio>
    </AbsoluteFill>
  );
}

// Merged video: ONE continuous scene over one continuous audio track. There are no title cards
// or per-clip scenes - the background, waveform and progress bar run straight through, captions
// flow across the joins, and only the headline updates (with a small entrance animation) as the
// speaker moves on to the next point. Then the closing card.
function MergedScene({ props, contentFrames }) {
  const frame = useCurrentFrame();
  const segs = props.segments;
  let index = 0;
  segs.forEach((s, i) => {
    if (frame >= s.startFrame) index = i;
  });
  const seg = segs[index] ?? { headline: props.title, startFrame: 0 };
  return (
    <SegmentClockProvider value={seg.startFrame}>
      <Scene
        theme={props.theme}
        headline={seg.headline}
        groupTitle={props.title}
        pointNumber={index + 1}
        totalPoints={segs.length}
        speaker={props.speaker}
        serviceTitle={props.serviceTitle}
        churchName={props.churchName}
        logoUrl={props.logoUrl}
        words={props.words}
        sizes={props.sizes}
        sceneFrames={contentFrames}
        audioOffset={0}
        continuous
      />
    </SegmentClockProvider>
  );
}

export function CompilationComposition(props) {
  useFonts();
  return (
    <AbsoluteFill>
      <WithAudio audioSrc={props.audioSrc} mixSrc={props.mixSrc}>
        <ContentThenOutro props={props} content={(contentFrames) => <MergedScene props={props} contentFrames={contentFrames} />} />
      </WithAudio>
    </AbsoluteFill>
  );
}
