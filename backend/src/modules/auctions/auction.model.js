import mongoose from 'mongoose';

const { Schema } = mongoose;

export const AUCTION_STATUSES = ['pending_review', 'rejected', 'scheduled', 'live', 'suspended', 'ended', 'cancelled'];
export const OUTCOMES = ['no_bids', 'won', 'reserve_not_met', 'bought_now'];

/**
 * An auction wraps one Listing (the item: photos, description, category fields, location).
 * Rules and fees are copied in when the admin approves it, so later admin changes never touch a running auction.
 * All money is in minor units (paise, cents).
 */
const auctionSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true, unique: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: AUCTION_STATUSES, required: true },
    currency: { type: String, required: true },

    startingMinor: { type: Number, required: true },
    reserveMinor: Number, // hidden from bidders
    buyNowMinor: Number,
    incrementMinor: Number, // seller's own (higher) increment; the platform table still applies as a floor

    durationMs: { type: Number, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    originalEndAt: Date,
    extensions: { type: Number, default: 0 },
    suspendedAt: Date,

    rules: {
      // copied from admin settings at approval
      incrementTiers: [{ _id: false, from: Number, step: Number }], // minor units
      antiSniping: { enabled: Boolean, windowSec: Number, extendSec: Number, maxExtensions: Number },
      proxyBidding: Boolean,
      sanityCapMultiplier: Number,
      paymentWindowHours: Number,
      offerWindowHours: Number,
    },

    state: {
      currentMinor: { type: Number, default: 0 },
      highestBidId: Schema.Types.ObjectId,
      highestBidderId: Schema.Types.ObjectId,
      leaderMaxMinor: { type: Number, default: 0 }, // the leader's private maximum (== currentMinor without proxy bidding)
      bidCount: { type: Number, default: 0 },
      bidderCount: { type: Number, default: 0 },
      reserveMet: { type: Boolean, default: false },
      lastBidAt: Date,
      version: { type: Number, default: 0 },
    },

    notes: [{ _id: false, text: String, at: Date }], // "additional information" the seller may add once bids exist
    outcome: { type: String, enum: OUTCOMES },
    winnerId: Schema.Types.ObjectId,
    finalMinor: Number,
    endedAt: Date,
    moderation: { reviewedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' }, reviewedAt: Date, reason: String },
    startedNotified: Boolean,
  },
  { timestamps: true }
);
auctionSchema.index({ status: 1, endAt: 1 });
auctionSchema.index({ status: 1, startAt: 1 });
auctionSchema.index({ sellerId: 1, createdAt: -1 });
auctionSchema.index({ 'state.highestBidderId': 1 });

export const Auction = mongoose.model('Auction', auctionSchema);

/** A bid is never edited or deleted — only voided by an admin (with a reason). */
const bidSchema = new Schema(
  {
    auctionId: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
    bidderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    alias: { type: Number, required: true }, // "Bidder 3" within this auction
    amountMinor: { type: Number, required: true },
    maxMinor: Number, // private maximum (proxy bidding)
    kind: { type: String, enum: ['manual', 'auto', 'buy_now'], default: 'manual' },
    status: { type: String, enum: ['valid', 'voided'], default: 'valid' },
    voidReason: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
bidSchema.index({ auctionId: 1, _id: -1 });
bidSchema.index({ auctionId: 1, bidderId: 1 });
bidSchema.index({ bidderId: 1, createdAt: -1 });

export const Bid = mongoose.model('Bid', bidSchema);

export const DEAL_STATUSES = ['awaiting_confirmation', 'in_progress', 'completed', 'buyer_defaulted', 'seller_defaulted', 'cancelled', 'disputed'];

/** What happens after an auction is won (or an item is offered to a bidder): confirm → meet → complete. */
const dealSchema = new Schema(
  {
    auctionId: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amountMinor: { type: Number, required: true },
    currency: String,
    source: { type: String, enum: ['win', 'buy_now', 'offer'], required: true },
    status: { type: String, enum: DEAL_STATUSES, default: 'awaiting_confirmation' },
    confirmBy: Date,
    confirmedAt: Date,
    completedBy: { buyer: Date, seller: Date },
    disputeReason: String,
    resolution: { by: { type: Schema.Types.ObjectId, ref: 'AdminUser' }, note: String, at: Date },
    timeline: [{ _id: false, at: Date, event: String, by: String }],
  },
  { timestamps: true }
);
dealSchema.index({ auctionId: 1, createdAt: -1 });
dealSchema.index({ buyerId: 1, createdAt: -1 });
dealSchema.index({ sellerId: 1, createdAt: -1 });
dealSchema.index({ status: 1, confirmBy: 1 });

export const Deal = mongoose.model('Deal', dealSchema);

/** A black mark for a winner who never confirmed, or a seller who backed out. Expires after the admin-set period. */
const strikeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['buyer', 'seller'], required: true },
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal' },
    reason: String,
    expiresAt: { type: Date, required: true },
    removedAt: Date,
    removedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
strikeSchema.index({ userId: 1, role: 1, expiresAt: 1 });

export const Strike = mongoose.model('Strike', strikeSchema);
