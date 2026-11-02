import { Router } from 'express';
import { memoryUpload } from '../middlewares/upload.js';
import {
  createService,
  updateService,
  listServices,
  getService,
  getServiceQuotes,
  deleteService,
} from '../controllers/service.controller.js';
import { requireAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getRoster, saveRoster, notifyRoster } from '../controllers/roster.controller.js';
import { startLive, endLive, setLiveSession } from '../controllers/live.controller.js';
import { createSessionForService, listSessionsForService } from '../controllers/session.controller.js';

const router = Router();

const templateUpload = memoryUpload.fields([
  { name: 'portraitTemplate', maxCount: 1 },
  { name: 'landscapeTemplate', maxCount: 1 },
]);

router.post('/', requireAdmin, templateUpload, createService);
router.get('/', listServices);
router.get('/:id', getService);
router.patch('/:id', requireAdmin, templateUpload, updateService);
router.delete('/:id', requireAdmin, deleteService);
router.get('/:id/quotes', getServiceQuotes);
router.post('/:id/sessions', createSessionForService);
router.get('/:id/sessions', listSessionsForService);
router.get('/:id/roster', asyncHandler(getRoster));
router.put('/:id/roster', requireAdmin, asyncHandler(saveRoster));
router.post('/:id/roster/notify', requireAdmin, asyncHandler(notifyRoster));
// Service mode: starting and ending the service and its sessions is for admins and service managers (the router's
// write gate lets only them through).
router.post('/:id/live/start', asyncHandler(startLive));
router.post('/:id/live/end', asyncHandler(endLive));
router.post('/:id/live/session', asyncHandler(setLiveSession));

export default router;
