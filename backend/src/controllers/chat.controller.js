import { TeamRoom, RoomMember } from '../models/TeamRoom.model.js';
import { TeamMessage } from '../models/TeamMessage.model.js';
import { Service } from '../models/Service.model.js';
import { User } from '../models/User.model.js';
import { assignmentsFor } from '../services/access.service.js';
import { emitToUsers } from '../services/realtime.service.js';
import { sendPush } from '../services/push.service.js';
import { isSticker, stickerLabel } from '../services/stickers.js';
import { removeVoiceFile } from './voice.controller.js';

const EMOJI = ['👍', '❤️', '🙏', '😂', '🔥', '✅', '👀', '🎉'];
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

async function generalRoom() {
  return (await TeamRoom.findOne({ kind: 'general' })) ?? (await TeamRoom.create({ kind: 'general', name: 'Team' }));
}

// Makes sure the general room exists, every service has a room (named after it), and this person is in the
// general room and in the room of every service they're rostered on.
async function syncRooms(user) {
  const general = await generalRoom();
  await RoomMember.updateOne({ room: general._id, user: user._id }, { $setOnInsert: { joinedAt: new Date(), lastReadAt: new Date() } }, { upsert: true });
  const services = await Service.find().sort({ createdAt: -1 }).limit(200).select('name date').lean();
  const existing = await TeamRoom.find({ kind: 'service' }).lean();
  const byService = new Map(existing.map((r) => [String(r.service), r]));
  for (const s of services) {
    const r = byService.get(String(s._id));
    if (!r) byService.set(String(s._id), await TeamRoom.create({ kind: 'service', service: s._id, name: s.name }).catch(() => null));
    else if (r.name !== s.name) await TeamRoom.updateOne({ _id: r._id }, { name: s.name });
  }
  const mine = await assignmentsFor(user._id);
  for (const a of mine) {
    const room = byService.get(String(a.service._id));
    if (room) await RoomMember.updateOne({ room: room._id, user: user._id }, { $setOnInsert: { joinedAt: new Date(), lastReadAt: new Date(0) } }, { upsert: true });
  }
  return { general, services };
}

const authorOf = (u) => ({ id: String(u._id), name: u.name });
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
// What a message reads like in a room list, an alert or a push, whatever its kind.
export function previewOf(m) {
  if (m.kind === 'sticker') return `Sticker: ${stickerLabel(m.sticker)}`;
  if (m.kind === 'voice') return `Voice note (${clock(m.audioDur || 0)})`;
  return m.text;
}
function shapeMessage(m) {
  return {
    id: String(m._id),
    roomId: String(m.room),
    author: m.author?._id ? authorOf(m.author) : { id: String(m.author), name: 'Someone' },
    kind: m.kind || 'text',
    text: m.text,
    preview: previewOf(m),
    sticker: m.kind === 'sticker' ? m.sticker : undefined,
    audioUrl: m.kind === 'voice' ? m.audioUrl : undefined,
    durationSec: m.kind === 'voice' ? m.audioDur : undefined,
    mentions: (m.mentions ?? []).map((u) => (u?._id ? authorOf(u) : { id: String(u), name: '' })),
    all: Boolean(m.mentionAll),
    reactions: (m.reactions ?? []).filter((r) => r.users?.length).map((r) => ({ emoji: r.emoji, users: r.users.map((u) => String(u?._id ?? u)) })),
    createdAt: m.createdAt,
    editedAt: m.editedAt ?? null,
  };
}
const populateMsg = (q) => q.populate('author', 'name').populate('mentions', 'name');

async function requireMember(roomId, userId) {
  const room = await TeamRoom.findById(roomId);
  if (!room) throw bad('Room not found.', 404);
  const member = await RoomMember.findOne({ room: room._id, user: userId });
  if (!member) throw bad('Join this room first.', 403);
  return { room, member };
}

export async function listRooms(req, res) {
  const { general } = await syncRooms(req.user);
  const rooms = await TeamRoom.find().populate('service', 'date').lean();
  const memberships = await RoomMember.find({ user: req.user._id }).lean();
  const mine = new Map(memberships.map((m) => [String(m.room), m]));
  const counts = await RoomMember.aggregate([{ $group: { _id: '$room', n: { $sum: 1 } } }]);
  const memberCount = new Map(counts.map((c) => [String(c._id), c.n]));

  const out = await Promise.all(
    rooms.map(async (r) => {
      const m = mine.get(String(r._id));
      const last = await TeamMessage.findOne({ room: r._id }).sort({ createdAt: -1 }).populate('author', 'name').lean();
      let unread = 0;
      let mentioned = false;
      if (m) {
        const since = { createdAt: { $gt: m.lastReadAt }, author: { $ne: req.user._id } };
        [unread, mentioned] = await Promise.all([TeamMessage.countDocuments({ room: r._id, ...since }), TeamMessage.exists({ room: r._id, ...since, $or: [{ mentions: req.user._id }, { mentionAll: true }] }).then(Boolean)]);
      }
      return {
        id: String(r._id),
        kind: r.kind,
        name: r.name,
        serviceId: r.service?._id ? String(r.service._id) : null,
        date: r.service?.date ?? null,
        joined: Boolean(m),
        unread,
        mentioned,
        members: memberCount.get(String(r._id)) ?? 0,
        last: last ? { text: previewOf(last).slice(0, 90), author: last.author?.name ?? '', at: last.createdAt } : null,
      };
    })
  );
  // General first, then rooms you're in (most recently active), then the rest (newest service first).
  out.sort((a, b) => (a.id === String(general._id) ? -1 : b.id === String(general._id) ? 1 : Number(b.joined) - Number(a.joined) || new Date(b.last?.at ?? b.date ?? 0) - new Date(a.last?.at ?? a.date ?? 0)));
  res.json(out);
}

export async function joinRoom(req, res) {
  const room = await TeamRoom.findById(req.params.id);
  if (!room) throw bad('Room not found.', 404);
  await RoomMember.updateOne({ room: room._id, user: req.user._id }, { $setOnInsert: { joinedAt: new Date(), lastReadAt: new Date() } }, { upsert: true });
  res.json({ ok: true });
}

export async function leaveRoom(req, res) {
  const room = await TeamRoom.findById(req.params.id);
  if (!room) throw bad('Room not found.', 404);
  if (room.kind === 'general') throw bad('Everyone stays in the team room.');
  await RoomMember.deleteOne({ room: room._id, user: req.user._id });
  res.json({ ok: true });
}

export async function roomMembers(req, res) {
  const { room } = await requireMember(req.params.id, req.user._id);
  const members = await RoomMember.find({ room: room._id }).populate('user', 'name active').lean();
  res.json(members.filter((m) => m.user?.active).map((m) => ({ id: String(m.user._id), name: m.user.name })).sort((a, b) => a.name.localeCompare(b.name)));
}

export async function listMessages(req, res) {
  const { room } = await requireMember(req.params.id, req.user._id);
  const filter = { room: room._id, ...(req.query.before ? { createdAt: { $lt: new Date(String(req.query.before)) } } : {}) };
  const msgs = await populateMsg(TeamMessage.find(filter).sort({ createdAt: -1 }).limit(Math.min(100, Number(req.query.limit) || 50)));
  res.json(msgs.reverse().map(shapeMessage));
}

// Saves a message, tells the room live, and sends the push. `fields` is what's specific to its kind; `tags` is who a text
// message mentions. Used by text, sticker and voice sends.
export async function postMessage(room, author, fields, tags = { mentions: [], all: false }) {
  const members = await RoomMember.find({ room: room._id }).select('user').lean();
  const memberIds = new Set(members.map((m) => String(m.user)));
  // Tags: only people actually in the room count.
  const mentions = [...new Set(tags.mentions.map(String))].filter((id) => memberIds.has(id) && id !== String(author._id));
  const all = Boolean(tags.all);
  const doc = await TeamMessage.create({ room: room._id, author: author._id, mentions, mentionAll: all, ...fields });
  const msg = shapeMessage(await populateMsg(TeamMessage.findById(doc._id)));
  await RoomMember.updateOne({ room: room._id, user: author._id }, { lastReadAt: new Date() });

  // Everyone in the room hears about it live (including the sender's other tabs); the room name travels along so the
  // alert can say where it came from.
  const mentionedSet = new Set(mentions);
  for (const id of memberIds) emitToUsers([id], 'chat:message', { message: msg, roomName: room.name, roomKind: room.kind, mentioned: id !== String(author._id) && (all || mentionedSet.has(id)) });
  // Phones and closed apps hear about it through push (the service worker stays quiet if the app is on screen).
  const others = [...memberIds].filter((id) => id !== String(author._id));
  const tagged = new Set(others.filter((id) => all || mentionedSet.has(id)));
  const text = msg.preview || '';
  const preview = text.length > 160 ? `${text.slice(0, 157)}…` : text;
  const base = { body: preview, url: `/chat?room=${room._id}&msg=${msg.id}`, tag: `chat:${room._id}`, kind: 'chat' };
  void sendPush([...tagged], { ...base, title: `${msg.author.name} · ${room.name} (tagged you)` });
  void sendPush(others.filter((id) => !tagged.has(id)), { ...base, title: `${msg.author.name} · ${room.name}` });
  return msg;
}

export async function sendMessage(req, res) {
  const { room } = await requireMember(req.params.id, req.user._id);
  const kind = req.body?.kind === 'sticker' ? 'sticker' : 'text';
  if (kind === 'sticker') {
    const sticker = String(req.body?.sticker ?? '');
    if (!isSticker(sticker)) throw bad('That sticker isn’t available.');
    return res.status(201).json(await postMessage(room, req.user, { kind: 'sticker', sticker }));
  }
  const text = String(req.body?.text ?? '').trim().slice(0, 4000);
  if (!text) throw bad('Type a message first.');
  const msg = await postMessage(room, req.user, { text }, { mentions: Array.isArray(req.body?.mentions) ? req.body.mentions : [], all: req.body?.all });
  res.status(201).json(msg);
}

// Works out who a message tags: people in the room whose @name appears in the text, and @all.
async function tagsIn(roomId, authorId, body) {
  const members = await RoomMember.find({ room: roomId }).select('user').lean();
  const memberIds = new Set(members.map((m) => String(m.user)));
  const mentions = [...new Set((Array.isArray(body?.mentions) ? body.mentions : []).map(String))].filter((id) => memberIds.has(id) && id !== String(authorId));
  return { memberIds, mentions, all: Boolean(body?.all) };
}

// Edit your own message.
export async function editMessage(req, res) {
  const msg = await TeamMessage.findById(req.params.id);
  if (!msg) throw bad('Message not found.', 404);
  await requireMember(msg.room, req.user._id);
  if (String(msg.author) !== String(req.user._id)) throw bad('You can only edit your own messages.', 403);
  if (msg.kind && msg.kind !== 'text') throw bad('Only text messages can be edited.');
  const text = String(req.body?.text ?? '').trim().slice(0, 4000);
  if (!text) throw bad('A message can’t be empty — delete it instead.');
  const { memberIds, mentions, all } = await tagsIn(msg.room, req.user._id, req.body);
  msg.text = text;
  msg.mentions = mentions;
  msg.mentionAll = all;
  msg.editedAt = new Date();
  await msg.save();
  const shaped = shapeMessage(await populateMsg(TeamMessage.findById(msg._id)));
  emitToUsers([...memberIds], 'chat:edit', { message: shaped });
  res.json(shaped);
}

// Delete your own message (admins can delete anyone's).
export async function deleteMessage(req, res) {
  const msg = await TeamMessage.findById(req.params.id);
  if (!msg) throw bad('Message not found.', 404);
  await requireMember(msg.room, req.user._id);
  if (String(msg.author) !== String(req.user._id) && !req.user.isAdmin) throw bad('You can only delete your own messages.', 403);
  await msg.deleteOne();
  if (msg.kind === 'voice') removeVoiceFile(msg.audioUrl);
  const members = await RoomMember.find({ room: msg.room }).select('user').lean();
  emitToUsers(members.map((m) => m.user), 'chat:delete', { roomId: String(msg.room), messageId: String(msg._id) });
  res.json({ ok: true });
}

export async function markRead(req, res) {
  const { room } = await requireMember(req.params.id, req.user._id);
  await RoomMember.updateOne({ room: room._id, user: req.user._id }, { lastReadAt: new Date() });
  res.json({ ok: true });
}

export async function toggleReaction(req, res) {
  const emoji = String(req.body?.emoji ?? '');
  if (!EMOJI.includes(emoji)) throw bad('That reaction isn’t available.');
  const msg = await TeamMessage.findById(req.params.id);
  if (!msg) throw bad('Message not found.', 404);
  await requireMember(msg.room, req.user._id);
  let r = msg.reactions.find((x) => x.emoji === emoji);
  if (!r) {
    msg.reactions.push({ emoji, users: [req.user._id] });
  } else if (r.users.some((u) => String(u) === String(req.user._id))) {
    r.users = r.users.filter((u) => String(u) !== String(req.user._id));
  } else r.users.push(req.user._id);
  msg.reactions = msg.reactions.filter((x) => x.users.length);
  await msg.save();
  const reactions = shapeMessage(msg).reactions;
  const members = await RoomMember.find({ room: msg.room }).select('user').lean();
  emitToUsers(members.map((m) => m.user), 'chat:reaction', { roomId: String(msg.room), messageId: String(msg._id), reactions });
  res.json({ reactions });
}

export const REACTIONS = EMOJI;
export async function reactionList(req, res) {
  res.json(EMOJI);
}

// Used by the nav badge.
export async function unreadSummary(req, res) {
  const memberships = await RoomMember.find({ user: req.user._id }).lean();
  let total = 0;
  let mentioned = false;
  for (const m of memberships) {
    const since = { room: m.room, createdAt: { $gt: m.lastReadAt }, author: { $ne: req.user._id } };
    const n = await TeamMessage.countDocuments(since);
    total += n;
    if (n && !mentioned) mentioned = Boolean(await TeamMessage.exists({ ...since, $or: [{ mentions: req.user._id }, { mentionAll: true }] }));
  }
  res.json({ total, mentioned });
}
