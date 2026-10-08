import crypto from 'node:crypto';
import { Report, Case, Verification, REPORT_TARGETS } from './trust.model.js';
import { Listing } from '../listings/listing.model.js';
import { User } from '../users/user.model.js';
import { Message, Conversation } from '../chat/chat.model.js';
import { Media } from '../uploads/media.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { notify } from '../notifications/notification.service.js';
import { ApiError } from '../../core/utils/ApiError.js';

const HOUR_MS = 60 * 60 * 1000;
const oid = (v) => String(v);

/* ───────── reports ───────── */

/** Who owns the reported thing, plus a copy of it as evidence. */
const resolveTarget = async (type, id, reporterId) => {
  if (type === 'listing') {
    const l = await Listing.findById(id).select('ownerId title description status listingNo').lean();
    if (!l || l.status === 'deleted') throw ApiError.notFound('TARGET_NOT_FOUND');
    return { ownerId: l.ownerId, snapshot: { title: l.title, description: l.description, listingNo: l.listingNo } };
  }
  if (type === 'user') {
    const u = await User.findById(id).select('name publicId').lean();
    if (!u) throw ApiError.notFound('TARGET_NOT_FOUND');
    return { ownerId: u._id, snapshot: { name: u.name, publicId: u.publicId } };
  }
  const m = await Message.findById(id).lean();
  if (!m) throw ApiError.notFound('TARGET_NOT_FOUND');
  // only someone in the conversation can report a message
  const c = await Conversation.findById(m.conversationId).select('buyerId sellerId').lean();
  if (!c || ![oid(c.buyerId), oid(c.sellerId)].includes(oid(reporterId))) throw ApiError.notFound('TARGET_NOT_FOUND');
  return { ownerId: m.senderId, snapshot: { text: m.text, sentAt: m.createdAt, conversationId: oid(m.conversationId) } };
};

export const createReport = async (reporterId, { targetType, targetId, reason, details }) => {
  const m = await getSettingValue('moderation');
  if (!m.reportReasons[targetType].includes(reason)) throw ApiError.badRequest('REASON_INVALID', 'Please choose one of the reasons');
  const { ownerId, snapshot } = await resolveTarget(targetType, targetId, reporterId);
  if (oid(ownerId) === oid(reporterId)) throw ApiError.badRequest('OWN_CONTENT', 'You cannot report yourself');
  if (await Report.exists({ reporterId, targetType, targetId, status: { $in: ['received', 'under_review'] } })) {
    throw ApiError.conflict('ALREADY_REPORTED', 'You have already reported this. We are looking into it.');
  }
  const r = await Report.create({ reporterId, targetType, targetId, targetUserId: ownerId, reason, details, snapshot });

  // enough different people reporting the same ad within a day hides it until someone checks
  if (targetType === 'listing' && m.reportAutoHideThreshold > 0) {
    const reporters = await Report.distinct('reporterId', { targetType: 'listing', targetId, createdAt: { $gte: new Date(Date.now() - 24 * HOUR_MS) } });
    if (reporters.length >= m.reportAutoHideThreshold) {
      await Listing.updateOne({ _id: targetId, status: 'published' }, { $set: { status: 'pending_review', 'moderation.reason': 'Hidden after several reports — waiting for review' } });
    }
  }
  return reportDto(r);
};

const reportDto = (r) => ({ id: oid(r._id), targetType: r.targetType, targetId: oid(r.targetId), reason: r.reason, details: r.details || null, status: r.status, resolutionNote: r.resolution?.note || null, createdAt: r.createdAt, snapshot: r.snapshot });

export const myReports = async (userId) => (await Report.find({ reporterId: userId }).sort({ createdAt: -1 }).limit(100).lean()).map(reportDto);

/** Admin decision on every open report about one target. */
export const resolveReports = async ({ targetType, targetId, outcome, note, adminId }) => {
  const open = await Report.find({ targetType, targetId, status: { $in: ['received', 'under_review'] } }).lean();
  if (!open.length) throw ApiError.notFound('NO_OPEN_REPORTS');
  await Report.updateMany({ _id: { $in: open.map((r) => r._id) } }, { $set: { status: outcome, resolution: { note, by: adminId, at: new Date() } } });
  // an ad hidden by reports comes back if nothing was wrong
  if (targetType === 'listing' && outcome === 'no_violation') {
    await Listing.updateOne({ _id: targetId, status: 'pending_review', 'moderation.reason': /^Hidden after several reports/ }, { $set: { status: 'published' }, $unset: { 'moderation.reason': 1 } });
  }
  for (const r of open) await notify(r.reporterId, 'report.update', { status: outcome === 'action_taken' ? 'action was taken' : 'no rule was broken', note }, { route: '/reports' });
  return open.length;
};

/** Open reports grouped by what was reported, most-reported first. */
export const reportQueue = async ({ status = 'open', targetType, page = 1, limit = 20 }) => {
  const match = status === 'open' ? { status: { $in: ['received', 'under_review'] } } : { status };
  if (REPORT_TARGETS.includes(targetType)) match.targetType = targetType;
  const groups = await Report.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $group: { _id: { t: '$targetType', id: '$targetId' }, count: { $sum: 1 }, reasons: { $addToSet: '$reason' }, last: { $max: '$createdAt' }, first: { $min: '$createdAt' }, targetUserId: { $first: '$targetUserId' }, snapshot: { $first: '$snapshot' }, reports: { $push: { id: '$_id', reason: '$reason', details: '$details', reporterId: '$reporterId', at: '$createdAt', status: '$status' } } } },
    { $sort: { count: -1, last: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit + 1 },
  ]);
  const userIds = groups.flatMap((g) => [g.targetUserId, ...g.reports.map((r) => r.reporterId)]).filter(Boolean);
  const users = new Map((await User.find({ _id: { $in: userIds } }).select('name phone.e164 status').lean()).map((u) => [oid(u._id), u]));
  const who = (id) => (id ? { id: oid(id), name: users.get(oid(id))?.name || null, phone: users.get(oid(id))?.phone?.e164 || null, status: users.get(oid(id))?.status || null } : null);
  const listingStatus = new Map((await Listing.find({ _id: { $in: groups.filter((g) => g._id.t === 'listing').map((g) => g._id.id) } }).select('status').lean()).map((l) => [oid(l._id), l.status]));
  return {
    items: groups.slice(0, limit).map((g) => ({
      targetType: g._id.t,
      targetId: oid(g._id.id),
      count: g.count,
      reasons: g.reasons,
      first: g.first,
      last: g.last,
      owner: who(g.targetUserId),
      snapshot: g.snapshot,
      listingStatus: listingStatus.get(oid(g._id.id)) || null,
      reports: g.reports.slice(0, 20).map((r) => ({ id: oid(r.id), reason: r.reason, details: r.details || null, reporter: who(r.reporterId), at: r.at, status: r.status })),
    })),
    hasMore: groups.length > limit,
  };
};

/* ───────── cases ───────── */

const newCaseNo = () => `C${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

export const createCase = async (userId, { type, subject, message, related = {}, amountLost, mediaIds = [] }) => {
  const s = await getSettingValue('support');
  const media = mediaIds.length ? await Media.find({ _id: { $in: mediaIds }, ownerType: 'user', ownerId: userId }).select('_id').lean() : [];
  if (media.length !== mediaIds.length) throw ApiError.badRequest('MEDIA_INVALID', 'One of the files was not found');
  const now = Date.now();
  const c = await Case.create({
    caseNo: newCaseNo(),
    userId,
    type,
    subject,
    related,
    amountLost,
    priority: type === 'fraud' ? 'high' : 'normal',
    messages: [{ by: 'user', text: message, mediaIds: media.map((x) => x._id) }],
    ackBy: new Date(now + s.ackHours * HOUR_MS),
    resolveBy: new Date(now + s.resolveHours[type] * HOUR_MS),
    lastUserMessageAt: new Date(),
  });
  return caseDto(c, { forUser: true });
};

const caseDto = (c, { forUser }) => ({
  id: oid(c._id),
  caseNo: c.caseNo,
  type: c.type,
  subject: c.subject,
  status: c.status,
  priority: c.priority,
  related: c.related ? Object.fromEntries(Object.entries(c.related).filter(([, v]) => v).map(([k, v]) => [k, oid(v)])) : {},
  amountLost: c.amountLost ?? null,
  messages: c.messages.filter((m) => !(forUser && m.internal)).map((m) => ({ id: oid(m._id), by: m.by, text: m.text, mediaIds: (m.mediaIds || []).map(oid), internal: Boolean(m.internal), at: m.at })),
  ackBy: c.ackBy,
  resolveBy: c.resolveBy,
  resolvedAt: c.resolvedAt || null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export const myCases = async (userId) =>
  (await Case.find({ userId }).sort({ updatedAt: -1 }).limit(100).lean()).map((c) => {
    const d = caseDto(c, { forUser: true });
    return { ...d, messages: undefined, lastMessage: d.messages.at(-1) || null, awaitingYou: c.status === 'waiting_user' };
  });

export const getMyCase = async (userId, id) => {
  const c = await Case.findOne({ _id: id, userId }).lean();
  if (!c) throw ApiError.notFound('CASE_NOT_FOUND');
  return caseDto(c, { forUser: true });
};

export const userReply = async (userId, id, text) => {
  const c = await Case.findOne({ _id: id, userId });
  if (!c) throw ApiError.notFound('CASE_NOT_FOUND');
  if (c.status === 'closed') throw ApiError.badRequest('CASE_CLOSED', 'This case is closed — open a new one if you still need help');
  c.messages.push({ by: 'user', text });
  c.lastUserMessageAt = new Date();
  if (['waiting_user', 'resolved'].includes(c.status)) c.status = 'open';
  await c.save();
  return caseDto(c, { forUser: true });
};

export const userCloseCase = async (userId, id) => {
  const c = await Case.findOneAndUpdate({ _id: id, userId, status: { $ne: 'closed' } }, { $set: { status: 'closed' }, $push: { messages: { by: 'system', text: 'Closed by the user' } } }, { new: true });
  if (!c) throw ApiError.notFound('CASE_NOT_FOUND');
  return caseDto(c, { forUser: true });
};

/** Admin answer (or an internal note the user never sees). */
export const adminReply = async (adminId, id, { text, internal, status }) => {
  const c = await Case.findById(id);
  if (!c) throw ApiError.notFound('CASE_NOT_FOUND');
  if (text) {
    c.messages.push({ by: 'admin', adminId, text, internal: Boolean(internal) });
    if (!internal) {
      c.lastAdminMessageAt = new Date();
      if (!c.acknowledgedAt) c.acknowledgedAt = new Date();
    }
  }
  const before = c.status;
  if (status) {
    c.status = status;
    if (status === 'resolved' && !c.resolvedAt) c.resolvedAt = new Date();
  } else if (text && !internal && c.status === 'open') c.status = 'in_progress';
  if (!c.assigneeId) c.assigneeId = adminId;
  await c.save();
  if (text && !internal) await notify(c.userId, 'case.reply', { subject: c.subject }, { route: `/help/cases/${c._id}` });
  else if (status && status !== before) await notify(c.userId, 'case.status', { subject: c.subject, status: status.replace('_', ' ') }, { route: `/help/cases/${c._id}` });
  return c;
};

export const caseQueue = async ({ status, type, overdue, page = 1, limit = 20 }) => {
  const f = {};
  if (status === 'active') f.status = { $in: ['open', 'in_progress', 'waiting_user'] };
  else if (status) f.status = status;
  if (type) f.type = type;
  if (overdue) Object.assign(f, { status: { $in: ['open', 'in_progress'] }, resolveBy: { $lt: new Date() } });
  const [docs, total] = await Promise.all([Case.find(f).sort({ priority: 1, resolveBy: 1 }).skip((page - 1) * limit).limit(limit).lean(), Case.countDocuments(f)]);
  const users = new Map((await User.find({ _id: { $in: docs.map((d) => d.userId) } }).select('name phone.e164').lean()).map((u) => [oid(u._id), u]));
  const now = Date.now();
  return {
    total,
    items: docs.map((c) => ({
      ...caseDto(c, { forUser: false }),
      messages: undefined,
      messageCount: c.messages.length,
      user: { id: oid(c.userId), name: users.get(oid(c.userId))?.name || null, phone: users.get(oid(c.userId))?.phone?.e164 || null },
      ackOverdue: !c.acknowledgedAt && c.ackBy < now,
      overdue: ['open', 'in_progress'].includes(c.status) && c.resolveBy < now,
      waitingOnUs: ['open', 'in_progress'].includes(c.status),
    })),
  };
};

export const adminCase = async (id) => {
  const c = await Case.findById(id).lean();
  if (!c) throw ApiError.notFound('CASE_NOT_FOUND');
  const user = await User.findById(c.userId).select('name phone.e164 email.address status createdAt').lean();
  return { ...caseDto(c, { forUser: false }), user: user ? { id: oid(user._id), name: user.name || null, phone: user.phone?.e164, email: user.email?.address || null, status: user.status, memberSince: user.createdAt } : null };
};

/* ───────── verification badges ───────── */

export const submitVerification = async (userId, { type, docType, docNumber, businessName, mediaIds }) => {
  if (await Verification.exists({ userId, type, status: 'pending' })) throw ApiError.conflict('ALREADY_PENDING', 'Your documents are already being checked');
  const user = await User.findById(userId).select('verification').lean();
  if (type === 'id' ? user?.verification?.idVerifiedAt : user?.verification?.businessVerifiedAt) throw ApiError.badRequest('ALREADY_VERIFIED', 'You are already verified');
  const media = await Media.find({ _id: { $in: mediaIds }, ownerType: 'user', ownerId: userId, visibility: 'private' }).select('_id').lean();
  if (media.length !== mediaIds.length) throw ApiError.badRequest('MEDIA_INVALID', 'Upload the documents again');
  const digits = String(docNumber || '').replace(/\s/g, '');
  const v = await Verification.create({ userId, type, docType, docLast4: digits ? digits.slice(-4) : undefined, businessName, mediaIds });
  return verificationDto(v);
};

const verificationDto = (v) => ({ id: oid(v._id), type: v.type, docType: v.docType, docLast4: v.docLast4 || null, businessName: v.businessName || null, status: v.status, reason: v.reason || null, createdAt: v.createdAt, reviewedAt: v.reviewedAt || null });

export const myVerification = async (userId) => {
  const [user, latest] = await Promise.all([User.findById(userId).select('verification phone.verifiedAt email').lean(), Verification.find({ userId }).sort({ createdAt: -1 }).limit(10).lean()]);
  const last = (type) => latest.find((v) => v.type === type);
  return {
    phone: Boolean(user?.phone?.verifiedAt),
    email: Boolean(user?.email?.verifiedAt),
    id: { verified: Boolean(user?.verification?.idVerifiedAt), latest: last('id') ? verificationDto(last('id')) : null },
    business: { verified: Boolean(user?.verification?.businessVerifiedAt), name: user?.verification?.businessName || null, latest: last('business') ? verificationDto(last('business')) : null },
  };
};

export const decideVerification = async (adminId, id, { action, reason }) => {
  const v = await Verification.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: { status: action === 'approve' ? 'approved' : 'rejected', reason, reviewedBy: adminId, reviewedAt: new Date() } }, { new: true });
  if (!v) throw ApiError.badRequest('NOT_PENDING', 'This request was already decided');
  if (action === 'approve') {
    const set = v.type === 'id' ? { 'verification.idVerifiedAt': new Date() } : { 'verification.businessVerifiedAt': new Date(), 'verification.businessName': v.businessName };
    await User.updateOne({ _id: v.userId }, { $set: set });
    await notify(v.userId, 'verification.approved', { badge: v.type === 'id' ? 'ID verified' : 'Verified business' }, { route: '/verification' });
  } else {
    await notify(v.userId, 'verification.rejected', { badge: v.type === 'id' ? 'ID verified' : 'Verified business', reason }, { route: '/verification' });
  }
  return v;
};

export const verificationQueue = async ({ status = 'pending', page = 1, limit = 20 }) => {
  const [docs, total] = await Promise.all([Verification.find({ status }).sort({ createdAt: status === 'pending' ? 1 : -1 }).skip((page - 1) * limit).limit(limit).lean(), Verification.countDocuments({ status })]);
  const users = new Map((await User.find({ _id: { $in: docs.map((d) => d.userId) } }).select('name phone.e164 createdAt').lean()).map((u) => [oid(u._id), u]));
  return {
    total,
    items: docs.map((v) => ({ ...verificationDto(v), mediaIds: v.mediaIds.map(oid), user: { id: oid(v.userId), name: users.get(oid(v.userId))?.name || null, phone: users.get(oid(v.userId))?.phone?.e164 || null, memberSince: users.get(oid(v.userId))?.createdAt } })),
  };
};
