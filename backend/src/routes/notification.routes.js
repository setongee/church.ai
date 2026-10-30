import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as c from '../controllers/notification.controller.js';

const router = Router();

router.get('/', h(c.listNotifications));
router.get('/prefs', h(c.getPrefs));
router.put('/prefs', h(c.setPrefs));
router.post('/read-all', h(c.readAll));
router.delete('/', h(c.clearAll));
router.post('/:id/read', h(c.readNotification));

export default router;
