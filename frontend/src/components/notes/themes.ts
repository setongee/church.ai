export interface NotesTheme {
  id: string;
  name: string;
  blurb: string;
  dark: boolean;
  bg: { from: string; to: string; angle: number };
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  // Cards (scripture quotes, plan days) sit on this.
  surface: string;
  line: string;
  head: { family: string; weight: number; upper?: boolean; spacing?: number; italic?: boolean };
  body: { family: string; weight: number };
  label: { family: string; weight: number };
  decor: 'frame' | 'rule' | 'band' | 'orbs' | 'corner';
}

// Five looks for the same notes. Each pairs a display face with a reading face, and has its own
// way of decorating the page so they differ in feel, not only in colour.
export const NOTES_THEMES: NotesTheme[] = [
  {
    id: 'midnight-gold',
    name: 'Midnight Gold',
    blurb: 'Deep navy and gold. Reverent and formal.',
    dark: true,
    bg: { from: '#0a1024', to: '#16204a', angle: 160 },
    ink: '#f6f0e1',
    muted: '#a8b0cc',
    accent: '#d9b44a',
    accent2: '#f1dc96',
    surface: '#18224c',
    line: '#2d3a6e',
    head: { family: 'Playfair Display', weight: 700 },
    body: { family: 'Lora', weight: 400 },
    label: { family: 'Plus Jakarta Sans', weight: 700 },
    decor: 'frame',
  },
  {
    id: 'ivory-classic',
    name: 'Ivory Classic',
    blurb: 'Warm paper, burgundy ink. Like a printed book.',
    dark: false,
    bg: { from: '#fcf8f0', to: '#f3ead8', angle: 170 },
    ink: '#2b2622',
    muted: '#7a6f62',
    accent: '#8c2f39',
    accent2: '#b98a4b',
    surface: '#fffdf8',
    line: '#ddd0b8',
    head: { family: 'Cormorant Garamond', weight: 700 },
    body: { family: 'Source Serif 4', weight: 400 },
    label: { family: 'Plus Jakarta Sans', weight: 700 },
    decor: 'rule',
  },
  {
    id: 'modern-light',
    name: 'Modern Light',
    blurb: 'Clean white, confident type, a bright blue accent.',
    dark: false,
    bg: { from: '#ffffff', to: '#eef2fb', angle: 160 },
    ink: '#0f172a',
    muted: '#5d667c',
    accent: '#2457e6',
    accent2: '#7a3ff0',
    surface: '#ffffff',
    line: '#dbe2f2',
    head: { family: 'Bricolage Grotesque', weight: 700 },
    body: { family: 'Plus Jakarta Sans', weight: 400 },
    label: { family: 'Plus Jakarta Sans', weight: 700 },
    decor: 'band',
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    blurb: 'Soft peach and coral. Warm, hopeful, welcoming.',
    dark: false,
    bg: { from: '#fff4e8', to: '#ffdfcf', angle: 155 },
    ink: '#3a201b',
    muted: '#94604f',
    accent: '#e1522a',
    accent2: '#f0a23d',
    surface: '#fffaf4',
    line: '#f0cdbb',
    head: { family: 'DM Serif Display', weight: 400 },
    body: { family: 'DM Sans', weight: 400 },
    label: { family: 'DM Sans', weight: 700 },
    decor: 'orbs',
  },
  {
    id: 'forest',
    name: 'Evergreen',
    blurb: 'Deep green with sage and brass. Calm and grounded.',
    dark: true,
    bg: { from: '#0e2a21', to: '#18392e', angle: 165 },
    ink: '#f2f0e4',
    muted: '#a6c1b2',
    accent: '#e2bb5f',
    accent2: '#8fd0a8',
    surface: '#1c4235',
    line: '#2f5c4b',
    head: { family: 'Fraunces', weight: 700 },
    body: { family: 'Inter', weight: 400 },
    label: { family: 'Inter', weight: 700 },
    decor: 'corner',
  },
];

export const themeById = (id: string) => NOTES_THEMES.find((t) => t.id === id) ?? NOTES_THEMES[0];
