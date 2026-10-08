import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PURPOSES = ['listing_fee', 'promotion', 'plan', 'commission'];
export const PAYMENT_STATUSES = ['created', 'paid', 'failed', 'refunded', 'partially_refunded'];

/**
 * One purchase. The amount is always worked out on the server; the gateway only collects it.
 * All money in minor units (paise).
 */
const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: PURPOSES, required: true },
    refId: Schema.Types.ObjectId, // listing / commission the payment is for
    productCode: String, // promotion package or plan code
    description: { type: String, required: true },
    currency: { type: String, required: true },
    baseMinor: { type: Number, required: true },
    discountMinor: { type: Number, default: 0 },
    taxMinor: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    totalMinor: { type: Number, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'created' },
    gateway: { type: String, enum: ['razorpay', 'none'], required: true },
    gatewayOrderId: { type: String, index: true, sparse: true },
    gatewayPaymentId: String,
    failureReason: String,
    paidAt: Date,
    fulfilledAt: Date,
    invoiceNo: String,
    refunds: [{ _id: false, amountMinor: Number, reason: String, gatewayRefundId: String, creditNoteNo: String, at: Date, by: { type: Schema.Types.ObjectId, ref: 'AdminUser' } }],
    refundedMinor: { type: Number, default: 0 },
    expiresAt: Date, // an unpaid order is dropped after 30 minutes
  },
  { timestamps: true }
);
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ purpose: 1, status: 1, paidAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);


/** A paid placement for an ad (SOP 15.2): featured, top placement, homepage, category or location-based. */
const promotionSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    type: { type: String, enum: ['featured', 'top', 'homepage', 'category', 'location'], required: true },
    includedInPlan: Boolean, // used one of the plan's included promotions instead of paying
    productCode: String,
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
  },
  { timestamps: true }
);
promotionSchema.index({ listingId: 1, endAt: -1 });
promotionSchema.index({ type: 1, endAt: 1 });

export const Promotion = mongoose.model('Promotion', promotionSchema);

/** A seller plan bought for a period (one-time purchase; buying again extends it). */
const subscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    planCode: { type: String, required: true },
    planName: String,
    extraFreeAds: { type: Number, default: 0 },
    credits: { type: Schema.Types.Mixed, default: {} }, // promotions included in the plan and not yet used: { featured: 2, ... }
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
  },
  { timestamps: true }
);
subscriptionSchema.index({ userId: 1, endAt: -1 });

export const Subscription = mongoose.model('Subscription', subscriptionSchema);

/** The platform's fee on a completed auction sale (SOP 15.4), owed by the seller, the buyer, or each of them. */
const commissionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // who owes it
    role: { type: String, enum: ['seller', 'buyer'], required: true },
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', required: true },
    auctionId: { type: Schema.Types.ObjectId, ref: 'Auction' },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing' },
    saleMinor: Number,
    rule: { type: { type: String }, value: Number, minFee: Number, maxFee: Number }, // the rule that produced it
    amountMinor: { type: Number, required: true },
    currency: String,
    status: { type: String, enum: ['due', 'paid', 'waived'], default: 'due' },
    dueAt: { type: Date, required: true },
    paidAt: Date,
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    waivedReason: String,
  },
  { timestamps: true }
);
commissionSchema.index({ userId: 1, status: 1, dueAt: 1 });
commissionSchema.index({ dealId: 1, role: 1 }, { unique: true });

export const Commission = mongoose.model('Commission', commissionSchema);

/** Gap-free sequences (invoice and credit-note numbers per financial year). */
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
export const Counter = mongoose.model('Counter', counterSchema);

export const nextNumber = async (key) => (await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true })).seq;
