import multer from 'multer';
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
