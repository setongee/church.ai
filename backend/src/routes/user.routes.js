import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { requireAdmin } from '../middlewares/auth.js';
import { listUsers, listTeam, createUser, updateUser, signOutUser, deleteUser, userRosters, assignRoster } from '../controllers/user.controller.js';
import { myAssignments } from '../controllers/roster.controller.js';

const router = Router();

router.get('/team', h(listTeam));
router.get('/me/assignments', h(myAssignments));
router.get('/', requireAdmin, h(listUsers));
router.post('/', requireAdmin, h(createUser));
router.patch('/:id', requireAdmin, h(updateUser));
router.get('/:id/roster', requireAdmin, h(userRosters));
router.post('/:id/roster', requireAdmin, h(assignRoster));
router.post('/:id/sign-out', requireAdmin, h(signOutUser));
router.delete('/:id', requireAdmin, h(deleteUser));

export default router;
