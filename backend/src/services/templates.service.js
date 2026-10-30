import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Brand } from '../models/Brand.model.js';
import { ReelTemplate } from '../models/ReelTemplate.model.js';
import { BUILTIN_TEMPLATES, DEFAULT_TEMPLATE_ID, normaliseTheme } from '../../remotion/templates.js';

export function absoluteUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${env.publicBaseUrl || `http://localhost:${env.port}`}${url}`;
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const FALLBACK_ACCENT = '#f59e0b';
const FALLBACK_PRIMARY = '#0f172a';

// The brand-driven templates draw on a dark canvas with white text, so brand colours have to
// work on it: an accent that is too dark would disappear (a black brand accent is black on
// black), and a light "primary" would wash out the white captions. Fall back to safe values
// rather than render unreadable text.
export async function getBrandProps() {
  const brand = await Brand.findOne({ key: 'default' }).lean();
  const accentLum = luminance(brand?.accentColor);
  const primaryLum = luminance(brand?.primaryColor);
  return {
    primary: primaryLum !== null && primaryLum < 0.2 ? brand.primaryColor : FALLBACK_PRIMARY,
    accent: accentLum !== null && accentLum > 0.3 ? brand.accentColor : FALLBACK_ACCENT,
    churchName: brand?.churchName || '',
    logoUrl: absoluteUrl(brand?.logoUrl),
    logoLightUrl: absoluteUrl(brand?.logoLightUrl),
    // Shown on the closing card.
    tagline: brand?.tagline || '',
    address: brand?.address || '',
    serviceTimes: brand?.serviceTimes || '',
    outroCta: brand?.outroCta || '',
    website: brand?.website || '',
    socials: brand?.socials || {},
  };
}

export async function listTemplates() {
  const custom = await ReelTemplate.find().sort({ createdAt: -1 }).lean();
  return [
    ...BUILTIN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, builtin: true, theme: normaliseTheme(t.theme) })),
    ...custom.map((t) => ({ id: t._id.toString(), name: t.name, description: 'Custom template', builtin: false, theme: normaliseTheme(t.theme) })),
  ];
}

// Turns a template id (or an inline, not-yet-saved theme, for previews) into the final theme
// handed to Remotion, plus the brand props every scene needs.
export async function resolveTheme({ templateId, theme: inlineTheme } = {}) {
  const brand = await getBrandProps();
  let raw = inlineTheme;
  if (!raw) {
    const key = templateId || DEFAULT_TEMPLATE_ID;
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === key);
    if (builtin) raw = builtin.theme;
    else if (mongoose.isValidObjectId(key)) raw = (await ReelTemplate.findById(key).lean())?.theme;
    // A deleted custom template shouldn't break renders of reels that still point at it.
    raw ||= BUILTIN_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID).theme;
  }
  const theme = normaliseTheme(raw);
  if (theme.brandAccent) {
    theme.accent = brand.accent;
    theme.bg = brand.primary;
  }
  theme.backgroundImageUrl = absoluteUrl(theme.backgroundImageUrl);

  // Light logo on dark canvases, regular logo on light ones. The poster's header always sits on
  // a darkened image/gradient, so it always wants the light one.
  const onDark = theme.layout === 'poster' || (luminance(theme.bg) ?? 0) < 0.5;
  const logoUrl = onDark ? brand.logoLightUrl || brand.logoUrl : brand.logoUrl || brand.logoLightUrl;
  return { theme, brand: { ...brand, logoUrl } };
}
