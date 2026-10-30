import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as c from '../controllers/postUpload.controller.js';

const router = Router();

router.get('/', h(c.listUploads));
router.post('/', c.postFileUpload.single('file'), h(c.createUpload));
router.get('/:id', h(c.getUpload));
router.patch('/:id', h(c.updateUpload));
router.post('/:id/captions', h(c.regenerate));
router.post('/:id/publish', h(c.publishUpload));
router.delete('/:id', h(c.removeUpload));

export default router;
