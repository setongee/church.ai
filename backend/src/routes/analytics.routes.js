import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { overview as platformOverview } from '../controllers/analytics.controller.js';
import * as ig from '../controllers/instagramAnalytics.controller.js';

const router = Router();

router.get('/overview', h(platformOverview));
router.get('/instagram/status', h(ig.status));
router.get('/instagram/overview', h(ig.overview));
router.get('/instagram/posts/:kind/:id/report', h(ig.postReport));
router.post('/instagram/growth-plan', h(ig.growth));

export default router;
