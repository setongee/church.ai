import { requireAdmin } from '../middlewares/auth.js';
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getNotes, generateNotes, updateNotes, regenerateDevotional, lookupRef, deleteNotes } from '../controllers/messageNotes.controller.js';
import { getSession, updateSession, endSession, postChatMessage, getPublishQueue, deleteSession, pointScriptures } from '../controllers/session.controller.js';

const router = Router();

router.get('/scripture/lookup', asyncHandler(lookupRef));
router.get('/:id', getSession);
router.patch('/:id', asyncHandler(updateSession));
router.delete('/:id', requireAdmin, deleteSession);
router.get('/:id/publish-queue', getPublishQueue);
router.post('/:id/end', endSession);
router.post('/:id/point-scriptures', asyncHandler(pointScriptures));
router.post('/:id/chat', postChatMessage);
router.get('/:id/message-notes', asyncHandler(getNotes));
router.post('/:id/message-notes/generate', asyncHandler(generateNotes));
router.put('/:id/message-notes', asyncHandler(updateNotes));
router.post('/:id/message-notes/regenerate', asyncHandler(regenerateDevotional));
router.delete('/:id/message-notes', asyncHandler(deleteNotes));

export default router;
