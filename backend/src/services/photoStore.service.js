import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { localUrl } from './audioPipeline.service.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
export const PHOTOS_DIR = path.join(UPLOADS_DIR, 'photos');
export const CAROUSEL_DIR = path.join(UPLOADS_DIR, 'carousel');
for (const dir of [PHOTOS_DIR, CAROUSEL_DIR]) fs.mkdirSync(dir, { recursive: true });

const MAX_EDGE = 1800;

// Stores an uploaded photo as a JPEG no larger than 1800px on its long side (and with its camera
// rotation applied), which keeps video rendering fast without visibly costing quality.
export async function storePhoto(buffer, originalName = 'photo') {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const tmp = path.join(os.tmpdir(), `photo-${crypto.randomUUID()}${ext}`);
  const name = `${crypto.randomUUID()}.jpg`;
  await fs.promises.writeFile(tmp, buffer);
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(tmp)
        .outputOptions([
          '-vf',
          `scale='if(gt(iw,ih),min(${MAX_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_EDGE},ih))'`,
          '-frames:v',
          '1',
          '-q:v',
          '3',
        ])
        .on('end', resolve)
        .on('error', (err) => reject(new Error(`That file couldn't be read as a photo (${err.message.split('\n')[0]}). Use JPEG, PNG or WebP.`)))
        .save(path.join(PHOTOS_DIR, name));
    });
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
  return localUrl('photos', name);
}

export function removeStoredFile(url, dir) {
  if (!url) return;
  fs.promises.unlink(path.join(dir, path.basename(new URL(url, 'http://x').pathname))).catch(() => {});
}
