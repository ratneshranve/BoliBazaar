import { Payment, Promotion, Subscription, Commission, nextNumber } from './payment.model.js';
import { quote, factorOf, commissionRuleFor, commissionShares } from './pricing.service.js';
import { razorpay } from './razorpay.js';
import { Listing } from '../listings/listing.model.js';
import { Category } from '../categories/category.model.js';
import { User } from '../users/user.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { notify } from '../notifications/notification.service.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';
import { toPublicUrl } from '../../core/utils/mediaUrl.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ORDER_TTL_MS = 30 * 60 * 1000;
const oid = (v) => String(v);

const money = (minor, currency) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency }).format(minor / factorOf(currency));

/** Indian financial year label, e.g. "2026-27" (April → March). */
const financialYear = (d = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

/* ───── turning a paid order into what was bought ───── */

const fulfilListingFee = async (p) => {
  const l = await Listing.findOne({ _id: p.refId, status: 'payment_pending' });
  if (!l) return;
  const category = await Category.findById(l.categoryId).select('rules').lean();
  const now = new Date();
  l.paidListing = true;
  if (category?.rules?.requiresReview) l.status = 'pending_review';
  else {
    l.status = 'published';
    l.publishedAt = now;
    l.expiresAt = new Date(now.getTime() + (category?.rules?.validityDays ?? 30) * DAY_MS);
  }
  await l.save();
};

const fulfilPromotion = async (p) => {
  const { promotions } = await getSettingValue('monetization');
  const pkg = promotions.find((x) => x.code === p.productCode);
  const l = await Listing.findById(p.refId);
  if (!pkg || !l) throw new Error('Promotion package or listing missing');
  const now = new Date();
  // nothing to pay means one of the plan's included promotions was used
  const includedInPlan = p.totalMinor === 0;
  if (includedInPlan) {
    const used = await Subscription.updateOne({ userId: p.userId, startAt: { $lte: now }, endAt: { $gt: now }, [`credits.${pkg.type}`]: { $gt: 0 } }, { $inc: { [`credits.${pkg.type}`]: -1 } });
    if (!used.modifiedCount) throw new Error('No plan credit left for this promotion');
  }
  const field = `${pkg.type}Until`;
  const from = l.promo?.[field] && l.promo[field] > now ? l.promo[field] : now; // buying again extends
  const until = new Date(from.getTime() + pkg.days * DAY_MS);
  l.set(`promo.${field}`, until);
  if (l.expiresAt && l.expiresAt < until) l.expiresAt = until; // the ad stays up while it is promoted
  await Promotion.create({ listingId: l._id, userId: p.userId, paymentId: p._id, type: pkg.type, productCode: pkg.code, startAt: from, endAt: until, includedInPlan });
  await l.save();
};

const fulfilPlan = async (p) => {
  const { plans } = await getSettingValue('monetization');
  const plan = plans.find((x) => x.code === p.productCode);
  if (!plan) throw new Error('Plan missing');
  const now = new Date();
  const current = await Subscription.findOne({ userId: p.userId, endAt: { $gt: now } }).sort({ endAt: -1 }).lean();
  const startAt = current ? current.endAt : now; // a second purchase starts when the first ends
  const credits = Object.fromEntries((plan.includedPromotions || []).map((x) => [x.type, x.count]));
  await Subscription.create({ userId: p.userId, paymentId: p._id, planCode: plan.code, planName: plan.name, extraFreeAds: plan.extraFreeAds, credits, startAt, endAt: new Date(startAt.getTime() + plan.days * DAY_MS) });
};

const fulfilCommission = (p) => Commission.updateOne({ _id: p.refId, status: 'due' }, { $set: { status: 'paid', paidAt: new Date(), paymentId: p._id } });

const FULFIL = { listing_fee: fulfilListingFee, promotion: fulfilPromotion, plan: fulfilPlan, commission: fulfilCommission };

/** created → paid exactly once, then deliver what was bought. Safe to call again (webhook + verify both do). */
const markPaid = async (paymentDocId, gatewayPaymentId) => {
  const p = await Payment.findOneAndUpdate(
    { _id: paymentDocId, status: { $in: ['created', 'failed'] } },
    { $set: { status: 'paid', paidAt: new Date(), gatewayPaymentId, invoiceNo: `INV/${financialYear()}/${String(await nextNumber(`invoice:${financialYear()}`)).padStart(6, '0')}` }, $unset: { expiresAt: 1 } },
    { new: true }
  );
  if (!p) return Payment.findById(paymentDocId);
  try {
    await FULFIL[p.purpose](p);
    await Payment.updateOne({ _id: p._id }, { $set: { fulfilledAt: new Date() } });
  } catch (err) {
    // money taken but delivery failed: keep it visible to finance (fulfilledAt stays empty)
    logger.error('Payment fulfilment failed', { paymentId: oid(p._id), err: err.message });
  }
  await notify(p.userId, 'payment.success', { item: p.description, amount: money(p.totalMinor, p.currency) }, { route: '/payments' });
  return Payment.findById(p._id);
};

/* ───── buying ───── */

/** Price it on the server, then open a gateway order (or finish at once when nothing is owed). */
export const createOrder = async (userId, input) => {
  const q = await quote({ userId, ...input });
  const p = await Payment.create({
    userId,
    purpose: q.purpose,
    refId: q.refId || undefined,
    productCode: q.productCode || undefined,
    description: q.description,
    currency: q.currency,
    baseMinor: q.baseMinor,
    taxMinor: q.taxMinor,
    taxPercent: q.taxPercent,
    totalMinor: q.totalMinor,
    gateway: q.totalMinor > 0 ? 'razorpay' : 'none',
    expiresAt: new Date(Date.now() + ORDER_TTL_MS),
  });

  if (q.totalMinor === 0) {
    const done = await markPaid(p._id, null);
    return { payment: paymentDto(done), checkout: null };
  }

  let order;
  try {
    order = await razorpay.createOrder({ amountMinor: q.totalMinor, currency: q.currency, receipt: oid(p._id), notes: { purpose: q.purpose, paymentId: oid(p._id) } });
  } catch (err) {
    await Payment.updateOne({ _id: p._id }, { $set: { status: 'failed', failureReason: err.code === 'PAYMENTS_UNAVAILABLE' ? 'Payments unavailable' : 'Could not start the payment' } });
    if (err instanceof ApiError) throw err;
    logger.error('Razorpay order failed', { err: err.message });
    throw ApiError.unavailable('PAYMENT_GATEWAY_ERROR', 'Could not start the payment, please try again');
  }
  await Payment.updateOne({ _id: p._id }, { $set: { gatewayOrderId: order.id } });
  const user = await User.findById(userId).select('name phone.e164 email.address').lean();
  const branding = await getSettingValue('branding');
  return {
    payment: paymentDto({ ...p.toObject(), gatewayOrderId: order.id }),
    // everything the Razorpay checkout needs; the key id is public by design
    checkout: {
      key: razorpay.keyId(),
      orderId: order.id,
      amount: q.totalMinor,
      currency: q.currency,
      name: branding.appName || undefined,
      image: branding.icon?.url || branding.logo?.url || undefined,
      description: q.description,
      prefill: { name: user?.name || undefined, contact: user?.phone?.e164, email: user?.email?.address || undefined },
    },
  };
};

/** Called by the app after checkout succeeds. The signature proves Razorpay sent it. */
export const verifyCheckout = async (userId, { orderId, paymentId, signature }) => {
  const p = await Payment.findOne({ gatewayOrderId: orderId, userId });
  if (!p) throw ApiError.notFound('PAYMENT_NOT_FOUND');
  if (!razorpay.verifyPayment({ orderId, paymentId, signature })) throw ApiError.badRequest('SIGNATURE_INVALID', 'Payment could not be verified');
  return paymentDto(await markPaid(p._id, paymentId));
};

/** Checkout closed or failed on the device. */
export const markFailed = async (userId, orderId, reason) => {
  await Payment.updateOne({ gatewayOrderId: orderId, userId, status: 'created' }, { $set: { status: 'failed', failureReason: String(reason || 'Cancelled').slice(0, 200) } });
};

/** Razorpay webhook: the source of truth when the app never came back. */
export const handleWebhook = async (rawBody, signature) => {
  if (!razorpay.verifyWebhook(rawBody, signature)) throw ApiError.unauthorized('SIGNATURE_INVALID');
  const evt = JSON.parse(rawBody.toString('utf8'));
  const entity = evt.payload?.payment?.entity;
  if (!entity?.order_id) return { ignored: true };
  const p = await Payment.findOne({ gatewayOrderId: entity.order_id });
  if (!p) return { ignored: true };
  if (evt.event === 'payment.captured' || evt.event === 'order.paid') await markPaid(p._id, entity.id);
  else if (evt.event === 'payment.failed' && p.status === 'created') {
    await Payment.updateOne({ _id: p._id, status: 'created' }, { $set: { status: 'failed', failureReason: entity.error_description || 'Payment failed' } });
  }
  return { ok: true };
};

/* ───── refunds (admin) ───── */

export const refundPayment = async (paymentId, { amount, reason }, adminId) => {
  const p = await Payment.findById(paymentId);
  if (!p || !['paid', 'partially_refunded'].includes(p.status)) throw ApiError.badRequest('NOT_REFUNDABLE', 'Only a paid payment can be refunded');
  const left = p.totalMinor - p.refundedMinor;
  const amountMinor = amount != null ? Math.round(amount * factorOf(p.currency)) : left;
  if (!(amountMinor > 0) || amountMinor > left) throw ApiError.badRequest('AMOUNT_INVALID', `At most ${money(left, p.currency)} can be refunded`);
  let gatewayRefundId = null;
  if (p.gateway === 'razorpay') {
    try {
      gatewayRefundId = (await razorpay.refund({ paymentId: p.gatewayPaymentId, amountMinor, notes: { reason } })).id;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.unavailable('REFUND_FAILED', err.message);
    }
  }
  const fy = financialYear();
  const creditNoteNo = `CN/${fy}/${String(await nextNumber(`credit:${fy}`)).padStart(6, '0')}`;
  p.refunds.push({ amountMinor, reason, gatewayRefundId, creditNoteNo, at: new Date(), by: adminId });
  p.refundedMinor += amountMinor;
  p.status = p.refundedMinor >= p.totalMinor ? 'refunded' : 'partially_refunded';
  await p.save();
  await notify(p.userId, 'payment.refunded', { item: p.description, amount: money(amountMinor, p.currency) }, { route: '/payments' });
  return p;
};

/* ───── commissions on auction sales ───── */

/**
 * Called when an auction deal completes: work out what is owed under the rule for the item's category
 * (SOP 15.4 — seller, buyer or both; fixed or percentage; minimum / maximum). Nothing if commission is off.
 */
export const raiseCommission = async (deal) => {
  const listing = await Listing.findById(deal.listingId).select('categoryPath').lean();
  const rule = await commissionRuleFor(listing?.categoryPath);
  const shares = commissionShares(rule, deal.amountMinor, deal.currency);
  const out = [];
  for (const sh of shares) {
    const userId = sh.role === 'seller' ? deal.sellerId : deal.buyerId;
    const doc = await Commission.findOneAndUpdate(
      { dealId: deal._id, role: sh.role },
      { $setOnInsert: { userId, role: sh.role, dealId: deal._id, auctionId: deal.auctionId, listingId: deal.listingId, saleMinor: deal.amountMinor, rule: { type: rule.type, value: rule.value, minFee: rule.minFee, maxFee: rule.maxFee }, amountMinor: sh.amountMinor, currency: deal.currency, dueAt: new Date(Date.now() + rule.dueDays * DAY_MS) } },
      { upsert: true, new: true }
    );
    await notify(userId, 'commission.due', { amount: money(sh.amountMinor, deal.currency), days: rule.dueDays }, { route: '/payments' });
    out.push(doc);
  }
  return out;
};

/* ───── views ───── */

export const paymentDto = (p) => ({
  id: oid(p._id),
  purpose: p.purpose,
  refId: p.refId ? oid(p.refId) : null,
  productCode: p.productCode || null,
  description: p.description,
  currency: p.currency,
  factor: factorOf(p.currency),
  baseMinor: p.baseMinor,
  taxMinor: p.taxMinor,
  taxPercent: p.taxPercent,
  totalMinor: p.totalMinor,
  refundedMinor: p.refundedMinor || 0,
  status: p.status,
  failureReason: p.failureReason || null,
  invoiceNo: p.invoiceNo || null,
  paidAt: p.paidAt || null,
  createdAt: p.createdAt,
});

export const myPayments = async (userId, { page = 1, limit = 20 }) => {
  const docs = await Payment.find({ userId, status: { $ne: 'created' } }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
  return { items: docs.slice(0, limit).map(paymentDto), page, hasMore: docs.length > limit };
};

export const getPayment = async (userId, id) => {
  const p = await Payment.findOne({ _id: id, userId }).lean();
  if (!p) throw ApiError.notFound('PAYMENT_NOT_FOUND');
  return paymentDto(p);
};

export const myCommissions = async (userId) => {
  const docs = await Commission.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
  const titles = new Map((await Listing.find({ _id: { $in: docs.map((d) => d.listingId) } }).select('title').lean()).map((l) => [oid(l._id), l.title]));
  return docs.map((c) => ({ id: oid(c._id), title: titles.get(oid(c.listingId)) || null, saleMinor: c.saleMinor, role: c.role, rule: c.rule, amountMinor: c.amountMinor, currency: c.currency, factor: factorOf(c.currency), status: c.status, dueAt: c.dueAt, overdue: c.status === 'due' && c.dueAt < new Date(), paidAt: c.paidAt || null }));
};

/** A printable tax invoice (HTML). The seller details come from Admin › Branding. */
export const invoiceHtml = async (userId, id) => {
  const p = await Payment.findOne({ _id: id, userId }).lean();
  if (!p || !p.invoiceNo) throw ApiError.notFound('INVOICE_NOT_FOUND');
  const [user, branding, m] = await Promise.all([User.findById(userId).select('name phone.e164 email.address').lean(), getSettingValue('branding'), getSettingValue('monetization')]);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const row = (label, minor, strong) => `<tr><td>${esc(label)}</td><td style="text-align:right${strong ? ';font-weight:700' : ''}">${esc(money(minor, p.currency))}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.invoiceNo)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#111}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}h1{font-size:22px}.muted{color:#666;font-size:13px}@media print{button{display:none}}</style></head><body>
${branding.logo?.url ? `<img src="${esc(toPublicUrl(branding.logo.url))}" alt="" style="height:48px">` : ''}
<h1>Tax invoice</h1>
<p class="muted">${esc(branding.appName || '')}${branding.supportEmail ? ` · ${esc(branding.supportEmail)}` : ''}${branding.supportPhone ? ` · ${esc(branding.supportPhone)}` : ''}</p>
<p><b>Invoice no:</b> ${esc(p.invoiceNo)}<br><b>Date:</b> ${esc(new Date(p.paidAt).toLocaleDateString('en-IN'))}<br><b>Billed to:</b> ${esc(user?.name || '')} ${esc(user?.phone?.e164 || '')} ${esc(user?.email?.address || '')}</p>
<table>${row(p.description, p.baseMinor)}${row(`${m.taxLabel} ${p.taxPercent}%`, p.taxMinor)}${row('Total paid', p.totalMinor, true)}${(p.refunds || []).map((r) => row(`Refunded (${r.creditNoteNo})`, -r.amountMinor)).join('')}</table>
<p class="muted">Payment reference: ${esc(p.gatewayPaymentId || '—')}</p>
<button onclick="window.print()">Print / Save as PDF</button>
</body></html>`;
};

/** Unpaid orders older than 30 minutes are closed so they don't clutter history. */
export const expireStaleOrders = () => Payment.updateMany({ status: 'created', expiresAt: { $lt: new Date() } }, { $set: { status: 'failed', failureReason: 'Not completed in time' } });
