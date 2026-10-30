import { Router } from 'express';
import { memoryUpload } from '../middlewares/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getBrand, updateBrand, uploadBrandImage, addMinister, updateMinister, deleteMinister } from '../controllers/brand.controller.js';

const router = Router();

router.get('/', asyncHandler(getBrand));
router.put('/', asyncHandler(updateBrand));
router.post('/image/:slot', memoryUpload.single('image'), asyncHandler(uploadBrandImage));

router.post('/ministers', memoryUpload.single('image'), asyncHandler(addMinister));
router.put('/ministers/:ministerId', memoryUpload.single('image'), asyncHandler(updateMinister));
router.delete('/ministers/:ministerId', asyncHandler(deleteMinister));

export default router;
