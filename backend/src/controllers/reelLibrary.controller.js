import { Reel } from '../models/Reel.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { PhotoReel } from '../models/PhotoReel.model.js';
import { CustomReel } from '../models/CustomReel.model.js';

// Every video made in the Reel Studio, newest first - voice reels, merged videos and photo
// reels - in one shape, so the studio can list, open and delete them from one place.
export async function getLibrary(req, res) {
  const sessionPop = { path: 'session', select: 'title preacher service', populate: { path: 'service', select: 'name' } };
  const [reels, comps, photos, customs] = await Promise.all([
    Reel.find().sort({ createdAt: -1 }).limit(300).populate(sessionPop).lean(),
    Compilation.find().sort({ createdAt: -1 }).limit(300).populate(sessionPop).lean(),
    PhotoReel.find().sort({ createdAt: -1 }).limit(300).lean(),
    CustomReel.find().sort({ createdAt: -1 }).limit(300).lean(),
  ]);
  const fromSession = (kind, d, title) => ({
    kind,
    id: String(d._id),
    title,
    status: d.status,
    progress: d.progress ?? 0,
    error: d.error || '',
    videoUrl: d.videoUrl || '',
    durationSec: d.durationSec ?? null,
    sessionId: d.session ? String(d.session._id ?? d.session) : '',
    sessionTitle: d.session?.title ?? '',
    serviceName: d.session?.service?.name ?? '',
    full: Boolean(d.full),
    createdAt: d.createdAt,
  });
  const items = [
    ...reels.map((r) => fromSession('reel', r, r.headline)),
    ...comps.map((c) => fromSession('merged', c, c.title)),
    ...photos.map((p) => ({
      kind: 'photo',
      id: String(p._id),
      title: p.title,
      status: p.status,
      progress: p.progress ?? 0,
      error: p.error || '',
      videoUrl: p.videoUrl || '',
      durationSec: p.durationSec ?? null,
      sessionId: '',
      sessionTitle: '',
      serviceName: '',
      full: false,
      photoCount: p.images?.length ?? 0,
      thumb: p.images?.[0]?.url ?? '',
      createdAt: p.createdAt,
    })),
    ...customs.map((c) => ({
      kind: 'custom',
      id: String(c._id),
      title: c.title,
      status: c.status,
      progress: 100,
      error: '',
      videoUrl: c.videoUrl || '',
      durationSec: c.durationSec ?? null,
      sessionId: '',
      sessionTitle: '',
      serviceName: '',
      full: false,
      template: c.template,
      createdAt: c.createdAt,
    })),
  ].filter((i) => i.sessionId || i.kind === 'photo' || i.kind === 'custom'); // drop orphans of deleted sessions
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ items });
}
