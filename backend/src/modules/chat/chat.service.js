import { Conversation, Message, Block } from './chat.model.js';
import { Listing } from '../listings/listing.model.js';
import { User } from '../users/user.model.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { emitToUser } from '../../realtime/index.js';
import { notify } from '../notifications/notification.service.js';

const oid = (v) => String(v);

const isBlocked = async (a, b) => Boolean(await Block.exists({ $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }));

const messageDto = (m) => ({ id: oid(m._id), conversationId: oid(m.conversationId), senderId: oid(m.senderId), text: m.text, readAt: m.readAt || null, createdAt: m.createdAt });

const sideOf = (c, userId) => (oid(c.buyerId) === oid(userId) ? 'buyer' : oid(c.sellerId) === oid(userId) ? 'seller' : null);

const loadMine = async (conversationId, userId) => {
  const c = await Conversation.findById(conversationId);
  if (!c || !sideOf(c, userId)) throw ApiError.notFound('CONVERSATION_NOT_FOUND');
  return c;
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

export const sendMessage = async (userId, conversationId, text) => {
  const c = await loadMine(conversationId, userId);
  const other = sideOf(c, userId) === 'buyer' ? c.sellerId : c.buyerId;
  if (await isBlocked(userId, other)) throw ApiError.forbidden('CHAT_BLOCKED', 'You cannot message this person');
  const otherUser = await User.findById(other).select('status').lean();
  if (!otherUser || ['banned', 'deleted'].includes(otherUser.status)) throw ApiError.forbidden('CHAT_UNAVAILABLE', 'This person is no longer available');

  const m = await Message.create({ conversationId: c._id, senderId: userId, text });
  const otherSide = sideOf(c, userId) === 'buyer' ? 'seller' : 'buyer';
  await Conversation.updateOne(
    { _id: c._id },
    { $set: { lastMessage: { text, senderId: userId, at: m.createdAt }, lastMessageAt: m.createdAt }, $inc: { [`unread.${otherSide}`]: 1 } }
  );
  const dto = messageDto(m);
  emitToUser(other, 'chat:message', dto);
  emitToUser(userId, 'chat:message', dto); // other tabs/devices of the sender
  const sender = await User.findById(userId).select('name').lean();
  await notify(other, 'chat.message', { sender: sender?.name || 'New message', preview: text.slice(0, 120) }, { route: `/chat/${c._id}` });
  return dto;
};

const peerCard = (u) => ({ id: oid(u._id), name: u.name || null, avatar: u.avatar?.url || null });

export const listConversations = async (userId) => {
  const docs = await Conversation.find({ $or: [{ buyerId: userId }, { sellerId: userId }], lastMessage: { $exists: true } }).sort({ lastMessageAt: -1 }).limit(100).lean();
  const peers = new Map(
    (await User.find({ _id: { $in: docs.map((c) => (oid(c.buyerId) === oid(userId) ? c.sellerId : c.buyerId)) } }).select('name avatar.url').lean()).map((u) => [oid(u._id), u])
  );
  const listings = new Map((await Listing.find({ _id: { $in: docs.map((c) => c.listingId) } }).select('title media price status').lean()).map((l) => [oid(l._id), l]));
  return docs.map((c) => {
    const side = sideOf(c, userId);
    const peer = peers.get(oid(side === 'buyer' ? c.sellerId : c.buyerId));
    const l = listings.get(oid(c.listingId));
    return {
      id: oid(c._id),
      peer: peer ? peerCard(peer) : { id: null, name: null, avatar: null },
      listing: l ? { id: oid(l._id), title: l.title, cover: l.media?.[0]?.url || null, status: l.status, price: { type: l.price.type, amountMinor: l.price.amountMinor ?? null, currency: l.price.currency } } : null,
      lastMessage: c.lastMessage ? { text: c.lastMessage.text, mine: oid(c.lastMessage.senderId) === oid(userId), at: c.lastMessage.at } : null,
      unread: c.unread?.[side] || 0,
      lastMessageAt: c.lastMessageAt,
    };
  });
};

export const conversationDetail = async (userId, conversationId) => {
  const c = await loadMine(conversationId, userId);
  const side = sideOf(c, userId);
  const peerId = side === 'buyer' ? c.sellerId : c.buyerId;
  const [peer, l, blocked] = await Promise.all([
    User.findById(peerId).select('name avatar.url').lean(),
    Listing.findById(c.listingId).select('title media price status').lean(),
    Block.findOne({ blockerId: userId, blockedId: peerId }).lean(),
  ]);
  return {
    id: oid(c._id),
    peer: peer ? peerCard(peer) : { id: oid(peerId), name: null, avatar: null },
    listing: l ? { id: oid(l._id), title: l.title, cover: l.media?.[0]?.url || null, status: l.status, price: { type: l.price.type, amountMinor: l.price.amountMinor ?? null, currency: l.price.currency } } : null,
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
  const other = side === 'buyer' ? c.sellerId : c.buyerId;
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
  const side = c && sideOf(c, userId);
  return side ? (side === 'buyer' ? oid(c.sellerId) : oid(c.buyerId)) : null;
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
