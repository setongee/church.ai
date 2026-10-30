import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { requireAdmin } from '../middlewares/auth.js';
import { MEDIA_DIR } from '../controllers/presentContent.controller.js';
import * as c from '../controllers/submission.controller.js';

// Pictures and videos made on the device travel with the submission; they wait on disk until it is approved.
const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  // The text part of a submission can be big: an exported design travels inside it as a picture.
  limits: { fileSize: 500 * 1024 * 1024, files: 40, fieldSize: 250 * 1024 * 1024 },
});

const router = Router();
router.get('/', h(c.listSubmissions));
router.post('/', upload.any(), h(c.createSubmission));
router.get('/:id', h(c.getSubmission));
router.post('/:id/approve', requireAdmin, h(c.approveSubmission));
router.post('/:id/reject', requireAdmin, h(c.rejectSubmission));
router.post('/:id/withdraw', h(c.withdrawSubmission));
export default router;
