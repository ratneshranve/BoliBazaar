import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { getSettingValue } from '../../modules/settings/settings.service.js';

const ALWAYS_OPEN = [/^\/config\//, /^\/health$/];

/** Blocks user-app API while Admin › App Control › Maintenance is ON (allow-listed testers pass). */
export const maintenanceGate = (req, res, next) =>
  (async () => {
    if (ALWAYS_OPEN.some((re) => re.test(req.path))) return;
    const control = await getSettingValue('appControl');
    const m = control.maintenance;
    if (!m.enabled) return;

    const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
    if (token && m.allowUserIds.length) {
      try {
        const p = jwt.verify(token, env.USER_JWT_SECRET);
        if (m.allowUserIds.includes(p.sub)) return;
      } catch {
        /* fall through to maintenance */
      }
    }
    throw ApiError.unavailable('MAINTENANCE', m.message || 'Maintenance', { title: m.title, until: m.until });
  })().then(() => next(), next);
