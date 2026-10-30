import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { liveActivity } from '../controllers/activity.controller.js';

const router = Router();
router.get('/', h(liveActivity));
export default router;
