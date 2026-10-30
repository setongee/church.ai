import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { PHOTOS_DIR, storePhoto } from './photoStore.service.js';

const IMAGES_URL = 'https://openrouter.ai/api/v1/images';
const TIMEOUT_MS = 150000;

// Every preset starts from the same promise: the people in the photo must not change. These are
// real photos of real congregation members, and image models happily "improve" a face into a
// different one, so the instruction is blunt about it.
const KEEP_PEOPLE =
  'Keep every person EXACTLY as they are: identical faces, features, skin tone, hair, expressions, clothing, ' +
  'poses, number of people and positions. Do not add, remove, replace or restyle any person, and do not change ' +
  'the composition or crop. Do not add text, logos, watermarks or borders. Output a photograph, not an illustration.';

export const ENHANCE_PRESETS = {
  polish: {
    label: 'Polish',
    hint: 'Balanced exposure, natural colour, less noise, sharper detail.',
    prompt: 'Retouch this photo like a professional editor: balance the exposure, recover blown highlights and crushed shadows, correct white balance for natural colour and skin tones, reduce noise and sharpen fine detail.',
  },
  cinematic: {
    label: 'Cinematic',
    hint: 'Warm stage-light glow, rich contrast, film-style grade.',
    prompt: 'Give this photo a warm cinematic colour grade: rich contrast, glowing stage-light highlights, deep but detailed shadows, a subtle teal-and-orange film look. Keep it natural enough to pass as a real photograph.',
  },
  airy: {
    label: 'Bright & airy',
    hint: 'Lifted shadows, clean light, fresh colour.',
    prompt: 'Make this photo brighter and airier: lift the shadows, add clean even light, keep colours fresh and true, and keep skin tones natural.',
  },
  cleanup: {
    label: 'Clean up',
    hint: 'Quietly remove small distractions at the edges.',
    prompt: 'Tidy this photo: quietly remove small distracting objects at the edges and background (stray cables, bright exit signs, clutter) and lightly improve exposure and sharpness. Leave the main subjects and the scene untouched.',
  },
};

// The ratios the image provider accepts for edits (it rejects e.g. 4:5), nearest in log space.
const RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4'];
function nearestRatio(width, height) {
  const target = Math.log(width / height);
  return RATIOS.reduce((best, r) => {
    const [a, b] = r.split(':').map(Number);
    const [ba, bb] = best.split(':').map(Number);
    return Math.abs(Math.log(a / b) - target) < Math.abs(Math.log(ba / bb) - target) ? r : best;
  }, RATIOS[0]);
}

// Dimensions of a JPEG, read from its header (no image library needed).
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { width: 1, height: 1 };
}

// Sends one stored photo through the image model with a preset (and optional extra instruction),
// and returns the URL of the new, stored photo.
export async function enhancePhoto({ url, preset, extra = '' }) {
  if (!env.openrouterApiKey) {
    const err = new Error("AI photo editing isn't configured. Set OPENROUTER_API_KEY on the backend.");
    err.status = 503;
    throw err;
  }
  const def = ENHANCE_PRESETS[preset];
  if (!def) {
    const err = new Error('Unknown enhancement.');
    err.status = 400;
    throw err;
  }

  const file = path.join(PHOTOS_DIR, path.basename(new URL(url, 'http://x').pathname));
  const buffer = await fs.promises.readFile(file);
  const { width, height } = jpegSize(buffer);
  const note = extra.trim() ? ` Also: ${extra.trim().slice(0, 200)}.` : '';

  const body = {
    model: env.openrouterImageModel,
    prompt: `${def.prompt}${note} ${KEEP_PEOPLE}`,
    aspect_ratio: nearestRatio(width, height),
    quality: 'high',
    n: 1,
    output_format: 'jpeg',
    output_compression: 95,
    input_references: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` } }],
  };

  const attempt = async (payload) => {
    const res = await fetch(IMAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.openrouterSiteUrl,
        'X-Title': env.openrouterAppName,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((err) => {
      const e = new Error(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'The image model took too long. Try again.' : `Image model request failed: ${err.message}`);
      e.status = 504;
      throw e;
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // keep raw for the message
    }
    const message = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || raw.slice(0, 200) || `status ${res.status}`;
    return { res, item: data?.data?.[0], message };
  };

  let result = await attempt(body);
  // Models differ in which optional parameters they take; if one is rejected, retry with just
  // the essentials rather than failing the edit.
  if (!result.res.ok && result.res.status >= 400 && result.res.status < 500) {
    const { quality, output_format, output_compression, ...slim } = body;
    result = await attempt(slim);
  }
  const { res, item, message } = result;
  if (!res.ok || !item?.b64_json) {
    const e = new Error(`AI photo editing failed: ${message}`);
    e.status = 502;
    throw e;
  }
  return storePhoto(Buffer.from(item.b64_json, 'base64'), 'enhanced.jpg');
}
