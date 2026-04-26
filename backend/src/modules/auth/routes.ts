import { Router } from 'express';
import { register, login, refresh, logout } from '../controllers/auth';
import { validate } from '../middleware/validate';
import { credentialsSchema, refreshTokenSchema } from '../schemas/auth';

const router = Router();

router.post('/register', validate(credentialsSchema), register);
router.post('/login', validate(credentialsSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refresh);
router.post('/logout', validate(refreshTokenSchema), logout);

export default router;
