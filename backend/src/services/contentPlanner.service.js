import { env } from '../config/env.js';
import { Brand } from '../models/Brand.model.js';
import { ContentItem } from '../models/ContentItem.model.js';
import { aiIssue, callOpenRouterJSON } from './openrouter.service.js';

export const PLAN_FORMATS = ['reel', 'post', 'carousel', 'story', 'video'];
export const SERVICE_FOCUS = ['recap', 'growth', 'context'];
export const PLAN_PLATFORMS = ['instagram', 'facebook', 'youtube', 'tiktok'];
const MAX_ITEMS = 60;
const CHUNK_DAYS = 14; // a long calendar is written a fortnight at a time, so each answer stays focused and complete

const SYSTEM = `You are the social media strategist for a church's media team. You plan content calendars that grow engagement, deepen people's walk with God, and invite people in - never gimmicky, always warm, clear and true to the church's voice.

You are given a brief from the team (what they want to achieve: e.g. church engagement, a programme drive, word growth), a date range, how many posts a week, which formats and platforms to use, the tone, and what is already planned.
Plan posts that fit the brief. Good church calendars have a rhythm: the Sunday message (clips, quotes, key points, sermon recap), a midweek scripture or devotional, testimonies and stories, behind-the-scenes and team faces, prayer prompts and questions that get comments, invitations and countdowns for events, serving/giving moments. Vary the formats. Spread posts across the week - not several on one day unless asked. Respect any dates or events the brief mentions and build countdowns toward them. Pick sensible posting times (mornings 6-9am, lunch 12-1pm, evenings 6-9pm; Sundays around the service).
Do not repeat or collide with what is already planned. Never invent scripture quotations: when you mention a verse, give only the reference (e.g. John 3:16) and a short paraphrase.

For each post give:
- date: YYYY-MM-DD, inside the range
- time: HH:mm (24 hour)
- title: a short working title (max 90 chars)
- format: one of the allowed formats
- platform: one of the allowed platforms
- theme: the content pillar in 1-3 words (e.g. "Scripture", "Testimony", "Sunday recap", "Invitation")
- caption: a ready-to-post caption draft - a strong first line (the hook), the body, a clear call to action, and 3-6 relevant hashtags (max 700 characters)
- notes: production notes for the team - what to film/design, who or what is needed, any assets or approvals (max 300 characters)
Respond ONLY with JSON: {"summary": string (2-3 sentences on the strategy for the WHOLE period from range.overallFrom to range.overallTo), "items": [...]}`;

// Added to the instructions when the team pastes in what was preached or said at a service.
const SERVICE_RULES = `
The team has also pasted in an EXCERPT FROM A SERVICE (serviceExcerpt): the message, notes or a transcript. Build this period's posts from it. serviceFocus says which kinds they want; make each kind that is listed, and spread them across the days instead of putting them together:
- "recap": a recap of the service for people who missed it or want to remember it - the big idea, the moments that landed, a key line. Theme "Sunday recap". Early in the period, ideally the day after the service or Sunday itself.
- "growth": take the practical points in the message and turn each into an ACTIONABLE word-growth post people can do this week - a short reading plan, a question to journal on, a verse to memorise and pray, a small challenge for the day, a family or small-group conversation starter. Say exactly what to do. Theme "Word growth". Space these through the week, one idea per post.
- "context": give people the background behind the message so it lands better - who was being spoken to, what was happening, the meaning of a key word or image, how a passage fits the bigger story, why it matters today. Plain and warm, not academic. Theme "Context". Mid-week works well.
Rules for using the excerpt: stay faithful to what was actually said; do not put words in the preacher's mouth or add teaching the excerpt doesn't contain. You may quote a short line from the excerpt exactly as written; never invent a quotation, and never write out a Bible verse's wording - give the reference and a short paraphrase. The excerpt is the source of the ideas; the brief says the goal. If serviceFocus is empty, use all three kinds. If the period is longer than a week, use the material across the whole period (fresh angles on later weeks, not the same post repeated). For notes, say which part of the message the post comes from.`;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseDay = (s) => new Date(`${s}T12:00:00Z`);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000) + 1;

async function churchContext() {
  const b = await Brand.findOne({ key: 'default' }).lean().catch(() => null);
  if (!b) return {};
  return { churchName: b.churchName, tagline: b.tagline, pastor: b.pastorName, serviceTimes: b.serviceTimes, website: b.website, instagram: b.socials?.instagram };
}

// Turns whatever the AI wrote into safe, well-formed items inside the range.
function clean(items, start, end, formats, platforms) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    const date = String(it?.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end) continue;
    const title = String(it?.title ?? '').trim().slice(0, 90);
    if (!title) continue;
    const key = `${date}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(it?.time ?? '').trim());
    const time = m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : '18:00';
    out.push({
      date,
      time,
      title,
      format: formats.includes(it?.format) ? it.format : formats[0],
      platform: platforms.includes(it?.platform) ? it.platform : platforms[0],
      theme: String(it?.theme ?? '').trim().slice(0, 40),
      caption: String(it?.caption ?? '').trim().slice(0, 1500),
      notes: String(it?.notes ?? '').trim().slice(0, 600),
    });
  }
  return out;
}

async function plannedAlready(start, end) {
  const found = await ContentItem.find({ scheduledAt: { $gte: parseDay(start), $lte: addDays(parseDay(end), 1) } }).select('title scheduledAt format').sort({ scheduledAt: 1 }).limit(120).lean();
  return found.map((i) => ({ date: ymd(i.scheduledAt), title: i.title, format: i.format }));
}

const fail = (message, status) => Object.assign(new Error(message), { status });
const AI_MESSAGE = {
  credits: 'The AI writer is paused right now (the OpenRouter key is out of credit). Ask an admin to top it up, or plan this one by hand.',
  busy: 'The AI is busy at the moment. Give it a minute and try again.',
  unavailable: 'The AI writer isn’t reachable right now. Try again shortly, or plan this one by hand.',
};

async function ask(payload, count) {
  const system = payload.serviceExcerpt ? SYSTEM + SERVICE_RULES : SYSTEM;
  if (!env.openrouterApiKey) throw fail('The AI writer isn’t set up on this server yet (no OpenRouter key).', 503);
  const models = [...new Set([env.contentPlanModel, env.openrouterNotesModel])];
  for (const model of models) {
    // A brief rate limit is common: wait a moment and try the same model once more before moving on.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await callOpenRouterJSON({ system, user: JSON.stringify(payload), maxTokens: Math.min(10000, 1500 + count * 520), temperature: 0.8, model }).catch(() => null);
      if (res && Array.isArray(res.items)) return res;
      if (aiIssue() !== 'busy') break;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw fail(AI_MESSAGE[aiIssue()] || AI_MESSAGE.unavailable, 503);
}

// brief + range + rhythm -> a list of planned posts (not saved; the person reviews them first).
export async function generateContentPlan({ brief, startDate, endDate, postsPerWeek, formats, platforms, tone, campaign, serviceExcerpt, serviceFocus }) {
  const [church, already] = await Promise.all([churchContext(), plannedAlready(startDate, endDate)]);
  const totalDays = daysBetween(startDate, endDate);
  const wanted = Math.min(MAX_ITEMS, Math.max(1, Math.round((totalDays / 7) * postsPerWeek)));
  // Split into fortnights and write them side by side (a long calendar would take minutes one after another).
  const chunks = [];
  for (let offset = 0; offset < totalDays; offset += CHUNK_DAYS) {
    const cs = ymd(addDays(parseDay(startDate), offset));
    const ce = ymd(addDays(parseDay(startDate), Math.min(offset + CHUNK_DAYS, totalDays) - 1));
    chunks.push({ cs, ce, share: Math.max(1, Math.round((daysBetween(cs, ce) / totalDays) * wanted)) });
  }
  const results = await Promise.all(
    chunks.map(({ cs, ce, share }) =>
      ask(
        {
          brief,
          campaign: campaign || undefined,
          church,
          serviceExcerpt: serviceExcerpt || undefined,
          serviceFocus: serviceExcerpt ? serviceFocus : undefined,
          range: { from: cs, to: ce, overallFrom: startDate, overallTo: endDate },
          postsToWrite: share,
          postsPerWeek,
          allowedFormats: formats,
          allowedPlatforms: platforms,
          tone: tone || 'warm and encouraging',
          alreadyPlanned: already.filter((a) => a.date >= cs && a.date <= ce),
        },
        share,
      ).then((res) => ({ res, cs, ce })),
    ),
  );
  const items = [];
  let summary = '';
  for (const { res, cs, ce } of results) {
    if (!summary && typeof res.summary === 'string') summary = res.summary.trim().slice(0, 600);
    items.push(...clean(res.items, cs, ce, formats, platforms));
  }
  if (!items.length) throw fail('The AI didn’t come back with a usable plan. Try again, or describe what you want in a bit more detail.', 502);
  items.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return { summary, items: items.slice(0, MAX_ITEMS) };
}

// One replacement idea for a single slot ("try another") - avoids the titles already in the plan.
export async function generateOneIdea({ brief, campaign, date, format, platform, tone, avoid, serviceExcerpt, serviceFocus }) {
  const church = await churchContext();
  const res = await ask(
    { brief, campaign: campaign || undefined, church, serviceExcerpt: serviceExcerpt || undefined, serviceFocus: serviceExcerpt ? serviceFocus : undefined, range: { from: date, to: date, overallFrom: date, overallTo: date }, postsToWrite: 1, postsPerWeek: 1, allowedFormats: [format], allowedPlatforms: [platform], tone: tone || 'warm and encouraging', alreadyPlanned: (avoid || []).slice(0, 40).map((title) => ({ title })), note: 'Give one fresh idea that is clearly different from everything in alreadyPlanned.' },
    1,
  );
  const [one] = clean(res.items, date, date, [format], [platform]);
  if (!one) throw fail('Couldn’t come up with another one - try again.', 502);
  return one;
}
