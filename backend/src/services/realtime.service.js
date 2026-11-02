// Lets HTTP controllers reach the socket server (to drop a user's live connections when they sign out).
let io = null;

export const setIo = (instance) => {
  io = instance;
};

export const userRoom = (userId) => `user:${userId}`;

// True while the person has the app open somewhere (a connected socket).
export function isOnline(userId) {
  return (io?.sockets.adapter.rooms.get(userRoom(userId))?.size ?? 0) > 0;
}

export function disconnectUser(userId) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}

// Someone signed in on a new device: every connection of theirs that doesn't carry the new token is told why (`session:replaced`)
// and closed a moment later, so the message gets through first. The new device's own connection is left alone.
export async function replaceSessions(userId, newToken, payload) {
  if (!io) return;
  const old = (await io.in(userRoom(userId)).fetchSockets()).filter((s) => s.data?.token !== newToken);
  for (const s of old) s.emit('session:replaced', payload);
  setTimeout(() => old.forEach((s) => s.disconnect(true)), 700).unref?.();
}

// Send an event to specific people (each person's sockets are in their own room).
export function emitToUsers(userIds, event, payload) {
  if (!io) return;
  for (const id of new Set(userIds.map(String))) io.to(userRoom(id)).emit(event, payload);
}

// Every signed-in connection joins this room (used for light "something changed, refresh" nudges, e.g. the task board).
export const AUTHED_ROOM = 'authed';
export function emitToAuthed(event, payload) {
  io?.to(AUTHED_ROOM).emit(event, payload);
}

// Admins and service managers join this room, to watch the live activity feed.
export const STAFF_ROOM = 'staff';
export function emitToStaff(event, payload) {
  io?.to(STAFF_ROOM).emit(event, payload);
}
