import mongoose from 'mongoose';
import { Subscription, Commission } from './payment.model.js';
import { Listing } from '../listings/listing.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { ApiError } from '../../core/utils/ApiError.js';

const { ObjectId } = mongoose.Types;
const DAY_MS = 24 * 60 * 60 * 1000;

export const factorOf = (currency) => 10 ** new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;

/** The seller's plan running right now, if any (without a plan they are on the Free Seller Plan). */
export const activePlan = (userId) => Subscription.findOne({ userId, startAt: { $lte: new Date() }, endAt: { $gt: new Date() } }).sort({ endAt: -1 }).lean();

/* ───── SOP 15.1: listing fees ───── */

/** Free ads and the fee for one more ad in this category: the category's own rule wins over the general one. */
export const listingFeeRule = async (categoryPath) => {
  const { listingFee } = await getSettingValue('monetization');
  const ids = (categoryPath || []).map(String);
  // most specific category first (the path runs root → leaf)
  const override = [...ids].reverse().map((id) => listingFee.categoryOverrides.find((o) => o.categoryId === id)).find(Boolean);
  return { enabled: listingFee.enabled, freeAds: override ? override.freeAdsPer30Days : listingFee.freeAdsPer30Days, fee: override ? override.fee : listingFee.fee };
};

/** How many free ads the seller has used in the last 30 days and how many they get (free plan + paid plan). */
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

/* ───── SOP 15.4: auction commission ───── */

/** The commission rule for an item: a category rule wins over the general one (most specific category first). */
export const commissionRuleFor = async (categoryPath) => {
  const { auctionCommission: ac } = await getSettingValue('monetization');
  const ids = (categoryPath || []).map(String);
  const override = [...ids].reverse().map((id) => ac.categoryOverrides.find((o) => o.categoryId === id)).find(Boolean);
  const r = override || ac;
  return { enabled: ac.enabled, payer: ac.payer, type: r.type, value: r.value, minFee: r.minFee, maxFee: r.maxFee, dueDays: ac.dueDays, categorySpecific: Boolean(override) };
};

/** What each paying side owes on a sale of `saleMinor`. With payer "both" the fee is split equally. */
export const commissionShares = (rule, saleMinor, currency) => {
  if (!rule.enabled) return [];
  const f = factorOf(currency);
  let total = rule.type === 'percent' ? Math.round((saleMinor * rule.value) / 100) : Math.round(rule.value * f);
  total = Math.max(total, Math.round(rule.minFee * f));
  if (rule.maxFee > 0) total = Math.min(total, Math.round(rule.maxFee * f));
  if (!(total > 0)) return [];
  if (rule.payer === 'both') {
    const half = Math.floor(total / 2);
    return [{ role: 'seller', amountMinor: total - half }, { role: 'buyer', amountMinor: half }];
  }
  return [{ role: rule.payer, amountMinor: total }];
};

/** Plain-language summary shown before an auction starts (SOP: fees must be shown in advance). */
export const commissionText = (rule, currency) => {
  if (!rule.enabled) return null;
  const money = (n) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  const fee = rule.type === 'percent' ? `${rule.value}% of the final price` : money(rule.value);
  const limits = [rule.minFee > 0 && `minimum ${money(rule.minFee)}`, rule.maxFee > 0 && `maximum ${money(rule.maxFee)}`].filter(Boolean).join(', ');
  const who = rule.payer === 'both' ? 'shared equally by the buyer and the seller' : `paid by the ${rule.payer}`;
  return `Platform commission: ${fee}${limits ? ` (${limits})` : ''}, ${who}, after the sale is completed.`;
};

/** People with an unpaid commission past its due date cannot post (sellers) or bid (buyers), if the admin says so. */
export const assertNoOverdueCommission = async (userId) => {
  const { auctionCommission } = await getSettingValue('monetization');
  if (!auctionCommission.blockWhenOverdue) return;
  if (await Commission.exists({ userId, status: 'due', dueAt: { $lt: new Date() } })) {
    throw ApiError.forbidden('COMMISSION_OVERDUE', 'Please pay your overdue auction commission first (Profile › Payments)');
  }
};

/* ───── quotes ───── */

/**
 * What something costs right now. Everything is decided here — the app only shows this quote.
 * A promotion included in the user's plan costs nothing (and uses one credit when bought).
 */
export const quote = async ({ userId, purpose, refId, productCode }) => {
  const m = await getSettingValue('monetization');
  const { currency } = await getSettingValue('marketplace');
  const factor = factorOf(currency);
  let baseMinor;
  let description;
  let includedInPlan = false;

  if (purpose === 'listing_fee') {
    const target = await Listing.findOne({ _id: refId, ownerId: userId }).select('title status categoryPath').lean();
    if (!target || target.status !== 'payment_pending') throw ApiError.badRequest('NOTHING_TO_PAY', 'This ad does not need a payment');
    const rule = await listingFeeRule(target.categoryPath);
    baseMinor = Math.round(rule.fee * factor);
    description = `Ad posting fee: ${target.title}`;
  } else if (purpose === 'promotion') {
    const pkg = m.promotions.find((p) => p.code === productCode);
    if (!pkg) throw ApiError.badRequest('PRODUCT_NOT_FOUND', 'This promotion is not available');
    const target = await Listing.findOne({ _id: refId, ownerId: userId }).select('title status expiresAt').lean();
    if (!target || target.status !== 'published' || (target.expiresAt && target.expiresAt < new Date())) throw ApiError.badRequest('LISTING_NOT_LIVE', 'Only a live ad can be promoted');
    const plan = await activePlan(userId);
    includedInPlan = (plan?.credits?.[pkg.type] || 0) > 0;
    baseMinor = includedInPlan ? 0 : Math.round(pkg.price * factor);
    description = `${pkg.name} (${pkg.days} days)${includedInPlan ? ' — included in your plan' : ''}: ${target.title}`;
  } else if (purpose === 'plan') {
    const plan = m.plans.find((p) => p.code === productCode);
    if (!plan) throw ApiError.badRequest('PRODUCT_NOT_FOUND', 'This plan is not available');
    baseMinor = Math.round(plan.price * factor);
    description = `${plan.name} (${plan.days} days)`;
  } else if (purpose === 'commission') {
    const target = await Commission.findOne({ _id: refId, userId }).lean();
    if (!target || target.status !== 'due') throw ApiError.badRequest('NOTHING_TO_PAY', 'This commission is not due');
    baseMinor = target.amountMinor;
    description = 'Auction commission';
  } else {
    throw ApiError.badRequest('PURPOSE_INVALID', 'Unknown purchase');
  }

  if (!(baseMinor > 0) && !includedInPlan) throw ApiError.badRequest('NOTHING_TO_PAY', 'Nothing to pay');
  const taxMinor = Math.round((baseMinor * m.taxPercent) / 100);
  return { purpose, refId: refId || null, productCode: productCode || null, description, currency, factor, baseMinor, taxPercent: m.taxPercent, taxLabel: m.taxLabel, taxMinor, totalMinor: baseMinor + taxMinor, includedInPlan };
};

