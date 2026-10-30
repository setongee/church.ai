import { Router } from 'express';
import { memoryUpload } from '../middlewares/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploadEditorImage, generateImage, listFonts, listImages, deleteImage } from '../controllers/editor.controller.js';

const router = Router();

router.post('/upload', memoryUpload.single('image'), asyncHandler(uploadEditorImage));
router.post('/generate-image', asyncHandler(generateImage));
router.get('/images', asyncHandler(listImages));
router.delete('/images/:id', asyncHandler(deleteImage));
router.get('/fonts', asyncHandler(listFonts));

export default router;
