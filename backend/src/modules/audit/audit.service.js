import { AuditLog } from './audit.model.js';
import { logger } from '../../core/utils/logger.js';

/** Record an admin action from inside a request handler. */
export const auditAdmin = async (req, { action, entityType, entityId, before, after, reason }) => {
  try {
    await AuditLog.create({
      actorType: 'admin',
      actorId: req.admin?.id,
      actorName: req.admin?.name,
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      before,
      after,
      reason,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.id,
    });
  } catch (err) {
    // Auditing must never be silently lost: surface loudly in logs.
    logger.error('AUDIT WRITE FAILED', { action, entityType, entityId, err: err.message });
    throw err;
  }
};

export const auditSystem = (data) => AuditLog.create({ actorType: 'system', ...data });
