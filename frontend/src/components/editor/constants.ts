export interface SizePreset {
  key: string;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export const SIZE_PRESETS: SizePreset[] = [
  { key: 'ig-portrait', label: 'Portrait post', hint: 'Instagram · 4:5', width: 1080, height: 1350 },
  { key: 'square', label: 'Square post', hint: 'Instagram / Facebook · 1:1', width: 1080, height: 1080 },
  { key: 'story', label: 'Story / Status', hint: 'Stories, Reels, WhatsApp · 9:16', width: 1080, height: 1920 },
  { key: 'landscape', label: 'Landscape', hint: 'YouTube, slides · 16:9', width: 1920, height: 1080 },
  { key: 'wide', label: 'Link share', hint: 'Facebook, LinkedIn · 1.91:1', width: 1200, height: 628 },
  { key: 'pinterest', label: 'Tall pin', hint: 'Pinterest · 2:3', width: 1000, height: 1500 },
];

// Custom fabric props that must survive toObject() -> loadFromJSON() round trips.
export const CUSTOM_PROPS = [
  'role',
  'uid',
  'label',
  'locked',
  'selectable',
  'evented',
  'gradFrom',
  'gradTo',
  'gradAngle',
  // template support
  'slot',
  'slotPre',
  'slotUp',
  'emphColor',
  'tplId',
  'lowerThird',
  'slotUrl',
];

export const SAFE_MARGIN_RATIO = 0.06;
export const HISTORY_LIMIT = 60;
export const AUTOSAVE_DELAY_MS = 1200;

export const SWATCHES = [
  '#ffffff', '#f5f5f4', '#a3a3a3', '#525252', '#171717', '#000000',
  '#ef4444', '#f97316', '#f59e0b', '#facc15', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#ec4899', '#f43f5e', '#78350f', '#1e3a8a', '#064e3b', '#4c1d95',
];

export interface GradientPreset {
  name: string;
  from: string;
  to: string;
  angle: number;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { name: 'Midnight', from: '#0f172a', to: '#312e81', angle: 160 },
  { name: 'Sunrise', from: '#f59e0b', to: '#db2777', angle: 150 },
  { name: 'Ocean', from: '#0ea5e9', to: '#1e3a8a', angle: 180 },
  { name: 'Forest', from: '#14532d', to: '#65a30d', angle: 145 },
  { name: 'Royal', from: '#4c1d95', to: '#be185d', angle: 135 },
  { name: 'Ember', from: '#450a0a', to: '#ea580c', angle: 170 },
  { name: 'Dusk', from: '#1f2937', to: '#fb7185', angle: 200 },
  { name: 'Sand', from: '#fef3c7', to: '#fdba74', angle: 160 },
];

export interface TextPreset {
  key: string;
  label: string;
  sample: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle?: 'italic' | 'normal';
  // fraction of min(width, height)
  size: number;
  uppercase?: boolean;
  charSpacing?: number;
  lineHeight?: number;
}

export const TEXT_PRESETS: TextPreset[] = [
  { key: 'heading', label: 'Heading', sample: 'Add a heading', fontFamily: 'Google Sans', fontWeight: 700, size: 0.08, lineHeight: 1.12 },
  { key: 'subheading', label: 'Subheading', sample: 'Add a subheading', fontFamily: 'Plus Jakarta Sans', fontWeight: 700, size: 0.045, lineHeight: 1.25 },
  { key: 'body', label: 'Body text', sample: 'Add a little body text', fontFamily: 'Plus Jakarta Sans', fontWeight: 400, size: 0.034, lineHeight: 1.45 },
  { key: 'statement', label: 'Bold statement', sample: 'BOLD STATEMENT', fontFamily: 'Anton', fontWeight: 400, size: 0.1, uppercase: true, charSpacing: 20, lineHeight: 1.05 },
  { key: 'script', label: 'Handwritten', sample: 'Handwritten', fontFamily: 'Caveat', fontWeight: 700, size: 0.1, lineHeight: 1.05 },
  { key: 'serif-italic', label: 'Elegant italic', sample: 'Elegant italic', fontFamily: 'Cormorant Garamond', fontWeight: 500, fontStyle: 'italic', size: 0.075 },
  { key: 'label', label: 'Small caps label', sample: 'SMALL LABEL', fontFamily: 'Plus Jakarta Sans', fontWeight: 700, size: 0.024, uppercase: true, charSpacing: 300 },
];

export const AI_STYLE_CHIPS = [
  'Cinematic lighting',
  'Soft watercolor',
  'Minimal & clean',
  'Golden hour',
  'Dark & moody',
  'Abstract shapes',
  'Heavenly light rays',
  'Textured paper',
];
