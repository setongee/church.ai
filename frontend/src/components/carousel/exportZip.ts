import JSZip from 'jszip';
import { assetUrl } from '@/lib/api';
import type { CarouselPostSlide } from '@/lib/types';
import { renderState } from './render';

export interface ZipOptions {
  // null keeps each slide's own size (times `scale`).
  target: { w: number; h: number } | null;
  // Only for target === null: 2 exports at double the design's size.
  scale?: number;
  // How a slide that isn't the target's shape is fitted: its own blurred copy behind it, or black bars.
  fit: 'blur' | 'black';
  format: 'png' | 'jpeg';
}

const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'slide';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('An image could not be loaded.'));
    img.src = src;
  });
}

const toBlob = (c: HTMLCanvasElement, format: ZipOptions['format']) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode an image.'))), `image/${format}`, 0.97));

// Puts a slide on a canvas of the target size (projectors and EasyWorship want 16:9), with either a
// blurred, darkened copy of the slide filling the rest, or plain black.
async function fitToTarget(img: HTMLImageElement, target: { w: number; h: number }, fit: ZipOptions['fit'], format: ZipOptions['format']) {
  const c = document.createElement('canvas');
  c.width = target.w;
  c.height = target.h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Could not prepare an image.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, target.w, target.h);
  const same = Math.abs(img.width / img.height - target.w / target.h) < 0.01;
  if (!same && fit === 'blur') {
    const cover = Math.max(target.w / img.width, target.h / img.height);
    ctx.filter = `blur(${Math.round(target.h / 28)}px)`;
    // Drawn a little oversize so the blur doesn't fade to black at the edges.
    ctx.drawImage(img, (target.w - img.width * cover * 1.1) / 2, (target.h - img.height * cover * 1.1) / 2, img.width * cover * 1.1, img.height * cover * 1.1);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, target.w, target.h);
  }
  const contain = Math.min(target.w / img.width, target.h / img.height);
  const w = img.width * contain;
  const h = img.height * contain;
  ctx.drawImage(img, (target.w - w) / 2, (target.h - h) / 2, w, h);
  return toBlob(c, format);
}

// Every slide of a carousel as numbered files in a ZIP: images at the chosen size, videos as the
// MP4s they are. Drop the extracted folder into EasyWorship (or any presentation software).
export async function exportSlidesZip(title: string, slides: CarouselPostSlide[], opts: ZipOptions, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const zip = new JSZip();
  const ext = opts.format === 'jpeg' ? 'jpg' : 'png';

  for (const [i, s] of slides.entries()) {
    onProgress?.(i, slides.length);
    const name = `${String(i + 1).padStart(2, '0')}-${safe(s.label || s.kind)}`;
    if (s.kind === 'video') {
      if (!s.videoUrl) continue;
      const res = await fetch(assetUrl(s.videoUrl));
      if (!res.ok) throw new Error(`Slide ${i + 1}'s video could not be downloaded.`);
      zip.file(`${name}.mp4`, await res.blob());
      continue;
    }

    let source: string;
    let revoke: string | null = null;
    if (s.kind === 'design') {
      const info = s.designInfo;
      if (info?.editorState) {
        // Draw the design at the size it will have in the file, so nothing is stretched or shrunk afterwards.
        const multiplier = opts.target ? Math.min(opts.target.w / info.width, opts.target.h / info.height) : (opts.scale ?? 1);
        source = await renderState(info.editorState, { w: info.width, h: info.height }, { format: 'png', multiplier });
      }
      else if (info?.exportedImageUrl) source = assetUrl(info.exportedImageUrl);
      else throw new Error(`Slide ${i + 1} is empty. Open it in the editor first.`);
    } else {
      const res = await fetch(assetUrl(s.imageUrl ?? ''));
      if (!res.ok) throw new Error(`Slide ${i + 1}'s image could not be downloaded.`);
      source = revoke = URL.createObjectURL(await res.blob());
    }
    try {
      const img = await loadImage(source);
      const blob = await fitToTarget(img, opts.target ?? { w: img.width, h: img.height }, opts.fit, opts.format);
      zip.file(`${name}.${ext}`, blob);
    } finally {
      if (revoke) URL.revokeObjectURL(revoke);
    }
  }
  onProgress?.(slides.length, slides.length);
  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const zipName = (title: string) => `${safe(title)}.zip`;
