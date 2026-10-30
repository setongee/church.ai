import crypto from 'crypto';
import { Brand } from '../models/Brand.model.js';
import { storeImage } from '../services/imageStore.service.js';

const TEXT_FIELDS = ['churchName', 'tagline', 'pastorName', 'pastorTitle', 'address', 'serviceTimes', 'outroCta', 'website', 'phone', 'email', 'bankName', 'accountName', 'accountNumber'];
const SOCIALS = ['instagram', 'facebook', 'youtube', 'x', 'tiktok'];
const COLOR_FIELDS = ['primaryColor', 'accentColor'];
const IMAGE_SLOTS = { logo: 'logoUrl', logoLight: 'logoLightUrl', pastor: 'pastorImageUrl' };
const HEX_RE = /^#[0-9a-f]{6}$/i;

async function getOrCreate() {
  return (await Brand.findOne({ key: 'default' })) ?? (await Brand.create({ key: 'default' }));
}

export async function getBrand(req, res) {
  res.json(await getOrCreate());
}

export async function updateBrand(req, res) {
  const brand = await getOrCreate();
  for (const f of TEXT_FIELDS) {
    if (typeof req.body[f] === 'string') brand[f] = req.body[f].trim().slice(0, 300);
  }
  for (const f of COLOR_FIELDS) {
    if (typeof req.body[f] === 'string') brand[f] = HEX_RE.test(req.body[f]) ? req.body[f] : '';
  }
  if (req.body.socials && typeof req.body.socials === 'object') {
    for (const f of SOCIALS) {
      if (typeof req.body.socials[f] === 'string') brand.socials[f] = req.body.socials[f].trim().slice(0, 200);
    }
  }
  if (Array.isArray(req.body.hiddenTemplates)) {
    brand.hiddenTemplates = [...new Set(req.body.hiddenTemplates.filter((x) => typeof x === 'string').map((x) => x.slice(0, 80)))].slice(0, 200);
  }
  // Clearing an image: send { clear: ['logo', 'pastor'] }.
  if (Array.isArray(req.body.clear)) {
    for (const slot of req.body.clear) if (IMAGE_SLOTS[slot]) brand[IMAGE_SLOTS[slot]] = '';
  }
  await brand.save();
  res.json(brand);
}

export async function uploadBrandImage(req, res) {
  const field = IMAGE_SLOTS[req.params.slot];
  if (!field) return res.status(404).json({ error: 'unknown brand image slot' });
  if (!req.file) return res.status(400).json({ error: 'image file is required' });
  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const url = await storeImage(dataUri, `brand-${req.params.slot}-${crypto.randomUUID()}`);
  const brand = await getOrCreate();
  brand[field] = url;
  await brand.save();
  res.json(brand);
}

// ---- ministers (guest preachers / other pastors) ----

async function ministerImage(file) {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  return storeImage(dataUri, `brand-minister-${crypto.randomUUID()}`);
}

export async function addMinister(req, res) {
  const name = String(req.body?.name ?? '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'A minister needs a name.' });
  const brand = await getOrCreate();
  if (brand.ministers.length >= 100) return res.status(400).json({ error: 'That is the maximum number of ministers.' });
  brand.ministers.push({
    name,
    title: String(req.body?.title ?? '').trim().slice(0, 120),
    imageUrl: req.file ? await ministerImage(req.file) : '',
  });
  await brand.save();
  res.status(201).json(brand);
}

export async function updateMinister(req, res) {
  const brand = await getOrCreate();
  const m = brand.ministers.id(req.params.ministerId);
  if (!m) return res.status(404).json({ error: 'minister not found' });
  if (typeof req.body?.name === 'string' && req.body.name.trim()) m.name = req.body.name.trim().slice(0, 120);
  if (typeof req.body?.title === 'string') m.title = req.body.title.trim().slice(0, 120);
  if (req.body?.clearImage === 'true') m.imageUrl = '';
  if (req.file) m.imageUrl = await ministerImage(req.file);
  await brand.save();
  res.json(brand);
}

export async function deleteMinister(req, res) {
  const brand = await getOrCreate();
  const m = brand.ministers.id(req.params.ministerId);
  if (!m) return res.status(404).json({ error: 'minister not found' });
  m.deleteOne();
  await brand.save();
  res.json(brand);
}
