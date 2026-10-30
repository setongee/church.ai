import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { requireAdmin } from '../middlewares/auth.js';
import * as c from '../controllers/board.controller.js';

// The team task board. Everyone signed in can see it; creating and shaping sprints and tasks is for admins, while the
// people a task is given to can move it, tick its checklist and comment (enforced in the controller).
const router = Router();

router.get('/sprints', h(c.listSprints));
router.post('/sprints', requireAdmin, h(c.createSprint));
router.patch('/sprints/:id', requireAdmin, h(c.updateSprint));
router.post('/sprints/:id/complete', requireAdmin, h(c.completeSprint));
router.delete('/sprints/:id', requireAdmin, h(c.deleteSprint));
router.get('/sprints/:id/tasks', h(c.listTasks));

router.post('/tasks', requireAdmin, h(c.createTask));
router.get('/tasks/:id', h(c.getTask));
router.patch('/tasks/:id', h(c.updateTask));
router.post('/tasks/:id/move', h(c.moveTask));
router.post('/tasks/:id/comments', h(c.addComment));
router.delete('/tasks/:id', requireAdmin, h(c.deleteTask));

export default router;
