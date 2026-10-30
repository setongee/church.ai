// The built-in stickers: big emoji on a coloured, die-cut badge with a short caption, drawn in code (no image files).
// The ids are what chat stores; backend/src/services/stickers.js holds the same id -> caption list (keep them in step).
export type StickerShape = "circle" | "squircle" | "burst";
export interface StickerDef {
  id: string;
  emoji: string;
  label: string;
  pack: "church" | "team" | "reactions";
  from: string;
  to: string;
  shape: StickerShape;
}

export const STICKER_PACKS: { id: StickerDef["pack"]; label: string; icon: string }[] = [
  { id: "church", label: "Church", icon: "🙏" },
  { id: "team", label: "Team work", icon: "🛠️" },
  { id: "reactions", label: "Reactions", icon: "😂" },
];

// [id, emoji, caption, pack, gradient from, gradient to, shape]
const RAW: [string, string, string, StickerDef["pack"], string, string, StickerShape][] = [
  ["amen", "🙏", "Amen!", "church", "#fbbf24", "#f97316", "circle"],
  ["praise", "🙌", "Praise God!", "church", "#fb923c", "#e11d48", "burst"],
  ["hallelujah", "🎺", "Hallelujah!", "church", "#facc15", "#ea580c", "squircle"],
  ["glory", "✨", "Glory!", "church", "#a78bfa", "#6366f1", "burst"],
  ["praying", "🤲", "Praying", "church", "#7dd3fc", "#3b82f6", "circle"],
  ["blessed", "💛", "Blessed", "church", "#fde047", "#f59e0b", "squircle"],
  ["god-good", "☀️", "God is good", "church", "#fcd34d", "#fb7185", "circle"],
  ["worship", "🎶", "Worship", "church", "#c084fc", "#7c3aed", "squircle"],
  ["faith", "🌱", "Faith", "church", "#86efac", "#16a34a", "circle"],
  ["grace", "🕊️", "Grace", "church", "#bae6fd", "#818cf8", "squircle"],
  ["word", "📖", "The Word", "church", "#fdba74", "#b45309", "squircle"],
  ["jesus", "✝️", "Jesus", "church", "#e5e7eb", "#6b7280", "circle"],
  ["on-fire", "🔥", "On fire!", "church", "#fb923c", "#dc2626", "burst"],
  ["thanksgiving", "🍇", "Thankful", "church", "#d8b4fe", "#9333ea", "circle"],

  ["welldone", "🏆", "Well done!", "team", "#fde047", "#d97706", "burst"],
  ["thanks", "💐", "Thank you", "team", "#f9a8d4", "#db2777", "circle"],
  ["onmyway", "🚗", "On my way", "team", "#7dd3fc", "#0284c7", "squircle"],
  ["noted", "📝", "Noted", "team", "#fde68a", "#ca8a04", "squircle"],
  ["done", "✅", "Done", "team", "#86efac", "#059669", "circle"],
  ["needhelp", "🆘", "Need help", "team", "#fca5a5", "#dc2626", "burst"],
  ["late", "⏰", "Running late", "team", "#fdba74", "#ea580c", "circle"],
  ["letsgo", "🚀", "Let's go!", "team", "#a5b4fc", "#4f46e5", "burst"],
  ["greatjob", "🌟", "Great job", "team", "#fef08a", "#f59e0b", "circle"],
  ["soundcheck", "🎚️", "Sound check", "team", "#d1d5db", "#4b5563", "squircle"],
  ["mic", "🎤", "Mic check", "team", "#f0abfc", "#a21caf", "circle"],
  ["slides", "🖥️", "Slides ready", "team", "#93c5fd", "#2563eb", "squircle"],
  ["setup", "🛠️", "Setting up", "team", "#cbd5e1", "#475569", "circle"],
  ["rolling", "🎥", "Rolling", "team", "#fca5a5", "#be123c", "squircle"],
  ["meeting", "📅", "Meeting time", "team", "#99f6e4", "#0d9488", "squircle"],
  ["question", "❓", "Question?", "team", "#c4b5fd", "#7c3aed", "circle"],
  ["confirmed", "👌", "Confirmed", "team", "#bef264", "#65a30d", "circle"],
  ["coffee", "☕", "Coffee break", "team", "#d6b48a", "#92400e", "squircle"],

  ["lol", "😂", "LOL", "reactions", "#fde047", "#f59e0b", "circle"],
  ["wow", "😮", "Wow!", "reactions", "#fcd34d", "#f97316", "burst"],
  ["love", "❤️", "Love it", "reactions", "#fda4af", "#e11d48", "circle"],
  ["clap", "👏", "Bravo", "reactions", "#fdba74", "#f59e0b", "squircle"],
  ["fire", "🔥", "Fire", "reactions", "#fb923c", "#dc2626", "circle"],
  ["cheers", "🥳", "Cheers!", "reactions", "#f0abfc", "#c026d3", "burst"],
  ["oops", "🙈", "Oops", "reactions", "#fde68a", "#d97706", "squircle"],
  ["mindblown", "🤯", "Mind blown", "reactions", "#fca5a5", "#7c3aed", "burst"],
  ["yes", "👍", "Yes!", "reactions", "#86efac", "#16a34a", "circle"],
  ["nope", "🙅", "Nope", "reactions", "#fecaca", "#ef4444", "squircle"],
  ["thinking", "🤔", "Hmm…", "reactions", "#fde68a", "#eab308", "circle"],
  ["cool", "😎", "Cool", "reactions", "#7dd3fc", "#0891b2", "squircle"],
  ["aww", "🥺", "Aww", "reactions", "#fbcfe8", "#ec4899", "circle"],
  ["hug", "🤗", "Hugs", "reactions", "#fed7aa", "#f97316", "circle"],
  ["eyes", "👀", "I see you", "reactions", "#bfdbfe", "#3b82f6", "squircle"],
];

export const STICKERS: StickerDef[] = RAW.map(([id, emoji, label, pack, from, to, shape]) => ({ id, emoji, label, pack, from, to, shape }));
const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));
export const stickerById = (id: string) => BY_ID.get(id);
export const stickerLabel = (id: string) => BY_ID.get(id)?.label ?? "Sticker";

const RECENT_KEY = "chat-recent-stickers";
export function recentStickers(): string[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as string[]).filter((id) => BY_ID.has(id)).slice(0, 12);
  } catch {
    return [];
  }
}
export function rememberSticker(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentStickers().filter((x) => x !== id)].slice(0, 12)));
  } catch {}
}
