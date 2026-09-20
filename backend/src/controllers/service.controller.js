import crypto from 'crypto';
import { Service } from '../models/Service.model.js';
import { Session } from '../models/Session.model.js';
import { Quote } from '../models/Quote.model.js';
import { uploadImage } from '../services/cloudinary.service.js';

function templateDataUri(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

export async function createService(req, res) {
  const { name } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const portraitFile = req.files?.portraitTemplate?.[0];
  const landscapeFile = req.files?.landscapeTemplate?.[0];

  const [portraitTemplateUrl, landscapeTemplateUrl] = await Promise.all([
    portraitFile
      ? uploadImage(templateDataUri(portraitFile), `service-portrait-${crypto.randomUUID()}`)
      : undefined,
    landscapeFile
      ? uploadImage(templateDataUri(landscapeFile), `service-landscape-${crypto.randomUUID()}`)
      : undefined,
  ]);
  if ((portraitFile && !portraitTemplateUrl) || (landscapeFile && !landscapeTemplateUrl)) {
    return res.status(502).json({ error: 'Failed to upload template image. Check the Cloudinary env vars are set.' });
  }

  const service = await Service.create({ name: name.trim(), portraitTemplateUrl, landscapeTemplateUrl });
  res.status(201).json(service);
}

export async function updateService(req, res) {
  const { id } = req.params;
  const service = await Service.findById(id);
  if (!service) return res.status(404).json({ error: 'service not found' });

  if (req.body.name?.trim()) service.name = req.body.name.trim();

  const portraitFile = req.files?.portraitTemplate?.[0];
  const landscapeFile = req.files?.landscapeTemplate?.[0];

  const [portraitTemplateUrl, landscapeTemplateUrl] = await Promise.all([
    portraitFile ? uploadImage(templateDataUri(portraitFile), `service-portrait-${id}-${crypto.randomUUID()}`) : null,
    landscapeFile
      ? uploadImage(templateDataUri(landscapeFile), `service-landscape-${id}-${crypto.randomUUID()}`)
      : null,
  ]);
  if ((portraitFile && !portraitTemplateUrl) || (landscapeFile && !landscapeTemplateUrl)) {
    return res.status(502).json({ error: 'Failed to upload template image. Check the Cloudinary env vars are set.' });
  }
  if (portraitTemplateUrl) service.portraitTemplateUrl = portraitTemplateUrl;
  if (landscapeTemplateUrl) service.landscapeTemplateUrl = landscapeTemplateUrl;

  await service.save();
  res.json(service);
}

export async function listServices(req, res) {
  const services = await Service.find().sort({ createdAt: -1 }).limit(200);
  res.json(services);
}

export async function getService(req, res) {
  const { id } = req.params;
  const [service, sessions] = await Promise.all([
    Service.findById(id),
    Session.find({ service: id }).sort({ createdAt: -1 }),
  ]);
  if (!service) return res.status(404).json({ error: 'service not found' });
  res.json({ service, sessions });
}

export async function getServiceQuotes(req, res) {
  const { id } = req.params;
  const service = await Service.findById(id);
  if (!service) return res.status(404).json({ error: 'service not found' });

  const sessions = await Session.find({ service: id }).select('_id title preacher');
  const sessionIds = sessions.map((s) => s._id);
  const quotes = await Quote.find({ session: { $in: sessionIds } }).sort({ createdAt: -1 });

  const sessionById = new Map(sessions.map((s) => [s._id.toString(), s]));
  const quotesWithSession = quotes.map((q) => ({
    ...q.toObject(),
    sessionTitle: sessionById.get(q.session.toString())?.title,
    sessionPreacher: sessionById.get(q.session.toString())?.preacher,
  }));

  res.json({ service, quotes: quotesWithSession });
}
