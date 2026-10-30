import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listDesigns,
  createDesign,
  getDesign,
  updateDesign,
  deleteDesign,
  exportDesign,
  generateDesignCaption,
  publishDesignToInstagram,
} from '../controllers/design.controller.js';

import multer from 'multer';
import { createAnimation, deleteAnimation, getAnimation, listAnimations, listEffects, downloadAnimation, listFinishedAnimations } from '../controllers/designAnimation.controller.js';

const router = Router();
const layerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 50 } });

router.get('/', asyncHandler(listDesigns));
router.post('/', asyncHandler(createDesign));
router.get('/animation-effects', asyncHandler(listEffects));
router.get('/animations', asyncHandler(listFinishedAnimations));
router.get('/animations/:animId', asyncHandler(getAnimation));
router.get('/animations/:animId/download', asyncHandler(downloadAnimation));
router.delete('/animations/:animId', asyncHandler(deleteAnimation));
router.get('/:id/animations', asyncHandler(listAnimations));
router.post('/:id/animate', layerUpload.any(), asyncHandler(createAnimation));
router.get('/:id', asyncHandler(getDesign));
router.patch('/:id', asyncHandler(updateDesign));
router.delete('/:id', asyncHandler(deleteDesign));
router.post('/:id/export', asyncHandler(exportDesign));
router.post('/:id/caption/generate', asyncHandler(generateDesignCaption));
router.post('/:id/publish/instagram', asyncHandler(publishDesignToInstagram));

export default router;
