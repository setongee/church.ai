# Recap Reel Studio — notes for Claude Code

Browser app that turns church service clips, photos, a sermon ("the word") audio clip and a music track into a beat-synced 9:16 recap reel with sound design and a closing card, then exports MP4/WebM. Everything runs client-side (Canvas 2D + Web Audio + MediaRecorder). No build step, no dependencies.

## Do not read these (binary / large, not code)
- `assets/sfx/*.mp3` — the 27 sound effects. Only `assets/sfx/manifest.json` matters (key → file + `hit` time in seconds = the moment inside the file that should land on the cut).
- `tools/fonts/*.ttf`

## File map
| File | What it is |
|---|---|
| `index.html` | UI markup only. Form controls are read by `id` from app.js. |
| `src/styles.css` | UI styles (dark studio theme). |
| `src/app.js` | Whole engine + UI wiring, one IIFE (~1.7k lines). |
| `assets/sfx/manifest.json` | SFX keys and hit points. |
| `tools/render_reel.py` | Headless frame-accurate renderer (Playwright + ffmpeg) using `window.ReelAPI`. |

## app.js sections (search for the `/* ---- name ---- */` banners)
- **helpers**: `clamp`, easing (`ease`, `easeIO`, `back`), `val(id)` / `num(id)` read form fields, `AC()` lazy AudioContext.
- **media ingest**: `addMediaFile` (video/image → `S.media[]` with thumb, dur, w/h), `setMessage`, `setMusic` (runs `detectBeat` → BPM + first downbeat), `setLogo`.
- **timeline**: `buildTimeline()` → `{B (sec/beat), segs[], total, montageStart, wordStart, wordEnd, outroStart, endStart, textStart, msgLen, hasWord}`. Each seg = `{sec: intro|montage|word|outro|end, kind: single|split3|grid6|letterbox|end, start, dur, items:[{m, inP, rate}], zoom, bar, text}`. Pace (`#pace`) sets beats per cut (clips/photos). First media = hero, last 1–2 = outro (`outroCount`).
- **audio**: `sfxLib()` loads the SFX pack; `genMusic()` is the fallback beat when no music is uploaded; `buildMix(T)` renders the full soundtrack offline (OfflineAudioContext): music with ducking automation under the voice, voice chain (HPF/EQ/compressor), SFX placed with `play(key, eventTime, gain, pan)` which aligns the SFX's `hit` to `eventTime`. Returns `{buf, venv}` (venv = voice envelope for the waveform).
- **drawing**: `drawFrame(t)` draws one frame at time `t` on `#cv`: layouts (`rects`), zoom/Ken Burns, `grade`, `leak` (light leaks/flashes), `drawWord` (title card + waveform), `drawOutroText` (wavy sticker text), `drawEnd` (closing card), `watermark`, `drawLogoSmall`. Video elements are pooled per segment by `manageVideos(t, running, exact)`.
- **timeline UI**: section strip, `invalidate()` rebuilds timeline on any input change.
- **playback / render**: `run(record)` = real-time preview/record (MediaRecorder on canvas stream + audio). `done()` hands back the blob; download uses the claude.ai `downloads` capability if present, else `<a download>`.
- **automation**: `window.ReelAPI.load(cfg)`, `.renderFrames(fps)` (frame-stepped, POSTs JPEG frames + `audio.wav` to `/upload/`), `.render()` (real-time, returns base64).

## Running
Must be served over http (fetches `assets/sfx/`): `npx serve .` or `python3 -m http.server`, then open `/index.html`. Opening via `file://` breaks SFX loading.

## Integrating into another app
- The engine reads settings from DOM ids through `val()`/`num()` and `$('#showWm').checked` etc. To embed as a feature, the clean first step is to replace those reads with a `settings` object (pass it into `buildTimeline`, `buildMix`, `drawFrame`) and expose a small API: `createReel({canvas, sfxBase}) → {addMedia, setMessage, setMusic, setLogo, setSettings, preview, render}`.
- Keep `buildTimeline` → `buildMix` → `drawFrame(t)` as the core pipeline; UI code (thumbs, drop zones, timeline strip) is separable.
- `SFX_BASE` (top of the audio section) points at the SFX folder — change it if assets live elsewhere (e.g. `/static/reel-sfx/`).
- Browser notes: MP4 recording needs Chrome 126+/Safari; others give WebM. HEVC phone clips decode in Safari and Chrome with hardware support.
