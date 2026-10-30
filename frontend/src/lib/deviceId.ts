// A secret id this browser keeps (one per browser profile / the desktop app). It is what ties a presenter to the one
// device running it: the server only lets a connection that presents this id drive that presenter, so no other
// device or account - an admin included - can end the service, take it offline or change what's on screen. It never
// goes in a URL; output screens use a public id the server derives from it.
const KEY = "present-device-id";
let cached = "";

export function getDeviceId(): string {
  if (cached) return cached;
  try {
    let id = localStorage.getItem(KEY) || "";
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("")).replace(/[^A-Za-z0-9_-]/g, "");
      localStorage.setItem(KEY, id);
    }
    cached = id;
  } catch {
    // Storage blocked: this tab still gets an id (it just won't survive a reload).
    cached = `tmp-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
  return cached;
}
