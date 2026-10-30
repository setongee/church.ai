import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Images uploaded before the move to Cloudinary still live here and are served statically by
// server.js - kept around so those old /uploads/... URLs keep resolving.
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    cb(new Error('Only image uploads are allowed'));
    return;
  }
  cb(null, true);
}

// All new image uploads (quote custom images, quote exports, service templates) go straight to
// Cloudinary rather than local disk - keeps the buffer in memory so it can be turned into a data
// URI with no temp file to clean up.
export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Audio imports can be long recordings (an hour of mp3 is ~60 MB), so these stream to a temp
// file on disk instead of being buffered in memory like the image uploads above.
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|aif|aiff|ogg|oga|opus|webm|flac|mp4)$/i;

export const audioUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `import-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/mp4' || file.mimetype === 'video/webm' || AUDIO_EXT_RE.test(file.originalname)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only audio files (mp3, wav, m4a, ...) are allowed'));
  },
  limits: { fileSize: 500 * 1024 * 1024 },
});

// A custom closing card: a full-screen image or a short video clip.
const OUTRO_DIR = path.join(UPLOADS_DIR, 'outro-media');
fs.mkdirSync(OUTRO_DIR, { recursive: true });
export { OUTRO_DIR };
export const outroMediaUpload = multer({
  storage: multer.diskStorage({
    destination: OUTRO_DIR,
    filename: (req, file, cb) => cb(null, `outro-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || /\.(png|jpe?g|webp|gif|mp4|mov|m4v|webm)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Upload an image or a video file'));
  },
  limits: { fileSize: 300 * 1024 * 1024 },
});

// A finished video rendered in the browser by a Custom template (Recap Reel), saved with the other reels.
const REELS_UPLOAD_DIR = path.join(UPLOADS_DIR, 'reels');
fs.mkdirSync(REELS_UPLOAD_DIR, { recursive: true });
export const customReelUpload = multer({
  storage: multer.diskStorage({
    destination: REELS_UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `custom-${Date.now()}-${Math.round(Math.random() * 1e9)}${file.mimetype.includes('mp4') ? '.mp4' : '.webm'}`),
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Upload a video file'));
  },
  limits: { fileSize: 300 * 1024 * 1024 },
});
