import { Quote } from '../models/Quote.model.js';
import { Reel } from '../models/Reel.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { PhotoReel } from '../models/PhotoReel.model.js';
import { Carousel } from '../models/Carousel.model.js';
import { Design } from '../models/Design.model.js';
import { PostUpload } from '../models/PostUpload.model.js';
import { getAccountInsights, getMedia, getMediaMany, getProfile, instagramConnected, listRecentMedia } from '../services/instagramInsights.service.js';
import { diagnoseAccount, postTips, scorePost } from '../services/instagramScoring.js';
import { growthPlan, postReview } from '../services/instagramReview.service.js';

// Every kind of thing this app can publish, and where its Instagram link is stored.
export const SOURCES = {
  quote: { Model: Quote, label: 'Quote image', title: (d) => d.text },
  reel: { Model: Reel, label: 'Reel', title: (d) => d.headline },
  compilation: { Model: Compilation, label: 'Merged reel', title: (d) => d.title || d.headline },
  photoReel: { Model: PhotoReel, label: 'Photo reel', title: (d) => d.title },
  carousel: { Model: Carousel, label: 'Carousel', title: (d) => d.title },
  design: { Model: Design, label: 'Design', title: (d) => d.title },
  upload: { Model: PostUpload, label: 'Uploaded post', title: (d) => d.title || d.caption },
};

export const RANGES = { '7d': 7, '30d': 30, '90d': 90, '12m': 365, all: null };
const rangeDays = (r) => (r in RANGES ? RANGES[r] : 30);

const median = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

// Wraps connection problems into a normal response so the page can say "not connected" instead of erroring.
async function ig(res, fn) {
  if (!instagramConnected()) return res.json({ connected: false, error: 'Instagram is not connected. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID in backend/.env.' });
  try {
    return await fn();
  } catch (err) {
    return res.json({ connected: true, error: err.message });
  }
}

// Posts published from this app within the range, with live metrics and a score.
async function publishedPosts(days, refresh) {
  const since = days ? new Date(Date.now() - days * 86400000) : null;
  const docs = (
    await Promise.all(
      Object.entries(SOURCES).map(async ([kind, src]) => {
        const rows = await src.Model.find({ instagramMediaId: { $exists: true, $nin: [null, ''] }, ...(since ? { instagramPublishedAt: { $gte: since } } : {}) }).lean();
        return rows.map((d) => ({ kind, label: src.label, id: String(d._id), title: String(src.title(d) ?? '').replace(/\s+/g, ' ').slice(0, 120), mediaId: d.instagramMediaId, permalink: d.instagramPermalink, publishedAt: d.instagramPublishedAt }));
      })
    )
  ).flat();
  const metrics = await getMediaMany(docs.map((d) => d.mediaId), refresh);
  // A post Instagram can no longer return (deleted there, or no permission to read it) is left out entirely - there's
  // nothing to report on. Other failures (a network blip) are kept so a real outage is visible rather than hidden.
  const gone = (m) => m?.error && /does not exist|unsupported get request|missing permissions|cannot be loaded/i.test(m.error);
  return docs.filter((d) => !gone(metrics.get(d.mediaId))).map((d) => ({ ...d, m: metrics.get(d.mediaId) })).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

// Account-wide context for scoring a post.
async function context(refresh) {
  const profile = await getProfile(refresh);
  const recent = await listRecentMedia(30, refresh);
  const withInsights = [...(await getMediaMany(recent.map((r) => r.id), refresh)).values()].filter((p) => !p.error);
  return { profile, recent: withInsights, followers: profile.followers, medianInteractions: median(withInsights.map((p) => p.interactions)) };
}

export async function status(req, res) {
  await ig(res, async () => res.json({ connected: true, profile: await getProfile(req.query.refresh === '1') }));
}

// The list page: published posts + their numbers + the account health diagnosis.
export async function overview(req, res) {
  await ig(res, async () => {
    const refresh = req.query.refresh === '1';
    const days = rangeDays(req.query.range);
    const ctx = await context(refresh);
    const [posts, account] = await Promise.all([publishedPosts(days, refresh), getAccountInsights(Math.min(days ?? 90, 90), refresh).catch(() => ({}))]);

    // Health looks at the whole account's recent posts inside the window (not just the ones made here).
    const windowDays = Math.min(days ?? 90, 90);
    const cutoff = Date.now() - windowDays * 86400000;
    const inWindow = ctx.recent.filter((p) => new Date(p.postedAt).getTime() >= cutoff);
    const health = diagnoseAccount({ profile: ctx.profile, posts: inWindow, account, days: windowDays });

    const scoreCtx = { followers: ctx.followers, medianInteractions: ctx.medianInteractions };
    const list = posts.map((p) => {
      if (!p.m || p.m.error) return { kind: p.kind, label: p.label, id: p.id, title: p.title, permalink: p.permalink, publishedAt: p.publishedAt, error: p.m?.error || 'No data from Instagram' };
      const scored = scorePost(p.m, scoreCtx);
      return { kind: p.kind, label: p.label, id: p.id, title: p.title, permalink: p.permalink || p.m.permalink, publishedAt: p.publishedAt, type: p.m.type, thumbnail: p.m.thumbnail, caption: p.m.caption, likes: p.m.likes, comments: p.m.comments, saves: p.m.saves, shares: p.m.shares, reach: p.m.reach, views: p.m.views, interactions: p.m.interactions, avgWatchSec: p.m.avgWatchSec, er: scored.er, score: scored.score, grade: scored.grade, limited: scored.limited };
    });
    const scored = list.filter((p) => p.score != null);
    const sum = (k) => scored.reduce((n, p) => n + (p[k] || 0), 0);
    res.json({
      connected: true,
      range: req.query.range in RANGES ? req.query.range : '30d',
      profile: ctx.profile,
      account,
      health,
      totals: { posts: list.length, likes: sum('likes'), comments: sum('comments'), saves: sum('saves'), shares: sum('shares'), reach: sum('reach'), avgScore: scored.length ? Math.round(sum('score') / scored.length) : null },
      posts: list,
    });
  });
}

// One post's report: score breakdown, what worked / what to change, and (optionally) the written AI review.
export async function postReport(req, res) {
  const src = SOURCES[req.params.kind];
  if (!src) return res.status(404).json({ error: 'unknown post kind' });
  const doc = await src.Model.findById(req.params.id).lean();
  if (!doc?.instagramMediaId) return res.status(404).json({ error: 'That post has not been published to Instagram.' });
  await ig(res, async () => {
    const refresh = req.query.refresh === '1';
    const [ctx, post] = await Promise.all([context(refresh), getMedia(doc.instagramMediaId, refresh)]);
    const scored = scorePost(post, { followers: ctx.followers, medianInteractions: ctx.medianInteractions });
    const { tips, strengths } = postTips(post, scored, { followers: ctx.followers });
    const accountEr = ctx.recent.length ? ctx.recent.reduce((n, p) => n + (p.reach > 0 ? p.interactions / p.reach : 0), 0) / ctx.recent.length : 0;
    const review = req.query.ai === '0' ? null : await postReview({ post, scored, tips, strengths, followers: ctx.followers });
    res.json({
      connected: true,
      post: { kind: req.params.kind, label: src.label, title: String(src.title(doc) ?? '').slice(0, 160), permalink: post.permalink, publishedAt: doc.instagramPublishedAt, type: post.type, thumbnail: post.thumbnail, caption: post.caption, likes: post.likes, comments: post.comments, saves: post.saves, shares: post.shares, reach: post.reach, views: post.views, avgWatchSec: post.avgWatchSec },
      score: scored.score,
      grade: scored.grade,
      er: scored.er,
      accountEr,
      limited: scored.limited,
      components: scored.components,
      tips,
      strengths,
      review,
    });
  });
}

// The written growth plan (AI + web research when available, the built-in playbook otherwise).
export async function growth(req, res) {
  await ig(res, async () => {
    const days = rangeDays(req.body?.range);
    const ctx = await context(false);
    const windowDays = Math.min(days ?? 90, 90);
    const cutoff = Date.now() - windowDays * 86400000;
    const inWindow = ctx.recent.filter((p) => new Date(p.postedAt).getTime() >= cutoff);
    const account = await getAccountInsights(windowDays).catch(() => ({}));
    const health = diagnoseAccount({ profile: ctx.profile, posts: inWindow, account, days: windowDays });
    const ranked = [...inWindow].map((p) => ({ type: p.type, caption: p.caption.slice(0, 140), likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares, reach: p.reach })).sort((a, b) => b.likes + b.comments + b.saves + b.shares - (a.likes + a.comments + a.saves + a.shares));
    res.json({ connected: true, plan: await growthPlan({ profile: ctx.profile, health, top: ranked.slice(0, 3), bottom: ranked.slice(-3) }) });
  });
}
