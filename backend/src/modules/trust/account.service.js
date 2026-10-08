import { User } from '../users/user.model.js';
import { Listing } from '../listings/listing.model.js';
import { Auction, Bid, Deal } from '../auctions/auction.model.js';
import { Payment, Commission } from '../payments/payment.model.js';
import { Report, Case } from './trust.model.js';
import { Session, Device } from '../auth/auth.models.js';
import { revokeSession } from '../auth/auth.service.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';

export const DELETION_GRACE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Things that must be finished before an account can go (open auctions, deals, unpaid fees). */
export const deletionBlockers = async (userId) => {
  const [selling, leading, deals, dues] = await Promise.all([
    Auction.countDocuments({ sellerId: userId, status: { $in: ['scheduled', 'live', 'suspended'] } }),
    Auction.countDocuments({ 'state.highestBidderId': userId, status: { $in: ['live', 'suspended'] } }),
    Deal.countDocuments({ $or: [{ buyerId: userId }, { sellerId: userId }], status: { $in: ['awaiting_confirmation', 'in_progress', 'disputed'] } }),
    Commission.countDocuments({ userId, status: 'due' }),
  ]);
  const out = [];
  if (selling) out.push(`${selling} running auction(s) you are selling`);
  if (leading) out.push(`${leading} auction(s) where you are the highest bidder`);
  if (deals) out.push(`${deals} auction deal(s) still open`);
  if (dues) out.push(`${dues} unpaid commission(s)`);
  return out;
};

export const requestDeletion = async (userId) => {
  const blockers = await deletionBlockers(userId);
  if (blockers.length) throw ApiError.badRequest('DELETION_BLOCKED', `Please finish these first: ${blockers.join('; ')}`, { blockers });
  const now = new Date();
  await User.updateOne({ _id: userId }, { $set: { status: 'pending_deletion', deletionRequestedAt: now } });
  // ads disappear straight away; they come back if the user changes their mind
  await Listing.updateMany({ ownerId: userId, status: 'published' }, { $set: { status: 'paused' } });
  return { deleteAfter: new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS) };
};

export const cancelDeletion = async (userId) => {
  const res = await User.updateOne({ _id: userId, status: 'pending_deletion' }, { $set: { status: 'active' }, $unset: { deletionRequestedAt: 1 } });
  if (!res.modifiedCount) throw ApiError.badRequest('NOT_PENDING', 'Your account is not scheduled for deletion');
};

/**
 * After the grace period: remove personal data but keep records the law requires (payments, invoices,
 * cases, audit). The account can no longer be used.
 */
export const purgeDueAccounts = async () => {
  const due = await User.find({ status: 'pending_deletion', deletionRequestedAt: { $lt: new Date(Date.now() - DELETION_GRACE_DAYS * DAY_MS) } }).select('_id').limit(50).lean();
  for (const { _id } of due) {
    try {
      if ((await deletionBlockers(_id)).length) continue; // something came up during the grace period
      const sessions = await Session.find({ userId: _id, revokedAt: null });
      await Promise.all(sessions.map((s) => revokeSession(s, 'account_deleted')));
      await Device.deleteMany({ userId: _id });
      await Listing.updateMany({ ownerId: _id, status: { $ne: 'deleted' } }, { $set: { status: 'deleted' } });
      await User.updateOne(
        { _id },
        {
          $set: { status: 'deleted', 'phone.e164': `deleted:${_id}`, name: null },
          $unset: { avatar: 1, about: 1, email: 1, homeLocation: 1, savedLocations: 1, verification: 1, notificationPrefs: 1, 'phone.verifiedAt': 1 },
        }
      );
      logger.info('Account deleted after grace period', { userId: String(_id) });
    } catch (err) {
      logger.error('Account deletion failed', { userId: String(_id), err: err.message });
    }
  }
};

/** Everything we hold about the user, as JSON (DPDP: right to access). */
export const exportMyData = async (userId) => {
  const [user, listings, bids, deals, payments, reports, cases] = await Promise.all([
    User.findById(userId).select('-__v').lean(),
    Listing.find({ ownerId: userId, status: { $ne: 'deleted' } }).select('listingNo title description price status createdAt location.label').lean(),
    Bid.find({ bidderId: userId }).select('auctionId amountMinor kind status createdAt').lean(),
    Deal.find({ $or: [{ buyerId: userId }, { sellerId: userId }] }).select('auctionId amountMinor currency status createdAt').lean(),
    Payment.find({ userId, status: { $ne: 'created' } }).select('description totalMinor currency status invoiceNo paidAt').lean(),
    Report.find({ reporterId: userId }).select('targetType reason status createdAt').lean(),
    Case.find({ userId }).select('caseNo type subject status createdAt messages.by messages.text messages.at messages.internal').lean(),
  ]);
  return {
    exportedAt: new Date(),
    profile: user && { name: user.name, phone: user.phone?.e164, email: user.email?.address, language: user.language, homeLocation: user.homeLocation?.label, createdAt: user.createdAt, consents: user.consents, verification: user.verification },
    listings,
    bids,
    deals,
    payments,
    reports,
    cases: cases.map((c) => ({ ...c, messages: c.messages.filter((m) => !m.internal).map(({ by, text, at }) => ({ by, text, at })) })),
  };
};
