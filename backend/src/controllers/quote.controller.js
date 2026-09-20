import crypto from 'crypto';
import { Quote } from '../models/Quote.model.js';
import { Session } from '../models/Session.model.js';
import { uploadImage } from '../services/cloudinary.service.js';
import { generateInstagramCaption } from '../services/openrouter.service.js';
import { publishImageToInstagram, InstagramConfigError, InstagramApiError } from '../services/instagram.service.js';

export async function getQuote(req, res) {
  const { id } = req.params;
  const quote = await Quote.findById(id);
  if (!quote) return res.status(404).json({ error: 'quote not found' });

  const session = await Session.findById(quote.session).populate('service');
  res.json({ quote, session });
}

export async function setCustomImage(req, res) {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'image file is required' });

  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const customImageUrl = await uploadImage(dataUri, `quote-${id}-custom-${crypto.randomUUID()}`);
  if (!customImageUrl) {
    return res.status(502).json({ error: 'Failed to upload image. Check the Cloudinary env vars are set.' });
  }

  const quote = await Quote.findByIdAndUpdate(id, { customImageUrl }, { new: true });
  if (!quote) return res.status(404).json({ error: 'quote not found' });
  res.json(quote);
}

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/;

export async function saveEditorExport(req, res) {
  const { id } = req.params;
  const { dataUrl, editorState } = req.body;

  const quote = await Quote.findById(id);
  if (!quote) return res.status(404).json({ error: 'quote not found' });

  if (dataUrl) {
    if (!DATA_URL_RE.test(dataUrl)) {
      return res.status(400).json({ error: 'dataUrl must be a base64 png/jpeg/webp image' });
    }
    const exportedImageUrl = await uploadImage(dataUrl, `quote-${id}-export-${crypto.randomUUID()}`);
    if (!exportedImageUrl) {
      return res.status(502).json({ error: 'Failed to upload image. Check the Cloudinary env vars are set.' });
    }
    quote.exportedImageUrl = exportedImageUrl;
  }

  if (editorState !== undefined) {
    quote.editorState = editorState;
  }

  await quote.save();
  res.json(quote);
}

export async function updateCaption(req, res) {
  const { id } = req.params;
  const { caption } = req.body;
  if (typeof caption !== 'string') return res.status(400).json({ error: 'caption must be a string' });

  const quote = await Quote.findByIdAndUpdate(id, { caption }, { new: true });
  if (!quote) return res.status(404).json({ error: 'quote not found' });
  res.json(quote);
}

export async function regenerateCaption(req, res) {
  const { id } = req.params;
  const quote = await Quote.findById(id);
  if (!quote) return res.status(404).json({ error: 'quote not found' });

  const caption = await generateInstagramCaption({
    quoteText: quote.text,
    sourceText: quote.sourceText || '',
    previousCaption: quote.caption || '',
  });
  if (!caption) {
    return res.status(502).json({ error: 'Failed to generate a caption. Check OPENROUTER_API_KEY and try again.' });
  }

  quote.caption = caption;
  await quote.save();
  res.json(quote);
}

export async function publishQuoteToInstagram(req, res) {
  const { id } = req.params;
  const quote = await Quote.findById(id);
  if (!quote) return res.status(404).json({ error: 'quote not found' });
  if (!quote.exportedImageUrl) {
    return res.status(400).json({ error: 'Export an image for this quote before posting it.' });
  }

  try {
    const { mediaId, permalink } = await publishImageToInstagram({
      imagePath: quote.exportedImageUrl,
      caption: quote.caption || '',
    });
    quote.instagramMediaId = mediaId;
    quote.instagramPermalink = permalink;
    quote.instagramPublishedAt = new Date();
    await quote.save();
    res.json(quote);
  } catch (err) {
    if (err instanceof InstagramConfigError || err instanceof InstagramApiError) {
      return res.status(err instanceof InstagramConfigError ? 400 : 502).json({ error: err.message });
    }
    console.error('[quote] instagram publish failed', err);
    res.status(500).json({ error: 'Failed to publish to Instagram.' });
  }
}
