import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

function hasCredentials() {
  return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
}

// Cloudinary has no dedicated "audio" resource type - audio files are uploaded (and
// transformed/streamed) as "video" resources. See https://cloudinary.com/documentation/audio_transformations
export async function uploadAudio(filePath, publicId) {
  if (!hasCredentials()) {
    console.warn('[cloudinary] missing credentials, skipping audio upload');
    return null;
  }

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'video',
    folder: 'live-transcription-audio',
    public_id: publicId,
    overwrite: true,
  });
  return result.secure_url;
}

// `input` is anything cloudinary.uploader.upload() accepts directly - a data URI (what the quote
// image editor exports) or a file path. Each call gets its own publicId (quotes get re-exported
// repeatedly) so a later export never overwrites - and cache-invalidates - an earlier one that
// might already be referenced elsewhere (e.g. published to Instagram).
export async function uploadImage(input, publicId) {
  if (!hasCredentials()) {
    console.warn('[cloudinary] missing credentials, skipping image upload');
    return null;
  }

  const result = await cloudinary.uploader.upload(input, {
    resource_type: 'image',
    folder: 'live-transcription-quotes',
    public_id: publicId,
  });
  return result.secure_url;
}
