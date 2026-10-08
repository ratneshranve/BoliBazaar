import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta, escapeRegex } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { Payment, Commission, PURPOSES, PAYMENT_STATUSES } from '../payment.model.js';
import { refundPayment, paymentDto } from '../payment.service.js';
import { factorOf } from '../pricing.service.js';
import { User } from '../../users/user.model.js';
import { Listing } from '../../listings/listing.model.js';
import { auditAdmin } from '../../audit/audit.service.js';
import { Ad } from '../../ads/ad.model.js';
import { Subscription, Promotion } from '../payment.model.js';

const router = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);

const users = async (ids) => new Map((await User.find({ _id: { $in: ids } }).select('name phone.e164').lean()).map((u) => [String(u._id), { id: String(u._id), name: u.name || null, phone: u.phone?.e164 || null }]));

const paymentFilter = async (q) => {
  const f = {};
  if (PAYMENT_STATUSES.includes(q.status)) f.status = q.status;
  else f.status = { $ne: 'created' };
  if (PURPOSES.includes(q.purpose)) f.purpose = q.purpose;
  if (q.from || q.to) f.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    const u = await User.find({ $or: [{ name: re }, { 'phone.e164': re }] }).select('_id').limit(200).lean();
    f.$or = [{ invoiceNo: re }, { gatewayPaymentId: re }, { gatewayOrderId: re }, { userId: { $in: u.map((x) => x._id) } }];
  }
  return f;
};

/* ───── payments ───── */

router.get(
  '/',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = await paymentFilter(req.query);
    const [docs, total] = await Promise.all([Payment.find(f).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(), Payment.countDocuments(f)]);
    const who = await users(docs.map((d) => d.userId));
    ok(res, docs.map((p) => ({ ...paymentDto(p), user: who.get(String(p.userId)), gateway: p.gateway, gatewayPaymentId: p.gatewayPaymentId || null, fulfilled: Boolean(p.fulfilledAt), refunds: p.refunds })), pageMeta(paging, total));
  })
);

/** Revenue over a period: collected, refunded and net, split by what was bought. */
router.get(
  '/summary',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const days = Math.min(366, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await Payment.aggregate([
      { $match: { paidAt: { $gte: since }, status: { $in: ['paid', 'refunded', 'partially_refunded'] } } },
      { $group: { _id: '$purpose', count: { $sum: 1 }, gross: { $sum: '$totalMinor' }, tax: { $sum: '$taxMinor' }, refunded: { $sum: '$refundedMinor' }, currency: { $first: '$currency' } } },
    ]);
    const daily = await Payment.aggregate([
      { $match: { paidAt: { $gte: since }, status: { $in: ['paid', 'refunded', 'partially_refunded'] } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, gross: { $sum: '$totalMinor' } } },
      { $sort: { _id: 1 } },
    ]);
    const [stuck, dueCommission, overdueCommission] = await Promise.all([
      Payment.countDocuments({ status: 'paid', fulfilledAt: null }),
      Commission.aggregate([{ $match: { status: 'due' } }, { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$amountMinor' } } }]),
      Commission.countDocuments({ status: 'due', dueAt: { $lt: new Date() } }),
    ]);
    const ads = await Ad.aggregate([{ $match: { paid: true, paidAt: { $gte: since } } }, { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$priceMinor' }, currency: { $first: '$currency' } } }]);
    if (ads[0]) rows.push({ _id: 'advertising', count: ads[0].count, gross: ads[0].gross, tax: 0, refunded: 0, currency: ads[0].currency });
    const [activePromotions, activePlans] = await Promise.all([Promotion.countDocuments({ endAt: { $gt: new Date() } }), Subscription.countDocuments({ startAt: { $lte: new Date() }, endAt: { $gt: new Date() } })]);
    const currency = rows[0]?.currency;
    ok(res, {
      days,
      currency: currency || null,
      factor: currency ? factorOf(currency) : 100,
      byPurpose: rows.map((r) => ({ purpose: r._id, count: r.count, grossMinor: r.gross, taxMinor: r.tax, refundedMinor: r.refunded, netMinor: r.gross - r.refunded })),
      daily: daily.map((d) => ({ date: d._id, grossMinor: d.gross })),
      unfulfilled: stuck,
      activePromotions,
      activePlans,
      commissionsDue: { count: dueCommission[0]?.n || 0, amountMinor: dueCommission[0]?.amount || 0, overdue: overdueCommission },
    });
  })
);

/** CSV of payments for accounting (same filters as the list). */
router.get(
  '/export.csv',
  requirePermission('finance.export'),
  asyncHandler(async (req, res) => {
    const docs = await Payment.find(await paymentFilter(req.query)).sort({ createdAt: -1 }).limit(50000).lean();
    const who = await users(docs.map((d) => d.userId));
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const amt = (minor, cur) => (minor / factorOf(cur)).toFixed(Math.log10(factorOf(cur)));
    const lines = [['Date', 'Invoice', 'User', 'Phone', 'Purpose', 'Description', 'Base', 'Discount', 'Tax', 'Total', 'Refunded', 'Currency', 'Status', 'Gateway payment'].join(',')];
    for (const p of docs) {
      const u = who.get(String(p.userId));
      lines.push([p.paidAt?.toISOString() || p.createdAt.toISOString(), p.invoiceNo, u?.name, u?.phone, p.purpose, p.description, amt(p.baseMinor, p.currency), amt(p.discountMinor, p.currency), amt(p.taxMinor, p.currency), amt(p.totalMinor, p.currency), amt(p.refundedMinor || 0, p.currency), p.currency, p.status, p.gatewayPaymentId].map(cell).join(','));
    }
    await auditAdmin(req, { action: 'finance.export', entityType: 'Payment', entityId: 'csv', after: { rows: docs.length } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\n'));
  })
);

router.post(
  '/:id/refund',
  requirePermission('finance.refund'),
  validate({ params: z.object({ id }), body: z.object({ amount: z.number().positive().optional(), reason: z.string().trim().min(3).max(300) }) }),
  asyncHandler(async (req, res) => {
    const p = await refundPayment(req.params.id, req.body, req.admin.id);
    await auditAdmin(req, { action: 'finance.refund', entityType: 'Payment', entityId: p._id, after: { status: p.status, refundedMinor: p.refundedMinor }, reason: req.body.reason });
    ok(res, paymentDto(p));
  })
);

/* ───── commissions ───── */

router.get(
  '/commissions',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = ['due', 'paid', 'waived'].includes(req.query.status) ? { status: req.query.status } : {};
    if (req.query.overdue === 'true') Object.assign(f, { status: 'due', dueAt: { $lt: new Date() } });
    const [docs, total] = await Promise.all([Commission.find(f).sort({ dueAt: 1 }).skip(paging.skip).limit(paging.limit).lean(), Commission.countDocuments(f)]);
    const who = await users(docs.map((d) => d.userId));
    const titles = new Map((await Listing.find({ _id: { $in: docs.map((d) => d.listingId) } }).select('title').lean()).map((l) => [String(l._id), l.title]));
    ok(
      res,
      docs.map((c) => ({ id: String(c._id), user: who.get(String(c.userId)), role: c.role, rule: c.rule || null, title: titles.get(String(c.listingId)) || null, saleMinor: c.saleMinor, amountMinor: c.amountMinor, currency: c.currency, factor: factorOf(c.currency), status: c.status, dueAt: c.dueAt, overdue: c.status === 'due' && c.dueAt < new Date(), paidAt: c.paidAt || null, waivedReason: c.waivedReason || null })),
      pageMeta(paging, total)
    );
  })
);

router.post(
  '/commissions/:id/waive',
  requirePermission('finance.waive'),
  validate({ params: z.object({ id }), body: z.object({ reason: z.string().trim().min(3).max(300) }) }),
  asyncHandler(async (req, res) => {
    const c = await Commission.findOneAndUpdate({ _id: req.params.id, status: 'due' }, { $set: { status: 'waived', waivedReason: req.body.reason } }, { new: true });
    if (!c) throw ApiError.badRequest('NOT_DUE', 'Only a due commission can be waived');
    await auditAdmin(req, { action: 'finance.waive_commission', entityType: 'Commission', entityId: c._id, before: { status: 'due' }, after: { status: 'waived' }, reason: req.body.reason });
    ok(res, { id: String(c._id), status: c.status });
  })
);

export default router;
