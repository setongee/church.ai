import { callOpenRouterJSON, aiIssue } from './openrouter.service.js';
import { fetchPageText, webSearch } from './webSearch.service.js';

// Research + writing for the Instagram reports. The scoring in instagramScoring.js always works; this adds a
// written review and growth plan grounded in what is currently being said about growing on Instagram, using the AI
// when it's available and a built-in playbook when it isn't.

let researchCache = null;
const SIX_HOURS = 6 * 3600 * 1000;

// A few current articles on growing and engaging an audience on Instagram (best effort - web search may be blocked).
export async function researchGrowth() {
  if (researchCache && Date.now() - researchCache.at < SIX_HOURS) return researchCache.items;
  const queries = ['how to grow instagram account reels saves shares algorithm 2026', 'church ministry instagram engagement tips grow followers'];
  const items = [];
  for (const q of queries) {
    const { results } = await webSearch(q);
    for (const r of results.slice(0, 2)) {
      if (items.some((i) => i.url === r.url)) continue;
      const excerpt = await fetchPageText(r.url, 2500);
      if (excerpt) items.push({ title: r.title, url: r.url, excerpt });
    }
  }
  researchCache = { at: Date.now(), items };
  return items;
}

const sources = (research) => research.map((r) => ({ title: r.title, url: r.url }));

// The built-in advice, used as the base and when the AI can't be reached.
const PLAYBOOK = {
  ideas: [
    'A 20–30 second Reel: one punchy line from the message, text on screen from the first second.',
    'A “3 truths from this week’s message” carousel — carousels are the most saved format.',
    'A short “pray this with me” Reel or a verse of the week graphic people can send to a friend.',
    'A behind-the-scenes clip from the service or the team (people follow people).',
    'A question post: “What is one thing God is teaching you this season?” to open the comments.',
  ],
  captions: [
    'Open with a hook line that stands alone — it is all most people read before “more”.',
    'End with one question or one clear action (save, send, comment), never several.',
    'Use 3–5 specific hashtags (topic + community), not 20 broad ones.',
    'Reply to comments within the first hour; it keeps the post moving.',
  ],
  schedule: 'Post 3–4 times a week with a Reel in at least half of them, at the time your own best posts went out (see the best day/time above).',
};

function fallbackGrowth({ health }) {
  const priorities = health.priorities.map((c) => ({ title: c.label, detail: `${c.value}. ${c.tip}` }));
  return {
    summary: `Your account scores ${health.score}/100 (${health.grade}). ${health.priorities.length ? `The biggest opportunities are ${health.priorities.slice(0, 2).map((c) => c.label.toLowerCase()).join(' and ')}.` : 'Nothing is badly off — keep your rhythm and keep testing formats.'}`,
    priorities,
    contentIdeas: PLAYBOOK.ideas,
    captionTips: PLAYBOOK.captions,
    schedule: health.stats.bestDay ? `Your best posts have gone out on ${health.stats.bestDay}${health.stats.bestHour != null ? ` around ${health.stats.bestHour}:00` : ''}. ${PLAYBOOK.schedule}` : PLAYBOOK.schedule,
  };
}

const GROWTH_SYSTEM = `You are an Instagram growth strategist for a church media team. You are given the account's real numbers, a diagnosis, its top and bottom posts, and excerpts from current articles. Write a practical growth plan. Reply ONLY with JSON: {"summary": string (2-3 sentences, plain language), "priorities": [{"title": string, "detail": string}] (3-5, most impactful first, each tied to a number you were given), "contentIdeas": [string] (5, specific to a church: messages, scripture, worship, community), "captionTips": [string] (3-5), "schedule": string (when and how often to post, using the best day/time if provided)}. Be specific and honest; do not invent statistics or quote the articles verbatim.`;

export async function growthPlan({ profile, health, top, bottom }) {
  const research = await researchGrowth().catch(() => []);
  const base = fallbackGrowth({ health });
  const ai = await callOpenRouterJSON({
    system: GROWTH_SYSTEM,
    user: JSON.stringify({ account: { followers: profile.followers, posts: profile.posts }, score: health.score, components: health.components.map((c) => ({ label: c.label, score: c.score, value: c.value })), stats: health.stats, topPosts: top, weakestPosts: bottom, articles: research.map((r) => ({ title: r.title, excerpt: r.excerpt })) }).slice(0, 14000),
    maxTokens: 1200,
    temperature: 0.4,
  }).catch(() => null);
  if (ai?.summary && Array.isArray(ai.priorities)) {
    return { ai: true, summary: String(ai.summary), priorities: ai.priorities.slice(0, 6).map((p) => ({ title: String(p.title), detail: String(p.detail) })), contentIdeas: (ai.contentIdeas ?? base.contentIdeas).slice(0, 7).map(String), captionTips: (ai.captionTips ?? base.captionTips).slice(0, 6).map(String), schedule: String(ai.schedule || base.schedule), sources: sources(research) };
  }
  return { ai: false, aiIssue: aiIssue() ?? 'unavailable', ...base, sources: sources(research) };
}

const POST_SYSTEM = `You review one Instagram post for a church media team. You get the post's caption, numbers, score breakdown and how it compares with the account. Reply ONLY with JSON: {"summary": string (2-3 sentences: how it did and why), "whatWorked": [string] (up to 3), "toImprove": [string] (up to 4, concrete), "captionRewrite": string (a stronger caption keeping the same message, with a hook and one call to action; empty string if the caption is already strong), "nextPostIdeas": [string] (up to 3 follow-ups built on this post)}. Do not invent numbers.`;

export async function postReview({ post, scored, tips, strengths, followers }) {
  const base = {
    summary: `This ${post.type.toLowerCase()} scored ${scored.score}/100 (${scored.grade}), with a ${(scored.er * 100).toFixed(1)}% engagement rate${post.reach ? ` and a reach of ${post.reach}` : ''}.`,
    whatWorked: strengths.slice(0, 3),
    toImprove: tips.map((t) => `${t.title}: ${t.detail}`).slice(0, 4),
    captionRewrite: '',
    nextPostIdeas: [],
  };
  const ai = await callOpenRouterJSON({
    system: POST_SYSTEM,
    user: JSON.stringify({ type: post.type, caption: post.caption.slice(0, 1200), followers, metrics: { reach: post.reach, views: post.views, likes: post.likes, comments: post.comments, saves: post.saves, shares: post.shares, avgWatchSec: post.avgWatchSec }, score: scored.score, components: scored.components.map((c) => ({ label: c.label, score: c.score, value: c.value })) }),
    maxTokens: 800,
    temperature: 0.4,
  }).catch(() => null);
  if (ai?.summary) return { ai: true, summary: String(ai.summary), whatWorked: (ai.whatWorked ?? []).slice(0, 4).map(String), toImprove: (ai.toImprove ?? []).slice(0, 5).map(String), captionRewrite: String(ai.captionRewrite || ''), nextPostIdeas: (ai.nextPostIdeas ?? []).slice(0, 4).map(String) };
  return { ai: false, aiIssue: aiIssue() ?? 'unavailable', ...base };
}
