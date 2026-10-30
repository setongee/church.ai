import { RoomMember, TeamRoom } from '../models/TeamRoom.model.js';
import { Sprint } from '../models/Sprint.model.js';
import { Task } from '../models/Task.model.js';
import { TeamMessage } from '../models/TeamMessage.model.js';
import { User } from '../models/User.model.js';
import { notify } from './notification.service.js';
import { DEFAULT_EMAIL_PREFS, emailLayout } from './notifyEmail.service.js';
import { mailConfigured, sendMail } from './mail.service.js';
import { isOnline } from './realtime.service.js';

// Reminders go out by day, in the team's own time zone, and never in the small hours.
const TZ = process.env.APP_TIMEZONE || 'Africa/Lagos';
const localDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
const localHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d)) % 24;
const dayDiff = (from, to) => Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000);
const nice = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const TASK_HOURS = [8, 20]; // reminders about tasks are sent between 8am and 8pm
const CHAT_HOURS = [7, 21];
const TAGGED_AFTER_MIN = 10; // someone tagged you and you haven't looked
const ANY_AFTER_MIN = 10; // unread messages have sat for this long (checked every few minutes, so the email lands 10-15 min after)
const CHAT_EMAIL_EVERY_H = 2; // at most one chat reminder email per person every couple of hours
let forced = false; // tests run the jobs at any hour
const inside = ([a, b]) => forced || (localHour() >= a && localHour() < b);

// ---- tasks nearing their due date ------------------------------------------------------------------------------------

const STAGES = {
  '2d': (t, left) => ({ title: `“${t.title}” is due ${left === 1 ? 'tomorrow' : 'in 2 days'}`, lead: `Due ${nice(t.due)}.` }),
  today: (t) => ({ title: `“${t.title}” is due today`, lead: 'It’s due today — update its progress or move it along.' }),
  overdue: (t, left) => ({ title: `“${t.title}” is overdue`, lead: `It was due ${nice(t.due)} (${-left} day${left === -1 ? '' : 's'} ago).` }),
};

async function taskReminders() {
  if (!inside(TASK_HOURS)) return;
  const today = localDay();
  const live = await Sprint.find({ status: { $ne: 'completed' } }).select('_id name').lean();
  const names = new Map(live.map((s) => [String(s._id), s.name]));
  const tasks = await Task.find({ sprint: { $in: [...names.keys()] }, status: { $ne: 'done' }, dueDate: { $ne: null }, 'assignees.0': { $exists: true } }).select('title status dueDate assignees sprint reminders').lean();
  for (const t of tasks) {
    const due = new Date(t.dueDate).toISOString().slice(0, 10);
    const left = dayDiff(today, due);
    const stage = left < 0 ? (left >= -14 ? 'overdue' : null) : left === 0 ? 'today' : left <= 2 ? '2d' : null;
    if (!stage) continue;
    // New due date? Start the reminder trail again.
    if (t.reminders?.due !== due) await Task.updateOne({ _id: t._id }, { reminders: { due, sent: [] } });
    // Claim it so this reminder goes out exactly once, even if two servers run.
    const claimed = await Task.findOneAndUpdate({ _id: t._id, 'reminders.sent': { $ne: stage } }, { $addToSet: { 'reminders.sent': stage } }, { new: false });
    if (!claimed) continue;
    const m = STAGES[stage]({ title: t.title, due }, left);
    await notify(t.assignees, { type: 'task', title: m.title, body: `${m.lead} ${names.get(String(t.sprint)) ?? ''}`.trim(), href: `/board?task=${t._id}`, email: 'reminders' });
  }
}

// ---- unread chat ---------------------------------------------------------------------------------------------------------

const preview = (m) => (m.kind === 'sticker' ? 'sent a sticker' : m.kind === 'voice' ? 'sent a voice note' : (m.text || '').replace(/\s+/g, ' ').slice(0, 140));

async function chatReminders() {
  if (!mailConfigured() || !inside(CHAT_HOURS)) return;
  const now = Date.now();
  const members = await RoomMember.find().lean();
  const byUser = new Map();
  for (const m of members) byUser.set(String(m.user), [...(byUser.get(String(m.user)) || []), m]);
  const rooms = new Map((await TeamRoom.find().select('name').lean()).map((r) => [String(r._id), r.name]));
  for (const [uid, mine] of byUser) {
    const user = await User.findById(uid).select('name email active emailPrefs lastChatEmailAt').lean();
    if (!user?.active || !user.email || (user.emailPrefs?.chat ?? DEFAULT_EMAIL_PREFS.chat) === false) continue;
    if (isOnline(uid)) continue; // they have the app open, they'll see it
    if (user.lastChatEmailAt && now - new Date(user.lastChatEmailAt).getTime() < CHAT_EMAIL_EVERY_H * 3600_000) continue;
    const blocks = [];
    let due = false;
    let anyTagged = false;
    for (const m of mine) {
      const unread = await TeamMessage.find({ room: m.room, author: { $ne: uid }, createdAt: { $gt: m.lastReadAt } }).sort({ createdAt: 1 }).limit(40).populate('author', 'name').lean();
      if (!unread.length) continue;
      const tagged = unread.filter((x) => x.mentionAll || (x.mentions || []).some((id) => String(id) === uid));
      if (tagged.some((x) => now - new Date(x.createdAt).getTime() >= TAGGED_AFTER_MIN * 60_000) || unread.some((x) => now - new Date(x.createdAt).getTime() >= ANY_AFTER_MIN * 60_000)) due = true;
      if (tagged.length) anyTagged = true;
      blocks.push({ room: rooms.get(String(m.room)) || 'Team chat', roomId: String(m.room), count: unread.length, tagged: tagged.length, last: unread.slice(-3) });
    }
    if (!due || !blocks.length) continue;
    const total = blocks.reduce((n, b) => n + b.count, 0);
    const lines = blocks.map((b) => ({
      text: `${b.room} — ${b.count} unread${b.tagged ? ` (${b.tagged} tagged you)` : ''}\n${b.last.map((x) => `${x.author?.name?.split(' ')[0] ?? 'Someone'}: ${preview(x)}`).join('\n')}`,
      html: `<b>${b.room.replace(/</g, '&lt;')}</b> — ${b.count} unread${b.tagged ? ` <span style="color:#ea580c">(${b.tagged} tagged you)</span>` : ''}<br>${b.last.map((x) => `<span style="color:#737373">${(x.author?.name?.split(' ')[0] ?? 'Someone').replace(/</g, '&lt;')}:</span> ${preview(x).replace(/</g, '&lt;')}`).join('<br>')}`,
    }));
    const subject = anyTagged ? `You were tagged in the team chat (${total} unread)` : `${total} unread message${total === 1 ? '' : 's'} in the team chat`;
    const claimed = await User.findOneAndUpdate({ _id: uid, $or: [{ lastChatEmailAt: null }, { lastChatEmailAt: { $lt: new Date(now - CHAT_EMAIL_EVERY_H * 3600_000) } }] }, { lastChatEmailAt: new Date() });
    if (!claimed) continue;
    await sendMail({ to: user.email, subject, ...emailLayout({ name: user.name.split(' ')[0], heading: subject, lines, cta: 'Open the chat', href: `/chat?room=${blocks[0].roomId}`, footer: 'You only get this when you’re away from the app. You can switch it off in Settings → Email notifications.' }) });
  }
}

// One pass of both jobs (also used by tests, with force to ignore the daytime window).
export async function runRemindersOnce({ force = false } = {}) {
  forced = force;
  try {
    await taskReminders();
    await chatReminders();
  } finally {
    forced = false;
  }
}

let timer = null;
export function startReminders() {
  if (timer) return;
  // The reminders email real people, so they only run on the live server (or when asked for), never from a dev machine.
  if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_REMINDERS !== '1') {
    console.log('[reminders] off (not production). Set ENABLE_REMINDERS=1 to run them here.');
    return;
  }
  const run = () => {
    taskReminders().catch((e) => console.error('[reminders] tasks', e.message));
    chatReminders().catch((e) => console.error('[reminders] chat', e.message));
  };
  setTimeout(run, 60_000); // soon after start-up, then every 5 minutes
  timer = setInterval(run, 5 * 60_000);
  timer.unref?.();
}
