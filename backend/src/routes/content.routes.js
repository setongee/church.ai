import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as c from '../controllers/content.controller.js';
import * as camp from '../controllers/campaign.controller.js';

// The content calendar. Everyone signed in can look; planning, scheduling and posting are for admins and the
// design / service manager / social media roles.
const router = Router();
const write = c.requireContentWriter;

router.get('/', h(c.listItems));
// AI planning and saving a whole plan at once (before '/:id' so these aren't read as ids).
router.post('/ai-plan', write, h(c.aiPlan));
router.post('/ai-plan/item', write, h(c.aiPlanItem));
router.post('/bulk', write, h(c.bulkCreate));
router.get('/campaigns', h(camp.names));
router.get('/campaigns/full', h(camp.list));
router.post('/campaigns/ai', write, h(camp.draftWithAi));
router.post('/campaigns', write, h(camp.create));
router.patch('/campaigns/:id', write, h(camp.update));
router.delete('/campaigns/:id', write, h(camp.remove));
router.get('/uploads', write, h(c.availableUploads));
router.get('/by-upload/:uploadId', h(c.byUpload));
router.post('/', write, h(c.createItem));
router.get('/:id', h(c.getItem));
router.patch('/:id', write, h(c.updateItem));
router.delete('/:id', write, h(c.removeItem));
router.post('/:id/schedule', write, h(c.scheduleItem));
router.post('/:id/unschedule', write, h(c.unscheduleItem));
router.post('/:id/publish-now', write, h(c.publishNow));
router.post('/:id/task', write, h(c.linkTask));
router.delete('/:id/task', write, h(c.unlinkTask));

export default router;
