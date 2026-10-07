/** Shape returned to the account owner. */
export const meDto = (u) => ({
  id: String(u._id),
  publicId: u.publicId,
  name: u.name || null,
  avatar: u.avatar?.url ? { url: u.avatar.url, mediaId: u.avatar.mediaId ? String(u.avatar.mediaId) : null } : null,
  about: u.about || null,
  phone: { e164: u.phone.e164, verified: Boolean(u.phone.verifiedAt) },
  email: u.email?.address ? { address: u.email.address, verified: Boolean(u.email.verifiedAt) } : null,
  language: u.language || null,
  countryCode: u.countryCode || null,
  timezone: u.timezone || null,
  homeLocation: u.homeLocation || null,
  sellerType: u.seller?.type || 'individual',
  privacy: u.privacy,
  status: u.status,
  suspendedUntil: u.suspendedUntil || null,
  profileCompleted: Boolean(u.profileCompletedAt),
  ageConfirmed: Boolean(u.ageConfirmedAt),
  createdAt: u.createdAt,
});

/** Shape shown to other users (no contact data). */
export const publicUserDto = (u) => ({
  publicId: u.publicId,
  name: u.name || null,
  avatar: u.avatar?.url || null,
  about: u.about || null,
  verified: { phone: Boolean(u.phone?.verifiedAt) },
  sellerType: u.seller?.type || 'individual',
  memberSince: u.createdAt,
});
