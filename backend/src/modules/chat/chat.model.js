import mongoose from 'mongoose';

const { Schema } = mongoose;

/** One conversation per (ad, buyer). The seller is the ad's owner. */
const conversationSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessage: { text: String, senderId: Schema.Types.ObjectId, at: Date },
    unread: { buyer: { type: Number, default: 0 }, seller: { type: Number, default: 0 } },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
conversationSchema.index({ listingId: 1, buyerId: 1 }, { unique: true });
conversationSchema.index({ buyerId: 1, lastMessageAt: -1 });
conversationSchema.index({ sellerId: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);

export const OFFER_STATUSES = ['pending', 'accepted', 'declined', 'countered', 'withdrawn', 'expired'];

/** A photo (public URL) or a document (private; downloaded through the chat API by the two people only). */
const attachmentSchema = new Schema(
  {
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
    kind: { type: String, enum: ['image', 'file'], required: true },
    url: String, // images only
    name: String,
    mime: String,
    size: Number,
    width: Number,
    height: Number,
  },
  { _id: false }
);

/** A price offer card. Answered by the other person; a counter is a new offer that replies to this one. */
const offerSchema = new Schema(
  {
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true },
    status: { type: String, enum: OFFER_STATUSES, default: 'pending' },
    expiresAt: { type: Date, required: true },
    respondedAt: Date,
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message' },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['text', 'media', 'offer'], default: 'text' },
    text: { type: String, maxlength: 1000 },
    attachments: { type: [attachmentSchema], default: undefined },
    offer: offerSchema,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, 'offer.status': 1 }, { partialFilterExpression: { kind: 'offer' } });

export const Message = mongoose.model('Message', messageSchema);

/** blockerId no longer wants to hear from blockedId. */
const blockSchema = new Schema(
  { blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true } },
  { timestamps: { createdAt: true, updatedAt: false } }
);
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });

export const Block = mongoose.model('Block', blockSchema);
