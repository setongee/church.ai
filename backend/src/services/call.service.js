import { RoomMember } from '../models/TeamRoom.model.js';
import { emitToUsers } from './realtime.service.js';

// Live group calls. Media goes browser-to-browser (WebRTC); this only remembers who is in which room's call and
// relays the signalling. State is in memory - a call doesn't survive a server restart (and shouldn't).
const calls = new Map(); // roomId -> call
const EMPTY_GRACE_MS = 20_000; // a refresh or a brief drop shouldn't end the call

export const getCall = (roomId) => calls.get(String(roomId)) ?? null;

export function shapeCall(c) {
  return c
    ? {
        id: c.id,
        roomId: c.roomId,
        title: c.title || '',
        // Set when the call is only for some people in the room (their ids); absent when it is for everyone.
        invited: c.invited ?? undefined,
        host: c.host,
        startedAt: c.startedAt,
        participants: [...c.participants.values()].map((p) => ({ id: p.userId, name: p.name, muted: p.muted, video: p.video })),
      }
    : null;
}

export async function roomMemberIds(roomId) {
  return (await RoomMember.find({ room: roomId }).select('user').lean()).map((m) => String(m.user));
}

// `host` / `startedBy` are { id, name }. Returns the call, or null when one is already live in that room.
export function startCall(roomId, roomName, host, startedBy, title = '', invited = null) {
  const key = String(roomId);
  if (calls.has(key)) return null;
  const call = { id: `${key}-${Date.now().toString(36)}`, roomId: key, roomName, host, startedBy, title: String(title || '').trim().slice(0, 80), invited: invited?.length ? invited.map(String) : null, startedAt: new Date().toISOString(), participants: new Map(), timer: null, lastPingAt: 0 };
  calls.set(key, call);
  return call;
}

// A call is for everyone in the room, or only for the people it was started with (and its host).
export const canSeeCall = (call, userId) => !call.invited || call.invited.includes(String(userId)) || call.host.id === String(userId) || call.startedBy?.id === String(userId);

// Who is told about a call, and may join it.
export async function callAudience(call) {
  const members = await roomMemberIds(call.roomId);
  return call.invited ? members.filter((id) => canSeeCall(call, id)) : members;
}

export async function broadcastCall(roomId, event = 'call:update') {
  const c = getCall(roomId);
  if (!c) return;
  emitToUsers(await callAudience(c), event, { roomId: String(roomId), call: shapeCall(c) });
}

export async function endCall(roomId, reason = 'ended') {
  const key = String(roomId);
  const c = calls.get(key);
  if (!c) return null;
  if (c.timer) clearTimeout(c.timer);
  calls.delete(key);
  emitToUsers(await callAudience(c), 'call:ended', { roomId: key, callId: c.id, reason });
  return c;
}

// When the last person leaves, the call ends after a short grace period (cancelled if someone joins again).
export function scheduleEmptyEnd(roomId, graceMs = EMPTY_GRACE_MS) {
  const c = getCall(roomId);
  if (!c || c.participants.size) return;
  if (c.timer) clearTimeout(c.timer);
  c.timer = setTimeout(() => {
    const cur = getCall(roomId);
    if (cur && !cur.participants.size) void endCall(roomId, 'empty');
  }, graceMs);
}

// ICE servers for the browsers: public STUN always; a TURN relay too when TURN_URLS (comma-separated),
// TURN_USERNAME and TURN_CREDENTIAL are set. Without TURN, people behind strict firewalls or some mobile networks
// may not be able to connect to each other.
export function iceServers() {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const urls = (process.env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) servers.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return servers;
}
