// Offline mode: Present on its own, with no sign-in. For a machine with no internet (a hall with no wifi, a desktop app
// carried to a venue) the person picks "Use in offline mode"; the app then shows only Present, running from the copy kept on
// the device. They work as a Presenter would: everything they make is kept on this device (see lib/draft.ts). Going back
// online drops the mode and the app works the normal way, signed in, with every page.
import type { AuthUser } from "./auth";

const KEY = "fafc-offline-mode";

export const OFFLINE_USER: AuthUser = { _id: "offline-user", name: "Offline mode", email: "", isAdmin: false, roles: ["presenter"], active: true };

let active = false; // the app is in offline mode right now (set by AuthProvider; read by code outside React)
export const offlineModeActive = () => active;
export const setOfflineModeActive = (on: boolean) => {
  active = on;
};

export const wantsOfflineMode = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
export const rememberOfflineMode = (on: boolean) => {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
};
