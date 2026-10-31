"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BellRing, CalendarClock, Check, Hash, Lock, LogOut, Pencil, Phone, PhoneCall, Send, Smile, SmilePlus, Sticker as StickerIcon, Trash2, Users, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { REACTION_EMOJI, cancelCallRequest, cancelScheduledCall, deleteMessage, editMessage, joinRoom, leaveRoom, listScheduledCalls, pingCall, reactTo, requestRoomCall, scheduleCall, roomCall, roomMembers, roomMessages, sendMessage, sendSticker, sendVoice, startRoomCall, voiceUrl, type ChatMessage, type Person, type Room } from "@/lib/chat";
import { flashElement } from "@/lib/deeplink";
import { useSearchParams } from "next/navigation";
import { rememberSticker } from "@/lib/stickers";
import { getSocket } from "@/lib/socket";
import { useChat } from "./ChatProvider";
import { CallDialog } from "./CallDialog";
import { useCached } from "@/lib/queries";
import { useCall } from "./CallProvider";
import { Sticker, StickerPicker } from "./Sticker";
import { MicButton, VoicePlayer, VoiceRecorder } from "./VoiceNote";
import { useChatSkin } from "@/lib/chatSkins";

const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayOf = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(Date.now() - 86400000);
  return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
};
// Emoji for the composer, grouped loosely: faces, hands & faith, then symbols.
const EMOJI_SET = ["😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤗", "🤔", "😅", "😢", "😭", "😮", "😴", "🙌", "👏", "👍", "👎", "🙏", "💪", "🤝", "👋", "✌️", "❤️", "💛", "💙", "🔥", "✨", "⭐", "🎉", "🎶", "🎤", "🎵", "📖", "✝️", "🕊️", "☀️", "🌟", "💡", "✅", "❌", "⚠️", "📌", "📣", "👀", "💯", "🚀"];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Message text with @tags highlighted.
function Body({ m, me }: { m: ChatMessage; me: string }) {
  const names = [...m.mentions.map((p) => p.name).filter(Boolean), ...(m.all ? ["all"] : [])];
  if (!names.length) return <>{m.text}</>;
  const re = new RegExp(`(@(?:${names.map(esc).join("|")}))`, "g");
  return (
    <>
      {m.text.split(re).map((part, i) => {
        if (!(part.startsWith("@") && names.some((n) => part === `@${n}`))) return <span key={i}>{part}</span>;
        const mine = part === "@all" || m.mentions.some((p) => p.id === me && part === `@${p.name}`);
        return (
          <span key={i} className={`rounded px-1 font-semibold ${mine ? "bg-orange-100 text-orange-800" : "bg-neutral-100 text-neutral-800"}`}>
            {part}
          </span>
        );
      })}
    </>
  );
}

// "Ada is typing…", "Ada and Ben are typing…", "Ada and 3 others are typing…". Space is kept for it so the page doesn't jump.
function TypingLine({ typers }: { typers: { id: string; name: string; since: number }[] }) {
  const sorted = [...typers].sort((a, b) => a.since - b.since);
  const first = sorted[0]?.name.split(" ")[0];
  const text = !sorted.length ? "" : sorted.length === 1 ? `${first} is typing` : sorted.length === 2 ? `${first} and ${sorted[1].name.split(" ")[0]} are typing` : `${first} and ${sorted.length - 1} others are typing`;
  return (
    <div className="mb-1.5 flex h-4 items-center gap-1.5 px-1 text-xs text-neutral-500" aria-live="polite">
      {text && (
        <>
          <span className="flex items-end gap-0.5" aria-hidden>
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
          <span className="truncate">{text}…</span>
        </>
      )}
    </div>
  );
}

// The chat: a list of rooms (team room + one per service) and the conversation in the open one.
export function ChatPanel({ initialRoomId }: { initialRoomId?: string | null }) {
  const { user } = useAuth();
  const skin = useChatSkin(); // a service wrapper's skin, else the person's own (Settings)
  const { rooms, refresh, markRead, setViewing, subscribe } = useChat();
  // The room being viewed: the one picked, else the one linked to (an alert, a URL), else the team room.
  const [picked, setPicked] = useState<string | null>(null);
  // On a phone only one pane fits: the room list, or the conversation (with a Back button).
  const [mobileThread, setMobileThread] = useState(Boolean(initialRoomId));
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [text, setText] = useState("");
  // Who else is typing in the open room: when they started, and when we last heard from them.
  const [typers, setTypers] = useState<{ id: string; name: string; since: number; seen: number }[]>([]);
  const lastTyping = useRef(0);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [picker, setPicker] = useState<string | null>(null); // message id with the reaction picker open
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null); // message id awaiting "delete?" confirmation
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [at, setAt] = useState<{ query: string } | null>(null);
  const [atIndex, setAtIndex] = useState(0);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [myReq, setMyReq] = useState<{ id: string; status: string } | null>(null); // my pending call request in this room
  const [callBusy, setCallBusy] = useState(false);
  const [callDialog, setCallDialog] = useState(false); // the admin's start-now / schedule dialog
  const [pingNote, setPingNote] = useState("");
  const [joinPrompt, setJoinPrompt] = useState<{ ended: boolean } | null>(null); // from a ?call= link
  const { calls, ready: callsReady, refreshCalls, session, join: joinCallSession, setMinimized } = useCall();
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);

  const activeId = picked ?? (initialRoomId && rooms.some((r) => r.id === initialRoomId) ? initialRoomId : (rooms[0]?.id ?? null));
  const room: Room | undefined = rooms.find((r) => r.id === activeId);
  const live = room ? calls[room.id] : undefined; // a call going on in this room
  const inThisCall = Boolean(room && session?.roomId === room.id);
  const pendingReq = live ? null : myReq;
  const { data: scheduled, reload: refreshScheduled } = useCached(["scheduled-calls", activeId], () => listScheduledCalls(activeId!), { enabled: Boolean(activeId && room?.joined), refetchInterval: 60_000 });

  // Load the open room.
  useEffect(() => {
    if (!activeId || !room?.joined) {
      setViewing(null);
      return;
    }
    let stale = false;
    setViewing(activeId);
    Promise.all([roomMessages(activeId), roomMembers(activeId)])
      .then(([m, p]) => {
        if (stale) return;
        setMsgs(m);
        setMembers(p);
        setError("");
        nearBottom.current = true;
        markRead(activeId);
      })
      .catch((e) => !stale && setError(e.message));
    return () => {
      stale = true;
      setViewing(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, room?.joined]);

  // Do I already have a call request waiting in this room?
  useEffect(() => {
    if (!activeId || !room?.joined) return;
    let stale = false;
    roomCall(activeId)
      .then((r) => !stale && setMyReq(r.myRequest))
      .catch(() => {});
    return () => {
      stale = true;
      setMyReq(null);
    };
  }, [activeId, room?.joined]);

  // Deep links: ?msg=<id> scrolls to that message and flashes it; ?call=<id> offers to join that call. They follow the URL,
  // so tapping a notification while this room is already open works too (it used to run only once per room).
  const params = useSearchParams();
  const msgParam = params.get("msg");
  const callParam = params.get("call");
  const msgDone = useRef("");
  const callDone = useRef("");
  const hasMsgs = msgs.length > 0;
  useEffect(() => {
    if (!msgParam || !activeId || !room?.joined || !hasMsgs) return;
    const key = `${activeId}:${msgParam}`;
    if (msgDone.current === key) return;
    msgDone.current = key;
    flashElement(`msg-${msgParam}`);
  }, [msgParam, activeId, room?.joined, hasMsgs]);
  useEffect(() => {
    if (!callParam || !activeId || !room?.joined || !callsReady) return;
    const key = `${activeId}:${callParam}`;
    if (callDone.current === key) return;
    callDone.current = key;
    // Look again first: the list on screen may be stale (the app was asleep), and "has ended" must be true.
    void refreshCalls().then((fresh) => setJoinPrompt({ ended: !(fresh ?? calls)[activeId] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callParam, activeId, room?.joined, callsReady]);

  // Live messages and reactions for the open room.
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === "message" && e.data.message.roomId === activeId) {
          setMsgs((m) => (m.some((x) => x.id === e.data.message.id) ? m : [...m, e.data.message]));
          if (document.visibilityState === "visible" && activeId) markRead(activeId);
        } else if (e.type === "reaction" && e.roomId === activeId) {
          setMsgs((m) => m.map((x) => (x.id === e.messageId ? { ...x, reactions: e.reactions } : x)));
        } else if (e.type === "edit" && e.message.roomId === activeId) {
          setMsgs((m) => m.map((x) => (x.id === e.message.id ? e.message : x)));
        } else if (e.type === "delete" && e.roomId === activeId) {
          setMsgs((m) => m.filter((x) => x.id !== e.messageId));
        }
      }),
    [subscribe, activeId, markRead],
  );

  useEffect(() => {
    if (nearBottom.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  // @ suggestions: "all" first, then people matching what's typed after the @.
  const suggestions = useMemo(() => {
    if (!at) return [];
    const q = at.query.toLowerCase();
    const people = members.filter((p) => p.id !== user?._id && p.name.toLowerCase().includes(q));
    const all = "all".startsWith(q) ? [{ id: "__all", name: "all" }] : [];
    return [...all, ...people].slice(0, 6);
  }, [at, members, user]);

  // Typing indicator: tell the room when I'm typing (at most every 3 s), and show who else is.
  const sendTyping = useCallback((roomId: string | null, typing: boolean) => {
    if (!roomId) return;
    getSocket().emit("chat:typing", { roomId, typing });
    lastTyping.current = typing ? Date.now() : 0;
  }, []);
  useEffect(() => {
    const socket = getSocket();
    const onTyping = (e: { roomId: string; user: { id: string; name: string }; typing: boolean }) => {
      if (e.roomId !== activeId || e.user.id === user?._id) return;
      setTypers((cur) => {
        const rest = cur.filter((t) => t.id !== e.user.id);
        if (!e.typing) return rest;
        const was = cur.find((t) => t.id === e.user.id);
        return [...rest, { id: e.user.id, name: e.user.name, since: was?.since ?? Date.now(), seen: Date.now() }];
      });
    };
    socket.on("chat:typing", onTyping);
    // Someone who closed the tab or lost signal never says they stopped: forget them after a few seconds of silence.
    const sweep = setInterval(() => setTypers((cur) => (cur.some((t) => Date.now() - t.seen > 6000) ? cur.filter((t) => Date.now() - t.seen <= 6000) : cur)), 1500);
    return () => {
      socket.off("chat:typing", onTyping);
      clearInterval(sweep);
      setTypers([]);
      if (lastTyping.current) sendTyping(activeId, false); // leaving the room (or the page) with half a message
    };
  }, [activeId, user?._id, sendTyping]);

  function onChange(v: string, caret: number) {
    setText(v);
    if (!v.trim()) {
      if (lastTyping.current) sendTyping(activeId, false);
    } else if (Date.now() - lastTyping.current > 3000) sendTyping(activeId, true);
    const m = /(?:^|\s)@([\p{L}\p{N} ]{0,24})$/u.exec(v.slice(0, caret));
    // A space is allowed in the query (names have them) but not two in a row or a trailing-space-only query.
    setAt(m && !/\s{2}/.test(m[1]) ? { query: m[1].trimStart() } : null);
    setAtIndex(0);
  }
  function pick(p: Person) {
    const el = input.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@[\p{L}\p{N} ]{0,24}$/u, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setAt(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }

  // Who a piece of text tags (people in the room whose @name appears, and @all).
  const tagsOf = useCallback((body: string) => ({ all: /(^|\s)@all\b/i.test(body), mentions: members.filter((p) => p.id !== user?._id && body.includes(`@${p.name}`)).map((p) => p.id) }), [members, user]);

  async function saveEdit() {
    if (!editing) return;
    const body = editing.text.trim();
    if (!body) return;
    try {
      const m = await editMessage(editing.id, { text: body, ...tagsOf(body) });
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? m : x)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save the edit");
    }
  }
  async function remove(id: string) {
    setDeleting(null);
    try {
      await deleteMessage(id);
      setMsgs((cur) => cur.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t delete it");
    }
  }
  // Drop an emoji into the message being written, at the cursor.
  function addEmoji(e: string) {
    const el = input.current;
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    setText(text.slice(0, at) + e + text.slice(end));
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
    });
  }

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setError("");
    try {
      const m = await sendMessage(activeId, { text: body, ...tagsOf(body) });
      setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      setText("");
      setAt(null);
      sendTyping(activeId, false);
      nearBottom.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send that");
    }
    setSending(false);
  }, [text, activeId, sending, tagsOf, sendTyping]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (at && suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setAtIndex((i) => (e.key === "ArrowDown" ? (i + 1) % suggestions.length : (i - 1 + suggestions.length) % suggestions.length));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(suggestions[atIndex]);
        return;
      }
      if (e.key === "Escape") return setAt(null);
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  async function react(m: ChatMessage, emoji: string) {
    setPicker(null);
    try {
      const r = await reactTo(m.id, emoji);
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, reactions: r.reactions } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t react");
    }
  }

  async function pickSticker(id: string) {
    setStickersOpen(false);
    if (!activeId) return;
    try {
      const m = await sendSticker(activeId, id);
      rememberSticker(id);
      setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      nearBottom.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send the sticker");
    }
  }
  async function sendRecording(blob: Blob) {
    if (!activeId) return;
    const m = await sendVoice(activeId, blob);
    setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
    nearBottom.current = true;
  }

  // Calls: admins start one; everyone else asks and waits for an admin.
  async function joinCall() {
    if (!room) return;
    setCallBusy(true);
    setJoinPrompt(null);
    const err = await joinCallSession(room.id, room.kind === "general" ? "Team room" : room.name);
    if (err) setError(err);
    setCallBusy(false);
  }
  async function startCall(title = "", invited?: string[]) {
    if (!room) return;
    setCallBusy(true);
    try {
      await startRoomCall(room.id, title, invited);
      await joinCall();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t start the call");
    }
    setCallBusy(false);
  }
  async function schedule(title: string, startAt: string, invited?: string[]) {
    if (!room) return;
    await scheduleCall(room.id, { title, startAt, invited });
    await refreshScheduled();
  }
  // An admin nudging the people in the room who haven't joined.
  async function ping() {
    if (!room) return;
    setPingNote("Pinging…");
    try {
      const { pinged } = await pingCall(room.id);
      setPingNote(pinged ? `Pinged ${pinged} ${pinged === 1 ? "person" : "people"}` : "Everyone is already on the call");
    } catch (e) {
      setPingNote(e instanceof Error ? e.message : "Couldn’t ping");
    }
    setTimeout(() => setPingNote(""), 6000);
  }
  async function askForCall() {
    if (!room) return;
    setCallBusy(true);
    try {
      setMyReq((await requestRoomCall(room.id)).request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send the request");
    }
    setCallBusy(false);
  }

  async function join() {
    if (!activeId) return;
    await joinRoom(activeId).catch(() => {});
    await refresh();
  }

  const me = user?._id ?? "";
  const newDay = msgs.map((m, i) => i === 0 || dayOf(m.createdAt) !== dayOf(msgs[i - 1].createdAt));
  return (
    <div data-chat-skin={skin} className="grid h-full min-h-0 gap-4 md:grid-cols-[17rem_1fr]">
      {/* Rooms */}
      <aside className={`min-h-0 flex-col overflow-hidden rounded-2xl bg-white md:flex ${mobileThread ? "hidden" : "flex"}`}>
        <p className="px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-widest text-neutral-400">Rooms</p>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {rooms.map((r) => (
            <li key={r.id}>
              <button onClick={() => (setPicked(r.id), setMobileThread(true))} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${r.id === activeId ? "bg-orange-50" : "hover:bg-neutral-50"}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${r.id === activeId ? "bg-orange-100 text-orange-700" : "bg-neutral-100 text-neutral-500"}`}>
                  {r.kind === "general" ? <Users size={15} /> : <Hash size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${r.unread ? "font-bold text-neutral-900" : "font-medium text-neutral-800"}`}>{r.kind === "general" ? "Team room" : r.name}</span>
                  <span className="block truncate text-xs text-neutral-400">{r.joined ? (r.last ? `${r.last.author}: ${r.last.text}` : "No messages yet") : `Service room · ${r.members} in it`}</span>
                </span>
                {r.joined && r.unread > 0 && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-[#ffffff] ${r.mentioned ? "bg-orange-600" : "bg-[#404040]"}`}>{r.mentioned ? `@${r.unread}` : r.unread}</span>}
                {!r.joined && <span className="text-[11px] font-semibold text-orange-600">Join</span>}
              </button>
            </li>
          ))}
          {rooms.length === 0 && <li className="px-3 py-4 text-sm text-neutral-400">Loading rooms…</li>}
        </ul>
      </aside>

      {/* Conversation */}
      <section className={`min-h-0 flex-col overflow-hidden rounded-2xl bg-white md:flex ${mobileThread ? "flex" : "hidden"}`}>
        {!room ? (
          <p className="m-auto text-sm text-neutral-400">Pick a room.</p>
        ) : !room.joined ? (
          <div className="m-auto max-w-sm px-6 text-center">
            <button onClick={() => setMobileThread(false)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 md:hidden">
              <ArrowLeft size={15} /> All rooms
            </button>
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-600">
              <Hash size={22} />
            </span>
            <h2 className="text-lg font-semibold text-neutral-900">{room.name}</h2>
            <p className="mt-1 text-sm text-neutral-500">The room for this service. {room.members} {room.members === 1 ? "person is" : "people are"} in it. Join to read and chat.</p>
            <button onClick={join} className="mt-4 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
              Join room
            </button>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-neutral-100 px-3 py-3 sm:px-5">
              <button onClick={() => setMobileThread(false)} aria-label="Back to rooms" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 md:hidden">
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-neutral-900">{room.kind === "general" ? "Team room" : room.name}</h2>
                <p className="text-xs text-neutral-500">{members.length || room.members} {(members.length || room.members) === 1 ? "member" : "members"} · type @ to tag someone, @all for everyone</p>
              </div>
              {!live && !inThisCall && (user?.isAdmin ? (
                <button onClick={() => setCallDialog(true)} disabled={callBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-[#16a34a] px-3 py-1.5 text-xs font-semibold text-[#16a34a] hover:bg-[#16a34a] hover:text-[#ffffff] disabled:opacity-50">
                  <Phone size={14} /> Start call
                </button>
              ) : pendingReq ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600">
                  Request sent
                  <button
                    onClick={async () => {
                      const id = pendingReq.id;
                      setMyReq(null);
                      await cancelCallRequest(id).catch(() => {});
                    }}
                    className="font-semibold text-neutral-500 underline hover:text-red-600"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => void askForCall()} disabled={callBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-[#16a34a] hover:text-[#16a34a] disabled:opacity-50">
                  <Phone size={14} /> Request call
                </button>
              ))}
              {room.kind === "service" && (
                <button
                  onClick={async () => {
                    await leaveRoom(room.id).catch(() => {});
                    await refresh();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
                >
                  <LogOut size={14} /> Leave
                </button>
              )}
            </header>

            {(scheduled ?? []).length > 0 && (
              <ul className="divide-y divide-neutral-100 border-b border-neutral-100 bg-neutral-50">
                {(scheduled ?? []).map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-xs text-neutral-600 sm:px-5">
                    <CalendarClock size={14} className="shrink-0 text-orange-600" />
                    <span className="min-w-0 flex-1 truncate">
                      <b className="text-neutral-900">{c.title || "Group call"}</b>{c.invited ? ` · private (${c.invited.length + 1} people)` : ""} · {new Date(c.startAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · starts by itself
                    </span>
                    {user?.isAdmin && (
                      <button
                        onClick={async () => {
                          if (!window.confirm("Cancel this scheduled call? Everyone in the room is told.")) return;
                          await cancelScheduledCall(c.id).catch((e) => setError(e instanceof Error ? e.message : "Couldn’t cancel"));
                          await refreshScheduled();
                        }}
                        className="shrink-0 font-semibold text-neutral-500 underline hover:text-red-600"
                      >
                        Cancel
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {live && (
              <div className="flex items-center gap-3 bg-[#16a34a] px-3 py-2.5 text-[#ffffff] sm:px-5" role="status">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ffffff] opacity-70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ffffff]" />
                </span>
                <p className="min-w-0 flex-1 truncate text-sm">
                  <b>{live.title || "Call in progress"}</b>
                  {live.invited && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[rgba(255,255,255,0.2)] px-2 py-0.5 text-[11px] font-semibold"><Lock size={11} /> Private · {live.invited.length + 1} people</span>}
                  <span className="opacity-90"> · {live.participants.length ? `${live.participants.slice(0, 3).map((p) => p.name).join(", ")}${live.participants.length > 3 ? ` +${live.participants.length - 3}` : ""}` : `${live.host.name} is starting it`}</span>
                </p>
                {user?.isAdmin && (
                  <button onClick={() => void ping()} disabled={pingNote === "Pinging…"} title="Ping the people in this room who haven’t joined" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.6)] px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-[rgba(255,255,255,0.15)] disabled:opacity-50">
                    <BellRing size={14} /> {pingNote || "Ping others"}
                  </button>
                )}
                {inThisCall ? (
                  <button onClick={() => setMinimized(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#ffffff] px-3.5 py-1.5 text-xs font-semibold text-[#166534] hover:bg-[#dcfce7]">
                    <PhoneCall size={14} /> Open call
                  </button>
                ) : (
                  <button onClick={() => void joinCall()} disabled={callBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#ffffff] px-3.5 py-1.5 text-xs font-semibold text-[#166534] hover:bg-[#dcfce7] disabled:opacity-50">
                    <PhoneCall size={14} /> Join call
                  </button>
                )}
              </div>
            )}

            <div
              ref={scroller}
              onScroll={() => {
                const el = scroller.current;
                if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-5"
            >
              {msgs.length === 0 && <p className="py-12 text-center text-sm text-neutral-400">No messages yet. Say hello 👋</p>}
              {msgs.map((m, i) => {
                const prev = msgs[i - 1];
                const day = dayOf(m.createdAt);
                const showDay = newDay[i];
                const grouped = !showDay && prev && prev.author.id === m.author.id && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60000;
                const mine = m.author.id === me;
                const tagged = !mine && (m.all || m.mentions.some((p) => p.id === me));
                return (
                  <div key={m.id}>
                    {showDay && (
                      <p className="my-3 text-center text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{day}</p>
                    )}
                    <div id={`msg-${m.id}`} className={`group relative flex gap-3 rounded-xl px-2 py-1 ${mine ? "flex-row-reverse" : ""} ${tagged ? "bg-orange-50/70" : "hover:bg-neutral-50"}`}>
                      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${grouped ? "invisible" : mine ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-200 text-neutral-700"}`}>{initials(m.author.name)}</span>
                      <div className={`min-w-0 flex-1 ${mine ? "text-right" : ""}`}>
                        {!grouped && (
                          <p className="text-sm">
                            <span className="font-semibold text-neutral-900">{mine ? "You" : m.author.name}</span>
                            <span className="ml-2 text-xs text-neutral-400">{timeOf(m.createdAt)}</span>
                          </p>
                        )}
                        {editing?.id === m.id ? (
                          <div className="mt-1">
                            <textarea
                              autoFocus
                              value={editing.text}
                              onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), void saveEdit());
                                else if (e.key === "Escape") setEditing(null);
                              }}
                              rows={Math.min(6, editing.text.split("\n").length + 1)}
                              className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[15px] outline-none focus:border-neutral-900"
                            />
                            <div className="mt-1.5 flex items-center gap-2 text-xs">
                              <button onClick={() => void saveEdit()} disabled={!editing.text.trim()} className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1 font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-40">
                                <Check size={13} /> Save
                              </button>
                              <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium text-neutral-500 hover:bg-neutral-100">
                                <X size={13} /> Cancel
                              </button>
                              <span className="text-neutral-400">Enter to save · Esc to cancel</span>
                            </div>
                          </div>
                        ) : (
                          m.kind === "sticker" && m.sticker ? (
                            <div className={`mt-1 flex ${mine ? "justify-end" : ""}`}>
                              <Sticker id={m.sticker} size={132} />
                            </div>
                          ) : m.kind === "voice" ? (
                            <div className={`mt-1 flex ${mine ? "justify-end" : ""}`}>
                              <VoicePlayer src={voiceUrl(m)} durationSec={m.durationSec ?? 0} seed={m.id} mine={mine} />
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-800">
                              <Body m={m} me={me} />
                              {m.editedAt && <span className="ml-1.5 text-[11px] text-neutral-400">(edited)</span>}
                            </p>
                          )
                        )}
                        {deleting === m.id && (
                          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-800">
                            Delete this message for everyone?
                            <button onClick={() => void remove(m.id)} className="rounded-md bg-red-600 px-2 py-0.5 font-semibold text-[#ffffff] hover:bg-red-700">
                              Delete
                            </button>
                            <button onClick={() => setDeleting(null)} className="font-medium underline">
                              Cancel
                            </button>
                          </div>
                        )}
                        {m.reactions.length > 0 && (
                          <div className={`mt-1 flex flex-wrap gap-1.5 ${mine ? "justify-end" : ""}`}>
                            {m.reactions.map((r) => {
                              const iReacted = r.users.includes(me);
                              return (
                                <button key={r.emoji} onClick={() => react(m, r.emoji)} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${iReacted ? "border-orange-300 bg-orange-50 text-orange-800" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"}`}>
                                  <span>{r.emoji}</span>
                                  <span className="font-semibold tabular-nums">{r.users.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {editing?.id !== m.id && (
                        <div className={`absolute -top-3 ${mine ? "left-3" : "right-3"} hidden gap-1 rounded-lg border border-neutral-200 bg-white p-0.5 group-hover:flex`}>
                          <button onClick={() => setPicker(picker === m.id ? null : m.id)} aria-label="Add a reaction" title="React" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-orange-600">
                            <SmilePlus size={15} />
                          </button>
                          {mine && (!m.kind || m.kind === "text") && (
                            <button onClick={() => (setDeleting(null), setEditing({ id: m.id, text: m.text }))} aria-label="Edit message" title="Edit" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-orange-600">
                              <Pencil size={15} />
                            </button>
                          )}
                          {(mine || user?.isAdmin) && (
                            <button onClick={() => (setEditing(null), setDeleting(m.id))} aria-label="Delete message" title="Delete" className="rounded-md p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      )}
                      {picker === m.id && (
                        <div className={`absolute ${mine ? "left-3" : "right-3"} top-3 z-10 flex gap-0.5 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg`}>
                          {REACTION_EMOJI.map((e) => (
                            <button key={e} onClick={() => react(m, e)} className="rounded-lg px-1.5 py-1 text-lg hover:bg-neutral-100">
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottom} />
            </div>

            <footer className="relative border-t border-neutral-100 p-3">
              <TypingLine typers={typers} />
              {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>}
              {at && suggestions.length > 0 && (
                <ul className="absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl">
                  {suggestions.map((p, i) => (
                    <li key={p.id}>
                      <button onMouseDown={(e) => (e.preventDefault(), pick(p))} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${i === atIndex ? "bg-orange-50 text-orange-800" : "text-neutral-700 hover:bg-neutral-50"}`}>
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-700">{p.id === "__all" ? "@" : initials(p.name)}</span>
                        <span className="font-medium">{p.id === "__all" ? "all" : p.name}</span>
                        {p.id === "__all" && <span className="text-xs text-neutral-400">notify everyone in this room</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {emojiOpen && (
                <div className="absolute bottom-full right-14 z-20 mb-1 grid w-72 grid-cols-8 gap-0.5 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl">
                  {EMOJI_SET.map((e) => (
                    <button key={e} onMouseDown={(ev) => ev.preventDefault()} onClick={() => addEmoji(e)} className="rounded-lg p-1 text-xl hover:bg-neutral-100">
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {stickersOpen && <StickerPicker onPick={(id) => void pickSticker(id)} onClose={() => setStickersOpen(false)} />}
              {recording ? (
                <VoiceRecorder onSend={sendRecording} onCancel={() => setRecording(false)} onError={setError} />
              ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={input}
                  value={text}
                  onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={`Message ${room.kind === "general" ? "the team" : room.name}…`}
                  className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-neutral-900"
                />
                <button onClick={() => (setStickersOpen(false), setEmojiOpen((o) => !o))} aria-label="Add an emoji" aria-pressed={emojiOpen} className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${emojiOpen ? "border-orange-300 bg-orange-50 text-orange-600" : "border-neutral-200 text-neutral-500 hover:text-orange-600"}`}>
                  <Smile size={18} />
                </button>
                <button onClick={() => (setEmojiOpen(false), setStickersOpen((o) => !o))} aria-label="Send a sticker" aria-pressed={stickersOpen} title="Stickers" className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${stickersOpen ? "border-orange-300 bg-orange-50 text-orange-600" : "border-neutral-200 text-neutral-500 hover:text-orange-600"}`}>
                  <StickerIcon size={18} />
                </button>
                {text.trim() ? (
                  <button onClick={() => void send()} disabled={sending} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-600 text-[#ffffff] hover:bg-orange-700 disabled:opacity-40">
                    <Send size={17} />
                  </button>
                ) : (
                  <MicButton onClick={() => (setError(""), setEmojiOpen(false), setStickersOpen(false), setRecording(true))} />
                )}
              </div>
              )}
            </footer>
          </>
        )}
      </section>

      {callDialog && room && <CallDialog roomName={room.kind === "general" ? "the Team room" : room.name} members={members} meId={user?._id} onStart={startCall} onSchedule={schedule} onClose={() => setCallDialog(false)} />}

      {joinPrompt && room && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(0,0,0,0.5)] p-4" onMouseDown={() => setJoinPrompt(null)}>
          <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Join the call" className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#16a34a] text-[#ffffff]">
              <PhoneCall size={22} />
            </span>
            {joinPrompt.ended || !live ? (
              <>
                <h3 className="text-base font-semibold text-neutral-900">That call has ended</h3>
                <p className="mt-1 text-sm text-neutral-500">Nobody is on it any more.</p>
                <button onClick={() => setJoinPrompt(null)} className="mt-5 rounded-xl border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                  Close
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-neutral-900">Join the call in {room.kind === "general" ? "the Team room" : room.name}?</h3>
                <p className="mt-1 text-sm text-neutral-500">{live.host.name} is hosting · {live.participants.length} on it now. Your microphone will turn on.</p>
                <div className="mt-5 flex justify-center gap-2">
                  <button onClick={() => setJoinPrompt(null)} className="rounded-xl border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                    Not now
                  </button>
                  <button onClick={() => void joinCall()} className="rounded-xl bg-[#16a34a] px-5 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-[#15803d]">
                    Join call
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
