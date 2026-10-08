import { Router } from 'express';
import { requireAdmin } from '../core/middleware/auth.js';
import adminAuthRoutes from '../modules/staff/admin/auth.routes.js';
import staffRoutes from '../modules/staff/admin/staff.routes.js';
import settingsRoutes from '../modules/settings/admin/settings.routes.js';
import auditRoutes from '../modules/audit/admin/audit.routes.js';
import usersRoutes from '../modules/users/admin/users.routes.js';
import dashboardRoutes from '../modules/dashboard/admin/dashboard.routes.js';
import uploadRoutes from '../modules/uploads/admin/uploads.routes.js';
import pagesRoutes from '../modules/cms/admin/pages.routes.js';
import categoriesRoutes from '../modules/categories/admin/categories.routes.js';
import placesRoutes from '../modules/places/admin/places.routes.js';
import bannersRoutes from '../modules/banners/admin/banners.routes.js';
import listingsRoutes from '../modules/listings/admin/listings.routes.js';
import notificationsRoutes from '../modules/notifications/admin/notifications.routes.js';

/** Admin-panel API, mounted at /api/v1/admin */
const router = Router();

router.use('/auth', adminAuthRoutes); // login is public; other auth routes check requireAdmin themselves

router.use(requireAdmin);
router.use('/dashboard', dashboardRoutes);
router.use('/staff', staffRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/users', usersRoutes);
router.use('/uploads', uploadRoutes);
router.use('/cms/pages', pagesRoutes);
router.use('/categories', categoriesRoutes);
router.use('/places', placesRoutes);
router.use('/cms/banners', bannersRoutes);
router.use('/listings', listingsRoutes);
router.use('/notifications', notificationsRoutes);

export default router;
