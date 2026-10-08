import { Notification, NotificationTemplate } from './notification.model.js';
import { EVENTS, GROUPS, render, varsIn } from './catalog.js';
import { User } from '../users/user.model.js';
import { translateTexts } from '../i18n/translate.service.js';
import { pushToUser } from '../../core/services/push.js';
import { emitToUser, isOnline } from '../../realtime/index.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';

/* ───── templates ───── */

/** The wording for an event; created from the starting text the first time it is needed. */
export const getTemplate = async (event) => {
  const def = EVENTS[event];
  if (!def) throw new Error(`Unknown notification event "${event}"`);
  return (
    (await NotificationTemplate.findOne({ event }).lean()) ||
    (await NotificationTemplate.findOneAndUpdate({ event }, { $setOnInsert: { event, title: def.title, body: def.body, enabled: true } }, { upsert: true, new: true, lean: true }))
  );
};

export const listTemplates = async () => {
  const out = [];
  for (const [event, def] of Object.entries(EVENTS)) {
    const t = await getTemplate(event);
    out.push({ event, group: def.group, vars: def.vars, pushOnly: Boolean(def.pushOnly), title: t.title, body: t.body, enabled: t.enabled, updatedAt: t.updatedAt });
  }
  return out;
};

export const saveTemplate = async (event, { title, body, enabled }, adminId) => {
  const def = EVENTS[event];
  if (!def) throw ApiError.notFound('EVENT_NOT_FOUND');
  const stray = [...new Set([...varsIn(title), ...varsIn(body)])].filter((v) => !def.vars.includes(v));
  if (stray.length) {
    throw ApiError.badRequest('VALIDATION_FAILED', `Unknown variable${stray.length > 1 ? 's' : ''}: ${stray.map((v) => `{{${v}}}`).join(', ')}`, {
      fields: { body: `You can use: ${def.vars.map((v) => `{{${v}}}`).join(', ')}` },
    });
  }
  const before = await getTemplate(event);
  const doc = await NotificationTemplate.findOneAndUpdate({ event }, { $set: { title, body, enabled, updatedBy: adminId } }, { new: true, lean: true });
  return { before: { title: before.title, body: before.body, enabled: before.enabled }, after: { title: doc.title, body: doc.body, enabled: doc.enabled } };
};

/* ───── preferences ───── */

/** Push on/off per group. Missing = on. The in-app inbox is always kept. */
export const getPrefs = async (userId) => {
  const user = await User.findById(userId).select('notificationPrefs').lean();
  const saved = user?.notificationPrefs?.groups || {};
  return Object.fromEntries(GROUPS.map((g) => [g, { push: saved[g]?.push !== false }]));
};

export const setPrefs = async (userId, groups) => {
  const current = await getPrefs(userId);
  for (const [g, v] of Object.entries(groups)) if (GROUPS.includes(g) && typeof v?.push === 'boolean') current[g] = { push: v.push };
  await User.updateOne({ _id: userId }, { $set: { 'notificationPrefs.groups': current } });
  return current;
};

/* ───── sending ───── */

const dto = (n) => ({ id: String(n._id), event: n.event, group: n.group, title: n.title, body: n.body, route: n.route || null, readAt: n.readAt || null, createdAt: n.createdAt });

/**
 * Tell a user something happened: saved in their inbox, pushed live to their open devices and sent as a
 * phone push (unless they turned that group off). Wording comes from the admin-edited template and is
 * translated into the user's language. Never throws — a notification problem must not break the action.
 */
export const notify = async (userId, event, vars = {}, { route } = {}) => {
  try {
    const def = EVENTS[event];
    const tpl = await getTemplate(event);
    if (!tpl.enabled) return null;
    const user = await User.findById(userId).select('language notificationPrefs status').lean();
    if (!user || ['banned', 'deleted'].includes(user.status)) return null;

    let { title, body } = tpl;
    if (user.language && user.language !== 'en') {
      try {
        [title, body] = await translateTexts([title, body], user.language); // placeholders stay intact
      } catch {
        /* English is fine */
      }
    }
    title = render(title, vars);
    body = render(body, vars);

    let saved = null;
    if (!def.pushOnly) {
      saved = await Notification.create({ userId, event, group: def.group, title, body, route });
      emitToUser(userId, 'notification:new', dto(saved));
    }

    const pushOn = user.notificationPrefs?.groups?.[def.group]?.push !== false;
    // chat messages are only pushed when the user isn't already looking at the app
    if (pushOn && (!def.pushOnly || !(await isOnline(userId)))) {
      await pushToUser(userId, { title, body, route, collapseKey: event }).catch((err) => logger.warn('Push failed', { event, err: err.message }));
    }
    return saved ? dto(saved) : null;
  } catch (err) {
    logger.error('notify failed', { event, userId: String(userId), err: err.message });
    return null;
  }
};

/* ───── inbox ───── */

export const listNotifications = async (userId, { page = 1, limit = 20 }) => {
  const docs = await Notification.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
  return { items: docs.slice(0, limit).map(dto), page, hasMore: docs.length > limit };
};

export const unreadCount = (userId) => Notification.countDocuments({ userId, readAt: null });

export const markRead = async (userId, ids) => {
  const filter = { userId, readAt: null, ...(ids ? { _id: { $in: ids } } : {}) };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return unreadCount(userId);
};
