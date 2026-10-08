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

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 1000 },
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
messageSchema.index({ conversationId: 1, _id: -1 });

export const Message = mongoose.model('Message', messageSchema);

/** blockerId no longer wants to hear from blockedId. */
const blockSchema = new Schema(
  { blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true } },
  { timestamps: { createdAt: true, updatedAt: false } }
);
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });

export const Block = mongoose.model('Block', blockSchema);
