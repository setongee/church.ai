import { Router } from 'express';
import { memoryUpload } from '../middlewares/upload.js';
import {
  getQuote,
  setCustomImage,
  saveEditorExport,
  updateCaption,
  regenerateCaption,
  publishQuoteToInstagram,
} from '../controllers/quote.controller.js';

const router = Router();

router.get('/:id', getQuote);
router.post('/:id/custom-image', memoryUpload.single('image'), setCustomImage);
router.post('/:id/export', saveEditorExport);
router.patch('/:id/caption', updateCaption);
router.post('/:id/caption/regenerate', regenerateCaption);
router.post('/:id/publish/instagram', publishQuoteToInstagram);

export default router;
