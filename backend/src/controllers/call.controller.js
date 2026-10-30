import { TeamRoom, RoomMember } from '../models/TeamRoom.model.js';
import { CallRequest } from '../models/CallRequest.model.js';
import { ScheduledCall } from '../models/ScheduledCall.model.js';
import { Notification } from '../models/Notification.model.js';
import { User } from '../models/User.model.js';
import { notify, shapeNotification } from '../services/notification.service.js';
import { emitToUsers } from '../services/realtime.service.js';
import { broadcastCall, callAudience, canSeeCall, getCall, iceServers, roomMemberIds, shapeCall, startCall } from '../services/call.service.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

async function memberRoom(roomId, userId) {
  const room = await TeamRoom.findById(roomId);
  if (!room) throw bad('Room not found.', 404);
  if (!(await RoomMember.exists({ room: room._id, user: userId }))) throw bad('Join this room first.', 403);
  return room;
}
const label = (room) => (room.kind === 'general' ? 'the Team room' : room.name);

// Starts the call, tells the room (live + notification/push). `host` and `by` are users ({ _id, name }).
// `notifyHost` pings the host too (a scheduled call starts by itself, so the host isn't on it yet).
export async function launch(room, host, by, { skipNotify = [], title = '', notifyHost = false, invited = null } = {}) {
  const call = startCall(room._id, room.name, { id: String(host._id), name: host.name }, { id: String(by._id), name: by.name }, title, invited);
  if (!call) return null;
  const ids = await callAudience(call);
  emitToUsers(ids, 'call:started', { roomId: String(room._id), call: shapeCall(call) });
  const skip = new Set([...(notifyHost ? [] : [String(host._id)]), ...skipNotify.map(String)]);
  await notify(ids.filter((id) => !skip.has(id)), { type: 'call', title: call.title ? `${call.title} — call started in ${label(room)}` : `Call started in ${label(room)}`, body: `${host.name} started a ${call.invited ? 'private ' : ''}group call — tap to join`, href: `/chat?room=${room._id}&call=${call.id}`, data: { roomId: String(room._id), callId: call.id } });
  return call;
}

// The people a call is for: null when everyone in the room, otherwise the chosen members (never the host, who is always in).
// Throws when someone was asked for specifically but nobody valid was chosen.
export async function cleanInvited(roomId, raw, hostId) {
  if (raw === undefined || raw === null) return null;
  const want = new Set((Array.isArray(raw) ? raw : []).map(String));
  const members = new Set(await roomMemberIds(roomId));
  const chosen = [...want].filter((id) => members.has(id) && id !== String(hostId));
  if (!chosen.length) throw bad('Choose at least one person to call, or call everyone.');
  return chosen;
}

// What the call button needs to know about a room right now.
export async function roomCall(req, res) {
  const room = await memberRoom(req.params.id, req.user._id);
  const mine = await CallRequest.findOne({ room: room._id, requester: req.user._id, status: 'pending' }).lean();
  const live = getCall(room._id);
  res.json({ call: live && canSeeCall(live, req.user._id) ? shapeCall(live) : null, myRequest: mine ? { id: String(mine._id), status: mine.status } : null });
}

// Admins start a call directly.
export async function startRoomCall(req, res) {
  if (!req.user.isAdmin) throw bad('Only an admin can start a call. Request one instead.', 403);
  const room = await memberRoom(req.params.id, req.user._id);
  const invited = await cleanInvited(room._id, req.body?.invited, req.user._id);
  const call = await launch(room, req.user, req.user, { title: req.body?.title, invited });
  if (!call) throw bad('A call is already going on in this room.', 409);
  res.status(201).json({ call: shapeCall(call) });
}

// A member asks for a call; every active admin is notified and can approve or decline.
export async function requestCall(req, res) {
  const room = await memberRoom(req.params.id, req.user._id);
  if (req.user.isAdmin) throw bad('You’re an admin — start the call yourself.');
  if (getCall(room._id)) throw bad('A call is already live in this room — join it.', 409);
  let request = await CallRequest.findOne({ room: room._id, requester: req.user._id, status: 'pending' });
  if (!request) {
    request = await CallRequest.create({ room: room._id, requester: req.user._id });
    const admins = (await User.find({ isAdmin: true, active: true }).select('_id').lean()).map((u) => u._id);
    await notify(admins, { type: 'call-request', title: `${req.user.name} wants to start a call`, body: `In ${label(room)} — approve or decline`, href: `/chat?room=${room._id}`, email: 'calls', data: { requestId: String(request._id), roomId: String(room._id), roomName: room.name, requesterName: req.user.name, status: 'pending' } });
  }
  res.status(201).json({ request: { id: String(request._id), status: request.status } });
}

// Marks the admins' prompts as settled (and tells their open screens), so a second admin sees it was already handled.
async function settle(requestId, status, byName) {
  const docs = await Notification.find({ 'data.requestId': String(requestId) });
  for (const d of docs) {
    d.data = { ...d.data, status, decidedBy: byName };
    d.readAt = d.readAt ?? new Date();
    d.markModified('data');
    await d.save();
    emitToUsers([d.user], 'notification:update', shapeNotification(d));
  }
}

async function decide(req, status) {
  if (!req.user.isAdmin) throw bad('Only an admin can do that.', 403);
  const request = await CallRequest.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { status, decidedBy: req.user._id, decidedAt: new Date() }, { new: true });
  if (!request) {
    const existing = await CallRequest.findById(req.params.id);
    if (!existing) throw bad('Request not found.', 404);
    return { request: existing, already: true };
  }
  return { request, already: false };
}

export async function approveCall(req, res) {
  const { request, already } = await decide(req, 'approved');
  if (already) return res.json({ ok: true, status: request.status, already: true });
  const room = await TeamRoom.findById(request.room);
  const requester = await User.findById(request.requester).select('name');
  await settle(request._id, 'approved', req.user.name);
  let call = getCall(request.room);
  let started = false;
  if (!call && room && requester) {
    call = await launch(room, requester, req.user);
    started = Boolean(call);
  }
  if (requester && room) {
    await notify([requester._id], { type: 'call', title: 'Your call request was approved', body: `${started ? 'The call is live in' : 'Join the call in'} ${label(room)}`, href: `/chat?room=${room._id}${call ? `&call=${call.id}` : ''}`, data: { roomId: String(room._id), callId: call?.id ?? null } });
  }
  res.json({ ok: true, status: 'approved', started, call: shapeCall(call) });
}

export async function declineCall(req, res) {
  const { request, already } = await decide(req, 'declined');
  if (already) return res.json({ ok: true, status: request.status, already: true });
  const room = await TeamRoom.findById(request.room);
  await settle(request._id, 'declined', req.user.name);
  await notify([request.requester], { type: 'call', title: 'Your call request was declined', body: `${req.user.name} declined the call in ${room ? label(room) : 'that room'}`, href: `/chat?room=${request.room}`, data: { roomId: String(request.room) } });
  res.json({ ok: true, status: 'declined' });
}

export async function cancelCallRequest(req, res) {
  const request = await CallRequest.findOneAndUpdate({ _id: req.params.id, requester: req.user._id, status: 'pending' }, { status: 'cancelled', decidedAt: new Date() }, { new: true });
  if (request) await settle(request._id, 'cancelled', req.user.name);
  res.json({ ok: true, status: request?.status ?? 'cancelled' });
}

// Every call that's live in a room you're in (so the banners are right after a reload).
export async function myLiveCalls(req, res) {
  const rooms = (await RoomMember.find({ user: req.user._id }).select('room').lean()).map((m) => String(m.room));
  res.json(rooms.map((id) => getCall(id)).filter((c) => c && canSeeCall(c, req.user._id)).map(shapeCall));
}

export async function iceServersFor(req, res) {
  res.json({ iceServers: iceServers() });
}

// ---- re-pinging, and calls set for later ---------------------------------------------------------------------------------

const PING_EVERY_MS = 60_000;
const whenText = (d) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: process.env.APP_TIMEZONE || 'Africa/Lagos' });
export const callHeading = (call, room) => `${call.title ? `${call.title} — ` : ''}call is live in ${label(room)}`;

// An admin nudges the people in the room who haven't joined the call that is going on.
export async function pingCall(req, res) {
  if (!req.user.isAdmin) throw bad('Only an admin can do that.', 403);
  const room = await memberRoom(req.params.id, req.user._id);
  const call = getCall(room._id);
  if (!call) throw bad('There is no call going on in this room.', 409);
  const wait = PING_EVERY_MS - (Date.now() - call.lastPingAt);
  if (wait > 0) throw bad(`You just pinged everyone. Try again in ${Math.ceil(wait / 1000)} seconds.`, 429);
  const onIt = new Set([...call.participants.keys()].map(String));
  const targets = (await callAudience(call)).filter((id) => id !== String(req.user._id) && !onIt.has(id));
  call.lastPingAt = Date.now();
  await notify(targets, { type: 'call', title: callHeading(call, room), body: `${req.user.name} is asking you to join — tap to join`, href: `/chat?room=${room._id}&call=${call.id}`, data: { roomId: String(room._id), callId: call.id } });
  res.json({ pinged: targets.length });
}

const shapeScheduled = (s) => ({ id: String(s._id), roomId: String(s.room), title: s.title, startAt: s.startAt, status: s.status, invited: s.invited?.length ? s.invited.map(String) : undefined });

export async function listScheduledCalls(req, res) {
  const room = await memberRoom(req.params.id, req.user._id);
  const list = await ScheduledCall.find({ room: room._id, status: 'scheduled', startAt: { $gte: new Date(Date.now() - 60_000) } }).sort({ startAt: 1 }).limit(20).lean();
  // A call for chosen people is only listed to them (and whoever set it).
  const mine = String(req.user._id);
  res.json(list.filter((c) => !c.invited?.length || c.invited.some((id) => String(id) === mine) || String(c.createdBy) === mine).map(shapeScheduled));
}

export async function scheduleCall(req, res) {
  if (!req.user.isAdmin) throw bad('Only an admin can schedule a call.', 403);
  const room = await memberRoom(req.params.id, req.user._id);
  const startAt = new Date(req.body?.startAt);
  if (Number.isNaN(startAt.getTime())) throw bad('Pick a date and time.');
  if (startAt.getTime() < Date.now() + 60_000) throw bad('Pick a time at least a minute from now.');
  if (startAt.getTime() > Date.now() + 90 * 86400_000) throw bad('That is too far ahead (90 days at most).');
  const title = String(req.body?.title ?? '').trim().slice(0, 80);
  const invited = await cleanInvited(room._id, req.body?.invited, req.user._id);
  const item = await ScheduledCall.create({ room: room._id, title, startAt, createdBy: req.user._id, invited: invited ?? [] });
  const ids = (invited ?? (await roomMemberIds(room._id))).filter((id) => id !== String(req.user._id));
  await notify(ids, { type: 'call', title: `Call scheduled${title ? `: ${title}` : ''}`, body: `${label(room)} · ${whenText(startAt)}. It starts by itself and you'll get a ping.`, href: `/chat?room=${room._id}` });
  res.status(201).json(shapeScheduled(item));
}

export async function cancelScheduledCall(req, res) {
  if (!req.user.isAdmin) throw bad('Only an admin can cancel a call.', 403);
  const item = await ScheduledCall.findOneAndUpdate({ _id: req.params.id, status: 'scheduled' }, { status: 'cancelled' }, { new: true });
  if (!item) throw bad('That call is no longer scheduled.', 404);
  const room = await TeamRoom.findById(item.room);
  if (room) {
    const ids = (item.invited?.length ? item.invited.map(String) : await roomMemberIds(room._id)).filter((id) => id !== String(req.user._id));
    await notify(ids, { type: 'call', title: `Scheduled call cancelled${item.title ? `: ${item.title}` : ''}`, body: `${label(room)} · was ${whenText(item.startAt)}`, href: `/chat?room=${room._id}` });
  }
  res.json({ ok: true });
}
