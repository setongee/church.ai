import { env } from '../config/env.js';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

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
  if (!env.publicBaseUrl) {
    throw new InstagramConfigError(
      'PUBLIC_BASE_URL is not set. Instagram fetches the exported image itself, so the backend ' +
        'needs a publicly reachable base URL (a deployed URL, or an ngrok/tunnel URL in dev).'
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

async function waitForContainerReady(creationId) {
  for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
    const status = await graphRequest(`/${creationId}`, {
      method: 'GET',
      body: { fields: 'status_code' },
    });
    if (status?.status_code === 'FINISHED') return;
    if (status?.status_code === 'ERROR') {
      throw new InstagramApiError('Instagram failed to process the image container.');
    }
    await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
  }
  throw new InstagramApiError('Timed out waiting for Instagram to process the image.');
}

// Publishes a single image as a feed post. `imagePath` is the app's own relative path
// (e.g. "/uploads/xyz.png"); it's resolved against PUBLIC_BASE_URL here since Instagram's
// servers - not the caller's browser - are the ones fetching it.
export async function publishImageToInstagram({ imagePath, caption }) {
  assertConfigured();
  if (!imagePath) throw new InstagramApiError('No exported image to publish.');

  const imageUrl = imagePath.startsWith('http') ? imagePath : `${env.publicBaseUrl}${imagePath}`;

  const container = await graphRequest(`/${env.instagramBusinessAccountId}/media`, {
    method: 'POST',
    body: { image_url: imageUrl, caption: caption || '' },
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

export { InstagramConfigError, InstagramApiError };
