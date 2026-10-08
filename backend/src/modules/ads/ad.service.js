import { Ad } from './ad.model.js';
import { Listing } from '../listings/listing.model.js';
import { User } from '../users/user.model.js';
import { cardDtos } from '../listings/listing.service.js';

const oid = (v) => String(v);
const running = (extra = {}) => ({ status: 'active', startAt: { $lte: new Date() }, endAt: { $gt: new Date() }, ...extra });

/** Count that these ads were shown (fire and forget). */
const seen = (ads) => ads.length && Ad.updateMany({ _id: { $in: ads.map((a) => a._id) } }, { $inc: { impressions: 1 } }).catch(() => {});

const bannerDto = (a) => ({ id: oid(a._id), type: a.type, title: a.title || null, subtitle: a.subtitle || null, image: a.image?.url || null, route: a.route || null, label: 'Ad' });

/** Website Banner Ads for the home carousel. */
export const homeAds = async () => {
  const [banners, businesses] = await Promise.all([Ad.find(running({ type: 'banner' })).sort({ startAt: -1 }).limit(5).lean(), Ad.find(running({ type: 'business_promotion' })).limit(6).lean()]);
  const sellers = new Map((await User.find({ _id: { $in: businesses.map((b) => b.sellerId) }, status: 'active' }).select('publicId name avatar verification').lean()).map((u) => [oid(u._id), u]));
  const promoted = businesses
    .filter((b) => sellers.has(oid(b.sellerId)))
    .map((b) => {
      const u = sellers.get(oid(b.sellerId));
      return { id: oid(b._id), title: b.title || u.verification?.businessName || u.name, subtitle: b.subtitle || null, image: b.image?.url || u.avatar?.url || null, publicId: u.publicId, label: 'Sponsored' };
    });
  seen([...banners, ...businesses]);
  return { adBanners: banners.map(bannerDto), sponsoredBusinesses: promoted };
};

/** Sponsored Listings mixed into the first page of results, and the Category Sponsorship for a category. */
export const searchAds = async ({ categoryPath, lang, viewerPoint }) => {
  const sponsoredFilter = running({ type: 'sponsored_listing' });
  const sponsored = await Ad.aggregate([{ $match: sponsoredFilter }, { $sample: { size: 2 } }]);
  const live = await Listing.find({ _id: { $in: sponsored.map((s) => s.listingId) }, status: 'published', expiresAt: { $gt: new Date() }, ...(categoryPath?.length ? { categoryPath: categoryPath.at(-1) } : {}) }).lean();
  const cards = (await cardDtos(live, { lang, viewerPoint })).map((c) => ({ ...c, sponsored: true, adId: oid(sponsored.find((s) => oid(s.listingId) === c.id)._id) }));
  let sponsor = null;
  if (categoryPath?.length) {
    const s = await Ad.findOne(running({ type: 'category_sponsorship', categoryId: { $in: categoryPath } })).sort({ startAt: -1 }).lean();
    if (s) sponsor = { ...bannerDto(s), label: 'Sponsored' };
    if (s) seen([s]);
  }
  seen(sponsored.filter((s) => cards.some((c) => c.adId === oid(s._id))));
  return { sponsoredListings: cards, sponsor };
};

export const recordClick = (id) => Ad.updateOne({ _id: id }, { $inc: { clicks: 1 } });
