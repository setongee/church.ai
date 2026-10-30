// Scores and diagnoses Instagram performance with plain, explainable rules (no AI needed, so it always works).
// The benchmarks are rough industry norms for engagement measured against reach; the point is the relative
// picture - what is holding an account or a post back - not a precise number.

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
// Piecewise-linear map: lerp(x, [[x0, y0], [x1, y1], ...]).
function lerp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}
const median = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const avg = (a) => (a.length ? a.reduce((n, v) => n + v, 0) / a.length : 0);
const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;

export const grade = (s) => (s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : s >= 40 ? 'Fair' : 'Needs work');
const status = (s) => (s >= 70 ? 'good' : s >= 45 ? 'ok' : 'poor');

export const hashtagCount = (caption) => (String(caption).match(/#[\p{L}\p{N}_]+/gu) ?? []).length;

// Engagement rate: interactions per person reached (falls back to views, then followers, when reach is missing).
export function engagementRate(p, followers = 0) {
  const base = p.reach > 0 ? p.reach : p.views > 0 ? p.views : followers;
  return base > 0 ? p.interactions / base : 0;
}

// ---- one post -------------------------------------------------------------------------------------

export function scorePost(p, { followers = 0, medianInteractions = 0 } = {}) {
  const limited = !p.hasInsights || !(p.reach > 0);
  const er = engagementRate(p, followers);
  const parts = [
    { id: 'engagement', label: 'Engagement rate', weight: 35, score: lerp(er, [[0, 0], [0.02, 35], [0.04, 55], [0.07, 78], [0.12, 100]]), value: pct(er), detail: 'Likes, comments, saves and shares per person reached. 4–7% is solid; above 10% is exceptional.' },
  ];
  if (!limited) {
    const depth = (p.saves + p.shares) / p.reach;
    parts.push({ id: 'depth', label: 'Saves & shares', weight: 25, score: lerp(depth, [[0, 0], [0.005, 30], [0.015, 60], [0.03, 85], [0.05, 100]]), value: pct(depth), detail: 'The signals Instagram weighs most: people keeping a post or sending it on.' });
    const rr = followers > 0 ? p.reach / followers : 0;
    parts.push({ id: 'reach', label: 'Reach vs followers', weight: 25, score: lerp(rr, [[0, 0], [0.25, 30], [0.6, 55], [1, 75], [2, 100]]), value: `${(rr * 100).toFixed(0)}% of followers`, detail: 'How far it travelled beyond your own followers. Reels often pass 100%.' });
  }
  if (medianInteractions > 0) {
    const rel = p.interactions / medianInteractions;
    parts.push({ id: 'relative', label: 'Vs your usual post', weight: 15, score: lerp(rel, [[0, 0], [0.5, 35], [1, 60], [2, 100]]), value: `${rel.toFixed(1)}× your median`, detail: 'Compared with the middle post of your recent ones.' });
  }
  const total = parts.reduce((n, c) => n + c.weight, 0);
  const score = Math.round(parts.reduce((n, c) => n + c.score * c.weight, 0) / total);
  return { score, grade: grade(score), er, limited, components: parts.map((c) => ({ ...c, score: Math.round(c.score), status: status(c.score) })) };
}

// What to change (and what to keep) for a single post.
export function postTips(p, scored, { followers = 0 } = {}) {
  const tips = [];
  const strengths = [];
  const by = Object.fromEntries(scored.components.map((c) => [c.id, c]));
  if (by.depth) {
    if (by.depth.score < 40) tips.push({ title: 'Make it worth saving or sending', detail: 'Saves and shares are low. Posts that give something to keep (a scripture breakdown, a short list, a prayer to pray) or say something people want to send to a friend get pushed much further.' });
    else if (by.depth.score >= 70) strengths.push('Strong saves and shares: people found it worth keeping or passing on.');
  }
  if (p.reach > 0 && p.comments / p.reach < 0.003) tips.push({ title: 'Invite a reply', detail: 'Few comments. End the caption with one specific question (“Which verse carries you this week?”) — a clear, easy ask roughly doubles comments.' });
  else if (p.reach > 0) strengths.push('Good conversation: people are commenting.');
  if (p.isReel && p.avgWatchSec != null && p.avgWatchSec < 4) tips.push({ title: 'Hook faster', detail: `Average watch time is ${p.avgWatchSec}s. Put the strongest line or a visual change in the first two seconds, and cut any lead-in.` });
  else if (p.isReel && p.avgWatchSec != null && p.avgWatchSec >= 7) strengths.push(`People stay: ${p.avgWatchSec}s average watch time.`);
  if (by.reach && by.reach.score < 35) tips.push({ title: 'Widen the reach', detail: 'It mostly reached existing followers. Reels, trending-but-relevant audio, 3–5 specific hashtags and collab posts with other ministries help it reach new people.' });
  else if (by.reach && by.reach.score >= 70) strengths.push('It travelled well beyond your followers.');
  const len = p.caption.trim().length;
  const tags = hashtagCount(p.caption);
  if (len < 40) tips.push({ title: 'Say a little more in the caption', detail: 'The caption is very short. Add a one-line hook, a sentence of context, and a call to action.' });
  if (tags === 0) tips.push({ title: 'Add a few hashtags', detail: 'No hashtags. Use 3–5 specific ones (topic + community) rather than broad ones.' });
  else if (tags > 15) tips.push({ title: 'Trim the hashtags', detail: `${tags} hashtags looks spammy. 3–8 targeted ones perform better.` });
  if (scored.limited) tips.push({ title: 'Insights are limited for this post', detail: 'Instagram has not returned reach data for it (very new, or an account/permission limit), so the score uses likes and comments only.' });
  if (!tips.length) tips.push({ title: 'Do more of this', detail: 'Nothing is holding this post back. Repeat the format and topic, and post it again in a different cut after a few weeks.' });
  return { tips, strengths };
}

// ---- the whole account ----------------------------------------------------------------------------

// `posts`: recent media with insights (flat shape from getMedia), `days`: the window they cover.
export function diagnoseAccount({ profile, posts, account = {}, days = 30 }) {
  const followers = profile?.followers ?? 0;
  const n = posts.length;
  const weeks = Math.max(days / 7, 1);
  const perWeek = n / weeks;
  const ers = posts.map((p) => engagementRate(p, followers));
  const avgEr = avg(ers);
  const medReach = median(posts.map((p) => p.reach).filter((r) => r > 0));
  const reachRatio = followers > 0 ? medReach / followers : 0;
  const withReach = posts.filter((p) => p.reach > 0);
  const depth = withReach.length ? avg(withReach.map((p) => (p.saves + p.shares) / p.reach)) : 0;
  const reelShare = n ? posts.filter((p) => p.isReel).length / n : 0;
  const times = posts.map((p) => new Date(p.postedAt)).sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < times.length; i++) maxGap = Math.max(maxGap, (times[i] - times[i - 1]) / 86400000);
  if (times.length) maxGap = Math.max(maxGap, (Date.now() - times[times.length - 1]) / 86400000);
  const tags = avg(posts.map((p) => hashtagCount(p.caption)));
  const growthPct = followers > 0 && account.followersGained != null ? (account.followersGained / followers) * 100 : null;

  // When do posts do best? (average interactions by weekday and hour, only where there are at least 2 posts)
  const slot = (keyFn) => {
    const m = new Map();
    for (const p of posts) {
      const k = keyFn(new Date(p.postedAt));
      m.set(k, [...(m.get(k) ?? []), p.interactions]);
    }
    return [...m.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => [k, avg(v)]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const bestDay = slot((d) => d.getDay());
  const bestHour = slot((d) => d.getHours());

  const typeAvg = ['REEL', 'CAROUSEL', 'IMAGE'].map((t) => {
    const ps = posts.filter((p) => p.type === t);
    return { type: t, count: ps.length, er: avg(ps.map((p) => engagementRate(p, followers))) };
  }).filter((t) => t.count > 0).sort((a, b) => b.er - a.er);

  const parts = [
    { id: 'consistency', label: 'Posting consistency', weight: 25, score: n === 0 ? 0 : lerp(perWeek, [[0, 0], [0.5, 25], [1, 45], [2, 75], [3, 100]]) - (maxGap > 10 ? 15 : 0), value: `${perWeek.toFixed(1)} posts/week · longest gap ${Math.round(maxGap)}d`, tip: 'Aim for 3–4 posts a week with no gap longer than a week. Batch-create after each service so there is always something ready to post.' },
    { id: 'engagement', label: 'Engagement', weight: 25, score: lerp(avgEr, [[0, 0], [0.02, 35], [0.04, 55], [0.07, 78], [0.12, 100]]), value: `${pct(avgEr)} average`, tip: 'Open every caption with a hook line and end with one question. Reply to every comment in the first hour — it signals a live conversation.' },
    { id: 'reach', label: 'Reach beyond followers', weight: 20, score: lerp(reachRatio, [[0, 0], [0.25, 30], [0.6, 55], [1, 75], [2, 100]]), value: `${(reachRatio * 100).toFixed(0)}% of followers (median post)`, tip: 'Lean on Reels and shareable quotes, use 3–5 specific hashtags, and collaborate with other ministries so posts reach new people.' },
    { id: 'signals', label: 'Saves & shares', weight: 15, score: lerp(depth, [[0, 0], [0.005, 30], [0.015, 60], [0.03, 85], [0.05, 100]]), value: pct(depth), tip: 'Make posts worth keeping: scripture breakdowns, “3 ways to…” lists, prayers. Add “save this for later” or “send this to someone who needs it”.' },
    { id: 'format', label: 'Format mix', weight: 10, score: lerp(reelShare, [[0, 15], [0.2, 50], [0.4, 90], [0.7, 100], [1, 70]]), value: `${Math.round(reelShare * 100)}% Reels`, tip: 'Reels are what Instagram shows to non-followers. Keep roughly half your posts as Reels and use carousels for teaching content people save.' },
  ];
  if (growthPct != null) parts.push({ id: 'growth', label: 'Follower growth', weight: 5, score: lerp(growthPct, [[-5, 0], [0, 25], [1, 60], [3, 100]]), value: `${account.followersGained >= 0 ? '+' : ''}${account.followersGained} followers (30d)`, tip: 'Growth follows reach and consistency. Make your bio say who it is for, pin your three best posts, and invite people to follow at the end of Reels.' });
  const totalW = parts.reduce((s, c) => s + c.weight, 0);
  const comps = parts.map((c) => ({ ...c, score: Math.round(clamp(c.score)), status: status(clamp(c.score)) }));
  const score = Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / totalW);

  const priorities = [...comps].sort((a, b) => (100 - b.score) * b.weight - (100 - a.score) * a.weight).filter((c) => c.score < 75).slice(0, 4);
  const strengths = comps.filter((c) => c.score >= 75).map((c) => `${c.label}: ${c.value}`);
  const issues = n === 0 ? ['No posts in this period — nothing to measure yet.'] : [];
  if (tags > 12) issues.push(`Posts average ${tags.toFixed(0)} hashtags — trim to 3–8 targeted ones.`);
  if (tags < 1 && n) issues.push('Posts use almost no hashtags — add 3–5 specific ones.');

  return {
    score,
    grade: grade(score),
    components: comps,
    priorities,
    strengths,
    issues,
    stats: {
      posts: n,
      postsPerWeek: +perWeek.toFixed(2),
      avgEngagementRate: +avgEr.toFixed(4),
      medianReach: medReach,
      reachRatio: +reachRatio.toFixed(3),
      savesSharesRate: +depth.toFixed(4),
      reelShare: +reelShare.toFixed(2),
      avgHashtags: +tags.toFixed(1),
      bestDay: bestDay == null ? null : DAYS[bestDay],
      bestHour: bestHour,
      formats: typeAvg.map((t) => ({ ...t, er: +t.er.toFixed(4) })),
      maxGapDays: Math.round(maxGap),
    },
  };
}
