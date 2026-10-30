import React from 'react';
import { Composition } from 'remotion';
import { CompilationComposition, OutroCard, ReelComposition, SettledFrameContext } from './Reel.jsx';
import { useFonts } from './common.jsx';
import { normaliseTheme } from './templates.js';
import { DEFAULT_THEME } from './templates.js';
import { DesignAnim } from './DesignAnim.jsx';
import { CarouselSlide, PhotoReelComposition } from './photoReel.jsx';

export const FPS = 30;

const reelDefaults = {
  theme: DEFAULT_THEME,
  headline: 'Headline goes here',
  pointNumber: 1,
  totalPoints: 5,
  speaker: '',
  serviceTitle: '',
  churchName: '',
  logoUrl: '',
  sizes: { headline: 1, captions: 1, info: 1 },
  durationSec: 10,
  outro: { enabled: false, seconds: 5, cta: '', churchName: '', logoUrl: '', tagline: '', serviceTimes: [], address: '', website: '', follow: [] },
  outroSec: 0,
  audioSrc: '',
  mixSrc: '',
  words: [],
};

const compilationDefaults = {
  theme: DEFAULT_THEME,
  title: 'Key points',
  speaker: '',
  serviceTitle: '',
  churchName: '',
  logoUrl: '',
  sizes: { headline: 1, captions: 1, info: 1 },
  audioSrc: '',
  mixSrc: '',
  totalFrames: FPS * 10,
  outro: { enabled: false, seconds: 5, cta: '', churchName: '', logoUrl: '', tagline: '', serviceTimes: [], address: '', website: '', follow: [] },
  outroSec: 0,
  words: [],
  segments: [],
};

const emptyOutro = { enabled: false, seconds: 5, cta: '', churchName: '', logoUrl: '', tagline: '', serviceTimes: [], address: '', website: '', follow: [] };
const defaultPal = { bg: '#f7efe2', bg2: '#ead9bd', text: '#1c1917', accent: '#e0561f', accentText: '#ffffff', font: 'bricolage', tintA: '#ff7a1a', tintB: '#2a6df4' };

const photoDefaults = {
  style: 'collage',
  images: [],
  intro: { enabled: true, title: 'Service Recap', subtitle: '' },
  cycleSec: 2.4,
  photoSec: 10,
  pal: defaultPal,
  theme: DEFAULT_THEME,
  logoUrl: '',
  showLogo: true,
  churchName: '',
  lowerThird: { style: 'none', title: '', subtitle: '', left: '', right: '' },
  sizes: { headline: 1, captions: 1, info: 1 },
  outro: emptyOutro,
  outroSec: 0,
  mixSrc: '',
};

const slideDefaults = {
  lengthSec: 8,
  mixSrc: '',
  layout: 'hero-left',
  images: [],
  title: '',
  subtitle: '',
  pal: defaultPal,
  theme: DEFAULT_THEME,
  logoUrl: '',
  showLogo: true,
  lowerThird: { style: 'none', title: '', subtitle: '', left: '', right: '' },
  outro: emptyOutro,
  sizes: { headline: 1, captions: 1, info: 1 },
};

// A closing card on its own, fully arrived - the thumbnails of the outro picker.
function OutroPreview({ theme, outro, sizes }) {
  useFonts();
  return (
    <SettledFrameContext.Provider value={240}>
      <OutroCard theme={normaliseTheme(theme)} outro={outro} sizes={sizes} />
    </SettledFrameContext.Provider>
  );
}

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="Reel"
        component={ReelComposition}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={FPS * 10}
        defaultProps={reelDefaults}
        // The clip length is only known per render, so derive the frame count from the props.
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(FPS, Math.ceil((props.durationSec + (props.outro?.enabled ? props.outroSec : 0)) * FPS)),
        })}
      />
      <Composition
        id="Compilation"
        component={CompilationComposition}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={FPS * 10}
        defaultProps={compilationDefaults}
        calculateMetadata={({ props }) => ({ durationInFrames: Math.max(FPS, props.totalFrames + Math.round((props.outro?.enabled ? props.outroSec : 0) * FPS)) })}
      />
      <Composition
        id="PhotoReel"
        component={PhotoReelComposition}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={FPS * 10}
        defaultProps={photoDefaults}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(FPS, Math.round((props.photoSec + (props.outro?.enabled ? props.outroSec : 0)) * FPS)),
        })}
      />
      <Composition
        id="DesignAnim"
        component={DesignAnim}
        width={1080}
        height={1350}
        fps={FPS}
        durationInFrames={FPS * 6}
        defaultProps={{ background: '', layers: [], effect: 'rise', lengthSec: 6, speed: 0.9, stagger: 0.4, loop: true, bgMotion: false, width: 1080, height: 1350 }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(FPS, Math.round(Math.min(8, props.lengthSec) * FPS)),
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="OutroPreview"
        component={OutroPreview}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={FPS}
        defaultProps={{ theme: DEFAULT_THEME, outro: emptyOutro, sizes: { headline: 1, captions: 1, info: 1 } }}
      />
      <Composition
        id="CarouselSlide"
        component={CarouselSlide}
        width={1080}
        height={1350}
        fps={FPS}
        durationInFrames={FPS * 8}
        defaultProps={slideDefaults}
        calculateMetadata={({ props }) => ({ durationInFrames: Math.max(FPS, Math.round(props.lengthSec * FPS)) })}
      />
    </>
  );
}
