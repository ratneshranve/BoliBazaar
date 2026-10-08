import { Router } from 'express';
import { maintenanceGate } from '../core/middleware/maintenance.js';
import configRoutes from '../modules/settings/user/config.routes.js';
import authRoutes from '../modules/auth/user/auth.routes.js';
import meRoutes from '../modules/users/user/me.routes.js';
import uploadRoutes from '../modules/uploads/user/uploads.routes.js';
import pagesRoutes from '../modules/cms/user/pages.routes.js';
import i18nRoutes from '../modules/i18n/user/i18n.routes.js';

/** User-app API, mounted at /api/v1 */
const router = Router();

router.use(maintenanceGate);

router.use('/config', configRoutes);
router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/uploads', uploadRoutes);
router.use('/pages', pagesRoutes);
router.use('/i18n', i18nRoutes);

export default router;
