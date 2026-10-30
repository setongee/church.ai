import { ContentItem } from '../models/ContentItem.model.js';
import { PostUpload } from '../models/PostUpload.model.js';
import { User } from '../models/User.model.js';
import { publishUploadToInstagram } from './postUpload.service.js';
import { InstagramApiError, InstagramConfigError } from './instagram.service.js';
import { notify } from './notification.service.js';

// Posts the content calendar's scheduled items when their time comes, and nudges owners about items still missing media.
// Safe to run on several servers at once: an item is claimed with one atomic update, so only one of them can post it.

const TICK_MS = 60 * 1000;
const MAX_LATE_MS = 3 * 3600 * 1000; // an item this far past its time is not posted any more (nobody wants a stale post)
const STUCK_MS = 20 * 60 * 1000; // 'publishing' for longer than this means the server died mid-post
const REMINDER_WINDOW_MS = 24 * 3600 * 1000;

// Swapped out by tests so no real Instagram call is ever made.
let publisher = publishUploadToInstagram;
export const __setPublisherForTests = (fn) => {
  publisher = fn || publishUploadToInstagram;
};

const link = (item) => `/calendar?item=${item._id}`;
const when = (d) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function adminIds() {
  return (await User.find({ isAdmin: true, active: true }).select('_id').lean()).map((u) => u._id);
}

// Who hears about this item: the people responsible, or whoever created it if nobody is.
const audience = (item) => (item.owners?.length ? item.owners : item.createdBy ? [item.createdBy] : []);

// A plain-English reason for a failed post.
export function failureText(err) {
  if (err instanceof InstagramConfigError) return /PUBLIC_BASE_URL/.test(err.message) ? 'Instagram can’t reach this server’s media yet (the public URL isn’t set up).' : 'Instagram is not connected.';
  if (err instanceof InstagramApiError) return `Instagram refused it: ${err.message}`.slice(0, 300);
  return String(err?.message || 'Something went wrong while posting.').slice(0, 300);
}

async function fail(item, reason) {
  await ContentItem.updateOne({ _id: item._id }, { status: 'failed', error: reason, publishStartedAt: null });
  const admins = await adminIds();
  await notify([...audience(item), ...admins], { type: 'content', title: `Couldn’t post “${item.title}”`, body: reason, href: link(item) });
}

// Posts one item that has already been claimed (status 'publishing'). Returns the saved item, or throws after marking it failed.
async function postClaimed(item) {
  const upload = item.upload ? await PostUpload.findById(item.upload) : null;
  if (!upload || upload.status !== 'ready' || !upload.mediaUrl) {
    await fail(item, 'No media is attached to this post.');
    throw Object.assign(new Error('No media is attached to this post.'), { status: 400 });
  }
  if (upload.instagramMediaId) {
    // Already out (posted from Upload & post): just record it.
    return ContentItem.findByIdAndUpdate(item._id, { status: 'published', publishedAt: upload.instagramPublishedAt || new Date(), instagramMediaId: upload.instagramMediaId, instagramPermalink: upload.instagramPermalink || '', error: '', publishStartedAt: null }, { new: true });
  }
  const caption = String(item.caption || upload.caption || '').trim().slice(0, 2200);
  try {
    await publisher(upload, caption);
  } catch (err) {
    const reason = failureText(err);
    await fail(item, reason);
    throw Object.assign(new Error(reason), { status: err instanceof InstagramConfigError ? 400 : 502 });
  }
  const done = await ContentItem.findByIdAndUpdate(item._id, { status: 'published', publishedAt: upload.instagramPublishedAt || new Date(), instagramMediaId: upload.instagramMediaId, instagramPermalink: upload.instagramPermalink || '', error: '', publishStartedAt: null }, { new: true });
  await notify(audience(item), { type: 'content', title: 'Your post is live', body: `“${item.title}” is now on Instagram.`, href: link(item) });
  return done;
}

// "Publish now" from the calendar: claims the item the same way the scheduler does, then posts it.
export async function publishItemNow(id) {
  const item = await ContentItem.findOneAndUpdate({ _id: id, status: { $in: ['idea', 'drafting', 'review', 'ready', 'scheduled', 'failed'] } }, { status: 'publishing', publishStartedAt: new Date() }, { new: true });
  if (!item) throw Object.assign(new Error('That item is already being posted or is already out.'), { status: 409 });
  return postClaimed(item);
}

async function postDue() {
  const now = new Date();
  // Too late to post - say so instead of surprising anyone with a stale post.
  const missed = await ContentItem.find({ status: 'scheduled', scheduledAt: { $lt: new Date(now.getTime() - MAX_LATE_MS) } });
  for (const item of missed) {
    const claimed = await ContentItem.findOneAndUpdate({ _id: item._id, status: 'scheduled' }, { status: 'failed', error: `Missed its time (${when(item.scheduledAt)}) - the server wasn’t able to post it. Reschedule it when you’re ready.` }, { new: true });
    if (claimed) await notify([...audience(item), ...(await adminIds())], { type: 'content', title: `“${item.title}” missed its time`, body: claimed.error, href: link(item) });
  }
  // One at a time, oldest first.
  for (;;) {
    const item = await ContentItem.findOneAndUpdate({ status: 'scheduled', scheduledAt: { $lte: now, $gte: new Date(now.getTime() - MAX_LATE_MS) } }, { status: 'publishing', publishStartedAt: new Date() }, { sort: { scheduledAt: 1 }, new: true });
    if (!item) break;
    try {
      await postClaimed(item);
    } catch (err) {
      console.error('[content] could not post', String(item._id), err.message);
    }
  }
}

// A post that was mid-flight when the server went down: don't guess whether it reached Instagram.
async function recoverStuck() {
  const stuck = await ContentItem.find({ status: 'publishing', publishStartedAt: { $lt: new Date(Date.now() - STUCK_MS) } });
  for (const item of stuck) {
    const claimed = await ContentItem.findOneAndUpdate({ _id: item._id, status: 'publishing' }, { status: 'failed', error: 'Posting was interrupted - check Instagram before trying again, so it isn’t posted twice.', publishStartedAt: null }, { new: true });
    if (claimed) await notify([...audience(item), ...(await adminIds())], { type: 'content', title: `Check “${item.title}” on Instagram`, body: claimed.error, href: link(item) });
  }
}

// About a day before the time, owners are reminded about posts that still have no media.
async function sendReminders() {
  const now = new Date();
  const due = await ContentItem.find({ reminderSent: false, upload: null, status: { $in: ['idea', 'drafting', 'review', 'ready', 'scheduled'] }, scheduledAt: { $gt: now, $lte: new Date(now.getTime() + REMINDER_WINDOW_MS) } });
  for (const item of due) {
    const claimed = await ContentItem.findOneAndUpdate({ _id: item._id, reminderSent: false }, { reminderSent: true });
    if (claimed) await notify(audience(item), { type: 'content', title: `“${item.title}” still needs media`, body: `It’s planned for ${when(item.scheduledAt)} but has no video or picture attached yet.`, href: link(item) });
  }
}

export async function runSchedulerTick() {
  await recoverStuck();
  await postDue();
  await sendReminders();
}

let timer = null;
export function startContentScheduler() {
  if (timer) return;
  const tick = () => runSchedulerTick().catch((err) => console.error('[content] scheduler tick failed', err.message));
  setTimeout(tick, 5000);
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
}
