import type { Highlight, SmartResult } from "./present";

// Where the Scripture tab was: the books/chapters/verses on each side, the search, the highlights, whether it was
// split. Kept outside the component (and in sessionStorage, so a reload keeps it too) so it survives switching tabs
// and visiting other pages while a service is running. It is dropped when the service ends. A fresh start opens at
// Genesis 1:1.
export interface Range {
  from: number;
  to: number;
}
export interface SideMemory {
  book: number;
  chapter: number;
  sel: Range | null;
}
export interface ScriptureMemory {
  a: SideMemory;
  b: SideMemory;
  split: boolean; // two scriptures side by side
  versionB: string;
  linked: boolean;
  focus: "a" | "b";
  q: string;
  results: Extract<SmartResult, { type: "smart" }> | null;
  hlA: { key: string; list: Highlight[] };
  hlB: { key: string; list: Highlight[] };
  hlColor: string;
}

const KEY = "present-scripture-memory";
const start = (): SideMemory => ({ book: 1, chapter: 1, sel: { from: 1, to: 1 } });
const fresh = (): ScriptureMemory => ({ a: start(), b: start(), split: false, versionB: "", linked: true, focus: "a", q: "", results: null, hlA: { key: "", list: [] }, hlB: { key: "", list: [] }, hlColor: "" });

let mem: ScriptureMemory | null = null;

export function getScriptureMemory(): ScriptureMemory {
  if (mem) return mem;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) mem = { ...fresh(), ...JSON.parse(raw) };
  } catch {}
  return (mem ??= fresh());
}

export function rememberScripture(patch: Partial<ScriptureMemory>) {
  mem = { ...getScriptureMemory(), ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(mem));
  } catch {}
}

export function forgetScripture() {
  mem = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
