import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { listMerges, getMerge, generateMerge, updateMerge, downloadMerge, getMergeTranscript, createReelFromMerge, deleteMerge, getSuggestions } from '../controllers/audioLab.controller.js';

const router = Router();

router.get('/', h(listMerges));
router.post('/sessions/:id/generate', h(generateMerge));
router.get('/sessions/:id/suggestions', h(getSuggestions));
router.get('/:id', h(getMerge));
router.patch('/:id', h(updateMerge));
router.get('/:id/download', h(downloadMerge));
router.get('/:id/transcript', h(getMergeTranscript));
router.post('/:id/reel', h(createReelFromMerge));
router.delete('/:id', h(deleteMerge));

export default router;
