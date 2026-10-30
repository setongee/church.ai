import { TeamRoom, RoomMember } from '../models/TeamRoom.model.js';
import { CallRequest } from '../models/CallRequest.model.js';
import { Notification } from '../models/Notification.model.js';
import { User } from '../models/User.model.js';
import { notify, shapeNotification } from '../services/notification.service.js';
import { emitToUsers } from '../services/realtime.service.js';
import { broadcastCall, getCall, iceServers, roomMemberIds, shapeCall, startCall } from '../services/call.service.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

async function memberRoom(roomId, userId) {
  const room = await TeamRoom.findById(roomId);
  if (!room) throw bad('Room not found.', 404);
  if (!(await RoomMember.exists({ room: room._id, user: userId }))) throw bad('Join this room first.', 403);
  return room;
}
const label = (room) => (room.kind === 'general' ? 'the Team room' : room.name);

// Starts the call, tells the room (live + notification/push). `host` and `by` are users ({ _id, name }).
async function launch(room, host, by, { skipNotify = [] } = {}) {
  const call = startCall(room._id, room.name, { id: String(host._id), name: host.name }, { id: String(by._id), name: by.name });
  if (!call) return null;
  const ids = await roomMemberIds(room._id);
  emitToUsers(ids, 'call:started', { roomId: String(room._id), call: shapeCall(call) });
  const skip = new Set([String(host._id), ...skipNotify.map(String)]);
  await notify(ids.filter((id) => !skip.has(id)), { type: 'call', title: `Call started in ${label(room)}`, body: `${host.name} started a group call — tap to join`, href: `/chat?room=${room._id}&call=${call.id}`, data: { roomId: String(room._id), callId: call.id } });
  return call;
}

// What the call button needs to know about a room right now.
export async function roomCall(req, res) {
  const room = await memberRoom(req.params.id, req.user._id);
  const mine = await CallRequest.findOne({ room: room._id, requester: req.user._id, status: 'pending' }).lean();
  res.json({ call: shapeCall(getCall(room._id)), myRequest: mine ? { id: String(mine._id), status: mine.status } : null });
}

// Admins start a call directly.
export async function startRoomCall(req, res) {
  if (!req.user.isAdmin) throw bad('Only an admin can start a call. Request one instead.', 403);
  const room = await memberRoom(req.params.id, req.user._id);
  const call = await launch(room, req.user, req.user);
  if (!call) throw bad('A call is already live in this room — join it.', 409);
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
  res.json(rooms.map((id) => shapeCall(getCall(id))).filter(Boolean));
}

export async function iceServersFor(req, res) {
  res.json({ iceServers: iceServers() });
}
