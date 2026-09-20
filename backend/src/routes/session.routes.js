import { Router } from 'express';
import { getSession, endSession, postChatMessage, getPublishQueue } from '../controllers/session.controller.js';

const router = Router();

router.get('/:id', getSession);
router.get('/:id/publish-queue', getPublishQueue);
router.post('/:id/end', endSession);
router.post('/:id/chat', postChatMessage);

export default router;
