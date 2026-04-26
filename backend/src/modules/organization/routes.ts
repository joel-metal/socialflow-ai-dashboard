import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createOrganization,
  listOrganizations,
  getOrganization,
  addMember,
  removeMember,
  switchOrganization,
} from '../controllers/organization';

const router = Router();

// All org routes require authentication
router.use(authMiddleware);

router.post('/', createOrganization);
router.get('/', listOrganizations);
router.post('/switch', switchOrganization);
router.get('/:orgId', getOrganization);
router.post('/:orgId/members', addMember);
router.delete('/:orgId/members/:userId', removeMember);

export default router;
