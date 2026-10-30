"use client";

import { useSyncExternalStore } from "react";

// Looks for the team chat. The CSS for each lives in globals.css ([data-chat-skin="..."]): a skin re-points the same
// palette variables the colour themes use, so every bubble, badge and button inside the chat follows it.
export type ChatSkinId = "default" | "warm" | "midnight" | "forest" | "ocean" | "rose";
export const CHAT_SKINS: { id: ChatSkinId; label: string; hint: string; bg: string; ink: string; accent: string }[] = [
  { id: "default", label: "Default", hint: "Follows the app", bg: "#ffffff", ink: "#171717", accent: "#c74b0a" },
  { id: "warm", label: "Warm", hint: "Cream and amber", bg: "#fff6e6", ink: "#451a03", accent: "#b45309" },
  { id: "midnight", label: "Midnight", hint: "Deep navy and indigo", bg: "#0f1424", ink: "#e0e7ff", accent: "#6366f1" },
  { id: "forest", label: "Forest", hint: "Calm greens", bg: "#ecfdf5", ink: "#022c22", accent: "#048059" },
  { id: "ocean", label: "Ocean", hint: "Clear blues", bg: "#eff6ff", ink: "#172554", accent: "#2563eb" },
  { id: "rose", label: "Rose", hint: "Soft pinks", bg: "#fff1f2", ink: "#4c0519", accent: "#be123c" },
];
export const isChatSkin = (v: unknown): v is ChatSkinId => CHAT_SKINS.some((s) => s.id === v);

const PERSONAL = "chat-skin"; // a person's own choice (Settings), kept in this browser
const WRAPPER = "chat-skin-wrapper"; // the active service wrapper's choice (wins while the service runs)
const read = (key: string): ChatSkinId | "" => {
  try {
    const v = (key === WRAPPER ? sessionStorage : localStorage).getItem(key);
    return isChatSkin(v) ? v : "";
  } catch {
    return "";
  }
};
const write = (key: string, v: string) => {
  try {
    const store = key === WRAPPER ? sessionStorage : localStorage;
    if (v) store.setItem(key, v);
    else store.removeItem(key);
  } catch {}
};

let personal: ChatSkinId | "" | null = null;
let wrapper: ChatSkinId | "" | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const effective = (): ChatSkinId => {
  personal ??= typeof window === "undefined" ? "" : read(PERSONAL);
  wrapper ??= typeof window === "undefined" ? "" : read(WRAPPER);
  return (wrapper || personal || "default") as ChatSkinId;
};

export const setPersonalChatSkin = (id: ChatSkinId) => {
  personal = id === "default" ? "" : id;
  write(PERSONAL, personal);
  emit();
};
export const getPersonalChatSkin = (): ChatSkinId => {
  personal ??= typeof window === "undefined" ? "" : read(PERSONAL);
  return (personal || "default") as ChatSkinId;
};
// A service wrapper's chat skin: used instead of the person's own while the wrapper is active ("" to stop).
export const setWrapperChatSkin = (id: string) => {
  wrapper = isChatSkin(id) && id !== "default" ? id : "";
  write(WRAPPER, wrapper);
  emit();
};

// The skin the chat should wear right now.
export const useChatSkin = () => useSyncExternalStore(subscribe, effective, () => "default" as ChatSkinId);
// Just the person's own choice (for the Settings picker).
export const usePersonalChatSkin = () => useSyncExternalStore(subscribe, getPersonalChatSkin, () => "default" as ChatSkinId);
