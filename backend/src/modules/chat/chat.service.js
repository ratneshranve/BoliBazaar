import { Conversation, Message, Block } from './chat.model.js';
import { Listing } from '../listings/listing.model.js';
import { minorFactor } from '../listings/listing.service.js';
import { User } from '../users/user.model.js';
import { Media } from '../uploads/media.model.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { emitToUser } from '../../realtime/index.js';
import { notify } from '../notifications/notification.service.js';
import { checkContent } from '../trust/moderation.service.js';
import { getSettingValue } from '../settings/settings.service.js';
import { formatMoney } from '../auctions/auction.util.js';

const oid = (v) => String(v);

const isBlocked = async (a, b) => Boolean(await Block.exists({ $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }));

/** A pending offer past its expiry reads as expired (stored status is updated lazily). */
const offerStatus = (o) => (o.status === 'pending' && o.expiresAt < new Date() ? 'expired' : o.status);

const messageDto = (m) => ({
  id: oid(m._id),
  conversationId: oid(m.conversationId),
  senderId: oid(m.senderId),
  kind: m.kind || 'text',
  text: m.text || '',
  attachments: (m.attachments || []).map((a) => ({
    mediaId: oid(a.mediaId),
    kind: a.kind,
    url: a.url || null, // files have no public URL: GET /chats/:id/files/:mediaId
    name: a.name || null,
    mime: a.mime || null,
    size: a.size || null,
    width: a.width || null,
    height: a.height || null,
  })),
  offer: m.offer
    ? {
        amountMinor: m.offer.amountMinor,
        currency: m.offer.currency,
        factor: minorFactor(m.offer.currency),
        status: offerStatus(m.offer),
        expiresAt: m.offer.expiresAt,
        respondedAt: m.offer.respondedAt || null,
        replyTo: m.offer.replyTo ? oid(m.offer.replyTo) : null,
      }
    : null,
  readAt: m.readAt || null,
  createdAt: m.createdAt,
});

/** One-line summary for the chat list and push notifications. */
const previewOf = (m) => {
  if (m.kind === 'offer') return `Offer: ${formatMoney(m.offer.amountMinor, m.offer.currency)}`;
  if (m.text) return m.text;
  const files = m.attachments || [];
  if (files.every((a) => a.kind === 'image')) return files.length > 1 ? `📷 ${files.length} photos` : '📷 Photo';
  return `📎 ${files.find((a) => a.kind === 'file')?.name || 'File'}`;
};

const sideOf = (c, userId) => (oid(c.buyerId) === oid(userId) ? 'buyer' : oid(c.sellerId) === oid(userId) ? 'seller' : null);
const peerIdOf = (c, userId) => (sideOf(c, userId) === 'buyer' ? c.sellerId : c.buyerId);

const loadMine = async (conversationId, userId) => {
  const c = await Conversation.findById(conversationId);
  if (!c || !sideOf(c, userId)) throw ApiError.notFound('CONVERSATION_NOT_FOUND');
  return c;
};

/** Both people must still be reachable and not blocking each other. */
const assertCanWrite = async (c, userId) => {
  const other = peerIdOf(c, userId);
  if (await isBlocked(userId, other)) throw ApiError.forbidden('CHAT_BLOCKED', 'You cannot message this person');
  const otherUser = await User.findById(other).select('status').lean();
  if (!otherUser || ['banned', 'deleted'].includes(otherUser.status)) throw ApiError.forbidden('CHAT_UNAVAILABLE', 'This person is no longer available');
  return other;
};

/** Save a message, bump the conversation, push it live and notify the other person. */
const deliver = async (c, userId, fields) => {
  const other = peerIdOf(c, userId);
  const m = await Message.create({ conversationId: c._id, senderId: userId, ...fields });
  const otherSide = sideOf(c, userId) === 'buyer' ? 'seller' : 'buyer';
  const preview = previewOf(m);
  await Conversation.updateOne(
    { _id: c._id },
    { $set: { lastMessage: { text: preview, senderId: userId, at: m.createdAt }, lastMessageAt: m.createdAt }, $inc: { [`unread.${otherSide}`]: 1 } }
  );
  const dto = messageDto(m);
  emitToUser(other, 'chat:message', dto);
  emitToUser(userId, 'chat:message', dto); // other tabs/devices of the sender
  const sender = await User.findById(userId).select('name').lean();
  await notify(other, 'chat.message', { sender: sender?.name || 'New message', preview: preview.slice(0, 120) }, { route: `/chat/${c._id}` });
  return dto;
};

/** Open (or reuse) the chat between the viewer and an ad's owner. */
export const startConversation = async (userId, listingId) => {
  const listing = await Listing.findById(listingId).select('ownerId status title').lean();
  if (!listing || listing.status !== 'published') throw ApiError.notFound('LISTING_NOT_FOUND');
  if (oid(listing.ownerId) === oid(userId)) throw ApiError.badRequest('OWN_LISTING', 'You cannot message yourself');
  if (await isBlocked(userId, listing.ownerId)) throw ApiError.forbidden('CHAT_BLOCKED', 'You cannot message this seller');
  const c = await Conversation.findOneAndUpdate(
    { listingId, buyerId: userId },
    { $setOnInsert: { listingId, buyerId: userId, sellerId: listing.ownerId } },
    { upsert: true, new: true }
  );
  return oid(c._id);
};

/** Text and/or photos and files (uploaded first via /uploads/image purpose=chat or /uploads/document purpose=chat_file). */
export const sendMessage = async (userId, conversationId, { text = '', mediaIds = [] }) => {
  const c = await loadMine(conversationId, userId);
  if (!text && !mediaIds.length) throw ApiError.badRequest('MESSAGE_EMPTY', 'Write a message or attach a file');
  if (text) await checkContent([text], { where: 'message', allowContact: true }); // people may share numbers to meet
  await assertCanWrite(c, userId);

  let attachments;
  if (mediaIds.length) {
    const cfg = await getSettingValue('chat');
    if (mediaIds.length > cfg.maxAttachments) throw ApiError.badRequest('TOO_MANY_ATTACHMENTS', `Attach up to ${cfg.maxAttachments} files`);
    const media = await Media.find({ _id: { $in: mediaIds }, ownerType: 'user', ownerId: userId, purpose: { $in: ['chat', 'chat_file'] }, status: 'ready', 'attachedTo.id': { $exists: false } }).lean();
    if (media.length !== new Set(mediaIds).size) throw ApiError.badRequest('MEDIA_INVALID', 'Upload not found or already sent');
    if (!cfg.photosEnabled && media.some((x) => x.purpose === 'chat')) throw ApiError.forbidden('CHAT_PHOTOS_OFF', 'Photos cannot be sent in chat right now');
    if (!cfg.filesEnabled && media.some((x) => x.purpose === 'chat_file')) throw ApiError.forbidden('CHAT_FILES_OFF', 'Files cannot be sent in chat right now');
    const byId = new Map(media.map((x) => [oid(x._id), x]));
    attachments = mediaIds.map((id) => {
      const x = byId.get(oid(id));
      return x.purpose === 'chat'
        ? { mediaId: x._id, kind: 'image', url: x.url, mime: x.mime, size: x.size, width: x.width, height: x.height }
        : { mediaId: x._id, kind: 'file', name: x.name || `document.${x.mime === 'application/pdf' ? 'pdf' : x.mime?.split('/')[1] || 'bin'}`, mime: x.mime, size: x.size };
    });
  }

  const dto = await deliver(c, userId, { kind: attachments ? 'media' : 'text', text: text || undefined, attachments });
  if (attachments) await Media.updateMany({ _id: { $in: mediaIds } }, { $set: { attachedTo: { kind: 'message', id: dto.id } } });
  return dto;
};

/** A private chat file, for one of the two people in the conversation only. */
export const chatFile = async (userId, conversationId, mediaId) => {
  const c = await loadMine(conversationId, userId);
  const msg = await Message.findOne({ conversationId: c._id, 'attachments.mediaId': mediaId }).select('attachments').lean();
  if (!msg) throw ApiError.notFound('FILE_NOT_FOUND');
  const media = await Media.findOne({ _id: mediaId, visibility: 'private', status: 'ready' }).lean();
  if (!media) throw ApiError.notFound('FILE_NOT_FOUND');
  return { media, name: msg.attachments.find((a) => oid(a.mediaId) === oid(mediaId))?.name || media.name || 'file' };
};

/* ───── price offers ───── */

const offerRules = async (c) => {
  const cfg = await getSettingValue('chat');
  if (!cfg.offersEnabled) throw ApiError.forbidden('OFFERS_OFF', 'Offers are not available right now');
  const l = await Listing.findById(c.listingId).select('status price title').lean();
  if (!l || l.status !== 'published') throw ApiError.badRequest('LISTING_NOT_AVAILABLE', 'This ad is no longer available');
  if (!['fixed', 'negotiable'].includes(l.price?.type) || !(l.price.amountMinor > 0)) throw ApiError.badRequest('OFFER_NOT_ALLOWED', 'This ad does not take price offers');
  return { cfg, listing: l };
};

const toMinor = (amount, currency) => Math.round(amount * minorFactor(currency));

/** Buyer offers a price for the ad. */
export const makeOffer = async (userId, conversationId, amount) => {
  const c = await loadMine(conversationId, userId);
  if (sideOf(c, userId) !== 'buyer') throw ApiError.forbidden('OFFER_BUYER_ONLY', 'Only the buyer can make an offer; reply with a counter-offer instead');
  await assertCanWrite(c, userId);
  const { cfg, listing } = await offerRules(c);
  const { currency, amountMinor: asking } = listing.price;
  const amountMinor = toMinor(amount, currency);
  const min = Math.ceil((asking * cfg.offerMinPercent) / 100);
  if (amountMinor < Math.max(1, min)) throw ApiError.badRequest('OFFER_TOO_LOW', `The lowest offer allowed is ${formatMoney(min, currency)}`, { minMinor: min });
  if (amountMinor > asking) throw ApiError.badRequest('OFFER_ABOVE_PRICE', 'Your offer is above the asking price');
  const open = await Message.countDocuments({ conversationId: c._id, senderId: userId, kind: 'offer', 'offer.status': 'pending', 'offer.expiresAt': { $gt: new Date() } });
  if (open >= cfg.offerMaxOpen) throw ApiError.tooMany('OFFER_LIMIT', `You already have ${open} open offer(s) here. Wait for a reply or withdraw one.`);
  return deliver(c, userId, { kind: 'offer', offer: { amountMinor, currency, expiresAt: new Date(Date.now() + cfg.offerExpiryHours * 3_600_000) } });
};

/** accept | decline | counter (by the person who received it) · withdraw (by the person who made it). */
export const respondToOffer = async (userId, conversationId, messageId, { action, amount }) => {
  const c = await loadMine(conversationId, userId);
  const m = await Message.findOne({ _id: messageId, conversationId: c._id, kind: 'offer' });
  if (!m) throw ApiError.notFound('OFFER_NOT_FOUND');
  if (offerStatus(m.offer) !== 'pending') throw ApiError.conflict('OFFER_CLOSED', `This offer is already ${offerStatus(m.offer)}`);
  const mine = oid(m.senderId) === oid(userId);
  if (action === 'withdraw' ? !mine : mine) throw ApiError.forbidden('OFFER_NOT_YOURS', action === 'withdraw' ? 'Only the person who made the offer can withdraw it' : 'You cannot answer your own offer');
  if (action !== 'withdraw') await assertCanWrite(c, userId);

  let counter = null;
  if (action === 'counter') {
    const { cfg, listing } = await offerRules(c);
    const amountMinor = toMinor(amount, m.offer.currency);
    if (!(amountMinor > 0)) throw ApiError.badRequest('VALIDATION_FAILED', 'Enter an amount');
    if (amountMinor === m.offer.amountMinor) throw ApiError.badRequest('OFFER_SAME_AMOUNT', 'Accept the offer instead of countering with the same amount');
    if (listing.price.currency !== m.offer.currency) throw ApiError.badRequest('OFFER_NOT_ALLOWED', 'The ad price changed; make a new offer');
    counter = { amountMinor, currency: m.offer.currency, expiresAt: new Date(Date.now() + cfg.offerExpiryHours * 3_600_000), replyTo: m._id };
  }

  const status = { accept: 'accepted', decline: 'declined', counter: 'countered', withdraw: 'withdrawn' }[action];
  const updated = await Message.findOneAndUpdate(
    { _id: m._id, 'offer.status': 'pending' },
    { $set: { 'offer.status': status, 'offer.respondedAt': new Date() } },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('OFFER_CLOSED', 'This offer was already answered');
  const dto = messageDto(updated);
  emitToUser(c.buyerId, 'chat:message:update', dto);
  emitToUser(c.sellerId, 'chat:message:update', dto);

  if (action === 'accept') {
    // one accepted price per chat: other open offers are closed
    await Message.updateMany({ conversationId: c._id, kind: 'offer', 'offer.status': 'pending', _id: { $ne: m._id } }, { $set: { 'offer.status': 'withdrawn', 'offer.respondedAt': new Date() } });
  }
  if (action === 'accept' || action === 'decline') {
    const me = await User.findById(userId).select('name').lean();
    const word = action === 'accept' ? 'accepted' : 'declined';
    await notify(m.senderId, 'chat.message', { sender: me?.name || 'Offer update', preview: `Offer ${word}: ${formatMoney(m.offer.amountMinor, m.offer.currency)}` }, { route: `/chat/${c._id}` });
  }
  return { offer: dto, counter: counter ? await deliver(c, userId, { kind: 'offer', offer: counter }) : null };
};

/* ───── lists ───── */

const peerCard = (u) => ({ id: oid(u._id), name: u.name || null, avatar: u.avatar?.url || null });

const listingCard = (l) => ({
  id: oid(l._id),
  title: l.title,
  cover: l.media?.[0]?.url || null,
  status: l.status,
  price: { type: l.price.type, amountMinor: l.price.amountMinor ?? null, currency: l.price.currency, factor: minorFactor(l.price.currency) },
});

export const listConversations = async (userId) => {
  const docs = await Conversation.find({ $or: [{ buyerId: userId }, { sellerId: userId }], lastMessage: { $exists: true } }).sort({ lastMessageAt: -1 }).limit(100).lean();
  const peers = new Map(
    (await User.find({ _id: { $in: docs.map((c) => peerIdOf(c, userId)) } }).select('name avatar.url').lean()).map((u) => [oid(u._id), u])
  );
  const listings = new Map((await Listing.find({ _id: { $in: docs.map((c) => c.listingId) } }).select('title media price status').lean()).map((l) => [oid(l._id), l]));
  return docs.map((c) => {
    const side = sideOf(c, userId);
    const peer = peers.get(oid(peerIdOf(c, userId)));
    const l = listings.get(oid(c.listingId));
    return {
      id: oid(c._id),
      peer: peer ? peerCard(peer) : { id: null, name: null, avatar: null },
      listing: l ? listingCard(l) : null,
      lastMessage: c.lastMessage ? { text: c.lastMessage.text, mine: oid(c.lastMessage.senderId) === oid(userId), at: c.lastMessage.at } : null,
      unread: c.unread?.[side] || 0,
      lastMessageAt: c.lastMessageAt,
    };
  });
};

export const conversationDetail = async (userId, conversationId) => {
  const c = await loadMine(conversationId, userId);
  const side = sideOf(c, userId);
  const peerId = peerIdOf(c, userId);
  const [peer, l, blocked] = await Promise.all([
    User.findById(peerId).select('name avatar.url').lean(),
    Listing.findById(c.listingId).select('title media price status').lean(),
    Block.findOne({ blockerId: userId, blockedId: peerId }).lean(),
  ]);
  return {
    id: oid(c._id),
    side,
    peer: peer ? peerCard(peer) : { id: oid(peerId), name: null, avatar: null },
    listing: l ? listingCard(l) : null,
    iBlockedThem: Boolean(blocked),
  };
};

/** Newest first; pass `before` (a message id) to page back. */
export const listMessages = async (userId, conversationId, { before, limit = 30 }) => {
  await loadMine(conversationId, userId);
  const filter = { conversationId, ...(before ? { _id: { $lt: before } } : {}) };
  const docs = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  return { items: docs.slice(0, limit).map(messageDto), hasMore: docs.length > limit };
};

export const markConversationRead = async (userId, conversationId) => {
  const c = await loadMine(conversationId, userId);
  const side = sideOf(c, userId);
  const other = peerIdOf(c, userId);
  const now = new Date();
  const res = await Message.updateMany({ conversationId: c._id, senderId: { $ne: userId }, readAt: null }, { $set: { readAt: now } });
  await Conversation.updateOne({ _id: c._id }, { $set: { [`unread.${side}`]: 0 } });
  if (res.modifiedCount) emitToUser(other, 'chat:read', { conversationId: oid(c._id), readAt: now });
};

export const unreadMessageCount = async (userId) => {
  const rows = await Conversation.find({ $or: [{ buyerId: userId }, { sellerId: userId }] }).select('buyerId unread').lean();
  return rows.reduce((n, c) => n + (c.unread?.[oid(c.buyerId) === oid(userId) ? 'buyer' : 'seller'] || 0), 0);
};

/** Used by the socket layer to relay "typing…" to the other person only. */
export const peerOf = async (userId, conversationId) => {
  const c = await Conversation.findById(conversationId).select('buyerId sellerId').lean();
  return c && sideOf(c, userId) ? oid(peerIdOf(c, userId)) : null;
};

/* ───── blocking ───── */

export const blockUser = async (blockerId, blockedId) => {
  if (oid(blockerId) === oid(blockedId)) throw ApiError.badRequest('INVALID_TARGET', 'You cannot block yourself');
  if (!(await User.exists({ _id: blockedId }))) throw ApiError.notFound('USER_NOT_FOUND');
  await Block.updateOne({ blockerId, blockedId }, { $setOnInsert: { blockerId, blockedId } }, { upsert: true });
};

export const unblockUser = (blockerId, blockedId) => Block.deleteOne({ blockerId, blockedId });

export const listBlocked = async (userId) => {
  const rows = await Block.find({ blockerId: userId }).sort({ createdAt: -1 }).lean();
  const users = new Map((await User.find({ _id: { $in: rows.map((r) => r.blockedId) } }).select('name avatar.url').lean()).map((u) => [oid(u._id), u]));
  return rows.map((r) => ({ ...peerCard(users.get(oid(r.blockedId)) || { _id: r.blockedId }), blockedAt: r.createdAt }));
};
