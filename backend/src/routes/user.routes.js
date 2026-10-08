import { Router } from 'express';
import { maintenanceGate } from '../core/middleware/maintenance.js';
import configRoutes from '../modules/settings/user/config.routes.js';
import authRoutes from '../modules/auth/user/auth.routes.js';
import meRoutes from '../modules/users/user/me.routes.js';
import uploadRoutes from '../modules/uploads/user/uploads.routes.js';
import pagesRoutes from '../modules/cms/user/pages.routes.js';
import i18nRoutes from '../modules/i18n/user/i18n.routes.js';
import categoriesRoutes from '../modules/categories/user/categories.routes.js';
import placesRoutes from '../modules/places/user/places.routes.js';
import homeRoutes from '../modules/home/user/home.routes.js';
import listingsRoutes from '../modules/listings/user/listings.routes.js';
import chatRoutes from '../modules/chat/user/chat.routes.js';
import notificationsRoutes from '../modules/notifications/user/notifications.routes.js';
import leadsRoutes from '../modules/leads/user/leads.routes.js';
import auctionsRoutes from '../modules/auctions/user/auctions.routes.js';
import paymentsRoutes from '../modules/payments/user/payments.routes.js';

/** User-app API, mounted at /api/v1 */
const router = Router();

router.use(maintenanceGate);

router.use('/config', configRoutes);
router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/uploads', uploadRoutes);
router.use('/pages', pagesRoutes);
router.use('/i18n', i18nRoutes);
router.use('/categories', categoriesRoutes);
router.use('/places', placesRoutes);
router.use('/home', homeRoutes);
router.use('/listings', listingsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/chats', chatRoutes);
router.use('/leads', leadsRoutes);
router.use('/auctions', auctionsRoutes);
router.use('/payments', paymentsRoutes);

export default router;
