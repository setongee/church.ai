import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listCarousels,
  createCarousel,
  getCarousel,
  updateCarousel,
  deleteCarousel,
  addMediaSlide,
  addAnimationSlide,
  generateCarouselCaption,
  publishCarousel,
} from '../controllers/carousel.controller.js';

const router = Router();

// Slide media streams to a temp file (videos can be large) and is then converted for Instagram.
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `carousel-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Upload an image or a video file'));
  },
  limits: { fileSize: 300 * 1024 * 1024 },
});

router.get('/', asyncHandler(listCarousels));
router.post('/', asyncHandler(createCarousel));
router.get('/:id', asyncHandler(getCarousel));
router.patch('/:id', asyncHandler(updateCarousel));
router.delete('/:id', asyncHandler(deleteCarousel));
router.post('/:id/media', mediaUpload.single('file'), asyncHandler(addMediaSlide));
router.post('/:id/animation-slide', asyncHandler(addAnimationSlide));
router.post('/:id/caption/generate', asyncHandler(generateCarouselCaption));
router.post('/:id/publish/instagram', asyncHandler(publishCarousel));

export default router;
