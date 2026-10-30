import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { requireAuth } from '../middlewares/auth.js';
import { status, setup, login, me, logout, changePassword, getPrefs, setPrefs } from '../controllers/auth.controller.js';

const router = Router();

router.get('/status', h(status));
router.post('/setup', h(setup));
router.post('/login', h(login));
router.get('/me', requireAuth, h(me));
router.post('/logout', requireAuth, h(logout));
router.post('/password', requireAuth, h(changePassword));
router.get('/prefs', requireAuth, h(getPrefs));
router.put('/prefs', requireAuth, h(setPrefs));

export default router;
