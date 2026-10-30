import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { UPLOADS_DIR } from '../middlewares/upload.js';
import { uploadImage } from './cloudinary.service.js';

const DATA_URI_RE = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s;
const EXT = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp' };

export class ImageStoreError extends Error {
  constructor(message) {
    super(message);
    this.status = 502;
  }
}

function hasCloudinary() {
  return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
}

// Stores a base64 data URI and returns a URL: an absolute Cloudinary URL when credentials exist,
// otherwise a relative `/uploads/<file>` path (served statically by server.js).
export async function storeImage(dataUri, publicId) {
  const match = DATA_URI_RE.exec(dataUri || '');
  if (!match) {
    const err = new ImageStoreError('That image format is not supported. Use PNG, JPEG or WebP.');
    err.status = 400;
    throw err;
  }

  const safeId = String(publicId).replace(/[^a-zA-Z0-9_-]/g, '_');

  if (hasCloudinary()) {
    try {
      const url = await uploadImage(dataUri, safeId);
      if (url) return url;
    } catch (err) {
      console.error('[imageStore] cloudinary upload failed', err);
      throw new ImageStoreError(`Failed to upload the image: ${err?.message || 'Cloudinary error'}`);
    }
    throw new ImageStoreError('Failed to upload the image. Check the Cloudinary env vars are set.');
  }

  try {
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    const file = `${safeId}.${EXT[match[1]]}`;
    await fs.promises.writeFile(path.join(UPLOADS_DIR, file), Buffer.from(match[2], 'base64'));
    return `/uploads/${file}`;
  } catch (err) {
    console.error('[imageStore] local write failed', err);
    throw new ImageStoreError('Failed to save the image on the server.');
  }
}
