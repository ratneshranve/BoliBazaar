import { Lead } from './lead.model.js';
import { Listing } from '../listings/listing.model.js';
import { User } from '../users/user.model.js';
import { Block } from '../chat/chat.model.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { notify } from '../notifications/notification.service.js';
import { checkContent } from '../trust/moderation.service.js';

const oid = (v) => String(v);
const TYPE_FOR = { job: 'application', service: 'enquiry' };

const person = (u) => ({ id: oid(u._id), name: u.name || null, avatar: u.avatar?.url || null });

const ownerDto = (l, sender, listing) => ({
  id: oid(l._id),
  type: l.type,
  message: l.message,
  status: l.status,
  createdAt: l.createdAt,
  listing: listing ? { id: oid(listing._id), title: listing.title } : null,
  sender: { ...person(sender || { _id: l.senderId }), phone: sender?.phone?.e164 || null }, // shared because they reached out to you
});

const senderDto = (l, listing) => ({
  id: oid(l._id),
  type: l.type,
  message: l.message,
  status: l.status,
  createdAt: l.createdAt,
  listing: listing ? { id: oid(listing._id), title: listing.title, cover: listing.media?.[0]?.url || null, status: listing.status } : null,
});

/** Apply for a job ad / send an enquiry to a service ad. */
export const createLead = async (senderId, listingId, message) => {
  const listing = await Listing.findById(listingId).select('ownerId status title listingType').lean();
  if (!listing || listing.status !== 'published') throw ApiError.notFound('LISTING_NOT_FOUND');
  await checkContent([message], { where: 'message', allowContact: true });
  const type = TYPE_FOR[listing.listingType];
  if (!type) throw ApiError.badRequest('LISTING_TYPE_NOT_SUPPORTED', 'This ad does not take applications or enquiries');
  if (oid(listing.ownerId) === oid(senderId)) throw ApiError.badRequest('OWN_LISTING', 'You cannot respond to your own ad');
  if (await Block.exists({ $or: [{ blockerId: senderId, blockedId: listing.ownerId }, { blockerId: listing.ownerId, blockedId: senderId }] })) {
    throw ApiError.forbidden('CHAT_BLOCKED', 'You cannot contact this person');
  }

  let lead;
  try {
    lead = await Lead.create({ type, listingId, ownerId: listing.ownerId, senderId, message });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('ALREADY_SENT', type === 'application' ? 'You already applied to this ad' : 'You already sent an enquiry for this ad');
    throw err;
  }
  const sender = await User.findById(senderId).select('name').lean();
  await notify(
    listing.ownerId,
    type === 'application' ? 'job.application_received' : 'enquiry.received',
    { name: sender?.name || 'Someone', title: listing.title },
    { route: `/leads/received?listing=${listingId}` }
  );
  return senderDto(lead, listing);
};

/** Everything people sent to my ads (optionally one ad). Newest first. */
export const listReceived = async (ownerId, { listingId, type, page = 1, limit = 20 }) => {
  const filter = { ownerId, ...(listingId ? { listingId } : {}), ...(type ? { type } : {}), status: { $ne: 'withdrawn' } };
  const docs = await Lead.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
  const page_ = docs.slice(0, limit);
  const [senders, listings] = await Promise.all([
    User.find({ _id: { $in: page_.map((l) => l.senderId) } }).select('name avatar.url phone.e164').lean(),
    Listing.find({ _id: { $in: page_.map((l) => l.listingId) } }).select('title').lean(),
  ]);
  const sMap = new Map(senders.map((u) => [oid(u._id), u]));
  const lMap = new Map(listings.map((l) => [oid(l._id), l]));
  return { items: page_.map((l) => ownerDto(l, sMap.get(oid(l.senderId)), lMap.get(oid(l.listingId)))), page, hasMore: docs.length > limit };
};

/** What I sent. */
export const listSent = async (senderId, { page = 1, limit = 20 }) => {
  const docs = await Lead.find({ senderId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
  const page_ = docs.slice(0, limit);
  const listings = new Map((await Listing.find({ _id: { $in: page_.map((l) => l.listingId) } }).select('title media status').lean()).map((l) => [oid(l._id), l]));
  return { items: page_.map((l) => senderDto(l, listings.get(oid(l.listingId)))), page, hasMore: docs.length > limit };
};

const OWNER_STATUSES = ['seen', 'shortlisted', 'declined'];
const STATUS_WORD = { shortlisted: 'shortlisted', declined: 'declined' };

/** The owner marks a lead seen / shortlisted / declined; the sender hears about shortlist and decline. */
export const setStatus = async (ownerId, leadId, status) => {
  if (!OWNER_STATUSES.includes(status)) throw ApiError.badRequest('INVALID_STATUS', 'Invalid status');
  const lead = await Lead.findOne({ _id: leadId, ownerId });
  if (!lead || lead.status === 'withdrawn') throw ApiError.notFound('LEAD_NOT_FOUND');
  if (lead.status === status) return { id: oid(lead._id), status };
  lead.status = status;
  lead.statusChangedAt = new Date();
  await lead.save();
  if (STATUS_WORD[status]) {
    const listing = await Listing.findById(lead.listingId).select('title').lean();
    await notify(
      lead.senderId,
      lead.type === 'application' ? 'job.application_status' : 'enquiry.status',
      { title: listing?.title || '', status: STATUS_WORD[status] },
      { route: '/leads/sent' }
    );
  }
  return { id: oid(lead._id), status };
};

export const withdraw = async (senderId, leadId) => {
  const lead = await Lead.findOne({ _id: leadId, senderId });
  if (!lead || lead.status === 'withdrawn') throw ApiError.notFound('LEAD_NOT_FOUND');
  lead.status = 'withdrawn';
  lead.statusChangedAt = new Date();
  await lead.save();
};

export const unseenCount = (ownerId) => Lead.countDocuments({ ownerId, status: 'new' });
