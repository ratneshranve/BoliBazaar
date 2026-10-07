import { Router } from 'express';
import { maintenanceGate } from '../core/middleware/maintenance.js';
import configRoutes from '../modules/settings/user/config.routes.js';
import authRoutes from '../modules/auth/user/auth.routes.js';
import meRoutes from '../modules/users/user/me.routes.js';
import uploadRoutes from '../modules/uploads/user/uploads.routes.js';

/** User-app API, mounted at /api/v1 */
const router = Router();

router.use(maintenanceGate);

router.use('/config', configRoutes);
router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/uploads', uploadRoutes);

export default router;
