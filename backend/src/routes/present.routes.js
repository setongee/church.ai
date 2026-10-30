import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as c from '../controllers/present.controller.js';
import * as sc from '../controllers/schedule.controller.js';
import * as pc from '../controllers/presentContent.controller.js';
import * as app from '../controllers/appLibrary.controller.js';
import * as ps from '../controllers/presentSession.controller.js';
import * as listen from '../controllers/presentListen.controller.js';

// Bible XML files run to ~20 MB; they're parsed immediately so memory storage is fine.
const xmlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

const songUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 50 } });

// Pictures, GIFs and videos: streamed to disk (a video can be hundreds of MB), then handled in the controller.
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: pc.MEDIA_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  fileFilter: (req, file, cb) => (/^(image|video)\//.test(file.mimetype) || /\.(png|jpe?g|webp|gif|mp4|mov|m4v|webm|ogv)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Upload a picture, GIF or video file'))),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// Pictures and videos a presenter made on their own device are only on that device. When one goes to the screen it is
// parked here for a little while, so a projector on another machine can show it. It isn't in any library.
const STAGE_DIR = path.join(pc.MEDIA_DIR, '..', 'present-stage');
fs.mkdirSync(STAGE_DIR, { recursive: true });
const STAGE_KEEP_MS = 2 * 24 * 3600 * 1000;
const stageUpload = multer({
  storage: multer.diskStorage({
    destination: STAGE_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  fileFilter: (req, file, cb) => (/^(image|video)\//.test(file.mimetype) ? cb(null, true) : cb(new Error('Only pictures and videos'))),
  limits: { fileSize: 500 * 1024 * 1024 },
});
async function stage(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Choose a picture or video.' });
  res.json({ url: `/uploads/present-stage/${req.file.filename}` });
  // Housekeeping: anything older than a couple of days is gone.
  for (const f of await fs.promises.readdir(STAGE_DIR).catch(() => [])) {
    const full = path.join(STAGE_DIR, f);
    const st = await fs.promises.stat(full).catch(() => null);
    if (st && Date.now() - st.mtimeMs > STAGE_KEEP_MS) await fs.promises.rm(full, { force: true });
  }
}

const router = Router();

router.get('/bibles', h(c.listBibles));
router.post('/bibles/download', h(c.downloadBibleHandler));
router.post('/bibles/import', xmlUpload.single('file'), h(c.importBibleHandler));
router.delete('/bibles/:id', h(c.deleteBible));
router.get('/bibles/:id/books', h(c.bibleBooks));
router.get('/bibles/:id/chapter', h(c.bibleChapter));
router.get('/bibles/:id/find', h(c.bibleFind));
router.get('/bibles/:id/smart', h(c.bibleSmart));
router.get('/bibles/:id/match', h(listen.bibleMatch)); // a quoted verse, no reference needed
router.post('/bibles/:id/paraphrase', h(listen.bibleParaphrase)); // the same verse in the preacher's own words (AI-assisted)
router.post('/bibles/:id/warm', h(listen.bibleWarm));

router.get('/songs', h(c.listSongs));
router.post('/songs', h(c.createSong));
router.post('/songs/find', h(c.findSongs));
router.post('/songs/import', songUpload.array('files', 50), h(c.importSongs));
router.put('/songs/:id', h(c.updateSong));
router.delete('/songs/:id', h(c.deleteSong));

router.get('/announcements', h(c.listAnnouncements));
router.post('/announcements', h(c.createAnnouncement));
router.put('/announcements/:id', h(c.updateAnnouncement));
router.delete('/announcements/:id', h(c.deleteAnnouncement));

router.get('/media', h(pc.listMedia));
router.post('/media', mediaUpload.single('file'), h(pc.uploadMedia));
router.delete('/media/:id', h(pc.deleteMedia));

router.get('/app/media', h(app.appMedia));
router.get('/app/quotes', h(app.appQuotes));
router.get('/app/prayers', h(app.appPrayers));

router.get('/scene-templates', h(pc.listSceneTemplates));
router.post('/scene-templates', h(pc.saveSceneTemplate));
router.put('/scene-templates/:id', h(pc.saveSceneTemplate));
router.delete('/scene-templates/:id', h(pc.deleteSceneTemplate));

router.get('/wrappers', h(pc.listWrappers));
router.post('/wrappers', h(pc.saveWrapper));
router.put('/wrappers/:id', h(pc.saveWrapper));
router.delete('/wrappers/:id', h(pc.deleteWrapper));

router.get('/scripture-box', h(pc.listScriptureBox));
router.post('/scripture-box', h(pc.addScriptureBox));
router.delete('/scripture-box/:id', h(pc.deleteScriptureBox));

router.get('/prayers', h(pc.listPrayers));
router.post('/prayers', h(pc.savePrayer));
router.put('/prayers/:id', h(pc.savePrayer));
router.delete('/prayers/:id', h(pc.deletePrayer));

router.get('/slideshows', h(pc.listSlideshows));
router.post('/slideshows', h(pc.saveSlideshow));
router.put('/slideshows/:id', h(pc.saveSlideshow));
router.delete('/slideshows/:id', h(pc.deleteSlideshow));

router.get('/quotes', h(pc.listQuotes));
router.post('/quotes', h(pc.saveQuote));
router.put('/quotes/:id', h(pc.saveQuote));
router.delete('/quotes/:id', h(pc.deleteQuote));

router.post('/stage', stageUpload.single('file'), h(stage));

router.get('/session', h(ps.getSession));
router.post('/session', h(ps.startSession));
router.put('/session', h(ps.updateSession));
router.delete('/session', h(ps.endSession));

router.get('/schedules', h(sc.listSchedules));
router.post('/schedules', h(sc.createSchedule));
router.get('/schedules/:id', h(sc.getSchedule));
router.put('/schedules/:id', h(sc.updateSchedule));
router.delete('/schedules/:id', h(sc.deleteSchedule));

export default router;
