import mongoose from 'mongoose';
import { Listing } from './listing.model.js';
import { User } from '../users/user.model.js';
import { Block } from '../chat/chat.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { ApiError } from '../../core/utils/ApiError.js';

/** Every "Show phone number" tap is logged: who saw whose number, on which ad (SOP §9, plan 08 §5). */
const contactRevealSchema = new mongoose.Schema(
  {
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    viewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // empty for guests
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
contactRevealSchema.index({ viewerId: 1, createdAt: -1 });
contactRevealSchema.index({ ip: 1, createdAt: -1 });
contactRevealSchema.index({ sellerId: 1, createdAt: -1 });
contactRevealSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const ContactReveal = mongoose.model('ContactReveal', contactRevealSchema);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the ad page may offer, without the number itself:
 *  none  — seller keeps the number private (chat only)
 *  login — seller shows it to logged-in users; the viewer is a guest
 *  available — tap "Show phone number" to reveal it
 */
export const contactOptions = (seller, { viewerId, isOwner }) => {
  const p = seller?.privacy || {};
  const mode = p.showPhone || 'never';
  const phone = mode === 'never' || isOwner ? 'none' : mode === 'verified_users' && !viewerId ? 'login' : 'available';
  return {
    phone,
    whatsapp: phone !== 'none' && Boolean(p.allowWhatsApp),
    callHours: phone !== 'none' && p.callHours?.from ? { from: p.callHours.from, to: p.callHours.to } : null,
  };
};

export const revealPhone = async (listingId, { viewerId, ip }) => {
  const l = await Listing.findById(listingId).select('ownerId status').lean();
  if (!l || !['published', 'sold'].includes(l.status)) throw ApiError.notFound('LISTING_NOT_FOUND', 'This ad is no longer available');
  const seller = await User.findById(l.ownerId).select('phone privacy status').lean();
  if (!seller || ['banned', 'deleted', 'pending_deletion'].includes(seller.status)) throw ApiError.notFound('LISTING_NOT_FOUND');
  const isOwner = viewerId && String(viewerId) === String(l.ownerId);
  const opts = contactOptions(seller, { viewerId, isOwner });
  if (opts.phone === 'login') throw ApiError.unauthorized('LOGIN_REQUIRED', 'Log in to see the phone number');
  if (opts.phone !== 'available') throw ApiError.forbidden('PHONE_HIDDEN', 'The seller prefers chat');
  if (viewerId && (await Block.exists({ $or: [{ blockerId: viewerId, blockedId: l.ownerId }, { blockerId: l.ownerId, blockedId: viewerId }] }))) {
    throw ApiError.forbidden('PHONE_HIDDEN', 'The seller prefers chat');
  }

  const { phoneRevealsPerDay } = await getSettingValue('chat');
  const since = new Date(Date.now() - DAY_MS);
  const who = viewerId ? { viewerId } : { ip, viewerId: { $exists: false } };
  const already = await ContactReveal.exists({ ...who, listingId: l._id, createdAt: { $gte: since } });
  if (!already) {
    const today = await ContactReveal.countDocuments({ ...who, createdAt: { $gte: since } });
    if (today >= phoneRevealsPerDay) throw ApiError.tooMany('REVEAL_LIMIT', 'You have seen many phone numbers today. Please use chat or try tomorrow.');
    await ContactReveal.create({ listingId: l._id, sellerId: l.ownerId, viewerId: viewerId || undefined, ip });
    await Listing.updateOne({ _id: l._id }, { $inc: { 'stats.phoneReveals': 1 } });
  }
  const digits = seller.phone.e164.replace(/\D/g, '');
  return { phone: seller.phone.e164, whatsappUrl: opts.whatsapp ? `https://wa.me/${digits}` : null, callHours: opts.callHours };
};
