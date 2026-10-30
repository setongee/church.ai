import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { listRoles, createRole, updateRole, deleteRole } from '../controllers/role.controller.js';

const router = Router();
router.get('/', h(listRoles));
router.post('/', h(createRole));
router.put('/:id', h(updateRole));
router.delete('/:id', h(deleteRole));
export default router;
