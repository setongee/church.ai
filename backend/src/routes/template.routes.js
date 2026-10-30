import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, saveOverride, deleteOverride } from '../controllers/template.controller.js';

const router = Router();

router.get('/', asyncHandler(listTemplates));
router.post('/', asyncHandler(createTemplate));
router.put('/override/:baseId', asyncHandler(saveOverride));
router.delete('/override/:baseId', asyncHandler(deleteOverride));
router.put('/:id', asyncHandler(updateTemplate));
router.delete('/:id', asyncHandler(deleteTemplate));

export default router;
