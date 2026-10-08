import mongoose from 'mongoose';
import { Coupon, Payment, Subscription, Commission } from './payment.model.js';
import { Listing } from '../listings/listing.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { ApiError } from '../../core/utils/ApiError.js';

const { ObjectId } = mongoose.Types;
const DAY_MS = 24 * 60 * 60 * 1000;

export const factorOf = (currency) => 10 ** new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;

/** The seller's plan running right now, if any. */
export const activePlan = (userId) => Subscription.findOne({ userId, startAt: { $lte: new Date() }, endAt: { $gt: new Date() } }).sort({ endAt: -1 }).lean();

/** Free ads and the fee for one more ad in this category: the category's own rule wins over the general one. */
export const listingFeeRule = async (categoryPath) => {
  const { listingFee } = await getSettingValue('monetization');
  const ids = (categoryPath || []).map(String);
  // most specific category first (the path runs root → leaf)
  const override = [...ids].reverse().map((id) => listingFee.categoryOverrides.find((o) => o.categoryId === id)).find(Boolean);
  return { enabled: listingFee.enabled, freeAds: override ? override.freeAdsPer30Days : listingFee.freeAdsPer30Days, fee: override ? override.fee : listingFee.fee };
};

/** How many free ads the seller has used in the last 30 days and how many they get. */
export const listingQuota = async (userId, categoryPath) => {
  const rule = await listingFeeRule(categoryPath);
  const plan = await activePlan(userId);
  const used = await Listing.countDocuments({
    ownerId: new ObjectId(String(userId)),
    listingType: { $ne: 'auction' },
    createdAt: { $gte: new Date(Date.now() - 30 * DAY_MS) },
    status: { $nin: ['payment_pending', 'deleted'] },
    paidListing: { $ne: true },
  });
  const allowed = rule.freeAds + (plan?.extraFreeAds || 0);
  return { ...rule, used, allowed, needsPayment: rule.enabled && rule.fee > 0 && used >= allowed, plan: plan ? { name: plan.planName, endAt: plan.endAt } : null };
};

/** Sellers with an unpaid commission past its due date cannot open new ads or auctions (if the admin says so). */
export const assertNoOverdueCommission = async (userId) => {
  const { auctionCommission } = await getSettingValue('monetization');
  if (!auctionCommission.blockWhenOverdue) return;
  if (await Commission.exists({ sellerId: userId, status: 'due', dueAt: { $lt: new Date() } })) {
    throw ApiError.forbidden('COMMISSION_OVERDUE', 'Please pay your overdue auction commission first (Profile › Payments)');
  }
};

/** Check a coupon for this buyer and purpose; returns the discount in minor units. */
const applyCoupon = async ({ code, userId, purpose, baseMinor, factor }) => {
  const c = await Coupon.findOne({ code: String(code).trim().toUpperCase(), active: true }).lean();
  const now = new Date();
  const fail = (msg) => {
    throw ApiError.badRequest('COUPON_INVALID', msg);
  };
  if (!c) fail('This coupon code is not valid');
  if ((c.validFrom && c.validFrom > now) || (c.validTo && c.validTo < now)) fail('This coupon has expired');
  if (c.purposes?.length && !c.purposes.includes(purpose)) fail('This coupon cannot be used for this purchase');
  if (c.totalLimit && c.usedCount >= c.totalLimit) fail('This coupon has been fully used');
  const mine = await Payment.countDocuments({ userId, couponCode: c.code, status: { $in: ['paid', 'partially_refunded'] } });
  if (c.perUserLimit && mine >= c.perUserLimit) fail('You have already used this coupon');
  if (c.firstPurchaseOnly && (await Payment.exists({ userId, status: 'paid' }))) fail('This coupon is for your first purchase only');
  let off = c.type === 'percent' ? Math.round((baseMinor * c.value) / 100) : Math.round(c.value * factor);
  if (c.type === 'percent' && c.maxDiscount) off = Math.min(off, Math.round(c.maxDiscount * factor));
  return { code: c.code, discountMinor: Math.min(off, baseMinor) };
};

/**
 * What something costs right now. Everything is decided here — the app only shows this quote.
 * Returns { description, baseMinor, discountMinor, taxMinor, taxPercent, totalMinor, currency, couponCode }.
 */
export const quote = async ({ userId, purpose, refId, productCode, couponCode }) => {
  const m = await getSettingValue('monetization');
  const { currency } = await getSettingValue('marketplace');
  const factor = factorOf(currency);
  let baseMinor;
  let description;
  let target = null;

  if (purpose === 'listing_fee') {
    target = await Listing.findOne({ _id: refId, ownerId: userId }).select('title status categoryPath').lean();
    if (!target || target.status !== 'payment_pending') throw ApiError.badRequest('NOTHING_TO_PAY', 'This ad does not need a payment');
    const rule = await listingFeeRule(target.categoryPath);
    baseMinor = Math.round(rule.fee * factor);
    description = `Ad posting fee: ${target.title}`;
  } else if (purpose === 'promotion') {
    const pkg = m.promotions.find((p) => p.code === productCode);
    if (!pkg) throw ApiError.badRequest('PRODUCT_NOT_FOUND', 'This promotion is not available');
    target = await Listing.findOne({ _id: refId, ownerId: userId }).select('title status expiresAt listingType').lean();
    if (!target || target.status !== 'published' || (target.expiresAt && target.expiresAt < new Date())) throw ApiError.badRequest('LISTING_NOT_LIVE', 'Only a live ad can be promoted');
    baseMinor = Math.round(pkg.price * factor);
    description = `${pkg.name}${pkg.days ? ` (${pkg.days} days)` : ''}: ${target.title}`;
  } else if (purpose === 'plan') {
    const plan = m.plans.find((p) => p.code === productCode);
    if (!plan) throw ApiError.badRequest('PRODUCT_NOT_FOUND', 'This plan is not available');
    baseMinor = Math.round(plan.price * factor);
    description = `${plan.name} (${plan.days} days)`;
  } else if (purpose === 'commission') {
    target = await Commission.findOne({ _id: refId, sellerId: userId }).lean();
    if (!target || target.status !== 'due') throw ApiError.badRequest('NOTHING_TO_PAY', 'This commission is not due');
    baseMinor = target.amountMinor;
    description = 'Auction commission';
  } else {
    throw ApiError.badRequest('PURPOSE_INVALID', 'Unknown purchase');
  }

  if (!(baseMinor > 0)) throw ApiError.badRequest('NOTHING_TO_PAY', 'Nothing to pay');
  const coupon = couponCode ? await applyCoupon({ code: couponCode, userId, purpose, baseMinor, factor }) : null;
  const discountMinor = coupon?.discountMinor || 0;
  const taxable = baseMinor - discountMinor;
  const taxMinor = Math.round((taxable * m.taxPercent) / 100);
  return { purpose, refId: refId || null, productCode: productCode || null, description, currency, factor, baseMinor, discountMinor, taxPercent: m.taxPercent, taxLabel: m.taxLabel, taxMinor, totalMinor: taxable + taxMinor, couponCode: coupon?.code || null };
};
