#!/usr/bin/env python3
"""Headless, frame-accurate renderer for Recap Reel Studio (reel.html).
Usage: python3 tools/render_reel.py --app . --config cfg.json --out reel.mp4 [--fonts DIR]
  --app is the project folder (index.html + src/ + assets/)
cfg.json:
{"media":["clip1.mp4","photo.jpg",...],      # order matters: first = intro hero, last 2 = outro
 "message":"word.mp3" | null, "music":"track.mp3" | null, "logo":"logo.png" | null,
 "fields":{"handle":"@x","outroText":"SEE YOU NEXT WEEK","details":"line1\\nline2",
           "msgTitle":"...","minister":"...","wordLabel":"THE WORD","grade":"cool|warm|film|none",
           "res":"1080|720","musicVol":0.7,"sfxVol":0.75,"voiceVol":1,"showWave":true,"showWm":true},
 "after":{"msgStart":12.5,"msgLen":20,"bpm":105,"musicStart":0}}   # optional; overrides auto-detection
"""
import argparse, functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--app', required=True); ap.add_argument('--config', required=True)
ap.add_argument('--out', required=True); ap.add_argument('--fonts', default=None)
a = ap.parse_args()
cfg = json.load(open(a.config))
work = tempfile.mkdtemp(prefix='reel_'); shutil.rmtree(work)
shutil.copytree(a.app, work, ignore=shutil.ignore_patterns('node_modules', '.git', 'tools'))
outd = os.path.join(work, 'upload'); os.makedirs(outd)
res = str(cfg.get('fields', {}).get('res', '1080'))
maxw = 1080 if res == '1080' else 720

def ff(*args): subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)

def stage(p, i, kind):
    """Copy into the served folder. Video -> VP9 WebM with short GOP (headless Chromium has no H.264/HEVC; short GOP = fast exact seeks)."""
    base = f'{kind}{i:02d}'; ext = os.path.splitext(p)[1].lower()
    if ext in ('.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp', '.hevc'):
        dst = base + '.webm'
        ff('-i', p, '-an', '-vf', f'scale=w={maxw}:h={maxw*16//9}:force_original_aspect_ratio=increase:force_divisible_by=2,fps=30',
           '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-g', '8', '-b:v', '8M', os.path.join(work, dst))
    elif ext in ('.heic', '.heif', '.tif', '.tiff', '.bmp'):
        dst = base + '.jpg'; ff('-i', p, '-q:v', '2', os.path.join(work, dst))
    elif kind in ('msg', 'mus') and ext not in ('.wav', '.ogg', '.opus', '.flac', '.mp3'):
        dst = base + '.wav'; ff('-i', p, os.path.join(work, dst))
    else:
        dst = base + ext; shutil.copy(p, os.path.join(work, dst))
    return dst

c2 = {'fields': cfg.get('fields', {}), 'after': cfg.get('after', {})}
c2['media'] = [stage(p, i, 'm') for i, p in enumerate(cfg['media'])]
for k, kind in (('message', 'msg'), ('music', 'mus'), ('logo', 'logo')):
    if cfg.get(k): c2[k] = stage(cfg[k], 0, kind)
font_css = ''
if a.fonts and os.path.isdir(a.fonts):
    shutil.copytree(a.fonts, os.path.join(work, 'fonts'))
    fam = {'Anton': ('Anton-Regular.ttf', '400'), 'Bowlby One': ('BowlbyOne-Regular.ttf', '400'), 'Archivo': ('Archivo.ttf', '100 900')}
    font_css = ''.join(f"@font-face{{font-family:'{n}';src:url(/fonts/{f});font-weight:{w}}}" for n, (f, w) in fam.items()
                       if os.path.exists(os.path.join(a.fonts, f)))

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); data = self.rfile.read(n)
        open(os.path.join(outd, os.path.basename(self.path)), 'wb').write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=work))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_address[1]}/index.html'

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1300, 'height': 1000})
    pg.on('console', lambda m: print('page:', m.text, file=sys.stderr) if m.type == 'error' or m.text.startswith('frame') else None)
    pg.add_init_script('window.__headless=true')
    pg.goto(url); pg.wait_for_function('window.ReelAPI')
    if font_css: pg.add_style_tag(content=font_css)
    pg.set_default_timeout(0)
    info = pg.evaluate('c=>ReelAPI.load(c)', c2)
    print('timeline:', info, file=sys.stderr)
    if info.get('bad'): print('WARNING could not decode:', info['bad'], file=sys.stderr)
    r = pg.evaluate('()=>ReelAPI.renderFrames(30)')
    print('rendered:', r, file=sys.stderr)
    b.close()
ff('-framerate', '30', '-i', os.path.join(outd, 'f%06d.jpg'), '-i', os.path.join(outd, 'audio.wav'),
   '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
   '-shortest', '-movflags', '+faststart', a.out)
shutil.rmtree(work, ignore_errors=True)
print('wrote', a.out)
