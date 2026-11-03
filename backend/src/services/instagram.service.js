import { env } from '../config/env.js';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

// Container creation returns almost immediately for images, but Meta's own docs recommend
// polling status_code before calling media_publish rather than assuming FINISHED - publishing
// against a container that's still IN_PROGRESS returns an opaque error.
const STATUS_POLL_INTERVAL_MS = 1500;
const STATUS_POLL_ATTEMPTS = 8;

class InstagramConfigError extends Error {}
class InstagramApiError extends Error {}

function assertConfigured() {
  if (!env.instagramAccessToken || !env.instagramBusinessAccountId) {
    throw new InstagramConfigError(
      'Instagram is not connected yet. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID ' +
        'on the backend (see backend/.env.example for the one-time setup steps).'
    );
  }
  if (!env.instagramPublicBaseUrl) {
    throw new InstagramConfigError(
      'PUBLIC_BASE_URL is not set. Instagram fetches the exported image itself, so the backend ' +
        'needs a publicly reachable base URL (a deployed URL, or an ngrok/tunnel URL in dev).'
    );
  }
}

// Instagram downloads each file itself and, if it gets a web page instead of a picture or video (an ngrok "tunnel offline" page,
// a login wall, a 404), only says "Only photo or video can be accepted as media type". Fetching the file first from here lets
// us say what is actually wrong. Third-party hosts such as Cloudinary are left alone.
async function assertServesMedia(url, kind) {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    return;
  }
  if (host === 'res.cloudinary.com') return;
  const ask = (method) => fetch(url, { method, headers: { 'User-Agent': 'facebookexternalhit/1.1', ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}) }, signal: AbortSignal.timeout(15000) });
  let res;
  try {
    res = await ask('HEAD');
    if (!res.ok || !res.headers.get('content-type')) res = await ask('GET');
  } catch {
    throw new InstagramApiError(`Instagram can’t be given this ${kind}: ${host} didn’t answer. Check that the backend is running and its public URL (INSTAGRAM_PUBLIC_BASE_URL) is reachable from the internet.`);
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !new RegExp(`^${kind}/`, 'i').test(type)) {
    throw new InstagramApiError(
      `Instagram can’t read this ${kind}: ${url} returned ${res.ok ? `“${type || 'no type'}”` : `status ${res.status}`} instead of a ${kind}. ` +
        'If you’re using an ngrok tunnel, it has probably been restarted or points at the wrong port: start it for the backend’s port and update INSTAGRAM_PUBLIC_BASE_URL.'
    );
  }
}

async function graphRequest(path, { method = 'GET', body } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body || {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  params.set('access_token', env.instagramAccessToken);

  const isGet = method === 'GET';
  const url = isGet ? `${GRAPH_URL}${path}?${params.toString()}` : `${GRAPH_URL}${path}`;
  const res = await fetch(url, {
    method,
    ...(isGet
      ? {}
      : { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    const message = data?.error?.message || `Instagram API request failed (${res.status})`;
    throw new InstagramApiError(message);
  }
  return data;
}

async function waitForContainerReady(creationId, { attempts = STATUS_POLL_ATTEMPTS, intervalMs = STATUS_POLL_INTERVAL_MS, noun = 'image' } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await graphRequest(`/${creationId}`, {
      method: 'GET',
      body: { fields: 'status_code' },
    });
    if (status?.status_code === 'FINISHED') return;
    if (status?.status_code === 'ERROR') {
      throw new InstagramApiError(`Instagram failed to process the ${noun}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new InstagramApiError(`Timed out waiting for Instagram to process the ${noun}.`);
}

// Instagram's Graph API only accepts JPEG. Cloudinary can convert on the fly, so for Cloudinary
// URLs insert f_jpg,q_95 right after /upload/ (unless a format transform is already there).
export function toInstagramImageUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'res.cloudinary.com' && u.pathname.includes('/upload/') && !u.pathname.includes('/f_jpg')) {
      u.pathname = u.pathname.replace('/upload/', '/upload/f_jpg,q_95/');
      return u.toString();
    }
  } catch {
    // not an absolute URL - leave untouched
  }
  return url;
}

// Publishes a single image as a feed post (or a Story when mediaType is 'STORIES'). `imagePath` is the app's own relative path
// (e.g. "/uploads/xyz.png"); it's resolved against PUBLIC_BASE_URL here since Instagram's
// servers - not the caller's browser - are the ones fetching it.
export async function publishImageToInstagram({ imagePath, caption, mediaType }) {
  assertConfigured();
  if (!imagePath) throw new InstagramApiError('No exported image to publish.');

  const imageUrl = toInstagramImageUrl(
    imagePath.startsWith('http') ? imagePath : `${env.instagramPublicBaseUrl.replace(/\/$/, '')}${imagePath}`
  );
  const isStory = mediaType === 'STORIES';
  await assertServesMedia(imageUrl, 'image');

  const container = await graphRequest(`/${env.instagramBusinessAccountId}/media`, {
    method: 'POST',
    body: isStory
      ? { image_url: imageUrl, media_type: 'STORIES' }
      : { image_url: imageUrl, caption: caption || '' },
  });
  if (!container?.id) throw new InstagramApiError('Instagram did not return a media container id.');

  await waitForContainerReady(container.id);

  const published = await graphRequest(`/${env.instagramBusinessAccountId}/media_publish`, {
    method: 'POST',
    body: { creation_id: container.id },
  });
  if (!published?.id) throw new InstagramApiError('Instagram did not return a published media id.');

  const details = await graphRequest(`/${published.id}`, {
    method: 'GET',
    body: { fields: 'permalink' },
  }).catch(() => null);

  return { mediaId: published.id, permalink: details?.permalink || '' };
}

// Publishes a finished video as an Instagram Reel. Instagram's servers download the file
// themselves, so the app's own path (e.g. "/uploads/reels/xyz.mp4", or a full URL on this server)
// is re-based onto PUBLIC_BASE_URL. Video processing takes much longer than images, so this polls
// for up to ~5 minutes.
export async function publishVideoToInstagram({ videoUrl, caption }) {
  assertConfigured();
  if (!videoUrl) throw new InstagramApiError('There is no rendered video to publish yet.');

  let pathname = videoUrl;
  try {
    pathname = new URL(videoUrl, 'http://placeholder').pathname;
  } catch {
    // keep as is
  }
  const publicUrl = `${env.instagramPublicBaseUrl.replace(/\/$/, '')}${pathname}`;
  await assertServesMedia(publicUrl, 'video');

  const container = await graphRequest(`/${env.instagramBusinessAccountId}/media`, {
    method: 'POST',
    body: { media_type: 'REELS', video_url: publicUrl, caption: caption || '', share_to_feed: 'true' },
  });
  if (!container?.id) throw new InstagramApiError('Instagram did not return a media container id.');

  await waitForContainerReady(container.id, { attempts: 60, intervalMs: 5000, noun: 'video' });

  const published = await graphRequest(`/${env.instagramBusinessAccountId}/media_publish`, {
    method: 'POST',
    body: { creation_id: container.id },
  });
  if (!published?.id) throw new InstagramApiError('Instagram did not return a published media id.');

  const details = await graphRequest(`/${published.id}`, { method: 'GET', body: { fields: 'permalink' } }).catch(() => null);
  return { mediaId: published.id, permalink: details?.permalink || '' };
}

export { InstagramConfigError, InstagramApiError };

// Publishes 2-10 images/videos as one swipeable carousel post. Each item becomes a child container
// (is_carousel_item), then a parent CAROUSEL container ties them together with the caption. Items
// are `{ type: 'image' | 'video', url }`, where url is the app's own path or a full URL on this
// server (re-based onto PUBLIC_BASE_URL, as Instagram fetches the files itself).
export async function publishCarouselToInstagram({ items, caption }) {
  assertConfigured();
  if (!Array.isArray(items) || items.length < 2 || items.length > 10) {
    throw new InstagramApiError('A carousel needs between 2 and 10 slides.');
  }
  const base = env.instagramPublicBaseUrl.replace(/\/$/, '');
  // Our own files (relative paths, or absolute URLs that point at this server's /uploads) are
  // re-based onto the public URL; third-party URLs such as Cloudinary stay as they are.
  const publicUrl = (u) => {
    if (!u) throw new InstagramApiError('A slide has no image or video to publish.');
    if (!u.startsWith('http')) return `${base}${u}`;
    const parsed = new URL(u);
    return parsed.pathname.startsWith('/uploads/') ? `${base}${parsed.pathname}` : u;
  };

  const children = [];
  for (const item of items) {
    const isVideo = item.type === 'video';
    const url = isVideo ? publicUrl(item.url) : toInstagramImageUrl(publicUrl(item.url));
    await assertServesMedia(url, isVideo ? 'video' : 'image');
    const child = await graphRequest(`/${env.instagramBusinessAccountId}/media`, {
      method: 'POST',
      body: isVideo ? { media_type: 'VIDEO', video_url: url, is_carousel_item: 'true' } : { image_url: url, is_carousel_item: 'true' },
    });
    if (!child?.id) throw new InstagramApiError('Instagram did not return a container id for a slide.');
    await waitForContainerReady(child.id, isVideo ? { attempts: 60, intervalMs: 5000, noun: 'video' } : undefined);
    children.push(child.id);
  }

  const parent = await graphRequest(`/${env.instagramBusinessAccountId}/media`, {
    method: 'POST',
    body: { media_type: 'CAROUSEL', children: children.join(','), caption: caption || '' },
  });
  if (!parent?.id) throw new InstagramApiError('Instagram did not return a carousel container id.');
  await waitForContainerReady(parent.id, { attempts: 20, intervalMs: 3000, noun: 'carousel' });

  const published = await graphRequest(`/${env.instagramBusinessAccountId}/media_publish`, {
    method: 'POST',
    body: { creation_id: parent.id },
  });
  if (!published?.id) throw new InstagramApiError('Instagram did not return a published media id.');
  const details = await graphRequest(`/${published.id}`, { method: 'GET', body: { fields: 'permalink' } }).catch(() => null);
  return { mediaId: published.id, permalink: details?.permalink || '' };
}
