# Recap Reel Studio

Beat-synced 9:16 church recap reels in the browser: intro hero → beat montage → the word (sermon audio over slow-mo) → "SEE YOU NEXT WEEK" outro → closing card, with a custom SFX pack and auto-ducked music.

## Run
```bash
npx serve .            # or: python3 -m http.server 8080
# open http://localhost:3000/index.html
```
(It must be served over http — `file://` can't load the sound effects.)

## Structure
```
index.html              UI markup
src/app.js              engine + UI (timeline, audio mix, canvas drawing, export)
src/styles.css          styles
assets/sfx/             27 SFX (mp3) + manifest.json (hit points)
tools/render_reel.py    optional headless renderer (Playwright + ffmpeg)
tools/fonts/            fonts for the headless renderer
CLAUDE.md               architecture notes for Claude Code
```

## Headless render (optional)
```bash
pip install playwright && python3 -m playwright install chromium
python3 tools/render_reel.py --app . --config cfg.json --out reel.mp4 --fonts tools/fonts
```
See the docstring at the top of `tools/render_reel.py` for the `cfg.json` format.
