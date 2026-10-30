import { authHeaders, handleUnauthorized } from "./auth";
import { assetUrl } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export interface Room {
  id: string;
  kind: "general" | "service";
  name: string;
  serviceId: string | null;
  date: string | null;
  joined: boolean;
  unread: number;
  mentioned: boolean;
  members: number;
  last: { text: string; author: string; at: string } | null;
}
export interface Person {
  id: string;
  name: string;
}
export interface Reaction {
  emoji: string;
  users: string[];
}
export type MessageKind = "text" | "sticker" | "voice";
export interface ChatMessage {
  id: string;
  roomId: string;
  author: Person;
  kind?: MessageKind; // older messages have none: they're text
  text: string;
  preview?: string; // how it reads in lists and alerts (e.g. "Sticker: Amen!", "Voice note (0:23)")
  sticker?: string;
  audioUrl?: string;
  durationSec?: number;
  mentions: Person[];
  all: boolean;
  reactions: Reaction[];
  createdAt: string;
  editedAt?: string | null;
}
// Pushed over the socket whenever a message lands in a room you're in.
export interface IncomingMessage {
  message: ChatMessage;
  roomName: string;
  roomKind: "general" | "service";
  mentioned: boolean;
}

export const REACTION_EMOJI = ["👍", "❤️", "🙏", "😂", "🔥", "✅", "👀", "🎉"];

export const listRooms = () => req<Room[]>("/api/chat/rooms");
export const joinRoom = (id: string) => req<{ ok: boolean }>(`/api/chat/rooms/${id}/join`, { method: "POST" });
export const leaveRoom = (id: string) => req<{ ok: boolean }>(`/api/chat/rooms/${id}/leave`, { method: "POST" });
export const markRoomRead = (id: string) => req<{ ok: boolean }>(`/api/chat/rooms/${id}/read`, { method: "POST" });
export const roomMembers = (id: string) => req<Person[]>(`/api/chat/rooms/${id}/members`);
export const roomMessages = (id: string, before?: string) => req<ChatMessage[]>(`/api/chat/rooms/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`);
export const sendMessage = (id: string, body: { text: string; mentions: string[]; all: boolean }) => req<ChatMessage>(`/api/chat/rooms/${id}/messages`, { method: "POST", body: JSON.stringify(body) });
export const reactTo = (messageId: string, emoji: string) => req<{ reactions: Reaction[] }>(`/api/chat/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) });

// ---- live activity (admins and service managers) ---------------------------------------------------

export type ActivityRange = "live" | "1h" | "today" | "7d";
export interface ActivityEvent {
  id: string;
  actor: string | null;
  actorName: string;
  kind: string;
  text: string;
  href: string;
  entityType: string;
  count: number;
  at: string;
}
export interface ActivityFeed {
  live: { scheduleName: string; startedAt: string } | null;
  range: ActivityRange;
  since: string;
  events: ActivityEvent[];
  team: { id: string; name: string; online: boolean; last: { text: string; at: string; count: number } | null }[];
}
export const activityFeed = (range: ActivityRange | "", actor = "", kind = "") => req<ActivityFeed>(`/api/activity?${new URLSearchParams({ ...(range && { range }), ...(actor && { actor }), ...(kind && { kind }) })}`);

export const editMessage = (id: string, body: { text: string; mentions: string[]; all: boolean }) => req<ChatMessage>(`/api/chat/messages/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteMessage = (id: string) => req<{ ok: boolean }>(`/api/chat/messages/${id}`, { method: "DELETE" });

// ---- stickers, voice notes ------------------------------------------------------------------------

export const previewOf = (m: Pick<ChatMessage, "preview" | "text">) => m.preview || m.text;
export const sendSticker = (roomId: string, sticker: string) => req<ChatMessage>(`/api/chat/rooms/${roomId}/messages`, { method: "POST", body: JSON.stringify({ kind: "sticker", sticker }) });
export const voiceUrl = (m: ChatMessage) => assetUrl(m.audioUrl ?? "");

// A recording goes up as multipart (the server converts it to a format every device plays).
export async function sendVoice(roomId: string, blob: Blob): Promise<ChatMessage> {
  const form = new FormData();
  form.set("audio", blob, `voice.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
  const res = await fetch(`${API_URL}/api/chat/rooms/${roomId}/voice`, { method: "POST", headers: authHeaders(), body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Couldn’t send the voice note (${res.status})`);
  }
  return body as ChatMessage;
}

// ---- group calls ----------------------------------------------------------------------------------

export interface CallParticipant {
  id: string;
  name: string;
  muted?: boolean;
  video?: boolean;
}
export interface CallInfo {
  id: string;
  roomId: string;
  title?: string;
  invited?: string[]; // set when the call is only for the people it was started with
  host: { id: string; name: string };
  startedAt: string;
  participants: CallParticipant[];
}
export const liveCalls = () => req<CallInfo[]>("/api/chat/calls");
export const roomCall = (roomId: string) => req<{ call: CallInfo | null; myRequest: { id: string; status: string } | null }>(`/api/chat/rooms/${roomId}/call`);
// `invited` leaves out the people who aren't asked; omit it to call everyone in the room.
export const startRoomCall = (roomId: string, title = "", invited?: string[]) => req<{ call: CallInfo }>(`/api/chat/rooms/${roomId}/call`, { method: "POST", body: JSON.stringify({ title, invited }) });
// An admin nudges the people in the room who haven't joined the call that is going on.
export const pingCall = (roomId: string) => req<{ pinged: number }>(`/api/chat/rooms/${roomId}/call/ping`, { method: "POST" });
export interface ScheduledCall {
  id: string;
  roomId: string;
  title: string;
  startAt: string;
  invited?: string[];
}
export const listScheduledCalls = (roomId: string) => req<ScheduledCall[]>(`/api/chat/rooms/${roomId}/scheduled-calls`);
export const scheduleCall = (roomId: string, input: { title: string; startAt: string; invited?: string[] }) => req<ScheduledCall>(`/api/chat/rooms/${roomId}/scheduled-calls`, { method: "POST", body: JSON.stringify(input) });
export const cancelScheduledCall = (id: string) => req<{ ok: boolean }>(`/api/chat/scheduled-calls/${id}`, { method: "DELETE" });
export const requestRoomCall = (roomId: string) => req<{ request: { id: string; status: string } }>(`/api/chat/rooms/${roomId}/call-requests`, { method: "POST" });
export const approveCallRequest = (id: string) => req<{ ok: boolean; status: string; started?: boolean; already?: boolean }>(`/api/chat/call-requests/${id}/approve`, { method: "POST" });
export const declineCallRequest = (id: string) => req<{ ok: boolean; status: string; already?: boolean }>(`/api/chat/call-requests/${id}/decline`, { method: "POST" });
export const cancelCallRequest = (id: string) => req<{ ok: boolean }>(`/api/chat/call-requests/${id}/cancel`, { method: "POST" });
export const callIceServers = () => req<{ iceServers: RTCIceServer[] }>("/api/chat/ice-servers");
