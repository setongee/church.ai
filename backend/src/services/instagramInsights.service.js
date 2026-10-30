import { env } from '../config/env.js';

// Read-only Instagram Graph API calls for analytics: account profile, recent media, and the insights Meta exposes for
// each. Metrics differ by media type and API version, so every metric is requested tolerantly - one that Meta
// refuses is skipped instead of failing the whole report.
const GRAPH = 'https://graph.instagram.com/v21.0';

export const instagramConnected = () => Boolean(env.instagramAccessToken && env.instagramBusinessAccountId);

export class InstagramInsightsError extends Error {}

async function get(path, params = {}) {
  if (!instagramConnected()) throw new InstagramInsightsError('Instagram is not connected. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID on the backend.');
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries({ ...params, access_token: env.instagramAccessToken })) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) throw new InstagramInsightsError(data?.error?.message || `Instagram API request failed (${res.status})`);
  return data;
}

// Short in-memory cache (the insights barely move minute to minute, and the app polls them a lot).
const cache = new Map();
const TTL = 5 * 60 * 1000;
async function cached(key, fn, refresh) {
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < TTL) return hit.val;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}

export const getProfile = (refresh) =>
  cached('profile', async () => {
    const d = await get(`/${env.instagramBusinessAccountId}`, { fields: 'username,name,followers_count,follows_count,media_count,account_type,profile_picture_url' });
    return { username: d.username, name: d.name, followers: d.followers_count ?? 0, following: d.follows_count ?? 0, posts: d.media_count ?? 0, accountType: d.account_type, picture: d.profile_picture_url };
  }, refresh);

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url';

// Most recent posts on the account (including ones not made from this app), newest first.
export const listRecentMedia = (limit = 50, refresh) =>
  cached(`media:${limit}`, async () => {
    const out = [];
    let next = null;
    while (out.length < limit) {
      const page = next ? await (await fetch(next)).json() : await get(`/${env.instagramBusinessAccountId}/media`, { fields: MEDIA_FIELDS, limit: Math.min(50, limit) });
      out.push(...(page.data ?? []));
      next = page.paging?.next;
      if (!next || !page.data?.length) break;
    }
    return out.slice(0, limit).map(normalizeMedia);
  }, refresh);

function normalizeMedia(m) {
  const isReel = m.media_product_type === 'REELS';
  return {
    id: m.id,
    caption: m.caption ?? '',
    type: isReel ? 'REEL' : m.media_type === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : m.media_type === 'VIDEO' ? 'VIDEO' : m.media_product_type === 'STORY' ? 'STORY' : 'IMAGE',
    permalink: m.permalink,
    postedAt: m.timestamp,
    likes: m.like_count ?? 0,
    comments: m.comments_count ?? 0,
    thumbnail: m.thumbnail_url || m.media_url || '',
    isReel,
  };
}

// Insight metrics for one post. Tries the full set, then each metric on its own.
const FEED_METRICS = ['reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions', 'views'];
const REEL_METRICS = [...FEED_METRICS, 'ig_reels_avg_watch_time'];

async function insightsFor(mediaId, metrics) {
  const out = {};
  try {
    const d = await get(`/${mediaId}/insights`, { metric: metrics.join(',') });
    for (const m of d.data ?? []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? 0;
    return out;
  } catch {
    await Promise.all(
      metrics.map(async (metric) => {
        try {
          const d = await get(`/${mediaId}/insights`, { metric });
          const m = d.data?.[0];
          if (m) out[metric] = m.values?.[0]?.value ?? m.total_value?.value ?? 0;
        } catch {
          // not available for this post / API version
        }
      })
    );
    return out;
  }
}

// One post: base fields + insights, in a single flat shape.
export const getMedia = (mediaId, refresh) =>
  cached(`post:${mediaId}`, async () => {
    const base = normalizeMedia(await get(`/${mediaId}`, { fields: MEDIA_FIELDS }));
    const ins = await insightsFor(mediaId, base.isReel ? REEL_METRICS : FEED_METRICS);
    return {
      ...base,
      likes: ins.likes ?? base.likes,
      comments: ins.comments ?? base.comments,
      saves: ins.saved ?? 0,
      shares: ins.shares ?? 0,
      reach: ins.reach ?? 0,
      views: ins.views ?? 0,
      interactions: ins.total_interactions ?? (ins.likes ?? base.likes) + (ins.comments ?? base.comments) + (ins.saved ?? 0) + (ins.shares ?? 0),
      avgWatchSec: ins.ig_reels_avg_watch_time ? Math.round(ins.ig_reels_avg_watch_time / 100) / 10 : null,
      hasInsights: Object.keys(ins).length > 0,
    };
  }, refresh);

// Insights for many posts (a few at a time, politely).
export async function getMediaMany(ids, refresh) {
  const out = new Map();
  const queue = [...new Set(ids)];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const id = queue.shift();
        try {
          out.set(id, await getMedia(id, refresh));
        } catch (err) {
          out.set(id, { id, error: err.message });
        }
      }
    })
  );
  return out;
}

// Account-wide totals over a window (summed across 28-day slices - Meta caps a single request).
const ACCOUNT_METRICS = ['reach', 'views', 'profile_views', 'accounts_engaged', 'total_interactions'];
export const getAccountInsights = (days, refresh) =>
  cached(`acct:${days}`, async () => {
    const now = Math.floor(Date.now() / 1000);
    const slices = [];
    for (let end = now, left = Math.min(days, 365); left > 0; left -= 28) {
      const span = Math.min(28, left);
      slices.push({ since: end - span * 86400, until: end });
      end -= span * 86400;
    }
    const totals = {};
    await Promise.all(
      slices.flatMap((sl) =>
        ACCOUNT_METRICS.map(async (metric) => {
          try {
            const d = await get(`/${env.instagramBusinessAccountId}/insights`, { metric, period: 'day', metric_type: 'total_value', since: sl.since, until: sl.until });
            totals[metric] = (totals[metric] ?? 0) + (d.data?.[0]?.total_value?.value ?? 0);
          } catch {
            // metric unavailable for this account
          }
        })
      )
    );
    // Follower change over the (last 30 days of the) window, where Meta provides it.
    let followerSeries = [];
    try {
      const d = await get(`/${env.instagramBusinessAccountId}/insights`, { metric: 'follower_count', period: 'day', since: now - Math.min(days, 30) * 86400, until: now });
      followerSeries = (d.data?.[0]?.values ?? []).map((v) => ({ date: v.end_time, gained: v.value }));
    } catch {
      // not available
    }
    return { ...totals, followersGained: followerSeries.reduce((n, v) => n + (v.gained ?? 0), 0), followerSeries };
  }, refresh);
