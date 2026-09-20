import { Router } from 'express';
import { memoryUpload } from '../middlewares/upload.js';
import {
  createService,
  updateService,
  listServices,
  getService,
  getServiceQuotes,
} from '../controllers/service.controller.js';
import { createSessionForService, listSessionsForService } from '../controllers/session.controller.js';

const router = Router();

const templateUpload = memoryUpload.fields([
  { name: 'portraitTemplate', maxCount: 1 },
  { name: 'landscapeTemplate', maxCount: 1 },
]);

router.post('/', templateUpload, createService);
router.get('/', listServices);
router.get('/:id', getService);
router.patch('/:id', templateUpload, updateService);
router.get('/:id/quotes', getServiceQuotes);
router.post('/:id/sessions', createSessionForService);
router.get('/:id/sessions', listSessionsForService);

export default router;
