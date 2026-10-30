// Photo-reel templates and carousel slide layouts. Plain JS, shared by the backend (listing and
// validation) and the Remotion bundle (rendering).

export const PHOTO_TEMPLATES = [
  {
    id: 'collage',
    name: 'Collage Loop',
    description: 'Cream collage: a tilted hero photo beside a column of tiles that glide upward in a loop, with halftone dots and a warm tint.',
    palette: { bg: '#f7efe2', bg2: '#ead9bd', text: '#1c1917', accent: '#e0561f', accentText: '#ffffff', font: 'bricolage', tintA: '#ff7a1a', tintB: '#2a6df4' },
  },
  {
    id: 'posterslide',
    name: 'Poster Slide',
    description: 'Event-poster look: huge stacked title behind a centred photo, with a row of soft photo boxes sliding left to right.',
    palette: { bg: '#0f3a4f', bg2: '#071f2c', text: '#ffffff', accent: '#f08a5d', accentText: '#071f2c', font: 'bebas', tintA: '#f08a5d', tintB: '#1f8fb4' },
  },
  {
    id: 'storycards',
    name: 'Story Cards',
    description: 'Instagram-story style phone cards glide left to right over a big, warm photo.',
    palette: { bg: '#7a2f0d', bg2: '#2a0f04', text: '#ffffff', accent: '#ffb347', accentText: '#2a0f04', font: 'bricolage', tintA: '#ff8a3d', tintB: '#7a2f0d' },
  },
  {
    id: 'wall',
    name: 'Photo Wall',
    description: 'Three columns of photos drifting up and down in opposite directions on a slight tilt.',
    palette: { bg: '#0f1226', bg2: '#05060f', text: '#ffffff', accent: '#f4b43a', accentText: '#0f1226', font: 'bricolage', tintA: '#f4b43a', tintB: '#4338ca' },
  },
  {
    id: 'filmstrip',
    name: 'Film Strip',
    description: 'Real film strips with sprocket holes scrolling past in alternating directions.',
    palette: { bg: '#141414', bg2: '#050505', text: '#f5f0e6', accent: '#e8b04a', accentText: '#141414', font: 'bebas', tintA: '#e8b04a', tintB: '#7c3aed' },
  },
  {
    id: 'polaroid',
    name: 'Polaroid Toss',
    description: 'Polaroid prints drop onto a table one after another and pile up.',
    palette: { bg: '#e9d9c3', bg2: '#d3bb98', text: '#2b1d12', accent: '#b4532a', accentText: '#ffffff', font: 'playfair', tintA: '#b4532a', tintB: '#3b82f6' },
  },
  {
    id: 'kenburns',
    name: 'Ken Burns',
    description: 'Full-screen photos with slow cinematic zooms and soft cross-fades.',
    palette: { bg: '#0b0b0f', bg2: '#000000', text: '#ffffff', accent: '#fbbf24', accentText: '#0b0b0f', font: 'playfair', tintA: '#fbbf24', tintB: '#1e3a8a' },
  },
  {
    id: 'slidestack',
    name: 'Card Stack',
    description: 'Photo cards slide up and stack, each one pushing the last back.',
    palette: { bg: '#1e1b4b', bg2: '#0b0a24', text: '#ffffff', accent: '#a78bfa', accentText: '#1e1b4b', font: 'jakarta', tintA: '#a78bfa', tintB: '#0ea5e9' },
  },
  {
    id: 'diagonal',
    name: 'Diagonal Wipe',
    description: 'A bright diagonal edge sweeps across the screen to reveal each next photo.',
    palette: { bg: '#0f172a', bg2: '#020617', text: '#ffffff', accent: '#22d3ee', accentText: '#0f172a', font: 'lufga', tintA: '#22d3ee', tintB: '#ec4899' },
  },
  {
    id: 'zoompunch',
    name: 'Zoom Punch',
    description: 'Punchy, energetic cuts: each photo snaps in with a zoom, a flash and a little shake.',
    palette: { bg: '#111111', bg2: '#000000', text: '#ffffff', accent: '#ff3d2e', accentText: '#ffffff', font: 'bebas', tintA: '#ff3d2e', tintB: '#111111' },
  },
  {
    id: 'mosaic',
    name: 'Mosaic Burst',
    description: 'Tiles fly in from every edge to build a mosaic, then one tile at a time pops out big.',
    palette: { bg: '#10231c', bg2: '#06100c', text: '#ffffff', accent: '#4ade80', accentText: '#06100c', font: 'jakarta', tintA: '#4ade80', tintB: '#0ea5e9' },
  },
  {
    id: 'coverflow',
    name: 'Cover Flow',
    description: 'A 3D carousel: the photo in focus sits in the middle while the others turn away on each side.',
    palette: { bg: '#1c1917', bg2: '#0c0a09', text: '#fafaf9', accent: '#fb923c', accentText: '#1c1917', font: 'lufga', tintA: '#fb923c', tintB: '#6366f1' },
  },
  {
    id: 'duotone',
    name: 'Duotone Pulse',
    description: 'Bold two-colour photos with halftone dots and giant outlined type.',
    palette: { bg: '#3b0764', bg2: '#be185d', text: '#ffffff', accent: '#fde047', accentText: '#3b0764', font: 'bebas', tintA: '#be185d', tintB: '#3b0764' },
  },
];

export const DEFAULT_PHOTO_TEMPLATE = 'collage';

// Carousel slide layouts and how many photos each takes.
export const CAROUSEL_LAYOUTS = [
  { id: 'title', label: 'Cover', photos: 1 },
  { id: 'hero-left', label: 'Hero + stack (right)', photos: 4 },
  { id: 'hero-right', label: 'Hero + stack (left)', photos: 4 },
  { id: 'framed', label: 'Framed photo', photos: 1 },
  { id: 'split', label: 'Two photos', photos: 2 },
  { id: 'trio', label: 'Three tiles', photos: 3 },
  { id: 'info', label: 'Church info', photos: 0 },
];

export const CAROUSEL_CYCLE = ['hero-left', 'framed', 'hero-right', 'trio', 'split'];

// Lower-third overlays that can sit over any photo reel or carousel photo slide.
export const LOWER_THIRDS = [
  { id: 'none', label: 'None', hint: 'No overlay.' },
  { id: 'bar', label: 'Event bar', hint: 'A full-width colour bar with a logo tab in the middle - text left and right.' },
  { id: 'block', label: 'Title block', hint: 'A dark title block with a script lead-in, and a strip for the time and place.' },
  { id: 'strip', label: 'Session strip', hint: 'A slim white label, a bold wordmark and an address strip.' },
];
