import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './core/config/env.js';
import { requestContext, notFound, errorHandler } from './core/middleware/common.js';
import { globalLimiter } from './core/middleware/rateLimit.js';
import { PUBLIC_UPLOAD_DIR } from './core/services/storage.js';
import userRoutes from './routes/user.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { handleWebhook } from './modules/payments/payment.service.js';
import { sitemapXml } from './modules/growth/growth.service.js';
import { mediaUrlMiddleware } from './core/utils/mediaUrl.js';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      // Mobile apps send no Origin header; browsers must be in CORS_ORIGINS.
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
    })
  );
  app.use(compression());
  // keep the raw bytes too: payment webhooks are signed over the exact body
  app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(requestContext);
  app.use(mediaUrlMiddleware); // photos on this server: short "/uploads/…" paths in the DB, full URLs in responses
  app.use(morgan(env.isDev ? 'dev' : 'combined'));

  // Files stored on this VPS (Admin › Storage = VPS). Private files are never served from here.
  app.use('/uploads', express.static(PUBLIC_UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

  app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api', globalLimiter);
  // search engines (served by the API; point the website's /sitemap.xml and /robots.txt here)
  app.get('/sitemap.xml', (req, res, next) => {
    if (!env.PUBLIC_WEB_URL) return res.status(404).type('text/plain').send('Set PUBLIC_WEB_URL in backend .env');
    sitemapXml(env.PUBLIC_WEB_URL.replace(/\/$/, ''))
      .then((xml) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml))
      .catch(next);
  });
  app.get('/robots.txt', (req, res) => {
    const web = env.PUBLIC_WEB_URL?.replace(/\/$/, '');
    res.type('text/plain').send(['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', web ? `Sitemap: ${web}/sitemap.xml` : ''].filter(Boolean).join('\n'));
  });

  // Razorpay webhook: no login, verified by its signature; works even in maintenance mode
  app.post('/api/v1/payments/webhook', (req, res, next) =>
    handleWebhook(req.rawBody || Buffer.from(''), req.get('X-Razorpay-Signature'))
      .then((r) => res.json({ success: true, data: r }))
      .catch(next)
  );
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1', userRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};
