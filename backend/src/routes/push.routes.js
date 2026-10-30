import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as c from '../controllers/push.controller.js';

const router = Router();

router.get('/key', h(c.publicKey));
router.post('/subscribe', h(c.subscribe));
router.post('/unsubscribe', h(c.unsubscribe));

export default router;
